export const libraryTrafficSchema = `#graphql
type LibraryTraffic @cacheControl(maxAge: 1800) {
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

enum LibraryTrafficGranularity {
  hour
  day
  week
  month
}

enum LibraryTrafficQuarter {
  Fall
  Winter
  Spring
  Summer1
  Summer10wk
  Summer2
}

enum LibraryTrafficPeriod {
  instruction
  finals
}

type LibraryTrafficHistoryRawEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: String!
  trafficCount: Int!
  trafficPercentage: Float!
  timestamp: String!
}

type LibraryTrafficHistoryRawPage {
  items: [LibraryTrafficHistoryRawEntry!]!
  nextCursor: String
}

input LibraryTrafficHistoryRawQuery {
  libraryName: String
  locationName: String
  year: String
  quarter: LibraryTrafficQuarter
  period: LibraryTrafficPeriod
  startDate: String
  endDate: String
  cursor: String
  take: Int
}

type LibraryTrafficHistoryAggregatedEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: String!
  period: String!
  avgCount: Float!
  avgPercentage: Float!
}

input LibraryTrafficHistoryAggregatedQuery {
  libraryName: String
  locationName: String
  granularity: LibraryTrafficGranularity!
  year: String
  quarter: LibraryTrafficQuarter
  period: LibraryTrafficPeriod
  startDate: String!
  endDate: String!
}

type LibraryTrafficHistoryPatternEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: String!
  year: String
  quarter: String
  bucket: Int!
  label: String!
  avgCount: Float!
  avgPercentage: Float!
}

input LibraryTrafficHistoryPatternQuery {
  libraryName: String
  locationName: String
  granularity: LibraryTrafficGranularity!
  year: String
  quarter: LibraryTrafficQuarter
  period: LibraryTrafficPeriod
  startDate: String
  endDate: String
}

extend type Query {
  libraryTraffic(query: LibraryTrafficQuery): [LibraryTraffic!]!
  libraryTrafficHistory(query: LibraryTrafficHistoryRawQuery): LibraryTrafficHistoryRawPage!
  libraryTrafficHistoryAggregated(query: LibraryTrafficHistoryAggregatedQuery): [LibraryTrafficHistoryAggregatedEntry!]!
  libraryTrafficHistoryPattern(query: LibraryTrafficHistoryPatternQuery): [LibraryTrafficHistoryPatternEntry!]!
}
`;
