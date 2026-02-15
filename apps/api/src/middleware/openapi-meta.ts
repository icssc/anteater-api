import type { OpenAPIObjectConfigure } from "@hono/zod-openapi";

export const openapiMeta: OpenAPIObjectConfigure<{ Bindings: Env }, string> = {
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "Anteater API",
    description:
      "The unified API for UCI related data. View documentation at https://docs.icssc.club/docs/developer/anteaterapi and API reference at https://anteaterapi.com/reference.\n\nWhile all data from this API is derived from official UCI sources where applicable, we cannot guarantee its accuracy. However, we do take data accuracy very seriously, and we urge you to report any discrepancies at https://github.com/icssc/anteater-api/issues.",
    contact: { email: "icssc@uci.edu" },
  },
  externalDocs: {
    url: "https://docs.icssc.club/docs/developer/anteaterapi/rest-api",
  },
  servers: [
    {
      url: "https://anteaterapi.com",
      description: "Anteater API Production",
    },
    {
      url: "http://localhost:8787",
      description: "Anteater API Local Development Instance",
    },
  ],
  tags: [
    {
      name: "WebSoc",
      description:
        "WebSoc related data, such as valid terms and sections. Sourced directly from WebSoc.",
    },
    {
      name: "Grades",
      description:
        "Historical grade data for UCI classes, sourced via California Public Records Act (CPRA) requests. Plus / minus data not available. Data for sections with less than 10 students not available.",
    },
    {
      name: "Courses",
      description:
        "Course data, such as department, school, instructors, and previous sections. Sourced from the UCI Course Catalog and WebSoc.",
    },
    {
      name: "Programs",
      description: "Data on majors, minors, and specializations and their requirements",
    },
    {
      name: "Enrollment History",
      description: "Historical enrollment data for UCI. Sourced from WebSoc.",
    },
    {
      name: "Instructors",
      description: "Instructor data enriched with course data.",
    },
    { name: "Calendar", description: "Core calendar dates and current week." },
    {
      name: "LARC",
      description:
        "Present and past LARC (https://larc.uci.edu/) sections. Sourced from LARC's enrollment site (https://enroll.larc.uci.edu/).",
    },
    {
      name: "Study Rooms",
      description:
        "Data sourced from the UCI Libraries reservation site (https://spaces.lib.uci.edu/) and Plaza Verde amenity reservations site (https://outlook.office365.com/book/PlazaVerde3@americancampus.onmicrosoft.com/)",
    },
    { name: "AP Exams", description: "Data concerning AP Exams as they relate to UCI." },
    {
      name: "Catalogue",
      description: "Data sourced from the UCI Catalogue (https://catalogue.uci.edu).",
    },
    {
      name: "Library Traffic",
      description:
        "Library traffic data for the UCI Libraries. Data is sourced from the UCI Libraries site (https://www.lib.uci.edu/).",
    },
    { name: "Other" },
  ],
};
