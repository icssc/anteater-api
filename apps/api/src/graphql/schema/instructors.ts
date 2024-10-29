export const instructorsSchema = `#graphql
type InstructorPreview @cacheControl(maxAge: 86400) {
    ucinetid: String!
    name: String!
    title: String!
    email: String!
    department: String!
    shortenedNames: [String!]!
}

type CoursePreviewWithTerms @cacheControl(maxAge: 86400) {
    id: String!
    title: String!
    department: String!
    courseNumber: String!
    terms: [String!]!
}

type Instructor @cacheControl(maxAge: 86400) {
    ucinetid: String!
    name: String!
    title: String!
    email: String!
    department: String!
    shortenedNames: [String!]!
    courses: [CoursePreviewWithTerms!]!
}

input InstructorsQuery {
    nameContains: String
    titleContains: String
    departmentContains: String
    take: Int
    skip: Int
}

extend type Query {
    instructor(ucinetid: String!): Instructor!
    instructors(query: InstructorsQuery!): [Instructor!]!
}
`;
