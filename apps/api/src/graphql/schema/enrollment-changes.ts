export const enrollmentChangesSchema = `#graphql
type NumCurrentlyEnrolled @cacheControl(maxAge: 300) {
    totalEnrolled: String!
    sectionEnrolled: String!
}
type SectionEnrollmentSnapshot @cacheControl(maxAge: 300) {
    maxCapacity: String!
    status: String!
    numCurrentlyEnrolled: NumCurrentlyEnrolled!
    numRequested: String!
    numOnWaitlist: String!
    numWaitlistCap: String!
    numNewOnlyReserved: String!
    restrictionCodes: [String!]!
    updatedAt: String!
}
type EnrollmentChangesSection @cacheControl(maxAge: 300) {
    sectionCode: String!
    from: SectionEnrollmentSnapshot
    to: SectionEnrollmentSnapshot!
}
type EnrollmentChangesCourse @cacheControl(maxAge: 300) {
    id: String!
    title: String!
    department: String!
    courseNumber: String!
    sections: [EnrollmentChangesSection!]!
}
type EnrollmentChanges @cacheControl(maxAge: 300) {
    courses: [EnrollmentChangesCourse!]!
}
input EnrollmentChangesQuery {
    year: String!
    quarter: String!
    since: String!
    sectionCodes: [String!]!
}
extend type Query {
    enrollmentChanges(query: EnrollmentChangesQuery!): EnrollmentChanges!
}
`;
