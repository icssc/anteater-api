import { calendarResolvers } from "$graphql/resolvers/calendar";
import { coursesResolvers } from "$graphql/resolvers/courses";
import { enrollmentHistoryResolvers } from "$graphql/resolvers/enrollment-history";
import { gradesResolvers } from "$graphql/resolvers/grades";
import { instructorsResolvers } from "$graphql/resolvers/instructors";
import { larcResolvers } from "$graphql/resolvers/larc.ts";
import { searchResolvers } from "$graphql/resolvers/search";
import { websocResolvers } from "$graphql/resolvers/websoc";
import { weekResolvers } from "$graphql/resolvers/week";
import { mergeResolvers } from "@graphql-tools/merge";

export const resolvers = mergeResolvers([
  calendarResolvers,
  coursesResolvers,
  enrollmentHistoryResolvers,
  gradesResolvers,
  instructorsResolvers,
  searchResolvers,
  websocResolvers,
  weekResolvers,
  larcResolvers,
]);
