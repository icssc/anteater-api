export const diningSchema = `#graphql
enum RestaurantId {
  anteatery
  brandywine
}

type DietRestriction @cacheControl(maxAge: 3600) {
  containsEggs: Boolean!
  containsFish: Boolean!
  containsMilk: Boolean!
  containsPeanuts: Boolean!
  containsSesame: Boolean!
  containsShellfish: Boolean!
  containsSoy: Boolean!
  containsTreeNuts: Boolean!
  containsWheat: Boolean!
  isGlutenFree: Boolean!
  isHalal: Boolean!
  isKosher: Boolean!
  isLocallyGrown: Boolean!
  isOrganic: Boolean!
  isVegan: Boolean!
  isVegetarian: Boolean!
}

type NutritionInfo @cacheControl(maxAge: 3600) {
  servingSize: String
  servingUnit: String
  calories: Float
  totalFatG: Float
  transFatG: Float
  saturatedFatG: Float
  cholesterolMg: Float
  sodiumMg: Float
  totalCarbsG: Float
  dietaryFiberG: Float
  sugarsG: Float
  proteinG: Float
  calciumMg: Float
  ironMg: Float
  vitaminAIU: Float
  vitaminCIU: Float
}

type DiningDish @cacheControl(maxAge: 3600) {
  id: String!
  stationId: String!
  name: String!
  description: String!
  ingredients: String
  category: String!
  imageUrl: String
  updatedAt: String!
  dietRestriction: DietRestriction!
  nutritionInfo: NutritionInfo!
}

type DiningEvent @cacheControl(maxAge: 3600) {
  title: String!
  image: String
  restaurantId: RestaurantId!
  description: String
  start: String!
  end: String
  updatedAt: String!
}

type DiningDateRange @cacheControl(maxAge: 3600) {
  earliest: String
  latest: String
}

type Stations @cacheControl(maxAge: 3600) {
  id: String
  name: String
  restaurantId: RestaurantId
  updatedAt: String
}

type Restaurant @cacheControl(maxAge: 3600) {
  id: RestaurantId
  updatedAt: String
  stations: [Stations!]!
}

type Period @cacheControl(maxAge: 3600) {
  id: String!
  name: String!
  startTime: String!
  endTime: String!
  stations: JSON!
  updatedAt: String!
}

type RestaurantToday @cacheControl(maxAge: 3600) {
  id: RestaurantId
  updatedAt: String
  periods: [Period!]!
}

type DayHours @cacheControl(maxAge: 3600) {
  open: String
  close: String
}

type ScheduleDayHours @cacheControl(maxAge: 3600) {
  sunday: DayHours!
  monday: DayHours!
  tuesday: DayHours!
  wednesday: DayHours!
  thursday: DayHours!
  friday: DayHours!
  saturday: DayHours!
}

type ScheduleMealPeriod @cacheControl(maxAge: 3600) {
  adobeId: Int!
  name: String!
  position: Int!
  hours: ScheduleDayHours!
}

type Schedule @cacheControl(maxAge: 3600) {
  upstreamId: String!
  restaurantId: RestaurantId!
  name: String!
  type: String!
  startDate: String
  endDate: String
  mealPeriods: [ScheduleMealPeriod!]!
  updatedAt: String!
}

input DiningEventsQuery {
  restaurantId: RestaurantId
}

input RestaurantsQuery {
  id: RestaurantId
}

input RestaurantTodayQuery {
  id: RestaurantId!
  date: String!
}

input SchedulesQuery {
  restaurantId: RestaurantId
  includeHistorical: Boolean
}

extend type Query {
  diningEvents(query: DiningEventsQuery): [DiningEvent!]!
  diningDish(id: String!): DiningDish!
  batchDiningDishes(ids: [String!]!): [DiningDish!]!
  diningDateRange: DiningDateRange!
  getRestaurants(query: RestaurantsQuery): [Restaurant!]!
  getRestaurantToday(query: RestaurantTodayQuery!): RestaurantToday!
  getDiningSchedules(query: SchedulesQuery): [Schedule!]!
}
`;
