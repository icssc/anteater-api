import authConfig from "@/auth.config";
import { database } from "@/db";
import { users } from "@/db/schema";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import NextAuth, { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: User & DefaultSession["user"];
  }

  interface User {
    isAdmin: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth(async (_req) => {
  const cf = getCloudflareContext();
  const db = database(cf.env.USERS_DB.connectionString);

  return {
    adapter: DrizzleAdapter(db),
    callbacks: {
      async session({ session, user }) {
        if (!user) {
          return session;
        }

        const result = await db
          .select({ isAdmin: users.isAdmin })
          .from(users)
          .where(eq(users.id, user.id))
          .then((rows) => rows[0]);

        session.user.isAdmin = result.isAdmin;

        return session;
      },
    },
    pages: {
      signIn: "/login",
    },
    session: {
      strategy: "database",
    },
    ...authConfig,
  };
});
