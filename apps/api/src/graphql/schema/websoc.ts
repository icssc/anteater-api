export const websocSchema = `#graphql
type HourMinute @cacheControl(maxAge: 300) {
    hour: Int!
    minute: Int!
}

type WebsocSectionMeeting @cacheControl(maxAge: 300) {
    timeIsTBA: Boolean!
    bldg: [String!]
    days: String
    startTime: HourMinute
    endTime: HourMinute
}

type WebsocSectionFinalExam @cacheControl(maxAge: 300) {
    examStatus: String!
    dayOfWeek: String
    month: Int
    day: Int
    startTime: HourMinute
    endTime: HourMinute
    bldg: [String!]
}

type WebsocSectionCurrentlyEnrolled @cacheControl(maxAge: 300) {
    totalEnrolled: String!
    sectionEnrolled: String!
}

type WebsocSection @cacheControl(maxAge: 300) {
    units: String!
    status: String!
    meetings: [WebsocSectionMeeting!]!
    finalExam: WebsocSectionFinalExam!
    sectionNum: String!
    instructors: [String!]!
    maxCapacity: String!
    sectionCode: String!
    sectionType: SectionType!
    numRequested: String!
    restrictions: String!
    numOnWaitlist: String!
    numWaitlistCap: String!
    sectionComment: String!
    numNewOnlyReserved: String!
    numCurrentlyEnrolled: WebsocSectionCurrentlyEnrolled!
    updatedAt: String!
}

type WebsocCourse @cacheControl(maxAge: 300) {
    sections: [WebsocSection!]!
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    courseComment: String!
    prerequisiteLink: String!
    updatedAt: String!
}

type WebsocCoursePreview @cacheControl(maxAge: 300) {
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    year: String!
    quarter: Term!
}

type WebsocDepartment @cacheControl(maxAge: 300) {
    courses: [WebsocCourse!]!
    deptCode: String!
    deptName: String!
    deptComment: String!
    sectionCodeRangeComments: [String!]!
    courseNumberRangeComments: [String!]!
    updatedAt: String!
}

type WebsocSchool @cacheControl(maxAge: 300) {
    departments: [WebsocDepartment!]!
    schoolName: String!
    schoolComment: String!
    updatedAt: String!
}

type WebsocResponse @cacheControl(maxAge: 300) {
    schools: [WebsocSchool!]!
}

type WebsocTerm @cacheControl(maxAge: 300) {
    shortName: String!
    longName: String!
}

input WebsocQuery {
    year: String!
    quarter: Term!
    ge: String
    department: String
    courseNumber: String
    sectionCodes: String
    instructorName: String
    days: String
    building: String
    room: String
    division: String
    sectionType: String
    fullCourses: String
    cancelledCourses: String
    units: String
    startTime: String
    endTime: String
    excludeRestrictionCodes: String
    includeRelatedCourses: Boolean
}

extend type Query {
    websoc(query: WebsocQuery!): WebsocResponse!
    terms: [WebsocTerm!]!
}
`;
