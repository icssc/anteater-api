import { database } from "@/db";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

if (!process.env.USERS_DB_URL) {
  throw new Error("USERS_DB_URL is required");
}

const db = database(process.env.USERS_DB_URL);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [Google],
  pages: {
    signIn: "/login",
  },
});
