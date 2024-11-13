export const coursesSchema = `#graphql
type CoursePreview @cacheControl(maxAge: 86400) {
    id: String!
    title: String!
    department: String!
    courseNumber: String!
}

type Course @cacheControl(maxAge: 86400) {
    id: String!
    department: String!
    courseNumber: String!
    courseNumeric: Int!
    school: String!
    title: String!
    courseLevel: String!
    minUnits: Float!
    maxUnits: Float!
    description: String!
    departmentName: String!
    instructors: [InstructorPreview!]!
    prerequisiteTree: JSON!
    prerequisiteText: String!
    prerequisites: [CoursePreview!]!
    dependencies: [CoursePreview!]!
    repeatability: String!
    gradingOption: String!
    concurrent: String!
    sameAs: String!
    restriction: String!
    overlap: String!
    corequisites: String!
    geList: [String!]!
    geText: String!
    terms: [String!]!
}

input CoursesQuery {
    department: String
    courseNumber: String
    courseNumeric: Int
    titleContains: String
    courseLevel: CourseLevel
    minUnits: Float
    maxUnits: Float
    descriptionContains: String
    geCategory: String
    take: Int
    skip: Int
}

extend type Query {
    course(id: String!): Course!
    courses(query: CoursesQuery!): [Course!]!
    batchCourses(ids: [String!]!): [Course!]!
}
`;
