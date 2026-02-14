export const diningSchema = `#graphql
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

type DiningDish {
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

type DiningEvent {
  title: String!
  image: String
  restaurantId: String!
  description: String
  start: String!
  end: String
  updatedAt: String!
}

type DiningDates {
  earliest: String
  latest: String
}
`;
