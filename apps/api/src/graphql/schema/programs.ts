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

type ProgramMarkerRequirement implements ProgramRequirementBase @cacheControl(maxAge: 86400) {
    label: String!
}

union ProgramRequirement = ProgramCourseRequirement | ProgramUnitRequirement | ProgramGroupRequirement | ProgramMarkerRequirement

interface Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement!]!
}

type SchoolRequirements @cacheControl(maxAge: 86400) {
    name: String!
    requirements: [ProgramRequirement!]!
}

type Major implements Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement!]!
    schoolRequirements: SchoolRequirements
}

type Minor implements Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement!]!
}

type Specialization implements Program @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    requirements: [ProgramRequirement!]!
}

enum UgradRequirementsBlockId {
    UC
    GE
}

type UgradRequirements @cacheControl(maxAge: 86400) {
    id: UgradRequirementsBlockId!,
    requirements: [ProgramRequirement!]!,
}

enum StandingYear {
    Freshman
    Sophomore
    Junior
    Senior
}

type YearPlan @cacheControl(maxAge: 86400) {
    year: StandingYear!
    fall: [String!]!
    winter: [String!]!
    spring: [String!]!
}

type SampleProgramVariation @cacheControl(maxAge: 86400) {
    label: String
    sampleProgram: [YearPlan!]!
    notes: [String!]!
}

type SampleProgramsRequirements @cacheControl(maxAge: 86400) {
    id: String!
    programName: String!
    variations: [SampleProgramVariation!]!
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

input UgradRequrementsQuery {
    id: UgradRequirementsBlockId!
}

input SampleProgramsQuery {
    id: String
}

extend type Query {
    majors(query: MajorsQuery): [MajorPreview!]!
    minors(query: MinorsQuery): [MinorPreview!]!
    specializations(query: SpecializationsQuery): [SpecializationPreview!]!
    major(query: ProgramRequirementsQuery!): Major!
    minor(query: ProgramRequirementsQuery!): Minor!
    specialization(query: ProgramRequirementsQuery!): Specialization!
    ugradRequirements(query: UgradRequrementsQuery!): UgradRequirements!
    samplePrograms(query: SampleProgramsQuery): [SampleProgramsRequirements!]!
}
`;
