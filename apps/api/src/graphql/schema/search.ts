export const searchSchema = `#graphql
union CourseOrInstructor = Course | Instructor

type SearchResponse @cacheControl(maxAge: 86400) {
    result: CourseOrInstructor!
    rank: Float!
}

input SearchQuery {
    query: String!
    take: Int
    skip: Int
}

extend type Query {
    search(query: SearchQuery!): [SearchResponse!]!
}
`;
