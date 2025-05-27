export const studyRoomsGraphQLSchema = `#graphql
  type Slot {
    studyRoomId: String!
    start: String!
    end: String!
    url: String!
    isAvailable: Boolean!
  }

  type StudyRoom {
    id: String!
    name: String!
    capacity: Int!
    location: String!
    description: String
    directions: String
    techEnhanced: Boolean!
    url: String!
    slots: [Slot]!
  }

  input StudyRoomsQuery {
    location: String
    capacityMin: Int
    capacityMax: Int
    isTechEnhanced: Boolean
    dates: [String!],
    times: [String!],
  }

  extend type Query {
    studyRoom(id: String!): StudyRoom!
    studyRooms(query: StudyRoomsQuery): [StudyRoom!]!
  }
`;
