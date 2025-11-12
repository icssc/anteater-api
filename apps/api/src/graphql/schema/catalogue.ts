export const catalogueSchema = `#graphql
enum StandingYear {
    Freshman
    Sophomore
    Junior
    Senior
}

enum CourseEntryType {
    courseId
    string
}

type CourseEntry @cacheControl(maxAge: 86400) {
    type: CourseEntryType!
    value: String!
}

type YearPlan @cacheControl(maxAge: 86400) {
    year: StandingYear!
    fall: [CourseEntry!]!
    winter: [CourseEntry!]!
    spring: [CourseEntry!]!
}

type SampleProgramVariation @cacheControl(maxAge: 86400) {
    label: String
    courses: [YearPlan!]!
    notes: [String!]!
}

type SampleProgram @cacheControl(maxAge: 86400) {
    id: String!
    programName: String!
    variations: [SampleProgramVariation!]!
}

input SampleProgramsQuery {
    id: String
}

extend type Query {
    samplePrograms(query: SampleProgramsQuery): [SampleProgram!]!
}
`;
