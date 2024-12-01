/**
 * Converts a start-end time string to a number of minutes since midnight.
 *
 * @example parseStartAndEndTimes("11:00-11:50a"); // { startTime: 660, endTime: 710 }
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
  if (endTimeMinute.includes("p")) {
    startTime += 12 * 60;
    endTime += 12 * 60;
  }
  if (startTime > endTime) startTime -= 12 * 60;
  return { startTime, endTime };
};
