export const mapSchema = `#graphql

type MapPreview @cacheControl(maxAge: 86400) {
    id: String!
    name: String!
    latitude: Float!
    longitude: Float!
    imageURLs: [String!]
    
}

input MapQuery {
    id: String!
}

extend type Query {
    map(query: MapQuery): [MapPreview!]!
}
`;
