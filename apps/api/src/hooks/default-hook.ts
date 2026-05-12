import type { Context } from "hono";
import type { ZodError } from "zod";
import type { ErrorSchema } from "$schema";

export const defaultHook = (
	result:
		| { success: false; error: ZodError }
		| { success: true; data: unknown },
	c: Context,
) => {
	if (!result.success) {
		return c.json<ErrorSchema>(
			{
				ok: false,
				message: result.error.issues.map((issue) => issue.message).join("; "),
			},
			422,
		);
	}
};
