import { exit } from "node:process";
import { database } from "@packages/db";
import type { DegreeWorksRequirement, Division } from "@packages/db/schema";
import {
  collegeRequirement,
  degree,
  major,
  majorRequirement,
  majorSpecializationToRequirement,
  minor,
  schoolRequirement,
  specialization,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { Scraper } from "$components";

function encodeBlock(requirements: DegreeWorksRequirement[]) {
  return requirements.map((r) => r.requirementId).join("-");
}

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
  const honorsTwoRequirementData = parsedUgradRequirements.get("CHC2");

  const degreeData = degreesAwarded
    .entries()
    .map(([id, name]) => ({
      id,
      name,
      division: (id.startsWith("B") ? "Undergraduate" : "Graduate") as Division,
    }))
    .toArray();

  const collegeBlocks = new Map<string, typeof collegeRequirement.$inferInsert>();
  const majorBlocks = new Map<string, typeof majorRequirement.$inferInsert>();

  const majorSpecData = parsedPrograms
    .values()
    .map(
      ({
        college,
        major: { name, degreeType, code, requirements, specializationRequired },
        specCode,
      }) => {
        let collegeBlockEncoded: null | string = null;
        if (college?.requirements) {
          collegeBlockEncoded = encodeBlock(college.requirements);
          collegeBlocks.set(collegeBlockEncoded, {
            name: college.name,
            requirements: college.requirements,
          });
        }

        const majorBlockEncoded = encodeBlock(requirements);
        majorBlocks.set(majorBlockEncoded, { requirements });

        return {
          id: `${degreeType}-${code}`,
          degreeId: degreeType ?? "",
          code,
          majorBlockEncoded,
          ...(specCode !== undefined ? { specializationId: `${degreeType}-${specCode}` } : {}),
          name,
          specializationRequired,
          requirements,
          ...(collegeBlockEncoded !== null ? { collegeBlockEncoded } : {}),
        };
      },
    )
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

    if (honorsTwoRequirementData) {
      await tx
        .insert(schoolRequirement)
        .values([
          {
            id: "CHC2",
            requirements: honorsTwoRequirementData,
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

    // we need to determine the db ID of college and major_requirement before updating major objects accordingly
    const collegeBlockWithIds = await tx
      .insert(collegeRequirement)
      .values(collegeBlocks.values().toArray())
      .onConflictDoUpdate({
        target: collegeRequirement.requirementsHash,
        set: conflictUpdateSetAllCols(collegeRequirement),
      })
      .returning({ id: collegeRequirement.id, block: collegeRequirement.requirements });

    const majorRequirementBlockWithIds = await tx
      .insert(majorRequirement)
      .values(majorBlocks.values().toArray())
      .onConflictDoUpdate({
        target: majorRequirement.id,
        set: conflictUpdateSetAllCols(majorRequirement),
      })
      .returning({ id: majorRequirement.id, block: majorRequirement.requirements });

    const majorData = majorSpecData
      .filter((majorSpecObj) => majorSpecObj.specializationId === undefined)
      .map((majorSpecObj) => {
        const collegeRequirement = collegeBlockWithIds.find(({ block }) => {
          return encodeBlock(block) === majorSpecObj.collegeBlockEncoded;
        })?.id;
        return {
          ...majorSpecObj,
          collegeRequirement,
        };
      });
    const majorSpecToRequirementData = majorSpecData.map(
      ({ id: majorId, specializationId, majorBlockEncoded }) => {
        const requirementId = majorRequirementBlockWithIds.find(({ block }) => {
          return encodeBlock(block) === majorBlockEncoded;
        })?.id;
        return {
          majorId,
          specializationId,
          requirementId,
        } as typeof majorSpecializationToRequirement.$inferInsert;
      },
    );

    await tx
      .insert(major)
      .values(majorData)
      .onConflictDoUpdate({ target: major.id, set: conflictUpdateSetAllCols(major) });
    await tx
      .insert(minor)
      .values(minorData)
      .onConflictDoUpdate({ target: minor.id, set: conflictUpdateSetAllCols(minor) });
    await tx
      .insert(specialization)
      .values(specData)
      .onConflictDoUpdate({
        target: specialization.id,
        set: conflictUpdateSetAllCols(specialization),
      });

    await tx
      .insert(majorSpecializationToRequirement)
      .values(majorSpecToRequirementData)
      .onConflictDoUpdate({
        target: [
          majorSpecializationToRequirement.majorId,
          majorSpecializationToRequirement.specializationId,
        ],
        set: conflictUpdateSetAllCols(majorSpecializationToRequirement),
      });
  });
  exit(0);
}

main().then();
