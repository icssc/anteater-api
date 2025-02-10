export const apExamsSchema = `#graphql
type APExam @cacheControl(maxAge: 86400) {
    catalogueName: String!
    officialName: String!
}

extend type Query {
    apExams: [APExam!]!
}
`;
