export const websocSchema = `#graphql
type HourMinute  {
    hour: Int!
    minute: Int!
}

type WebsocSectionMeeting  {
    timeIsTBA: Boolean!
    bldg: [String!]
    days: String
    startTime: HourMinute
    endTime: HourMinute
}

type WebsocSectionFinalExam  {
    examStatus: String!
    dayOfWeek: String
    month: Int
    day: Int
    startTime: HourMinute
    endTime: HourMinute
    bldg: [String!]
}

type WebsocSectionCurrentlyEnrolled  {
    totalEnrolled: String!
    sectionEnrolled: String!
}

type WebsocSection  {
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
    isCancelled: Boolean!
    updatedAt: String!
}

type WebsocCourse  {
    sections: [WebsocSection!]!
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    courseId: String!
    courseComment: String!
    prerequisiteLink: String!
    updatedAt: String!
}

type WebsocCoursePreview  {
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    year: String!
    quarter: Term!
}

type WebsocDepartment {
    courses: [WebsocCourse!]!
    deptCode: String!
    deptName: String!
    deptComment: String!
    sectionCodeRangeComments: [String!]!
    courseNumberRangeComments: [String!]!
    updatedAt: String!
}

type WebsocSchool {
    departments: [WebsocDepartment!]!
    schoolName: String!
    schoolComment: String!
    updatedAt: String!
}

type WebsocResponse  {
    schools: [WebsocSchool!]
}

type WebsocTerm  {
    shortName: String!
    longName: String!
}

type WebsocDepartmentPreview  {
    deptCode: String!
    deptName: String!
}

input WebsocQuery {
    year: String!
    quarter: Term!
    ge: String
    department: String
    courseNumber: String
    courseId: String
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

type Syllabus @cacheControl(maxAge: 86400) {
    year: String!
    quarter: Term!
    instructorNames: [String!]!
    url: String!
}

input SyllabiQuery {
    courseId: String!
    year: String
    quarter: Term
    instructor: String
}

input WebsocDepartmentsQuery {
    sinceYear: String
    sinceTerm: Term
    untilYear: String
    untilTerm: Term
}

extend type Query {
    websoc(query: WebsocQuery!): WebsocResponse!
    terms: [WebsocTerm!]!
    websocDepartments(query: WebsocDepartmentsQuery!): [WebsocDepartmentPreview!]!
    syllabi(query: SyllabiQuery!): [Syllabus!]!
}
`;
