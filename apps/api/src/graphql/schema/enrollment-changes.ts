export const enrollmentChangesSchema = `#graphql
  type EnrollmentChangesStatus @cacheControl(maxAge: 300) {
    from: String!
    to: String!
  }

  type NumCurrentlyEnrolled @cacheControl(maxAge: 300) {
    totalEnrolled: String!
    sectionEnrolled: String!
  }

  type EnrollmentChangesSection @cacheControl(maxAge: 300) {
    sectionCode: String!
    maxCapacity: String!
    status: EnrollmentChangesStatus!
    numCurrentlyEnrolled: NumCurrentlyEnrolled!
    numRequested: String!
    numOnWaitlist: String!
    numWaitlistCap: String!
  }

  type EnrollmentChangeCourse @cacheControl(maxAge: 300) {
    deptCode: String!
    courseTitle: String!
    courseNumber: String!
    sections: [EnrollmentChangesSection!]!
  }

  type EnrollmentChanges @cacheControl(maxAge: 300) {
    courses: [EnrollmentChangeCourse!]!
    updatedAt: String!
  }

  input EnrollmentChangesQuery {
    sections: String!
  }

  extend type Query {
    enrollmentChanges(query: EnrollmentChangesQuery): EnrollmentChanges!
  }
`;
