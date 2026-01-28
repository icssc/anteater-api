/// <reference path="./.sst/platform/config.d.ts" />
import { z } from "zod";

const { AWS_ACM_CERTIFICATE_ARN, CLOUDFLARE_DNS_ZONE_ID } = z
  .object({ AWS_ACM_CERTIFICATE_ARN: z.string(), CLOUDFLARE_DNS_ZONE_ID: z.string() })
  .parse(process.env);

export default $config({
  app() {
    return {
      name: "key-manager",
      removal: "remove",
      home: "aws",
      providers: { cloudflare: "5.43.0" },
    };
  },
  async run() {
    new sst.aws.Nextjs("key-manager", {
      domain: {
        name: "dashboard.anteaterapi.com",
        cert: AWS_ACM_CERTIFICATE_ARN,
        dns: sst.cloudflare.dns({ zone: CLOUDFLARE_DNS_ZONE_ID }),
      },
    });
  },
});
