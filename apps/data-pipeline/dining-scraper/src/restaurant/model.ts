import z from "zod";

export const restaurantIds = ["3056", "3314"] as const;
export const restaurantNames = ["anteatery", "brandywine"] as const;

export type RestaurantId = (typeof restaurantIds)[number];
export type RestaurantName = (typeof restaurantNames)[number];

export const restaurantUrlMap = {
  anteatery: "the-anteatery",
  brandywine: "brandywine",
} as const;

export type FetchLocationVariables = {
  locationUrlKey: "brandywine" | "the-anteatery";
  sortOrder: "ASC" | "DESC";
};

export const fetchLocationResponseSchema = z.object({
  data: z.object({
    Commerce_mealPeriods: z.array(
      z.object({
        name: z.string(),
        id: z.number(),
        position: z.number(),
      }),
    ),
    Commerce_attributesList: z.object({
      items: z.array(
        z.object({
          code: z.string(),
          options: z.array(
            z.object({
              value: z.string(),
              label: z.string(),
            }),
          ),
        }),
      ),
    }),
    getLocation: z.object({
      commerceAttributes: z.object({
        maxMenusDate: z.string().date(),
        children: z.array(
          z.object({
            id: z.number(),
            uid: z.string(),
            name: z.string(),
            position: z.number(),
          }),
        ),
      }),
      aemAttributes: z.object({
        hoursOfOperation: z.object({
          schedule: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              meal_periods: z.array(
                z.object({
                  meal_period: z.string(),
                  opening_hours: z.string(),
                }),
              ),
              start_date: z.string().date().optional(),
              end_date: z.string().date().optional(),
            }),
          ),
        }),
      }),
    }),
  }),
});

export type LocationResponse = z.infer<typeof fetchLocationResponseSchema>;

export type MealPeriod = LocationResponse["data"]["Commerce_mealPeriods"][0];

export type WeekTimes = [string, string, string, string, string, string, string];

export type MealPeriodWithHours = MealPeriod & {
  // The hours for which the meal period opens (e.g. openHours[day] = "11:00")
  openHours: WeekTimes;
  // The hours for which the meal period occurs (e.g. openHours[day] = "14:00")
  closeHours: WeekTimes;
};

export type Schedule = {
  name: string;
  type: string;
  startDate?: Date;
  endDate?: Date;
  mealPeriods: MealPeriodWithHours[];
};

export type DiningHallInformation = {
  // Maps the allergen (e.g. "Eggs") to its code (39)
  allergenIntoleranceCodes: { [allergen: string]: number };
  // Maps the preference (e.g. "Gluten Free") to its code (78)
  menuPreferenceCodes: { [preference: string]: number };
  // Maps the id of the station to station name
  stationsInfo: { [uid: string]: string };
  // Schedules (special and standard) for this dining hall
  schedules: Schedule[];
};
