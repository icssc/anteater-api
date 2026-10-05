import { isNull } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const diningRestaurant = pgTable("dining_restaurant", {
  id: varchar("id").primaryKey(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningPeriod = pgTable(
  "dining_period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealPeriodTypeId: integer("meal_period_type_id")
      .notNull()
      .references(() => diningMealPeriodType.adobeId),
    date: date("date").notNull(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex().on(table.mealPeriodTypeId, table.date, table.restaurantId),
    index().on(table.date),
    index().on(table.restaurantId),
  ],
);

export const diningStation = pgTable(
  "dining_station",
  {
    id: varchar("id").primaryKey(),
    name: varchar("name").notNull(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.restaurantId)],
);

export const diningDish = pgTable(
  "dining_dish",
  {
    id: varchar("id").primaryKey(),
    stationId: varchar("station_id")
      .notNull()
      .references(() => diningStation.id, {
        onDelete: "cascade",
      }),
    name: varchar("name").notNull(),
    description: varchar("description").notNull(),
    ingredients: varchar("ingredients"),
    category: varchar("category").notNull(),
    imageUrl: varchar("image_url"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.stationId)],
);

export const diningNutritionInfo = pgTable("dining_nutrition_info", {
  dishId: varchar("dish_id")
    .primaryKey()
    .references(() => diningDish.id, {
      onDelete: "cascade",
    }),
  servingSize: varchar("serving_size"),
  servingUnit: varchar("serving_unit"),
  calories: numeric("calories", { precision: 10, scale: 2 }),
  totalFatG: numeric("total_fat_g", { precision: 10, scale: 2 }),
  transFatG: numeric("trans_fat_g", { precision: 10, scale: 2 }),
  saturatedFatG: numeric("saturated_fat_g", { precision: 10, scale: 2 }),
  cholesterolMg: numeric("cholesterol_mg", { precision: 10, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { precision: 10, scale: 2 }),
  totalCarbsG: numeric("total_carbs_g", { precision: 10, scale: 2 }),
  dietaryFiberG: numeric("dietary_fiber_g", { precision: 10, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 10, scale: 2 }),
  proteinG: numeric("protein_g", { precision: 10, scale: 2 }),
  calciumMg: numeric("calcium", { precision: 10, scale: 2 }),
  ironMg: numeric("iron", { precision: 10, scale: 2 }),
  vitaminAIU: numeric("vitamin_a", { precision: 10, scale: 2 }),
  vitaminCIU: numeric("vitamin_c", { precision: 10, scale: 2 }),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningDietRestriction = pgTable("dining_diet_restriction", {
  dishId: varchar("dish_id")
    .primaryKey()
    .references(() => diningDish.id, {
      onDelete: "cascade",
    }),
  containsEggs: boolean("contains_eggs").notNull(),
  containsFish: boolean("contains_fish").notNull(),
  containsMilk: boolean("contains_milk").notNull(),
  containsPeanuts: boolean("contains_peanuts").notNull(),
  containsSesame: boolean("contains_sesame").notNull(),
  containsShellfish: boolean("contains_shellfish").notNull(),
  containsSoy: boolean("contains_soy").notNull(),
  containsTreeNuts: boolean("contains_tree_nuts").notNull(),
  containsWheat: boolean("contains_wheat").notNull(),
  isGlutenFree: boolean("is_gluten_free").notNull(),
  isHalal: boolean("is_halal").notNull(),
  isKosher: boolean("is_kosher").notNull(),
  isLocallyGrown: boolean("is_locally_grown").notNull(),
  isOrganic: boolean("is_organic").notNull(),
  isVegan: boolean("is_vegan").notNull(),
  isVegetarian: boolean("is_vegetarian").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningDishToPeriod = pgTable(
  "dining_dish_to_period",
  {
    periodId: uuid("period_id")
      .notNull()
      .references(() => diningPeriod.id),
    dishId: varchar("dish_id")
      .notNull()
      .references(() => diningDish.id),
  },
  (table) => [
    {
      pk: primaryKey({
        name: "dining_dish_to_period_pk",
        columns: [table.periodId, table.dishId],
      }),
    },
  ],
);

export const diningEvent = pgTable(
  "dining_event",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: varchar("title").notNull(),
    image: varchar("image"),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    description: varchar("description"),
    start: timestamp("start"),
    end: timestamp("end"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    // Drizzle does not support `nullsNotDistinct` on a `uniqueIndex`, but `uniqueIndex` is required to implement a partial index. The comment below is implemented in migrations/0034_dining_event_null_start.sql
    // uniqueIndex().on(table.restaurantId, table.start, table.end).nullsNotDistinct().where(isNotNull(table.start)),
    uniqueIndex().on(table.restaurantId, table.title).where(isNull(table.start)),
  ],
);

export const diningMealPeriodType = pgTable("dining_meal_period_type", {
  adobeId: integer("adobe_id").primaryKey(),
  name: varchar("name").notNull(),
  position: integer("position").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export const diningSchedule = pgTable(
  "dining_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: varchar("restaurant_id")
      .notNull()
      .references(() => diningRestaurant.id, {
        onDelete: "cascade",
      }),
    upstreamId: varchar("upstream_id").notNull(),
    name: varchar("name").notNull(),
    type: varchar("type").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique().on(table.restaurantId, table.name, table.startDate, table.endDate).nullsNotDistinct(), // forbid multiple Standard schedules with null start/end dates
    index().on(table.restaurantId),
  ],
);

export const diningScheduleMealPeriod = pgTable(
  "dining_schedule_meal_period",
  {
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => diningSchedule.id, {
        onDelete: "cascade",
      }),
    mealPeriodTypeId: integer("meal_period_type_id")
      .notNull()
      .references(() => diningMealPeriodType.adobeId),
    sunOpen: time("sun_open"),
    sunClose: time("sun_close"),
    monOpen: time("mon_open"),
    monClose: time("mon_close"),
    tueOpen: time("tue_open"),
    tueClose: time("tue_close"),
    wedOpen: time("wed_open"),
    wedClose: time("wed_close"),
    thuOpen: time("thu_open"),
    thuClose: time("thu_close"),
    friOpen: time("fri_open"),
    friClose: time("fri_close"),
    satOpen: time("sat_open"),
    satClose: time("sat_close"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "dining_schedule_meal_period_pk",
      columns: [table.scheduleId, table.mealPeriodTypeId],
    }),
  ],
);
