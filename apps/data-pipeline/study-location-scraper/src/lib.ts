import type { database } from "@packages/db";
import { lt, sql } from "@packages/db/drizzle";
import { studyLocation, studyRoom, studyRoomSlot } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import type { Cheerio, CheerioAPI } from "cheerio";
import { load } from "cheerio";
import fetch from "cross-fetch";
import type { AnyNode } from "domhandler";

type StudyRoom = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  description: string;
  directions: string;
  techEnhanced: boolean;
  slots: Slot[];
};

type StudyLocation = {
  id: string;
  name: string;
  rooms: StudyRoom[];
};

type SlotResponse = {
  start: string;
  end: string;
  itemId: string;
  className?: string;
};

type Slot = {
  studyRoomId: string;
  start: Date;
  end: Date;
  isAvailable: boolean;
};

type StudySpacesResponse = {
  slots: SlotResponse[];
};

type StudySpaces = {
  slots: Slot[];
};

const ROOM_SPACE_URL = "https://spaces.lib.uci.edu/space";
const LIB_SPACE_URL = "https://spaces.lib.uci.edu/spaces";
const LIB_SPACE_AVAILABILITY_URL = "https://spaces.lib.uci.edu/spaces/availability/grid";

/**
 * Shortened libary names mapped to their IDs used by spaces.lib.uci.edu
 * See https://www.lib.uci.edu/ for shortened names
 **/
const studyLocations: Record<string, { name: string; lid: string }> = {
  Langson: { name: "Langson Library", lid: "6539" },
  Gateway: { name: "Gateway Study Center", lid: "6579" },
  Science: { name: "Science Library", lid: "6580" },
  MRC: { name: "Multimedia Resources Center", lid: "6581" },
  GML: { name: "Grunigen Medical Library", lid: "12189" },
};

/**
 * Make post request used by "https://spaces.lib.uci.edu/spaces" to retrieve room availability.
 *
 * @param lid - Library ID
 * @param start - Date format YYYY-MM-DD
 * @param end - Date format YYYY-MM-DD
 * @returns {object} JSON response returned by request
 */
const getStudySpaces = async (lid: string, start: string, end: string): Promise<StudySpaces> =>
  await fetch(LIB_SPACE_AVAILABILITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${LIB_SPACE_URL}?lid=${lid}`,
    },
    body: new URLSearchParams({ lid, gid: "0", start, end, pageSize: "18" }),
  })
    .then((res): Promise<StudySpacesResponse> => res.json())
    .then((res) => ({
      slots: res.slots.map((slot) => ({
        studyRoomId: slot.itemId,
        start: new Date(`${slot.start.replace(" ", "T")}Z`),
        end: new Date(`${slot.end.replace(" ", "T")}Z`),
        isAvailable: !slot.className,
      })),
    }));

function processGML(descriptionHeader: Cheerio<AnyNode>, $: CheerioAPI): string {
  let descriptionText = "";
  descriptionHeader.find("p").each(function () {
    let paraText = $(this).text().trim();
    if (paraText.includes("\n")) {
      paraText = paraText.replaceAll(/\n/g, ", ");
      if (!paraText.endsWith(":")) {
        paraText += ". ";
      }
    }
    descriptionText += `${paraText} `;
  });
  descriptionText = descriptionText.replace(/\s{2,}/g, " ").trim();
  descriptionText = descriptionText.replace(/\s+,/g, ",");
  descriptionText = descriptionText.replace(/\.\s*\./g, ".");
  descriptionText = descriptionText.replace(".,", ".");
  return descriptionText;
}

function processDescription(
  descriptionHeader: Cheerio<AnyNode>,
  location: string,
  $: CheerioAPI,
): string {
  let descriptionText: string;
  if (location === "Grunigen Medical Library") {
    descriptionText = processGML(descriptionHeader, $);
  } else {
    const descriptionParts: string[] = [];
    descriptionHeader.contents().each((_, content) => {
      if (content.nodeType === 3) {
        const textContent = $(content).text().trim();
        if (textContent) {
          descriptionParts.push(textContent);
        }
      } else if (content.nodeType === 1) {
        const child = $(content);
        if (child.is("p, ul, li, strong, em, span, br")) {
          if (child.is("ul")) {
            child.find("li").each((_, li) => {
              descriptionParts.push(`- ${$(li).text().trim()}`);
            });
          } else if (child.is("br")) {
            descriptionParts.push("\n");
          } else {
            descriptionParts.push(child.text().trim());
          }
        }
      }
    });

    let combinedDescription = descriptionParts.join(" ").replace(/\n+/g, ", ");
    combinedDescription = combinedDescription
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*\.\s*/g, ". ")
      .replace(/\s{2,}/g, " ")
      .replace(/\.,/g, ".")
      .replace(/\.\s*\./g, ".");

    combinedDescription = combinedDescription.replace(/\.\s*$/, ".");
    descriptionText = combinedDescription.trim();
  }

  if (descriptionText && !descriptionText.endsWith(".")) {
    descriptionText += ".";
  }

  return descriptionText;
}

async function getRoomInfo(RoomId: string): Promise<StudyRoom> {
  const url = `${ROOM_SPACE_URL}/${RoomId}`;
  const room: StudyRoom = {
    id: `${RoomId}`,
    name: "",
    capacity: 0,
    location: "",
    description: "",
    directions: "",
    techEnhanced: false,
    slots: [],
  };
  const text = await fetch(url).then((x) => x.text());
  const $ = load(text);

  const roomHeader = $("#s-lc-public-header-title");
  const roomHeaderText = roomHeader.text().trim();
  const headerMatch = roomHeaderText.match(
    /^(.*?)\s*(\(Tech Enhanced\))?\s*\n*\s*\((.*?)\)\s*\n*\s*Capacity:\s(\d+)/,
  );
  if (headerMatch) {
    room.name = headerMatch[1].trim();
    if (headerMatch[2]) {
      room.techEnhanced = true;
    }
    room.location = headerMatch[3].trim();
    room.capacity = Number.parseInt(headerMatch[4], 10);
  }

  const directionsHeader = $(".s-lc-section-directions");
  const directionsText = directionsHeader.find("p").text().trim();
  if (directionsText) {
    room.directions = directionsText.trim();
    if (!room.directions.endsWith(".")) {
      room.directions += ".";
    }
  }

  const descriptionHeader = $(".s-lc-section-description");
  room.description = processDescription(descriptionHeader, room.location, $);
  return room;
}

async function scrapeStudyLocations(): Promise<StudyLocation[]> {
  const date = new Date();
  const start = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  date.setDate(date.getDate() + 3);
  const end = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const locations: StudyLocation[] = [];
  for (const lib in studyLocations) {
    const studyLocation: Omit<StudyLocation, "rooms"> & { rooms: Map<string, StudyRoom> } = {
      id: studyLocations[lib].lid,
      name: lib,
      rooms: new Map(),
    };
    const spaces = await getStudySpaces(studyLocation.id, start, end);
    for (const slot of spaces.slots) {
      if (!studyLocation.rooms.has(slot.studyRoomId)) {
        studyLocation.rooms.set(slot.studyRoomId, await getRoomInfo(slot.studyRoomId));
      }
      studyLocation.rooms.get(slot.studyRoomId)?.slots.push(slot);
    }
    locations.push({
      ...studyLocation,
      rooms: Array.from(studyLocation.rooms.values()),
    });
  }
  return locations;
}

export async function doLibraryScrape(db: ReturnType<typeof database>) {
  const locations = await scrapeStudyLocations();
  const locationRows = locations.map(({ id, name }) => ({ id, name }));
  const roomRows = locations.flatMap(({ id: studyLocationId, rooms }) =>
    rooms.map((room) => ({ ...room, studyLocationId })),
  );
  const slotRows = roomRows.flatMap((room) => room.slots);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TIME ZONE 'America/Los_Angeles';`);
    await tx
      .insert(studyLocation)
      .values(locationRows)
      .onConflictDoUpdate({
        target: studyLocation.id,
        set: conflictUpdateSetAllCols(studyLocation),
      });
    await tx
      .insert(studyRoom)
      .values(roomRows)
      .onConflictDoUpdate({
        target: studyRoom.id,
        set: conflictUpdateSetAllCols(studyRoom),
      });
    await tx
      .insert(studyRoomSlot)
      .values(slotRows)
      .onConflictDoUpdate({
        target: [studyRoomSlot.studyRoomId, studyRoomSlot.start, studyRoomSlot.end],
        set: conflictUpdateSetAllCols(studyRoomSlot),
      });
    await tx.delete(studyRoomSlot).where(lt(studyRoomSlot.end, new Date()));
  });
}
