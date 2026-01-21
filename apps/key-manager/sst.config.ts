/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: "key-manager",
      removal: "remove",
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Nextjs("key-manager", {
      domain: {
        name: "dashboard.anteaterapi.com",
        dns: sst.cloudflare.dns(),
      },
      environment: {
        USERS_DB_URL: process.env.USERS_DB_URL,
        CLOUDFLARE_KV_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
        CLOUDFLARE_DEFAULT_ACCOUNT_ID: process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID,
        AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
        AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    });
  },
});
