import { apExamResolvers } from "$graphql/resolvers/ap-exams";
import { calendarResolvers } from "$graphql/resolvers/calendar";
import { catalogueResolvers } from "$graphql/resolvers/catalogue.ts";
import { coursesResolvers } from "$graphql/resolvers/courses";
import { diningResolvers } from "$graphql/resolvers/dining.ts";
import { enrollmentHistoryResolvers } from "$graphql/resolvers/enrollment-history";
import { gradesResolvers } from "$graphql/resolvers/grades";
import { instructorsResolvers } from "$graphql/resolvers/instructors";
import { larcResolvers } from "$graphql/resolvers/larc.ts";
import { libraryTrafficResolvers } from "$graphql/resolvers/library-traffic";
import { programResolvers } from "$graphql/resolvers/programs.ts";
import { searchResolvers } from "$graphql/resolvers/search";
import { studyRoomsResolvers } from "$graphql/resolvers/study-rooms";
import { websocResolvers } from "$graphql/resolvers/websoc";
import { weekResolvers } from "$graphql/resolvers/week";

export const resolvers = [
  apExamResolvers,
  calendarResolvers,
  coursesResolvers,
  diningResolvers,
  enrollmentHistoryResolvers,
  gradesResolvers,
  instructorsResolvers,
  larcResolvers,
  libraryTrafficResolvers,
  programResolvers,
  catalogueResolvers,
  searchResolvers,
  websocResolvers,
  weekResolvers,
  studyRoomsResolvers,
];
