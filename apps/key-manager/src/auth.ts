import { database } from "@/db";
import { users } from "@/db/schema";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

if (!process.env.USERS_DB_URL) {
  throw new Error("USERS_DB_URL is required");
}

const db = database(process.env.USERS_DB_URL);

declare module "next-auth" {
  interface User {
    isAdmin: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      const result = await db
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, user.id))
        .then((rows) => rows[0]);

      session.user.isAdmin = result?.isAdmin ?? false;

      return session;
    },
  },
});
