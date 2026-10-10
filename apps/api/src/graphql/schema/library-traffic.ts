export const libraryTrafficSchema = `#graphql
enum LibraryName {
  LANGSON_LIBRARY
  SCIENCE_LIBRARY
  GATEWAY_STUDY_CENTER
}

type LibraryTraffic @cacheControl(maxAge: 1800) {
  id: Int!
  libraryName: LibraryName!
  locationName: String!
  trafficCount: Int!
  trafficPercentage: Float!
  timestamp: String!
}

input LibraryTrafficQuery {
  libraryName: LibraryName
  locationName: String
}

enum LibraryTrafficGranularity {
  hour
  day
  week
  month
}

enum LibraryTrafficPeriod {
  instruction
  finals
}

type LibraryTrafficHistoryRawEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: LibraryName!
  trafficCount: Int!
  trafficPercentage: Float!
  timestamp: String!
}

type LibraryTrafficHistoryRawPage @cacheControl(maxAge: 1800) {
  items: [LibraryTrafficHistoryRawEntry!]!
  nextCursor: String
}

input LibraryTrafficHistoryRawQuery {
  libraryName: LibraryName
  locationName: String
  year: String
  quarter: Term
  period: LibraryTrafficPeriod
  startDate: String
  endDate: String
  cursor: String
  take: Int
}

type LibraryTrafficHistoryAggregatedEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: LibraryName!
  bucketStart: String!
  avgCount: Float!
  avgPercentage: Float!
}

input LibraryTrafficHistoryAggregatedQuery {
  libraryName: LibraryName
  locationName: String
  granularity: LibraryTrafficGranularity!
  year: String
  quarter: Term
  period: LibraryTrafficPeriod
  startDate: String
  endDate: String
}

type LibraryTrafficHistoryPatternEntry @cacheControl(maxAge: 1800) {
  locationId: Int!
  locationName: String!
  libraryName: LibraryName!
  year: String
  quarter: String
  bucket: Int!
  label: String!
  avgCount: Float!
  avgPercentage: Float!
}

input LibraryTrafficHistoryPatternQuery {
  libraryName: LibraryName
  locationName: String
  granularity: LibraryTrafficGranularity!
  year: String
  quarter: Term
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
