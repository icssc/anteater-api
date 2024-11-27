import type { ParsedNumber } from "$schema";
import { z } from "@hono/zod-openapi";
import { isBaseTenInt } from "@packages/stdlib";

/**
 * Transforms a string of course numbers into a list of ParsedNumber objects.
 * A course number can be an integer, a string, or a range of integers.
 *
 * @example
 * courseNumberTransform("46,6B,51-53")
 * [
 *   { _type: 'ParsedInteger', value: 46 },
 *   { _type: 'ParsedString', value: '6B' },
 *   { _type: 'ParsedRange', min: 51, max: 53 }
 * ]
 *
 * @param nums string of course numbers
 * @param ctx
 *
 * @returns a list of ParsedNumber objects
 */
export const courseNumberTransform = (nums: string | undefined, ctx: z.RefinementCtx) => {
  if (!nums) return undefined;
  const parsedNums: ParsedNumber[] = [];
  for (const num of nums.split(",").map((num) => num.trim())) {
    if (num.includes("-")) {
      const [lower, upper] = num.split("-");
      if (!(isBaseTenInt(lower) && isBaseTenInt(upper))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `'${num}' is not a valid course number range. The lower and upper bounds of a course number range must both be base-10 integers.`,
        });
        return z.NEVER;
      }
      parsedNums.push({
        _type: "ParsedRange",
        min: Number.parseInt(lower, 10),
        max: Number.parseInt(upper, 10),
      });
      continue;
    }
    if (!isBaseTenInt(num)) {
      parsedNums.push({ _type: "ParsedString", value: num });
    } else {
      parsedNums.push({ _type: "ParsedInteger", value: Number.parseInt(num, 10) });
    }
  }
  return parsedNums;
};
