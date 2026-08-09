export function parseRepeatability(repeatText: string): {
  repeatabilityTimes: number | null;
  unit: "credit_hours" | "times" | null;
} {
  const timesMatch1 = /May be taken for credit (\d+) time(s)?/.exec(repeatText);
  const timesMatch2 = /May be taken (\d+) time(s)? */.exec(repeatText);
  const unitsMatch = /May be taken for credit for (\d+) units/.exec(repeatText);

  if (timesMatch1) {
    return {
      repeatabilityTimes: Number.parseInt(timesMatch1[1], 10),
      unit: "times",
    };
  }
  if (timesMatch2) {
    return {
      repeatabilityTimes: Number.parseInt(timesMatch2[1], 10),
      unit: "times",
    };
  }
  if (unitsMatch) {
    return {
      repeatabilityTimes: Number.parseInt(unitsMatch[1], 10),
      unit: "credit_hours",
    };
  }
  if (repeatText.toLowerCase().includes("unlimited")) {
    return {
      repeatabilityTimes: null,
      unit: null,
    };
  }

  // The current EURO ST 201 catalogue entry omits the number of units. Preserve
  // the source wording while treating its unspecified limit as unbounded.
  if (repeatText.trim() === "May be taken for credit for unit as topics vary") {
    return {
      repeatabilityTimes: null,
      unit: null,
    };
  }
  if (repeatText.trim() !== "") {
    throw new Error(`Unrecognized repeatability text: ${repeatText}`);
  }

  return {
    repeatabilityTimes: 0,
    unit: "times",
  };
}
