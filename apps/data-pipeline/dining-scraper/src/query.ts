import type z from "zod";

export async function queryAdobeECommerce<Schema extends z.Schema>(
  query: string,
  variables: object,
  schema: Schema,
): Promise<z.infer<Schema> | null> {
  const response = await fetch(
    `https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`,
    {
      headers: {
        Referer: "https://uci.mydininghub.com/",
        "content-type": "application/json",
        store: "ch_uci_en",
        "magento-store-code": "ch_uci",
        "magento-website-code": "ch_uci",
        "magento-store-view-code": "ch_uci_en",
        "x-api-key": "ElevateAPIProd",
        Origin: "https://uci.mydininghub.com",
      },
    },
  );

  if (!response.ok) {
    console.error("GraphQL ERROR in queryAdobeECommerce:");
    console.error("HTTP status:", response.status);
    console.error("Response body:", await response.text());
    return null;
  }

  return schema.parse(await response.json());
}
