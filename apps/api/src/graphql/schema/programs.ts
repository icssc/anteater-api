export const programsSchema = `#graphql
enum ProgramDivision {
    Undergraduate
    Graduate
}

interface ProgramPreview {
    id: String!
    name: String!
}

type MajorPreview implements ProgramPreview @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    type: String!
    division: ProgramDivision!
    specializations: [String!]!
}

type MinorPreview implements ProgramPreview @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
}

type SpecializationPreview implements ProgramPreview @cacheControl(maxAge: 86400) {
    id: String!
    majorId: String!
    name: String!
}

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
    requirementCount: Int!
    # circular
    requirements: JSON!
}

union ProgramRequirement = ProgramCourseRequirement | ProgramUnitRequirement | ProgramGroupRequirement

type Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement]!
}

input ProgramRequirementsQuery {
    programId: String!
}

input MajorsQuery {
    id: String!
}

input MinorsQuery {
    id: String!
}

input SpecializationsQuery {
    majorId: String!
}

extend type Query {
    majors(query: MajorsQuery): [MajorPreview!]!
    minors(query: MinorsQuery): [MinorPreview!]!
    specializations(query: SpecializationsQuery): [SpecializationPreview!]!
    major(query: ProgramRequirementsQuery!): Program!
    minor(query: ProgramRequirementsQuery!): Program!
    specialization(query: ProgramRequirementsQuery!): Program!
}
`;
