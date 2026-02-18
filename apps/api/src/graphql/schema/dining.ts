export const diningSchema = `#graphql
enum RestaurantId {
  anteatery
  brandywine
}

type DietRestriction {
  containsEggs: Boolean
  containsFish: Boolean
  containsMilk: Boolean
  containsPeanuts: Boolean
  containsSesame: Boolean
  containsShellfish: Boolean
  containsSoy: Boolean
  containsTreeNuts: Boolean
  containsWheat: Boolean
  isGlutenFree: Boolean
  isHalal: Boolean
  isKosher: Boolean
  isLocallyGrown: Boolean
  isOrganic: Boolean
  isVegan: Boolean
  isVegetarian: Boolean
}

type NutritionInfo {
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
  dietRestriction: DietRestriction
  nutritionInfo: NutritionInfo
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

type DiningDates @cacheControl(maxAge: 3600) {
  earliest: String
  latest: String
}

type Stations {
  id: String
  name: String
  restaurantId: RestaurantIds
  updatedAt: String
}

type Restaurant {
  id: RestaurantIds
  updatedAt: String
  stations: [Stations!]!
}

type StationDishMap {
  stationId: String! 
  dishIds: [String!]! 
}

type Period {
  id: String! 
  name: String! 
  startTime: String! 
  endTime: String!
  stations: [StationDishMap!]!
  updatedAt: String!
}

type RestaurantToday {
  id: RestaurantIds
  updatedAt: String
  periods: [Period!]! 
}

input DiningEventsQuery {
  restaurantId: RestaurantId
}

input RestaurantsQuerySchema {
  id: RestaurantIds
}

input RestaurantTodayQuerySchema {
  id: RestaurantIds
  date: String
}

extend type Query {
  diningEvents(query: DiningEventsQuery): [DiningEvent!]!
  diningDish(id: String!): DiningDish
  diningDates: DiningDates!
    getRestaurants(query: RestaurantsQuerySchema): [Restaurant!]!
    @cacheControl(maxAge: 86400)
  getRestaurantToday(query: RestaurantTodayQuerySchema): RestaurantToday
    @cacheControl(maxAge: 86400)
}
`;
