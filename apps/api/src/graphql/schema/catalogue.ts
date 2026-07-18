export const catalogueSchema = `#graphql
enum StandingYear {
    Freshman
    Sophomore
    Junior
    Senior
}

enum CourseEntryType {
    courseId
    unknown
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

type CatalogProgramVariation @cacheControl(maxAge: 86400) {
    label: String
    courses: [YearPlan!]!
    notes: [String!]!
}

type CatalogProgram @cacheControl(maxAge: 86400) {
    id: String!
    programName: String!
    variations: [CatalogProgramVariation!]!
}

input SampleProgramsQuery {
    id: String
}

extend type Query {
    samplePrograms(query: SampleProgramsQuery): [CatalogProgram!]!
}
`;
