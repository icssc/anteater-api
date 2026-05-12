import { exit } from "node:process";
import { database } from "@packages/db";
import {
  type Division,
  dwDegree,
  dwMajor,
  dwMajorRequirement,
  dwMajorSpecializationToRequirement,
  dwMajorYear,
  dwMinor,
  dwMinorRequirement,
  dwSchoolRequirement,
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
        };
      },
    )
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
        .insert(dwMajorRequirement)
        .values(obj)
        .onConflictDoUpdate({
          target: dwMajorRequirement.id,
          set: conflictUpdateSetAllCols(dwMajorRequirement),
        })
        .returning({ id: dwMajorRequirement.id })
        .then(([r]) => r.id);

      obj.requirementId = requirementId;
    }

    if (ucRequirementData && geRequirementData) {
      await tx
        .insert(dwSchoolRequirement)
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
          target: dwSchoolRequirement.id,
          set: conflictUpdateSetAllCols(dwSchoolRequirement),
        });
    }

    if (honorsFourRequirementData) {
      await tx
        .insert(dwSchoolRequirement)
        .values([
          {
            id: "CHC4",
            catalogYear,
            requirements: honorsFourRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: dwSchoolRequirement.id,
          set: conflictUpdateSetAllCols(dwSchoolRequirement),
        });
    }

    if (honorsTwoRequirementData) {
      await tx
        .insert(dwSchoolRequirement)
        .values([
          {
            id: "CHC2",
            catalogYear,
            requirements: honorsTwoRequirementData,
          },
        ])
        .onConflictDoUpdate({
          target: dwSchoolRequirement.id,
          set: conflictUpdateSetAllCols(dwSchoolRequirement),
        });
    }

    await tx
      .insert(dwDegree)
      .values(degreeData)
      .onConflictDoUpdate({ target: dwDegree.id, set: conflictUpdateSetAllCols(dwDegree) });

    await tx
      .insert(dwMajor)
      .values(
        majorSpecData
          // skip additional (major, spec) entries; add exactly once for each major
          .filter((m) => m.specializationId === undefined)
          .map((m) => ({
            id: m.majorId,
            name: m.name,
            code: m.code,
            degreeId: m.degreeId,
          })),
      )
      .onConflictDoUpdate({ target: dwMajor.id, set: conflictUpdateSetAllCols(dwMajor) });

    await tx
      .insert(dwMajorYear)
      .values(
        majorSpecData
          .filter((m) => m.specializationId === undefined)
          .map((m) => ({
            programId: m.majorId,
            catalogYear,
            specializationRequired: m.specializationRequired,
            collegeRequirementsTitle: m.college?.name,
            collegeRequirements: m.college?.requirements,
          })),
      )
      .onConflictDoUpdate({
        target: [dwMajorYear.programId, dwMajorYear.catalogYear],
        set: conflictUpdateSetAllCols(dwMajorYear),
      });

    await tx
      .insert(dwMajorSpecializationToRequirement)
      .values(
        majorSpecData.map((m) => {
          return {
            majorId: m.majorId,
            specializationId: m.specializationId,
            requirementId: m.requirementId,
          } as typeof dwMajorSpecializationToRequirement.$inferInsert;
        }),
      )
      .onConflictDoUpdate({
        target: [
          dwMajorSpecializationToRequirement.majorId,
          dwMajorSpecializationToRequirement.specializationId,
        ],
        set: conflictUpdateSetAllCols(dwMajorSpecializationToRequirement),
      });

    await tx
      .insert(dwMinor)
      .values(
        parsedMinorPrograms
          .values()
          .map((m) => ({
            id: m.code,
            name: m.name,
          }))
          .toArray(),
      )
      .onConflictDoUpdate({ target: dwMinor.id, set: conflictUpdateSetAllCols(dwMinor) });

    await tx
      .insert(dwMinorRequirement)
      .values(
        parsedMinorPrograms
          .values()
          .map((m) => ({
            programId: m.code,
            catalogYear,
            requirements: m.requirements,
          }))
          .toArray(),
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
        specData.map((s) => ({
          programId: s.id,
          catalogYear,
          requirements: s.requirements,
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
