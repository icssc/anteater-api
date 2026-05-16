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
          requirementId: undefined as bigint | undefined,
          collegeRequirementId: undefined as bigint | undefined,
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
    for (const obj of majorSpecData) {
      const requirementId = await tx
        .insert(majorRequirement)
        .values(obj)
        .onConflictDoUpdate({
          target: majorRequirement.id,
          set: conflictUpdateSetAllCols(majorRequirement),
        })
        .returning({ id: majorRequirement.id })
        .then(([r]) => r.id);

      obj.requirementId = requirementId;

      if (obj.college) {
        const collegeRequirementId = await tx
          .insert(collegeRequirement)
          .values({
            requirements: obj.college.requirements,
            name: obj.college.name,
          })
          .onConflictDoUpdate({
            target: collegeRequirement.id,
            set: conflictUpdateSetAllCols(collegeRequirement),
          })
          .returning({ id: collegeRequirement.id })
          .then(([r]) => r.id);

        obj.collegeRequirementId = collegeRequirementId;
      }
    }

    const majorSpecToRequirementData = majorSpecData.map((obj) => {
      return {
        majorId: obj.majorId,
        specializationId: obj.specializationId,
        requirementId: obj.requirementId,
      } as typeof majorSpecializationToRequirement.$inferInsert;
    });

    const majorData = majorSpecData
      .filter((obj) => {
        return obj.specializationId === undefined;
      })
      .map((obj) => {
        return {
          name: obj.name,
          code: obj.code,
          specializationRequired: obj.specializationRequired,
          id: obj.majorId,
          degreeId: obj.degreeId,
          collegeRequirementId: obj.collegeRequirementId,
        };
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
      .onConflictDoUpdate({
        target: degree.id,
        set: conflictUpdateSetAllCols(degree),
      });

    await tx
      .insert(major)
      .values(majorData)
      .onConflictDoUpdate({
        target: major.id,
        set: conflictUpdateSetAllCols(major),
      });

    await tx
      .insert(minor)
      .values(minorData)
      .onConflictDoUpdate({
        target: minor.id,
        set: conflictUpdateSetAllCols(minor),
      });
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
