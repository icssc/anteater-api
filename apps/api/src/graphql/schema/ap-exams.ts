export const apExamsSchema = `#graphql
type APExam @cacheControl(maxAge: 86400) {
    catalogueName: String!
    officialName: String!
}

input APExamsQuery {
    id: String!,
}

extend type Query {
    apExams(query: APExamsQuery): [APExam!]!
}
`;
