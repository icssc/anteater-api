import type { diningDishQuerySchema, diningEventsQuerySchema } from "$schema";
import type { database } from "@packages/db";
import { and, eq, gte, max, min } from "@packages/db/drizzle";
import {
  diningDietRestriction,
  diningDish,
  diningEvent,
  diningMenu,
  diningNutritionInfo,
} from "@packages/db/schema";
import type { z } from "zod";

type DiningDishQuery = z.infer<typeof diningDishQuerySchema>;
type DiningEventQuery = z.infer<typeof diningEventsQuerySchema>;

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
}
