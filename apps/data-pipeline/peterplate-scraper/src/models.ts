import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios, { type AxiosError, type AxiosResponse } from "axios";
import winston from "winston";
import { z } from "zod";
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const defaultFormat = [
  winston.format.timestamp(),
  winston.format.printf((info) => `[${info.timestamp} ${info.level}] ${info.message}`),
];
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(...defaultFormat),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), ...defaultFormat),
    }),
    new winston.transports.File({
      filename: `${__dirname}/../logs/${Date.now()}.log`,
    }),
  ],
});
export type Schedule = {
  name: string;
  type: string;
  startDate?: Date;
  endDate?: Date;
  mealPeriods: MealPeriodWithHours[];
};
export const GetLocationSchema = z.object({
  data: z.object({
    Commerce_mealPeriods: z.array(
      z.object({
        name: z.string(),
        id: z.number(),
        position: z.number(),
      }),
    ),
    Commerce_attributesList: z.object({
      items: z.array(
        z.object({
          code: z.string(),
          options: z.array(
            z.object({
              value: z.string(),
              label: z.string(),
            }),
          ),
        }),
      ),
    }),
    getLocation: z.object({
      commerceAttributes: z.object({
        maxMenusDate: z.string().date(),
        children: z.array(
          z.object({
            id: z.number(),
            uid: z.string(),
            name: z.string(),
            position: z.number(),
          }),
        ),
      }),
      aemAttributes: z.object({
        hoursOfOperation: z.object({
          schedule: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              meal_periods: z.array(
                z.object({
                  meal_period: z.string(),
                  opening_hours: z.string(),
                }),
              ),
              start_date: z.string().date().optional(),
              end_date: z.string().date().optional(),
            }),
          ),
        }),
      }),
    }),
  }),
});
export type LocationInfo = z.infer<typeof GetLocationSchema>;
export type MealPeriod = LocationInfo["data"]["Commerce_mealPeriods"][0];
export type WeekTimes = [string, string, string, string, string, string, string];
export type MealPeriodWithHours = MealPeriod & {
  // The hours for which the meal period opens (e.g. openHours[day] = "11:00")
  openHours: WeekTimes;
  // The hours for which the meal period occurs (e.g. openHours[day] = "14:00")
  closeHours: WeekTimes;
};
export type GetLocationQueryVariables = {
  locationUrlKey: "brandywine" | "the-anteatery";
  sortOrder: "ASC" | "DESC";
};
export type DiningHallInformation = {
  // Maps the allergen (e.g. "Eggs") to its code (39)
  allergenIntoleranceCodes: { [allergen: string]: number };
  // Maps the preference (e.g. "Gluten Free") to its code (78)
  menuPreferenceCodes: { [preference: string]: number };
  // Maps the id of the station to station name
  stationsInfo: { [uid: string]: string };
  // Schedules (special and standard) for this dining hall
  schedules: Schedule[];
};
export const getLocationQuery = `
query getLocation(
  $locationUrlKey: String!
  $sortOrder: Commerce_SortOrderEnum
) {
  getLocation(campusUrlKey: "campus", locationUrlKey: $locationUrlKey) {
    commerceAttributes {
      maxMenusDate
      children {
        id
        uid
        name
        position
      }
    }
    aemAttributes {
      hoursOfOperation {
        schedule
      }
      name
    }
  }
  Commerce_mealPeriods(sort_order: $sortOrder) {
    name
    id
    position
  }
  Commerce_attributesList(entityType: CATALOG_PRODUCT) {
    items {
      code
      options {
        value
        label
      }
    }
  }
}
`;
export const graphQLEndpoint: string =
  "https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql?";
export const graphQLHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0",
  Referer: "https://uci.mydininghub.com/",
  "content-type": "application/json",
  store: "ch_uci_en",
  "magento-store-code": "ch_uci",
  "magento-website-code": "ch_uci",
  "magento-store-view-code": "ch_uci_en",
  "x-api-key": "ElevateAPIProd",
  Origin: "https://uci.mydininghub.com",
};
export function parseOpeningHours(hoursString: string): [WeekTimes, WeekTimes] {
  const DAY_MAP: { [key: string]: number } = {
    Su: 0,
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
  };

  const openingTime: string[] = new Array(7).fill("");
  const closingTime: string[] = new Array(7).fill("");

  const timeBlocks = hoursString
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const block of timeBlocks) {
    // Example: block = "Mo-Fr 07:15-11:00"
    const parts = block.split(/\s+/); // Split by one or more spaces

    if (parts.length < 2) {
      console.warn(`[parseOpeningHours]: Skipping invalid time block format: ${block}`);
      continue;
    }

    const dayRangeStr = parts[0]; // "Mo-Fr"
    const timeRangeStr = parts[1]; // "07:15-11:00 OR off"
    if (!dayRangeStr || !timeRangeStr) {
      logger.warn(`[parseOpeningHours] Skipping malformed time block: "${block}"`); //this is not native to peterplate api!!
      continue;
    }

    // If the timeRange is off, then we need not do anything (it is not open)
    if (timeRangeStr === "off") continue;

    const [openTime, closeTime] = timeRangeStr.split("-"); // "07:15", "11:00"

    if (!openTime || !closeTime) {
      console.warn(`[parseOpeningHours]: Skipping block with incomplete time range: ${block}`);
      continue;
    }

    const dayIndices: number[] = [];

    // Case: Day Range (e.g., "Mo-Fr")
    if (dayRangeStr.includes("-")) {
      const dayParts = dayRangeStr.split("-");

      if (dayParts.length < 2) {
        console.warn(
          `[parseOpeningHours]: Skipping block with malformed day range: ${dayRangeStr}}`,
        );
        continue;
      }

      const startDay = dayParts[0];
      const endDay = dayParts[1];
      if (!startDay || !endDay) {
        logger.warn(`[parseOpeningHours] Skipping malformed day range: "${dayRangeStr}"`); //this is not native to peterplate api!!
        continue;
      }
      const startIndex = DAY_MAP[startDay];
      const endIndex = DAY_MAP[endDay];

      if (startIndex === undefined || endIndex === undefined) {
        console.warn(`Skipping block with unknown day range: ${dayRangeStr}`);
        continue;
      }

      // handles if date range wraps around (i.e. Mo-Su)
      if (startIndex <= endIndex) {
        for (let i = startIndex; i <= endIndex; i++) dayIndices.push(i);
      } else {
        for (let i = startIndex; i < 7; i++) dayIndices.push(i);
        for (let i = 0; i <= endIndex; i++) dayIndices.push(i);
      }

      // Case: Single Day (e.g., "Mo")
    } else {
      const singleIndex = DAY_MAP[dayRangeStr];
      if (singleIndex !== undefined) {
        dayIndices.push(singleIndex);
      } else {
        console.warn(`Skipping block with unknown single day: ${dayRangeStr}`);
        continue;
      }
    }

    // Apply the times to the array indices
    for (const index of dayIndices) {
      openingTime[index] = openTime;
      closingTime[index] = closeTime;
    }
  }

  // Return the result, casting to the required fixed-length tuple type
  return [openingTime as WeekTimes, closingTime as WeekTimes];
}
export async function queryAdobeECommerce(
  query: string,
  variables: object,
): Promise<AxiosResponse> {
  try {
    const response = await axios({
      method: "get",
      url: graphQLEndpoint,
      headers: graphQLHeaders,
      params: {
        query: query,
        variables: JSON.stringify(variables),
      },
    });

    type ResponseWithQuery = AxiosResponse["data"] & {
      query: string;
      params: string;
    };
    const loggedResponse: ResponseWithQuery = {
      ...response.data,
      query: query,
      params: variables,
    };

    if (process.env.IS_LOCAL) {
      const outPath = `query-${new Date().toISOString().replace(/:/g, "-")}-response.json`;
      writeFileSync(`./${outPath}`, JSON.stringify(loggedResponse), {
        flag: "w",
      });
      logger.info(`[query] Wrote AdobeEcommerce response to ${process.cwd()}/${outPath}.`);
    }

    return response;
  } catch (err: unknown) {
    console.error("GraphQL ERROR in queryAdobeECommerce:");

    if (axios.isAxiosError(err)) {
      const aErr = err as AxiosError;
      console.error("Axios message:", aErr.message);
      if (aErr.code) {
        console.error("Error code:", aErr.code);
      }
      console.error("HTTP status:", aErr.response?.status);
      console.error("Response body:", aErr.response?.data);
      // If no response, show the request info
      if (aErr.code) {
        console.error("Error code:", aErr.code);
      }
    } else {
      console.error(err);
    }

    throw err;
  }
}
