import type { NextAuthConfig } from "next-auth";

export default {
  providers: [
    {
      id: "icssc",
      name: "ICSSC OIDC",
      type: "oidc",
      clientId:
        process.env.CF_ENV === "prod" ? "anteater-api-key-manager" : "anteater-api-key-manager-dev",
      issuer: "https://auth.icssc.club",
      wellKnown: "https://auth.icssc.club/.well-known/openid-configuration",
      idToken: true,
      authorization: { params: { scope: "openid email profile" } },
      checks: ["pkce", "state"],
      // :)
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          // set later
          isAdmin: false,
        };
      },
    },
  ],
  trustHost: true,
} satisfies NextAuthConfig;
