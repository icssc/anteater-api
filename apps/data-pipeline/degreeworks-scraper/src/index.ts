import { exit } from "node:process";
import { database } from "@packages/db";
import { notInArray, sql } from "@packages/db/drizzle";
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
import { v4 as uuidv4 } from "uuid";
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

  const majorSpecData = parsedPrograms
    .values()
    .map(
      ({
        college,
        major: { name, degreeType, code, requirements, specializationRequired },
        specCode,
      }) => {
        return {
          majorId: `${degreeType}-${code}`,
          degreeId: degreeType ?? "",
          code,
          ...(specCode !== undefined ? { specializationId: `${degreeType}-${specCode}` } : {}),
          name,
          specializationRequired,
          requirements,
          college,
          ...(college ? { collegeReqUuid: uuidv4() } : {}),
          majorReqUuid: uuidv4(),
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
    await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

    const majorReqUnifiedId = await tx.transaction(async (tx2) => {
      const idToHash = await tx2
        .insert(majorRequirement)
        .values(
          majorSpecData.map(({ requirements, majorReqUuid: id }) => {
            return { id, requirements };
          }),
        )
        .returning({ uuid: majorRequirement.id, hash: majorRequirement.requirementHash });

      await tx2
        .delete(majorRequirement)
        .where(
          notInArray(
            majorRequirement.id,
            tx2
              .selectDistinctOn([majorRequirement.requirementHash], { id: majorRequirement.id })
              .from(majorRequirement)
              .orderBy(majorRequirement.requirementHash, majorRequirement.id),
          ),
        );

      const hashToUnified = new Map(
        await tx2
          .select({ uuid: majorRequirement.id, hash: majorRequirement.requirementHash })
          .from(majorRequirement)
          .then((q) =>
            q.map(({ uuid, hash }) => {
              return [hash, uuid];
            }),
          ),
      );
      return new Map(
        idToHash.map(({ uuid, hash }) => {
          return [uuid, hashToUnified.get(hash)];
        }),
      );
    });

    const collegeReqUnifiedId = await tx.transaction(async (tx2) => {
      const idToHash = await tx2
        .insert(collegeRequirement)
        .values(
          majorSpecData
            .filter((x) => x.college !== undefined)
            .map(({ college, collegeReqUuid: uuid }) => {
              return { name: college?.name, requirements: college?.requirements, id: uuid };
            }) as (typeof collegeRequirement.$inferInsert)[],
        )
        .returning({ uuid: collegeRequirement.id, hash: collegeRequirement.requirementHash });
      await tx2
        .delete(collegeRequirement)
        .where(
          notInArray(
            collegeRequirement.id,
            tx2
              .selectDistinctOn([collegeRequirement.requirementHash], { id: collegeRequirement.id })
              .from(collegeRequirement)
              .orderBy(collegeRequirement.requirementHash, collegeRequirement.id),
          ),
        );
      const hashToUnified = new Map(
        await tx2
          .select({ uuid: collegeRequirement.id, hash: collegeRequirement.requirementHash })
          .from(collegeRequirement)
          .then((q) =>
            q.map(({ uuid, hash }) => {
              return [hash, uuid];
            }),
          ),
      );
      return new Map(
        idToHash.map(({ uuid, hash }) => {
          return [uuid, hashToUnified.get(hash)];
        }),
      );
    });

    // Unifies randomly generated uuid associated with the same requirement hash
    for (const majorSpecObj of majorSpecData) {
      if (majorSpecObj.collegeReqUuid) {
        majorSpecObj.collegeReqUuid = collegeReqUnifiedId.get(majorSpecObj.collegeReqUuid);
      }
      majorSpecObj.majorReqUuid = majorReqUnifiedId.get(majorSpecObj.majorReqUuid) as string;
    }

    const majorSpecToRequirementData = majorSpecData.map((majorSpecObj) => {
      return {
        majorId: majorSpecObj.majorId,
        specializationId: majorSpecObj.specializationId,
        requirementId: majorSpecObj.majorReqUuid,
      } as typeof majorSpecializationToRequirement.$inferInsert;
    });

    const majorData = majorSpecData
      .filter((majorSpecObj) => majorSpecObj.specializationId === undefined)
      .map((majorSpecObj) => {
        return {
          name: majorSpecObj.name,
          code: majorSpecObj.code,
          specializationRequired: majorSpecObj.specializationRequired,
          id: majorSpecObj.majorId,
          degreeId: majorSpecObj.degreeId,
          collegeRequirementId: majorSpecObj.collegeReqUuid,
        } as typeof major.$inferInsert;
      });

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
