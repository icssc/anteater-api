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
    restrictionCodes: [String!]!
    updatedAt: String!
}

type EnrollmentChangesSection @cacheControl(maxAge: 300) {
    sectionCode: String!
    from: SectionEnrollmentSnapshot
    to: SectionEnrollmentSnapshot!
}

type EnrollmentChanges @cacheControl(maxAge: 300) {
    sections: [EnrollmentChangesSection!]!
}

input EnrollmentChangesQuery {
    year: String!
    quarter: String!
    since: String!
    sections: [Int!]!
}

extend type Query {
    enrollmentChanges(query: EnrollmentChangesQuery!): EnrollmentChanges!
}
`;
