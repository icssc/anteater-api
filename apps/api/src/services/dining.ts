import type {
  diningEventsQuerySchema,
  dishQuerySchema,
  dishSchema,
  restaurantTodayQuerySchema,
  restaurantTodayResponseSchema,
  restaurantsQuerySchema,
  restaurantsResponseSchema,
} from "$schema";
import type { database } from "@packages/db";
import { type SQL, and, eq, gte, inArray, max, min, sql } from "@packages/db/drizzle";
import {
  diningDietRestriction,
  diningDish,
  diningDishToPeriod,
  diningEvent,
  diningNutritionInfo,
  diningPeriod,
  diningRestaurant,
  diningStation,
} from "@packages/db/schema";
import { getFromMapOrThrow, orNull } from "@packages/stdlib";
import type { z } from "zod";

type DiningDishQuery = z.infer<typeof dishQuerySchema>;
type DiningEventQuery = z.infer<typeof diningEventsQuerySchema>;

class DiningService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getUpcomingEvents(input: DiningEventQuery) {
    // only get events ending at or after the current time
    const conds = [gte(diningEvent.end, sql`NOW()`)];

    if (input.restaurantId) {
      conds.push(eq(diningEvent.restaurantId, input.restaurantId));
    }

    return this.db
      .select({
        title: diningEvent.title,
        image: diningEvent.image,
        restaurantId: diningEvent.restaurantId,
        description: diningEvent.description,
        start: diningEvent.start,
        end: diningEvent.end,
        updatedAt: diningEvent.updatedAt,
      })
      .from(diningEvent)
      .where(and(...conds));
  }

  async getDishesRaw(input: { where?: SQL }): Promise<z.infer<typeof dishSchema>[]> {
    const rows = await this.db
      .select({
        id: diningDish.id,
        stationId: diningDish.stationId,
        name: diningDish.name,
        description: diningDish.description,
        ingredients: diningDish.ingredients,
        category: diningDish.category,
        imageUrl: diningDish.imageUrl,
        updatedAt: diningDish.updatedAt,
        nutritionInfo: {
          servingSize: diningNutritionInfo.servingSize,
          servingUnit: diningNutritionInfo.servingUnit,
          calories: diningNutritionInfo.calories,
          totalFatG: diningNutritionInfo.totalFatG,
          transFatG: diningNutritionInfo.transFatG,
          saturatedFatG: diningNutritionInfo.saturatedFatG,
          cholesterolMg: diningNutritionInfo.cholesterolMg,
          sodiumMg: diningNutritionInfo.sodiumMg,
          totalCarbsG: diningNutritionInfo.totalCarbsG,
          dietaryFiberG: diningNutritionInfo.dietaryFiberG,
          sugarsG: diningNutritionInfo.sugarsG,
          proteinG: diningNutritionInfo.proteinG,
          calciumMg: diningNutritionInfo.calciumMg,
          ironMg: diningNutritionInfo.ironMg,
          vitaminAIU: diningNutritionInfo.vitaminAIU,
          vitaminCIU: diningNutritionInfo.vitaminCIU,
          containsEggs: diningDietRestriction.containsEggs,
          containsFish: diningDietRestriction.containsFish,
          containsMilk: diningDietRestriction.containsMilk,
          containsPeanuts: diningDietRestriction.containsPeanuts,
          containsSesame: diningDietRestriction.containsSesame,
          containsShellfish: diningDietRestriction.containsShellfish,
          containsSoy: diningDietRestriction.containsSoy,
          containsTreeNuts: diningDietRestriction.containsTreeNuts,
          containsWheat: diningDietRestriction.containsWheat,
          isGlutenFree: diningDietRestriction.isGlutenFree,
          isHalal: diningDietRestriction.isHalal,
          isKosher: diningDietRestriction.isKosher,
          isLocallyGrown: diningDietRestriction.isLocallyGrown,
          isOrganic: diningDietRestriction.isOrganic,
          isVegan: diningDietRestriction.isVegan,
          isVegetarian: diningDietRestriction.isVegetarian,
          updatedAt: diningDietRestriction.updatedAt,
        },
        dietRestriction: {
          containsEggs: diningDietRestriction.containsEggs,
          containsFish: diningDietRestriction.containsFish,
          containsMilk: diningDietRestriction.containsMilk,
          containsPeanuts: diningDietRestriction.containsPeanuts,
          containsSesame: diningDietRestriction.containsSesame,
          containsShellfish: diningDietRestriction.containsShellfish,
          containsSoy: diningDietRestriction.containsSoy,
          containsTreeNuts: diningDietRestriction.containsTreeNuts,
          containsWheat: diningDietRestriction.containsWheat,
          isGlutenFree: diningDietRestriction.isGlutenFree,
          isHalal: diningDietRestriction.isHalal,
          isKosher: diningDietRestriction.isKosher,
          isLocallyGrown: diningDietRestriction.isLocallyGrown,
          isOrganic: diningDietRestriction.isOrganic,
          isVegan: diningDietRestriction.isVegan,
          isVegetarian: diningDietRestriction.isVegetarian,
          updatedAt: diningDietRestriction.updatedAt,
        },
      })
      .from(diningDish)
      .leftJoin(diningNutritionInfo, eq(diningDish.id, diningNutritionInfo.dishId))
      .leftJoin(diningDietRestriction, eq(diningDish.id, diningDietRestriction.dishId))
      .where(input.where);

    return rows.map((r) => {
      // alias to allow these assignments
      const rPun = r as z.infer<typeof dishSchema>;

      if (r.nutritionInfo.updatedAt === null) {
        rPun.nutritionInfo = null;
      }
      // this optional won't ever trigger
      if (r.dietRestriction?.updatedAt === null) {
        rPun.dietRestriction = null;
      }

      return rPun;
    });
  }

  async batchGetDishes(ids: string[]) {
    return this.getDishesRaw({ where: inArray(diningDish.id, ids) });
  }

  async getDishById(input: DiningDishQuery) {
    return this.getDishesRaw({ where: eq(diningDish.id, input.id) }).then((x) => orNull(x[0]));
  }

  async getPickableDates() {
    const result = await this.db
      .select({
        earliest: min(diningPeriod.date),
        latest: max(diningPeriod.date),
      })
      .from(diningPeriod);

    return {
      earliest: result[0]?.earliest ?? null,
      latest: result[0]?.latest ?? null,
    };
  }

  async getRestaurants(query: z.infer<typeof restaurantsQuerySchema>) {
    const fetched = await this.db
      .select({
        restaurant: {
          id: diningRestaurant.id,
          updatedAt: diningRestaurant.updatedAt,
        },
        station: {
          id: diningStation.id,
          name: diningStation.name,
          updatedAt: diningStation.updatedAt,
        },
      })
      .from(diningRestaurant)
      .leftJoin(diningStation, eq(diningRestaurant.id, diningStation.restaurantId))
      .where(query.id ? eq(diningRestaurant.id, query.id) : undefined);

    const result = {} as Record<
      (typeof diningRestaurant.$inferInsert)["id"],
      z.infer<typeof restaurantsResponseSchema>[number]
    >;

    for (const { restaurant, station } of fetched) {
      // incorrectness of as cast is not observed because we immediately establish the missing invariant
      // biome-ignore lint/suspicious/noAssignInExpressions: yes, i meant that
      const stations = ((result[restaurant.id] ??= restaurant as z.infer<
        typeof restaurantsResponseSchema
      >[number]).stations ??= []);
      if (station) {
        stations.push(station);
      }
    }

    return Object.values(result);
  }

  async getRestaurantToday(query: z.infer<typeof restaurantTodayQuerySchema>) {
    const rows = await this.db
      .select({
        restaurant: {
          id: diningRestaurant.id,
          updatedAt: diningRestaurant.updatedAt,
        },
        period: {
          id: diningPeriod.id,
          name: diningPeriod.name,
          startTime: diningPeriod.startTime,
          endTime: diningPeriod.endTime,
          updatedAt: diningPeriod.updatedAt,
        },
        station: {
          id: diningStation.id,
          updatedAt: diningStation.updatedAt,
        },
        dishes: sql<
          (typeof diningDish.$inferSelect.id)[]
        >`ARRAY_REMOVE(ARRAY_AGG(${diningDish.id}), NULL)`,
      })
      .from(diningRestaurant)
      .leftJoin(diningPeriod, eq(diningRestaurant.id, diningPeriod.restaurantId))
      .leftJoin(diningStation, eq(diningRestaurant.id, diningStation.restaurantId))
      .leftJoin(diningDishToPeriod, eq(diningPeriod.id, diningDishToPeriod.periodId))
      .innerJoin(diningDish, eq(diningDish.id, diningDishToPeriod.dishId))
      .where(and(eq(diningRestaurant.id, query.id), eq(diningPeriod.date, query.date)))
      .groupBy(
        // yes, we actually need all of these
        diningRestaurant.id,
        diningPeriod.id,
        diningPeriod.startTime,
        diningPeriod.endTime,
        diningPeriod.updatedAt,
        diningStation.id,
        diningDishToPeriod.periodId,
      );

    if (rows.length === 0) {
      return null;
    }

    type PeriodsRecord = z.infer<typeof restaurantTodayResponseSchema>["periods"];
    const periods = new Map<keyof PeriodsRecord, PeriodsRecord[string]>();

    for (const { period, station, dishes } of rows) {
      if (period === null) {
        continue;
      }

      if (!periods.has(period.id)) {
        periods.set(period.id, {
          name: period.name,
          startTime: period.startTime,
          endTime: period.endTime,
          stationToDishes: {},
          updatedAt: period.updatedAt,
        });
      }

      if (station !== null) {
        getFromMapOrThrow(periods, period.id).stationToDishes[station.id] = dishes;
      }
    }

    return {
      id: rows[0].restaurant.id,
      periods: Object.fromEntries(periods),
      updatedAt: rows[0].restaurant.updatedAt,
    };
  }
}

export default DiningService;
