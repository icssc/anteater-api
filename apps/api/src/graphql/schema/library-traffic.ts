export const libraryTrafficSchema = `#graphql
type LibraryTraffic {
  id: String!
  locationName: String!
  trafficCount: Int!
  trafficPercentage: Float! 
  timestamp: String!
}

input LibraryTrafficQuery {
  locationName: String
}

extend type Query {
  libraryTraffic(query: LibraryTrafficQuery): [LibraryTraffic!]!
}
`;
