import { type ExamCoursesGrantedTree, geCategories } from "@packages/stdlib";
import { z } from "zod";

const coursesGrantedTreeSchema: z.ZodType<ExamCoursesGrantedTree> = z.lazy(() =>
  z.union([
    z.object({
      AND: z.array(z.union([z.string(), coursesGrantedTreeSchema])),
    }),
    z.object({
      OR: z.array(z.union([z.string(), coursesGrantedTreeSchema])),
    }),
  ]),
);

function createExamDataSchema(
  examType: "AP" | "IB",
  minScore: number,
  maxScore: number,
  requireRewards: boolean,
) {
  const rewardSchema = z
    .object({
      acceptableScores: z.array(z.int().min(minScore).max(maxScore)).min(1),
      unitsGranted: z.int().nonnegative(),
      electiveUnitsGranted: z.int().nonnegative(),
      geGranted: z.partialRecord(z.enum(geCategories), z.int().nonnegative()),
      coursesGranted: coursesGrantedTreeSchema,
      notes: z.string().optional(),
    })
    .refine((reward) => reward.electiveUnitsGranted <= reward.unitsGranted, {
      message: "Elective units cannot exceed total units",
      path: ["electiveUnitsGranted"],
    });

  const rewardsSchema = z.array(rewardSchema);

  const examSchema = z
    .object({
      catalogueName: z.string().optional(),
      rewards: requireRewards ? rewardsSchema.min(1) : rewardsSchema,
    })
    .superRefine((exam, ctx) => {
      const seenScores = new Set<number>();

      for (const [index, reward] of exam.rewards.entries()) {
        for (const score of reward.acceptableScores) {
          if (seenScores.has(score)) {
            ctx.addIssue({
              code: "custom",
              message: `Duplicate qualifying score ${score}`,
              path: ["rewards", index, "acceptableScores"],
            });
          }

          seenScores.add(score);
        }
      }
    });

  return z.record(z.string(), examSchema).superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: `No ${examType} exams defined`,
      });
    }

    for (const name of Object.keys(data)) {
      if (!name.trim()) {
        ctx.addIssue({
          code: "custom",
          message: `${examType} exam name cannot be blank`,
          path: [name],
        });
      }
    }
  });
}

export const apExamDataSchema = createExamDataSchema("AP", 1, 5, false);
export const ibExamDataSchema = createExamDataSchema("IB", 5, 7, true);
