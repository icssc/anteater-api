import * as assert from "node:assert";
import { exit } from "node:process";
import { database } from "@packages/db";
import type { Division } from "@packages/db/schema";
import {
  dwCollegeRequirement,
  dwDegree,
  dwMajor,
  dwMajorRequirement,
  dwMinor,
  dwMinorRequirement,
  dwSchool,
  dwSpecialization,
  dwSpecializationRequirement,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { Scraper } from "$components";

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
    catalogYear,
    degreesAwarded,
    parsedUgradRequirements,
    parsedSpecializations,
    parsedPrograms,
    parsedMinorPrograms,
  } = scraper.get();

  const ucRequirementData = parsedUgradRequirements.get("UC");
  const geRequirementData = parsedUgradRequirements.get("GE");
  const honorsFourRequirementData = parsedUgradRequirements.get("CHC4");
  const honorsTwoRequirementData = parsedUgradRequirements.get("CHC2");

  const degreeData = degreesAwarded
    .entries()
    .map(([id, name]) => ({
      id,
      name,
      division: (id.startsWith("B") ? "Undergraduate" : "Graduate") as Division,
    }))
    .toArray();

  const collegeBlocks = [] as (typeof dwCollegeRequirement.$inferInsert)[];
  const majorData = parsedPrograms
    .values()
    .map(([college, { name, degreeType, code, requirements, specializationRequired }]) => {
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
        specializationRequired,
        requirements,
        ...(collegeBlockIndex !== undefined ? { collegeBlockIndex } : {}),
        collegeRequirement: null as bigint | null,
      };
    })
    .toArray();

  const minorData = parsedMinorPrograms
    .values()
    .map(({ name, code: id, requirements }) => ({ id, name, requirements }))
    .toArray();

  const specData = parsedSpecializations
    .values()
    .map(([majorId, specName, { degreeType, code, requirements }]) => ({
      id: `${degreeType}-${code}`,
      name: specName,
      majorId: `${majorId.degreeType}-${majorId.code}`,
      requirements,
    }))
    .toArray();
  await db.transaction(async (tx) => {
    if (ucRequirementData && geRequirementData) {
      await tx
        .insert(dwSchool)
        .values([
          {
            id: "UC",
            catalogYear,
            requirements: ucRequirementData,
          },
          {
            id: "GE",
            catalogYear,
            requirements: geRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: [dwSchool.id, dwSchool.catalogYear],
          set: conflictUpdateSetAllCols(dwSchool),
        });
    }

    if (honorsFourRequirementData) {
      await tx
        .insert(dwSchool)
        .values([
          {
            id: "CHC4",
            catalogYear,
            requirements: honorsFourRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: [dwSchool.id, dwSchool.catalogYear],
          set: conflictUpdateSetAllCols(dwSchool),
        });
    }

    if (honorsTwoRequirementData) {
      await tx
        .insert(dwSchool)
        .values([
          {
            id: "CHC2",
            catalogYear,
            requirements: honorsTwoRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: [dwSchool.id, dwSchool.catalogYear],
          set: conflictUpdateSetAllCols(dwSchool),
        });
    }

    await tx
      .insert(dwDegree)
      .values(degreeData)
      .onConflictDoUpdate({ target: dwDegree.id, set: conflictUpdateSetAllCols(dwDegree) });

    // we need to determine the db ID of school blocks and update major objects accordingly first
    const collegeBlockIds = await tx
      .insert(dwCollegeRequirement)
      .values(collegeBlocks)
      .onConflictDoUpdate({
        target: dwCollegeRequirement.id,
        set: conflictUpdateSetAllCols(dwCollegeRequirement),
      })
      .returning({ id: dwCollegeRequirement.id })
      .then((rows) => rows.map(({ id }) => id));

    for (const majorObj of majorData) {
      if (majorObj.collegeBlockIndex !== undefined) {
        majorObj.collegeRequirement = collegeBlockIds[majorObj.collegeBlockIndex];
      }
    }

    await tx
      .insert(dwMajor)
      .values(majorData)
      .onConflictDoUpdate({ target: dwMajor.id, set: conflictUpdateSetAllCols(dwMajor) });
    await tx
      .insert(dwMajorRequirement)
      .values(
        majorData.map((maj) => ({
          ...maj,
          programId: maj.id,
          catalogYear,
        })),
      )
      .onConflictDoUpdate({
        target: [dwMajorRequirement.programId, dwMajorRequirement.catalogYear],
        set: conflictUpdateSetAllCols(dwMajorRequirement),
      });

    await tx
      .insert(dwMinor)
      .values(minorData)
      .onConflictDoUpdate({ target: dwMinor.id, set: conflictUpdateSetAllCols(dwMinor) });
    await tx
      .insert(dwMinorRequirement)
      .values(
        minorData.map((min) => ({
          ...min,
          programId: min.id,
          catalogYear,
        })),
      )
      .onConflictDoUpdate({
        target: [dwMinorRequirement.programId, dwMinorRequirement.catalogYear],
        set: conflictUpdateSetAllCols(dwMinorRequirement),
      });

    await tx
      .insert(dwSpecialization)
      .values(specData)
      .onConflictDoUpdate({
        target: dwSpecialization.id,
        set: conflictUpdateSetAllCols(dwSpecialization),
      });
    await tx
      .insert(dwSpecializationRequirement)
      .values(
        specData.map((spec) => ({
          ...spec,
          programId: spec.id,
          catalogYear,
        })),
      )
      .onConflictDoUpdate({
        target: [dwSpecializationRequirement.programId, dwSpecializationRequirement.catalogYear],
        set: conflictUpdateSetAllCols(dwSpecializationRequirement),
      });
  });
  exit(0);
}

main().then();
