import * as assert from "node:assert";
import { exit } from "node:process";
import { database } from "@packages/db";
import type { Division } from "@packages/db/schema";
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

  const collegeBlocks = [] as (typeof collegeRequirement.$inferInsert)[];

  console.log(`parsed programs length: ${parsedPrograms.size}`);
  const majorSpecData = parsedPrograms
    .values()
    .map(
      ({
        college,
        major: { name, degreeType, code, requirements, specializationRequired },
        specCode,
      }) => {
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
          ...(specCode !== undefined ? { specializationId: `${degreeType}-${specCode}` } : {}),
          name,
          specializationRequired,
          requirements,
          ...(collegeBlockIndex !== undefined ? { collegeBlockIndex } : {}),
        };
      },
    )
    .toArray();
  console.log(`major spec data length: ${majorSpecData.length}`);

  const majorRequirementBlocks = [] as (typeof majorRequirement.$inferInsert)[];
  const majorSpecToRequirementIndexData = majorSpecData.map(
    ({ id, specializationId, requirements }) => {
      const wouldInsert = { requirements };
      let majorRequirementBlockIndex: number | undefined;
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
        specializationId,
        majorRequirementBlockIndex,
      };
    },
  );

  console.log(`major spec to requirement length: ${majorSpecToRequirementIndexData.length}`);

  const majorData = majorSpecData.filter(({ specializationId }) => specializationId === undefined);
  console.log(`major data length: ${majorData.length}`);
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

    // we need to determine the db ID of school blocks and update major objects accordingly first
    const collegeBlockWithIds = await tx
      .insert(collegeRequirement)
      .values(collegeBlocks)
      .onConflictDoUpdate({
        target: collegeRequirement.requirementsHash,
        set: conflictUpdateSetAllCols(collegeRequirement),
      })
      .returning({ id: collegeRequirement.id, block: collegeRequirement.requirements });

    const majorRequirementBlockWithIds = await tx
      .insert(majorRequirement)
      .values(majorRequirementBlocks)
      .onConflictDoUpdate({
        target: majorRequirement.id,
        set: conflictUpdateSetAllCols(majorRequirement),
      })
      .returning({ id: majorRequirement.id, block: majorRequirement.requirements });

    for (const majorObj of majorData) {
      if (majorObj.collegeBlockIndex !== undefined) {
        (majorObj as typeof major.$inferInsert).collegeRequirement = collegeBlockWithIds.find(
          ({ id, block }) => {
            try {
              assert.deepStrictEqual(block, collegeBlocks[majorObj.collegeBlockIndex as number]);
              return true;
            } catch {
              return false;
            }
          },
        )?.id;
      }
    }
    const majorSpecToRequirementData = majorSpecToRequirementIndexData.map(
      ({ majorId, specializationId, majorRequirementBlockIndex }) => {
        const requirementId = majorRequirementBlockWithIds.find(({ block }) => {
          try {
            assert.deepStrictEqual(
              block,
              majorRequirementBlocks[majorRequirementBlockIndex].requirements,
            );
            return true;
          } catch {
            return false;
          }
        })!.id;
        return {
          majorId,
          specializationId,
          requirementId,
        };
      },
    );
    // for (const majorSpecObj of majorSpecToRequirementData) {
    //   (majorSpecObj as unknown as typeof majorSpecializationToRequirement.$inferInsert).requirementId =
    //     majorRequirementBlockWithIds.find(({ id, block }) => {
    //       try {
    //         assert.deepStrictEqual(
    //           block,
    //           majorRequirementBlocks[majorSpecObj.majorRequirementBlockIndex].requirements,
    //         );
    //         return true;
    //       } catch {
    //         return false;
    //       }
    //     })!.id;
    // }
    console.log(`major spec to requirement length: ${majorSpecToRequirementData.length}`);
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
