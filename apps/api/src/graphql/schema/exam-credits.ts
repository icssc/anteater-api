type ExamType = "AP" | "IB";

function createExamTypeDefs(examType: ExamType) {
  const queryName = examType === "AP" ? "apExams" : "ibExams";

  return `
    type ${examType}ExamReward @cacheControl(maxAge: 86400) {
      acceptableScores: [Int!]!
      unitsGranted: Int!
      electiveUnitsGranted: Int!
      geGranted: JSON!
      coursesGranted: JSON!
      notes: String
    }

    type ${examType}Exam @cacheControl(maxAge: 86400) {
      fullName: String!
      catalogueName: String
      rewards: [${examType}ExamReward!]!
    }

    input ${examType}ExamsQuery {
      fullName: String
      catalogueName: String
    }

    extend type Query {
      ${queryName}(query: ${examType}ExamsQuery): [${examType}Exam!]!
    }
  `;
}

export const examCreditsSchema = `#graphql
${createExamTypeDefs("AP")}
${createExamTypeDefs("IB")}
`;
