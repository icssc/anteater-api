export const courseMaterialsSchema = `#graphql
enum MaterialTerm {
    Fall
    Winer
    Spring
    Summer
}

enum TextbookFormat {
    Physical
    Electronic
    Both
    OER
}

enum MaterialRequirement {
    Required
    Recommended
    GoToClassFirst
}

type CourseMaterial @cacheControl(maxAge: 86400) {
    year: String!
    quarter: MaterialTerm!
    sectionCode: String!
    department: String!
    courseNumber: String!
    courseNumeric: Int!
    instructors: [String!]!
    author: String
    title: String!
    edition: String
    format: TextbookFormat!
    requirement: MaterialRequirement
    isbn: String
    mmsId: String
    link: String
}

input GetCourseMaterialsQuery {
    year: String
    quarter: MaterialTerm
    department: String
    courseNumber: String
    sectionCode: String
    instructors: String
    author: String
    title: String
    format: TextbookFormat
    requirement: MaterialRequirement
}

extend type Query {
    getCourseMaterials(query: GetCourseMaterialsQuery): [CourseMaterial!]!
}
`;
