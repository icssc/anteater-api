import Google from "next-auth/providers/google";

import type { NextAuthConfig } from "next-auth";
import { z } from "zod";

const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = z
  .object({ AUTH_GOOGLE_ID: z.string(), AUTH_GOOGLE_SECRET: z.string() })
  .parse(process.env);

export default {
  providers: [Google({ clientId: AUTH_GOOGLE_ID, clientSecret: AUTH_GOOGLE_SECRET })],
} satisfies NextAuthConfig;
