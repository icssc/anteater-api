export const searchSchema = `#graphql
union CourseOrInstructor = Course | Instructor

type SearchResult @cacheControl(maxAge: 86400) {
    result: CourseOrInstructor!
    rank: Float!
}

type SearchResponse {
    count: Float!
    results: [SearchResult!]!
}

input SearchQuery {
    query: String!
    take: Int
    skip: Int
}

extend type Query {
    search(query: SearchQuery!): SearchResponse!
}
`;
