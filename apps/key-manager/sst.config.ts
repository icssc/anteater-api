/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: "key-manager",
      removal: "remove",
      home: "aws",
      providers: { cloudflare: "6.10.0" },
    };
  },
  async run() {
    const secret = new sst.Secret("CLOUDFLARE_DNS_ZONE_ID");
    new sst.aws.Nextjs("key-manager", {
      domain: {
        name: "dashboard.anteaterapi.com",
        dns: sst.cloudflare.dns({ zone: secret }),
      },
    });
  },
});
