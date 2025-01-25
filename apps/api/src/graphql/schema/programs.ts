export const programsSchema = `#graphql
interface ProgramRequirementBase {
    label: String!
}

type ProgramCourseRequirement implements ProgramRequirementBase @cacheControl(maxAge: 86400) {
    label: String!
    requirementType: String!
    courseCount: Int!
    courses: [String!]!
}

type ProgramUnitRequirement implements ProgramRequirementBase @cacheControl(maxAge: 86400) {
    label: String!
    requirementType: String!
    unitCount: Int!
    courses: [String!]!
}

type ProgramGroupRequirement implements ProgramRequirementBase @cacheControl(maxAge: 86400) {
    label: String!
    requirementType: String!
    # circular
    requirements: [JSON!]!
}

union ProgramRequirement = ProgramCourseRequirement | ProgramUnitRequirement | ProgramGroupRequirement

type Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement]
}

input ProgramRequirementsQuery {
    programId: String!
}

extend type Query {
    major(query: ProgramRequirementsQuery!): Program!
    minor(query: ProgramRequirementsQuery!): Program!
    specialization(query: ProgramRequirementsQuery!): Program!
}
`;
