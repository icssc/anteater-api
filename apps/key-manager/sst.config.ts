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
      },
    });
  },
});
