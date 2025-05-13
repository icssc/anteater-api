export const libraryTrafficSchema = `#graphql
type LibraryTraffic {
  id: Int!
  libraryName: String!
  locationName: String!
  trafficCount: Int!
  trafficPercentage: Float! 
  timestamp: String!
}

input LibraryTrafficQuery {
  libraryName: String
  locationName: String
}

extend type Query {
  libraryTraffic(query: LibraryTrafficQuery): [LibraryTraffic!]!
}
`;
