export const libraryTrafficSchema = `#graphql
type LibraryTraffic {
  id: String!
  location_name: String!
  traffic_count: Int!
  traffic_percentage: Float! 
  timestamp: String!
  is_active: Boolean!
}

extend type Query {
  latestLibraryTraffic(floor_name: String): [LibraryTraffic!]!
}
`;
