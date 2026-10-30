import { type ExamCoursesGrantedTree, geCategories } from "@packages/stdlib";
import { z } from "zod";

// A course credit reward can contain nested AND/OR requirements
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

const ibRewardSchema = z
  .object({
    acceptableScores: z.array(z.union([z.literal(5), z.literal(6), z.literal(7)])).min(1),
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

const ibExamSchema = z
  .object({
    catalogueName: z.string().optional(),
    rewards: z.array(ibRewardSchema).min(1),
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

export const ibExamDataSchema = z.record(z.string(), ibExamSchema).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "No IB exams defined",
    });
  }

  for (const name of Object.keys(data)) {
    if (!name.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "IB exam name cannot be blank",
        path: [name],
      });
    }
  }
});
