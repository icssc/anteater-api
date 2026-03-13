import type { Schedule, WeekTimes } from "./model.ts";

/**
 * Takes in data in the form "Mo-Fr 07:15-11:00; Sa-Su 09:00-11:00"
 */
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
      console.warn(`parseOpeningHours: Skipping invalid time block format: ${block}`);
      continue;
    }

    const [dayRangeStr, timeRangeStr] = parts;
    let openTime = "00:00";
    let closeTime = "00:00";

    // Only parse the range if it isn't "off"
    if (timeRangeStr !== "off") {
      const times = timeRangeStr.split("-");
      if (times.length < 2) {
        console.warn(`[parseOpeningHours]: Incomplete time range: ${block}`);
        continue;
      }
      [openTime, closeTime] = times;
    }

    const dayIndices: number[] = [];

    // Case: Day Range (e.g., "Mo-Fr")
    if (dayRangeStr.includes("-")) {
      const [startDay, endDay] = dayRangeStr.split("-");
      const startIndex = DAY_MAP[startDay];
      const endIndex = DAY_MAP[endDay];

      if (startIndex === undefined || endIndex === undefined) {
        console.warn(`Skipping unknown day range: ${dayRangeStr}`);
        continue;
      }

      // Logic to handle wrap-around (e.g., Fr-Mo)
      let curr = startIndex;
      while (curr !== endIndex) {
        dayIndices.push(curr);
        curr = (curr + 1) % 7;
      }
      dayIndices.push(endIndex);
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

/**
 * Returns the current schedule, if in a special meal schedule date/week.
 * Otherwise, defaults to standard schedule.
 * @param schedules a list of schedules to search
 * @param date the date of the schedule to get
 */
export function findCurrentlyActiveSchedule(schedules: Schedule[], date: Date): Schedule {
  return (
    schedules.find(
      (schedule) =>
        schedule.startDate &&
        schedule.endDate &&
        date >= schedule.startDate &&
        date <= schedule.endDate,
    ) ??
    // NOTE: We will assert that a standard schedule will always be returned...
    // if this no longer applies in the future, God help you.
    (schedules.find((schedule) => schedule.type === "standard") as Schedule)
  );
}
