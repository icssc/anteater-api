import * as assert from "node:assert";
import { exit } from "node:process";
import { Scraper } from "$components";
import { database } from "@packages/db";
import {
  collegeRequirement,
  degree,
  major,
  minor,
  schoolRequirement,
  specialization,
} from "@packages/db/schema";
import type { Division } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";

async function main() {
  if (!process.env.DEGREEWORKS_SCRAPER_X_AUTH_TOKEN) throw new Error("Auth cookie not set.");
  if (!process.env.DB_URL) throw new Error("DB_URL not set.");
  const db = database(process.env.DB_URL);
  const scraper = await Scraper.new({
    authCookie: process.env.DEGREEWORKS_SCRAPER_X_AUTH_TOKEN,
    db,
  });
  await scraper.run();
  const {
    degreesAwarded,
    parsedUgradRequirements,
    parsedSpecializations,
    parsedPrograms,
    parsedMinorPrograms,
  } = scraper.get();
  const ucRequirementData = parsedUgradRequirements.get("UC");
  const geRequirementData = parsedUgradRequirements.get("GE");
  const honorsFourRequirementData = parsedUgradRequirements.get("CHC4");

  const degreeData = degreesAwarded
    .entries()
    .map(([id, name]) => ({
      id,
      name,
      division: (id.startsWith("B") ? "Undergraduate" : "Graduate") as Division,
    }))
    .toArray();

  const collegeBlocks = [] as (typeof collegeRequirement.$inferInsert)[];
  const majorData = parsedPrograms
    .values()
    .map(([college, { name, degreeType, code, requirements }]) => {
      let collegeBlockIndex: number | undefined;
      if (college?.requirements) {
        const wouldInsert = { name: college.name, requirements: college.requirements };
        const existing = collegeBlocks.findIndex((schoolExisting) => {
          try {
            assert.deepStrictEqual(schoolExisting, wouldInsert);
            return true;
          } catch {
            return false;
          }
        });

        if (existing === -1) {
          collegeBlocks.push(wouldInsert);
          collegeBlockIndex = collegeBlocks.length - 1;
        } else {
          collegeBlockIndex = existing;
        }
      }

      return {
        id: `${degreeType}-${code}`,
        degreeId: degreeType ?? "",
        code,
        name,
        requireSpec: requirements.some((x) => x.requirementType === "Spec"),
        requirements: requirements.filter((x) => x.requirementType !== "Spec"),
        ...(collegeBlockIndex !== undefined ? { collegeBlockIndex } : {}),
      };
    })
    .toArray();

  const minorData = parsedMinorPrograms
    .values()
    .map(({ name, code: id, requirements }) => ({ id, name, requirements }))
    .toArray();

  const specData = parsedSpecializations
    .values()
    .map(([majorId, specName, { name, degreeType, code, requirements }]) => ({
      id: `${degreeType}-${code}`,
      name: specName,
      majorId: `${majorId.degreeType}-${majorId.code}`,
      requirements,
    }))
    .toArray();
  await db.transaction(async (tx) => {
    if (ucRequirementData && geRequirementData) {
      await tx
        .insert(schoolRequirement)
        .values([
          {
            id: "UC",
            requirements: ucRequirementData,
          },
          {
            id: "GE",
            requirements: geRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: schoolRequirement.id,
          set: conflictUpdateSetAllCols(schoolRequirement),
        });
    }

    if (honorsFourRequirementData) {
      await tx
        .insert(schoolRequirement)
        .values([
          {
            id: "CHC4",
            requirements: honorsFourRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: schoolRequirement.id,
          set: conflictUpdateSetAllCols(schoolRequirement),
        });
    }

    await tx
      .insert(degree)
      .values(degreeData)
      .onConflictDoUpdate({ target: degree.id, set: conflictUpdateSetAllCols(degree) });

    // we need to determine the db ID of school blocks and update major objects accordingly first
    const collegeBlockIds = await tx
      .insert(collegeRequirement)
      .values(collegeBlocks)
      .onConflictDoUpdate({
        target: collegeRequirement.requirements,
        set: conflictUpdateSetAllCols(collegeRequirement),
      })
      .returning({ id: collegeRequirement.id })
      .then((rows) => rows.map(({ id }) => id));

    for (const majorObj of majorData) {
      if (majorObj.collegeBlockIndex !== undefined) {
        (majorObj as typeof major.$inferInsert).collegeRequirement =
          collegeBlockIds[majorObj.collegeBlockIndex];
      }
    }

    await tx
      .insert(major)
      .values(majorData)
      .onConflictDoUpdate({ target: major.id, set: conflictUpdateSetAllCols(major) });
    await tx
      .insert(minor)
      .values(minorData)
      .onConflictDoUpdate({ target: major.id, set: conflictUpdateSetAllCols(minor) });
    await tx
      .insert(specialization)
      .values(specData)
      .onConflictDoUpdate({ target: major.id, set: conflictUpdateSetAllCols(specialization) });
  });
  exit(0);
}

main().then();
