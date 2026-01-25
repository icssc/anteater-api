import type { LocationResponse } from "./fetch-location.ts";

export const restaurantIds = ["3056", "3314"] as const;
export const restaurantNames = ["anteatery", "brandywine"] as const;

export type RestaurantId = (typeof restaurantIds)[number];
export type RestaurantName = (typeof restaurantNames)[number];

export const restaurantUrlMap = {
  anteatery: "the-anteatery",
  brandywine: "brandywine",
} as const;

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
