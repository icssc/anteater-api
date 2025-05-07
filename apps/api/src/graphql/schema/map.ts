export const mapSchema = `#graphql

type MapPreview @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    latitude: String!
    longitude: String!
}

input MapQuery {
    id: String!
}

extend type Query {
    locations(query: MapQuery): [MapPreview!]!
}
`;
