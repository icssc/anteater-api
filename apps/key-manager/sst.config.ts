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
        dns: sst.cloudflare.dns(), // note that we don't need the zone here, since cloudflare can identify it for us
      },
    });
  },
});
