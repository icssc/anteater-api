export const ibExamsSchema = `#graphql
type IBExamReward @cacheControl(maxAge: 86400) {
    acceptableScores: [Int!]!
    unitsGranted: Int!
    electiveUnitsGranted: Int!
    geGranted: JSON!
    coursesGranted: JSON!
    notes: String
}

type IBExam @cacheControl(maxAge: 86400) {
    fullName: String!
    catalogueName: String
    rewards: [IBExamReward!]!
}

input IBExamsQuery {
    fullName: String,
    catalogueName: String,
}

extend type Query {
    ibExams(query: IBExamsQuery): [IBExam!]!
}
`;
