import { programsSchema } from "$graphql/schema/programs.ts";
import { mergeTypeDefs } from "@graphql-tools/merge";
import { apExamsSchema } from "./ap-exams";
import { calendarSchema } from "./calendar";
import { coursesSchema } from "./courses";
import { enrollmentHistorySchema } from "./enrollment-history";
import { enums } from "./enums";
import { gradesSchema } from "./grades";
import { instructorsSchema } from "./instructors";
import { larcSchema } from "./larc";
import { libraryTrafficSchema } from "./library-traffic";
import { searchSchema } from "./search";
import { studyRoomsGraphQLSchema } from "./study-rooms";
import { websocSchema } from "./websoc";
import { weekSchema } from "./week";

const baseSchema = `#graphql
scalar JSON

enum CacheControlScope {
    PUBLIC
    PRIVATE
}
directive @cacheControl(
    maxAge: Int
    scope: CacheControlScope
    inheritMaxAge: Boolean
) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

type Query {
    empty: String
}
`;

export const typeDefs = mergeTypeDefs([
  baseSchema,
  enums,
  apExamsSchema,
  calendarSchema,
  coursesSchema,
  enrollmentHistorySchema,
  gradesSchema,
  instructorsSchema,
  larcSchema,
  libraryTrafficSchema,
  programsSchema,
  searchSchema,
  websocSchema,
  weekSchema,
  studyRoomsGraphQLSchema,
]);
