import type {
  diningDishQuerySchema,
  diningEventQuerySchema,
  diningZotmealQuerySchema,
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
type DiningZotmealQuery = z.infer<typeof diningZotmealQuerySchema>;

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
      .select()
      .from(diningNutritionInfo)
      .where(eq(diningNutritionInfo.dishId, input.id))
      .limit(1);

    const [dietRestriction] = await this.db
      .select()
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

  async getRestaurantsByDate(input: DiningZotmealQuery) {
    const dateStr = input.date.toISOString().split("T")[0]; // "YYYY-MM-DD"

    const restaurants = await this.db.select().from(diningRestaurant);

    const menus = await this.db.select().from(diningMenu).where(eq(diningMenu.date, dateStr));

    const periods = await this.db.select().from(diningPeriod);

    const dishToMenus = await this.db.select().from(diningDishToMenu);

    const dishes = await this.db.select().from(diningDish);

    const nutritionInfos = await this.db.select().from(diningNutritionInfo);

    const dietRestrictions = await this.db.select().from(diningDietRestriction);

    const events = await this.db.select().from(diningEvent).where(gte(diningEvent.end, new Date()));

    const mappedRestaurants = restaurants.map((restaurant) => {
      const restaurantMenus = menus.filter((m) => m.restaurantId === restaurant.id);

      const restaurantEvents = events.filter((e) => e.restaurantId === restaurant.id);

      return {
        ...restaurant,
        menus: restaurantMenus
          .map((menu) => {
            const period = periods.find((p) => p.id === menu.periodId);

            const menuDishes = dishToMenus
              .filter((dtm) => dtm.menuId === menu.id)
              .map((dtm) => {
                const dish = dishes.find((d) => d.id === dtm.dishId);
                if (!dish) return null;

                return {
                  ...dish,
                  nutritionInfo: nutritionInfos.find((n) => n.dishId === dish.id) ?? null,
                  dietRestriction: dietRestrictions.find((d) => d.dishId === dish.id) ?? null,
                  menuId: menu.id,
                  restaurant: restaurant.name,
                };
              })
              .filter(Boolean);

            return {
              ...menu,
              period,
              dishes: menuDishes,
            };
          })
          .sort((a, b) => (a.period?.startTime ?? "").localeCompare(b.period?.startTime ?? "")),
        events: restaurantEvents,
      };
    });

    const [firstRestaurant, secondRestaurant] = mappedRestaurants;

    if (!firstRestaurant || !secondRestaurant) {
      throw new Error("Restaurants not found, there should always be two restaurants");
    }

    return firstRestaurant.name === "anteatery"
      ? {
          anteatery: firstRestaurant,
          brandywine: secondRestaurant,
        }
      : {
          anteatery: secondRestaurant,
          brandywine: firstRestaurant,
        };
  }
}
