import { GraphQLError } from "graphql/error";
import type { GraphQLContext } from "$graphql/graphql-context";
import {
  apExamsQuerySchema,
  apExamsResponseSchema,
  ibExamsQuerySchema,
  ibExamsResponseSchema,
} from "$schema";
import { APExamsService, IBExamsService } from "$services";

type ExamType = "AP" | "IB";

async function resolveExams(examType: ExamType, args: { query?: unknown }, { db }: GraphQLContext) {
  const querySchema = examType === "AP" ? apExamsQuerySchema : ibExamsQuerySchema;

  const parsedArgs = querySchema.parse(args.query ?? {});

  const res =
    examType === "AP"
      ? await new APExamsService(db).getAPExams(parsedArgs)
      : await new IBExamsService(db).getIBExams(parsedArgs);

  // Preserve the existing NOT_FOUND behavior for filtered queries
  if (args.query && (parsedArgs.fullName || parsedArgs.catalogueName) && !res.length) {
    throw new GraphQLError(`Can't find any ${examType} Exams; is your id correct?`, {
      extensions: { code: "NOT_FOUND" },
    });
  }

  // Validate all outgoing GraphQL data
  const responseSchema = examType === "AP" ? apExamsResponseSchema : ibExamsResponseSchema;

  return responseSchema.parse(res);
}

export const examCreditsResolvers = {
  Query: {
    apExams: (_: unknown, args: { query?: unknown }, context: GraphQLContext) =>
      resolveExams("AP", args, context),

    ibExams: (_: unknown, args: { query?: unknown }, context: GraphQLContext) =>
      resolveExams("IB", args, context),
  },
};
