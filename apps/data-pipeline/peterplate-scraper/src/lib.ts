import {
  type DiningHallInformation,
  type GetLocationQueryVariables,
  GetLocationSchema,
  type LocationInfo,
  type MealPeriodWithHours,
  type Schedule,
  getLocationQuery,
  parseOpeningHours,
  queryAdobeECommerce,
} from "./models";
export async function getLocationInformation(
  location: GetLocationQueryVariables["locationUrlKey"],
  sortOrder: GetLocationQueryVariables["sortOrder"],
): Promise<DiningHallInformation> {
  const getLocationVariables = {
    locationUrlKey: location,
    sortOrder: sortOrder,
  } as GetLocationQueryVariables;

  const response = await queryAdobeECommerce(getLocationQuery, getLocationVariables);

  const parsedData: LocationInfo = GetLocationSchema.parse(response.data);

  const getLocation = parsedData.data.getLocation;
  const commerceMealPeriods = parsedData.data.Commerce_mealPeriods;
  const commerceAttributesList = parsedData.data.Commerce_attributesList;
  const schedules = getLocation.aemAttributes.hoursOfOperation.schedule;

  // Get all of the schedules
  const parsedSchedules: Schedule[] = schedules.map((schedule) => {
    const scheduleMealPeriods: MealPeriodWithHours[] = schedule.meal_periods.map((mealPeriod) => {
      const mealPeriodInfo = commerceMealPeriods.find((cmp) => cmp.name === mealPeriod.meal_period);

      const [openHours, closeHours] = parseOpeningHours(mealPeriod.opening_hours);

      return {
        name: mealPeriod.meal_period,
        id: mealPeriodInfo?.id ?? "UNIDENTIFIED",
        position: mealPeriodInfo?.position ?? 0,
        openHours,
        closeHours,
      } as MealPeriodWithHours;
    });

    return {
      name: schedule.name,
      type: schedule.type,
      startDate: schedule.start_date,
      endDate: schedule.end_date,
      mealPeriods: scheduleMealPeriods,
    } as Schedule;
  });

  const allergenIntoleranceCodes: DiningHallInformation["allergenIntoleranceCodes"] = {};
  const allergenItem = commerceAttributesList.items.find(
    (item) => item.code === "allergens_intolerances",
  );
  if (allergenItem) {
    for (const option of allergenItem.options) {
      allergenIntoleranceCodes[option.label] = Number.parseInt(option.value);
    }
  }

  const menuPreferenceCodes: DiningHallInformation["menuPreferenceCodes"] = {};
  const commerceAttributesItem = commerceAttributesList.items.find(
    (item) => item.code === "menu_preferences",
  );

  if (commerceAttributesItem) {
    for (const option of commerceAttributesItem.options) {
      menuPreferenceCodes[option.label] = Number.parseInt(option.value);
    }
  }

  const stationsInfo: { [id: string]: string } = {};
  const commerceAttributesChildren = getLocation.commerceAttributes.children;
  if (commerceAttributesChildren) {
    for (const station of commerceAttributesChildren) {
      stationsInfo[station.id] = station.name;
    }
  }

  return {
    allergenIntoleranceCodes,
    menuPreferenceCodes,
    stationsInfo,
    schedules: parsedSchedules,
  };
}
