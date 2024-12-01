interface MeetingDays {
  meetsMonday: boolean;
  meetsTuesday: boolean;
  meetsWednesday: boolean;
  meetsThursday: boolean;
  meetsFriday: boolean;
  meetsSaturday: boolean;
  meetsSunday: boolean;
}

type Day = "M" | "Tu" | "W" | "Th" | "F" | "S" | "Su";
type Days = Day[];

const dayMap: Record<Day, keyof MeetingDays> = {
  M: "meetsMonday",
  Tu: "meetsTuesday",
  W: "meetsWednesday",
  Th: "meetsThursday",
  F: "meetsFriday",
  S: "meetsSaturday",
  Su: "meetsSunday",
};

/**
 * Parse a string of days into a MeetingDays
 *
 * @example
 * parseMeetingDays("MWF");
 * // { meetsMonday: true, meetsTuesday: false, ...}
 *
 * @param days string or list of days (e.g. "MWF" or ["M", "W", "F"])
 * @returns MeetingDays
 */
export const parseMeetingDays = (days: string | Days): MeetingDays => {
  const res: MeetingDays = {
    meetsMonday: false,
    meetsTuesday: false,
    meetsWednesday: false,
    meetsThursday: false,
    meetsFriday: false,
    meetsSaturday: false,
    meetsSunday: false,
  };

  if (Array.isArray(days)) {
    for (const day of days) {
      res[dayMap[day]] = true;
    }
  } else {
    for (const day of days.match(/M|Tu|W|Th|F|Sa|Su/g) || []) {
      res[dayMap[day as Day]] = true;
    }
  }

  return res;
};
