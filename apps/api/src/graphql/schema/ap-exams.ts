export const apExamsSchema = `#graphql
type APExamReward @cacheControl(maxAge: 86400) {
    acceptableScores: [Int!]!
    unitsGranted: Int!
    electiveUnitsGranted: Int!
    geCategories: [String!]!
    coursesGranted: JSON!
}

type APExam @cacheControl(maxAge: 86400) {
    fullName: String!
    catalogueName: String
    rewards: [APExamReward!]!
}

input APExamsQuery {
    fullName: String,
    catalogueName: String,
}

extend type Query {
    apExams(query: APExamsQuery): [APExam!]!
}
`;
