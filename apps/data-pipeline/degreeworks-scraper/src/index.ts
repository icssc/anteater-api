import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import { exit } from "node:process";
import { Scraper } from "$components";
import { database } from "@packages/db";
import {
  collegeRequirement,
  degree,
  major,
  majorRequirement,
  majorSpecPairToRequirement,
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

  const majorSpecData = parsedPrograms
    .entries()
    .map(([k, [college, { name, degreeType, code, requirements }]]) => {
      const specCode = k.split(";")[1] !== "" ? `${degreeType}-${k.split(";")[1]}` : undefined;
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
        ...(specCode !== undefined ? { specCode } : {}),
        name,
        requirements,
        ...(collegeBlockIndex !== undefined ? { collegeBlockIndex } : {}),
      };
    })
    .toArray();
  console.log(
    `length of parsedProgarms: ${parsedPrograms.size}. lengthed of objectified parsedPrograms: ${Object.fromEntries(parsedPrograms)}.length of majorData: ${majorSpecData.length}`,
  );
  await fs.writeFile("./MajorDataFirst.json", JSON.stringify(majorSpecData, null, 2));

  const majorRequirementBlocks = [] as (typeof majorRequirement.$inferInsert)[];
  const majorSpecToRequirementData = majorSpecData.map(({ id, specCode, requirements }) => {
    const wouldInsert = { requirements };
    let majorRequirementBlockIndex: number | undefined = undefined;
    const existing = majorRequirementBlocks.findIndex((req) => {
      try {
        assert.deepEqual(wouldInsert, req);
        return true;
      } catch {
        return false;
      }
    });
    if (existing === -1) {
      majorRequirementBlocks.push(wouldInsert);
      majorRequirementBlockIndex = majorRequirementBlocks.length - 1;
    } else {
      majorRequirementBlockIndex = existing;
    }
    return {
      majorId: id,
      specId: specCode,
      majorRequirementBlockIndex,
    };
  });

  const majorData = majorSpecData.filter(({ specCode }) => specCode === undefined);

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

  await fs.writeFile(
    "./ParsedPrograms.json",
    JSON.stringify(Object.fromEntries(parsedPrograms), null, 2),
  );
  await fs.writeFile("./MajorData.json", JSON.stringify(majorData, null, 2));
  await fs.writeFile("./MajorReq.json", JSON.stringify(majorSpecToRequirementData, null, 2));
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
    console.log("Updated GE and UC req");

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
    console.log("Updated School Req");

    await tx
      .insert(degree)
      .values(degreeData)
      .onConflictDoUpdate({ target: degree.id, set: conflictUpdateSetAllCols(degree) });
    console.log("Updated Degree Data");

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
    console.log("Updated college requirements");

    const majorRequirementBlockIds = await tx
      .insert(majorRequirement)
      .values(majorRequirementBlocks)
      .onConflictDoUpdate({
        target: majorRequirement.requirementsHash,
        set: conflictUpdateSetAllCols(majorRequirement),
      })
      .returning({ id: majorRequirement.id })
      .then((rows) => rows.map(({ id }) => id));
    console.log("Update Major Requirements");

    for (const majorObj of majorData) {
      if (majorObj.collegeBlockIndex !== undefined) {
        (majorObj as typeof major.$inferInsert).collegeRequirement =
          collegeBlockIds[majorObj.collegeBlockIndex];
      }
    }
    console.log("Set college Req on majorData");

    for (const majorSpecObj of majorSpecToRequirementData) {
      if (majorSpecObj.majorRequirementBlockIndex !== undefined) {
        (majorSpecObj as typeof majorSpecPairToRequirement.$inferInsert).requirementId =
          majorRequirementBlockIds[majorSpecObj.majorRequirementBlockIndex];
      }
    }
    console.log("Set majorRequirement Id on majorSpecToRequirementData");
    await tx
      .insert(major)
      .values(majorData)
      .onConflictDoUpdate({ target: major.id, set: conflictUpdateSetAllCols(major) });
    console.log("Updated Major");
    await tx
      .insert(minor)
      .values(minorData)
      .onConflictDoUpdate({ target: minor.id, set: conflictUpdateSetAllCols(minor) });
    console.log("Updated Minors");
    await tx
      .insert(specialization)
      .values(specData)
      .onConflictDoUpdate({
        target: specialization.id,
        set: conflictUpdateSetAllCols(specialization),
      });
    console.log("Updated Specs");

    await tx
      .insert(majorSpecPairToRequirement)
      .values(majorSpecToRequirementData)
      .onConflictDoUpdate({
        target: majorSpecPairToRequirement.id,
        set: conflictUpdateSetAllCols(majorSpecPairToRequirement),
      });
    console.log("Updated Major Spec pair to Requirements table");
  });
  exit(0);
}

main().then();
