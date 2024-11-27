export const larcSchema = `#graphql

type LarcSectionMeeting @cacheControl(maxAge: 300) {
    bldg: [String!]!
    days: String
    startTime: HourMinute
    endTime: HourMinute
}

type LarcSection @cacheControl(maxAge: 300) {
    meetings: [LarcSectionMeeting!]!
    instructors: [String!]!
}

type LarcCourse @cacheControl(maxAge: 300) {
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    sections: [LarcSection!]!
}

type LarcResponse @cacheControl(maxAge: 300) {
    courses: [LarcCourse!]!
}

input LarcQuery {
    instructorName: String
    building: String
    department: String
    courseNumber: String
    year: String
    quarter: String
    days: String
    startTime: String
    endTime: String
}

extend type Query {
    larc(query: LarcQuery): LarcResponse!
}
`;
