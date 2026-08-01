export const coursesSchema = `#graphql
type CoursePreview @cacheControl(maxAge: 86400) {
    id: String!
    title: String!
    department: String!
    courseNumber: String!
}

enum TentativeInstructorStatus {
    assigned
    tbd
}

type TentativeInstructor {
    status: TentativeInstructorStatus!
    name: String!
    ucinetid: String
}

type TentativeCourseOffering {
    term: String!
    instructors: [TentativeInstructor!]!
    source: String!
    sourceUrl: String!
    academicYear: String!
    lastUpdated: String
    updatedAt: String @deprecated(reason: "Use lastUpdated")
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
    repeatabilityTimes: Int
    repeatabilityType: String
    gradingOption: String!
    concurrent: String!
    sameAs: String!
    restriction: String!
    overlap: String!
    corequisites: String!
    geList: [String!]!
    geText: String!
    terms: [String!]!
    tentativeOfferings: [TentativeCourseOffering!]! @cacheControl(maxAge: 300)
}

type CoursesByCursor {
    items: [Course!]!
    nextCursor: String
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

input CoursesByCursorQuery {
    department: String
    courseNumber: String
    courseNumeric: Int
    titleContains: String
    courseLevel: CourseLevel
    minUnits: Float
    maxUnits: Float
    descriptionContains: String
    geCategory: String
    cursor: String
    take: Int
}

extend type Query {
    batchCourses(ids: [String!]!): [Course!]!
    course(id: String!): Course!
    courses(query: CoursesQuery!): [Course!]!
    coursesByCursor(query: CoursesByCursorQuery!): CoursesByCursor!
}
`;
