export const searchSchema = `#graphql
union CourseOrInstructor = Course | Instructor

type SearchResult @cacheControl(maxAge: 86400) {
    result: CourseOrInstructor!
    rank: Float!
}

enum SearchResultType {
    course,
    instructor,
}

type SearchResponse {
    count: Int!
    results: [SearchResult!]!
}

input SearchQuery {
    query: String!
    take: Int
    skip: Int
    resultType: SearchResultType
    department: String
    courseLevel: CourseLevel
    minUnits: Float
    maxUnits: Float
    ge: [String!]
}

extend type Query {
    search(query: SearchQuery!): SearchResponse!
}
`;
