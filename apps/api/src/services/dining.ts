import type {
  diningDishQuerySchema,
  diningEventQuerySchema,
  diningPeterplateQuerySchema,
} from "$schema";
import type { database } from "@packages/db";
import { and, eq, gte, max, min } from "@packages/db/drizzle";
import {
  diningDietRestriction,
  diningDish,
  diningDishToMenu,
  diningEvent,
  diningMenu,
  diningNutritionInfo,
  diningPeriod,
  diningRestaurant,
} from "@packages/db/schema";
import type { z } from "zod";

type DiningDishQuery = z.infer<typeof diningDishQuerySchema>;
type DiningEventQuery = z.infer<typeof diningEventQuerySchema>;
type DiningPeterplateQuery = z.infer<typeof diningPeterplateQuerySchema>;

export class DiningService {
  constructor(private readonly db: ReturnType<typeof database>) {}

  async getUpcomingEvents(input: DiningEventQuery) {
    // only get events ending at or after the current time
    const conds = [gte(diningEvent.end, new Date())];

    if (input.restaurantId) {
      conds.push(eq(diningEvent.restaurantId, input.restaurantId));
    }

    return this.db
      .select({
        title: diningEvent.title,
        image: diningEvent.image,
        restaurantId: diningEvent.restaurantId,
        // somewhere it was mentioned that shortDescription is never stored, so don't return it
        longDescription: diningEvent.longDescription,
        start: diningEvent.start,
        end: diningEvent.end,
        updatedAt: diningEvent.updatedAt,
      })
      .from(diningEvent)
      .where(and(...conds));
  }

  async getDishById(input: DiningDishQuery) {
    const [dish] = await this.db
      .select()
      .from(diningDish)
      .where(eq(diningDish.id, input.id))
      // ensures that only 1 dish is returned
      .limit(1);

    if (!dish) return null;

    const [nutritionInfo] = await this.db
      .select({
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
      })
      .from(diningNutritionInfo)
      .where(eq(diningNutritionInfo.dishId, input.id))
      .limit(1);

    const [dietRestriction] = await this.db
      .select({
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
      })
      .from(diningDietRestriction)
      .where(eq(diningDietRestriction.dishId, input.id))
      .limit(1);

    return {
      ...dish,
      nutritionInfo: nutritionInfo ?? null,
      dietRestriction: dietRestriction ?? null,
    };
  }

  async getPickableDates() {
    const result = await this.db
      .select({
        earliest: min(diningMenu.date),
        latest: max(diningMenu.date),
      })
      .from(diningMenu);

    return {
      earliest: result[0]?.earliest ?? null,
      latest: result[0]?.latest ?? null,
    };
  }

  async getRestaurantsByDate(input: DiningPeterplateQuery) {
    const dateStr = input.date.toISOString().split("T")[0];

    const rows = await this.db
      .select({
        restaurant: diningRestaurant,
        menu: diningMenu,
        period: diningPeriod,
        dish: diningDish,
        nutrition: diningNutritionInfo,
        dietRestriction: diningDietRestriction,
        event: diningEvent,
      })
      .from(diningRestaurant)
      .leftJoin(
        diningMenu,
        and(eq(diningMenu.restaurantId, diningRestaurant.id), eq(diningMenu.date, dateStr)),
      )
      .leftJoin(diningPeriod, eq(diningPeriod.id, diningMenu.periodId))
      .leftJoin(diningDishToMenu, eq(diningDishToMenu.menuId, diningMenu.id))
      .leftJoin(diningDish, eq(diningDish.id, diningDishToMenu.dishId))
      .leftJoin(diningNutritionInfo, eq(diningNutritionInfo.dishId, diningDish.id))
      .leftJoin(diningDietRestriction, eq(diningDietRestriction.dishId, diningDish.id))
      .leftJoin(
        diningEvent,
        and(eq(diningEvent.restaurantId, diningRestaurant.id), gte(diningEvent.end, new Date())),
      );
    type Period = {
      id: string;
      startTime: string | null;
      endTime: string | null;
    };

    type NutritionInfo = {
      id: string;
      calories: number | null;
    };

    type DietRestriction = {
      id: string;
      name: string;
    };

    type Dish = {
      id: string;
      name: string;
      nutritionInfo?: NutritionInfo | null;
      dietRestrictions?: DietRestriction[];
    };

    type Menu = {
      id: string;
      date: string;
      period: Period | null;
      dishes: Dish[];
    };

    type Event = {
      id: string;
      name: string;
    };

    type Restaurant = {
      id: string;
      name: string;
      menus: Menu[];
      events: Event[];
    };

    const restaurantMap = new Map<string, Restaurant>();

    for (const row of rows) {
      const r = row.restaurant;

      if (!restaurantMap.has(r.id)) {
        restaurantMap.set(r.id, {
          ...r,
          menus: [],
          events: [],
        });
      }

      const restaurant = restaurantMap.get(r.id);

      if (row.event) {
        if (!restaurant.events.some((e) => e.id === row.event.id)) {
          restaurant.events.push(row.event);
        }
      }

      if (!row.menu) continue;

      let menu = restaurant.menus.find((m) => m.id === row.menu.id);

      if (!menu) {
        menu = {
          ...row.menu,
          period: row.period ?? null,
          dishes: [],
        };
        restaurant.menus.push(menu);
      }

      if (!row.dish) continue;

      if (!menu.dishes.some((d) => d.id === row.dish.id)) {
        menu.dishes.push({
          ...row.dish,
          nutritionInfo: row.nutrition ?? null,
          dietRestriction: row.dietRestriction ?? null,
          menuId: row.menu.id,
          restaurant: r.name,
        });
      }
    }

    const restaurants = Array.from(restaurantMap.values());

    if (restaurants.length !== 2) {
      throw new Error("Restaurants not found, there should always be two restaurants");
    }

    for (const restaurant of restaurants) {
      restaurant.menus.sort((a, b) =>
        (a.period?.startTime ?? "").localeCompare(b.period?.startTime ?? ""),
      );
    }

    const anteatery = restaurants.find((r) => r.name.toLowerCase() === "anteatery");
    const brandywine = restaurants.find((r) => r.name.toLowerCase() === "brandywine");

    if (!anteatery || !brandywine) {
      throw new Error("Expected anteatery and brandywine");
    }

    return {
      anteatery,
      brandywine,
    };
  }
}
