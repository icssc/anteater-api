/**
 * Converts a start-end time string to a number of minutes since midnight.
 * If an end time doesn't specify "p" or "pm", we assume it ends in "am" based on WebSoc logic
 * @example parseStartAndEndTimes("11:00-11:50"); // { startTime: 660, endTime: 710 }
 * @example parseStartAndEndTimes("1:00-1:50p"); // { startTime: 780, endTime: 830 }
 * @example parseStartAndEndTimes("11:00-2:50p"); // { startTime: 660, endTime: 890 }
 *
 * If a time passes through midnight, we return number of minutes passed since the midnight of the first day.
 * @example parseStartAndEndTimes("11:00-1:50"); // { startTime: 660, endTime: 1550 }
 *
 * @param time start-end time string
 * @returns startTime and endTime in minutes since midnight
 */
export const parseStartAndEndTimes = (time: string) => {
  let startTime: number;
  let endTime: number;
  const [startTimeString, endTimeString] = time
    .trim()
    .split("-")
    .map((x) => x.trim());
  const [startTimeHour, startTimeMinute] = startTimeString.split(":");
  startTime = (Number.parseInt(startTimeHour, 10) % 12) * 60 + Number.parseInt(startTimeMinute, 10);
  const [endTimeHour, endTimeMinute] = endTimeString.split(":");
  endTime = (Number.parseInt(endTimeHour, 10) % 12) * 60 + Number.parseInt(endTimeMinute, 10);
  if (endTimeMinute.includes("p") && startTime <= endTime) startTime += 12 * 60;
  if (startTime > endTime) endTime += 24 * 60;
  return { startTime, endTime };
};
