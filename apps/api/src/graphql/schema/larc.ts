export const larcSchema = `#graphql

type LarcSection @cacheControl(maxAge: 300) {
    days: String!
    time: String!
    instructor: String!
    bldg: String!
    websocCourse: WebsocCoursePreview!
}

input LarcQuery {
    instructor: String
    bldg: String
    department: String
    courseNumber: String
    year: String
    quarter: String
}

extend type Query {
    larc(query: LarcQuery): [LarcSection!]!
}
`;
