import { createHash } from "node:crypto";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import type {
  CourseConstraintTree,
  DegreeWorksNonExclusivityQualifier,
  DegreeWorksProgram,
  DegreeWorksProgramId,
  DegreeWorksRequirement,
  DegreeWorksRequirementQualifier,
  ProgramCodes,
} from "@packages/db/schema";
import { course, type DegreeWorksProgramType } from "@packages/db/schema";
import { programTypeSchema } from "src/schema";
import type { Block, QualifierClause, Rule, WithClause } from "$types";
import {
  andTrees,
  classifyTree,
  invertWithArrayToTree,
  orTrees,
  withArrayToTree,
} from "./WithArrayUtils";

export class AuditParser {
  // currently unused because we can no longer detect whether specialization(s) exist and must instead guess-and-check
  // private static readonly SPEC_OR_OTHER_REGEX = /"type":"(?:SPEC|OTHER)","value":"\w+"/g;
  private static readonly SPECIALIZATION_ADJACENT_REGEX =
    /specialization|concentration|emphasis|area|track|major/i;
  private static readonly ELECTIVE_REGEX = /ELECTIVE @+/;
  private static readonly WILDCARD_REGEX = /\w@/;
  private static readonly RANGE_REGEX = /-\w+/;

  private potentialMajors: ProgramCodes[] | undefined;
  private potentialSpecs: string[] | undefined;

  private requirementIdMap = new Map<string, string>();
  private ineligiblePrograms = new Set<string>();

  constructor(
    private readonly db: ReturnType<typeof database>,
    private readonly catalogYear: string,
  ) {
    console.log("[AuditParser.new] AuditParser initialized");
  }

  setPotentialPrograms(potentialMajors: ProgramCodes[], potentialSpecs: string[]) {
    this.potentialMajors = potentialMajors;
    this.potentialSpecs = potentialSpecs;
  }

  async parseBlock(blockId: string, block: Block, otherBlock?: Block): Promise<DegreeWorksProgram> {
    const programId = this.parseBlockId(blockId);
    const header = block.header?.qualifierArray
      ? {
          header: await this.parseQualifiers(block.header.qualifierArray, programId),
        }
      : {};

    return {
      ...programId,
      name: block.title,
      requirements: await this.ruleArrayToRequirements(
        [...(otherBlock?.ruleArray ?? []), ...block.ruleArray],
        programId,
      ),
      ...header,
      // populate later; we cannot determine specializations on the spot
      specs: [],
      specializationRequired: this.checkSpecializationIsRequired(block.ruleArray),
    };
  }

  lexOrd = new Intl.Collator().compare;

  // as of this commit, this field is not provided in any meaningful cases
  // parseSpecs = (block: Block): string[] =>
  //   JSON.stringify(block)
  //     .matchAll(AuditParser.specOrOtherMatcher)
  //     .map((x) => JSON.parse(`{${x[0]}}`).value)
  //     .toArray()
  //     .sort();

  flattenIfStmt(ruleArray: Rule[]): Rule[] {
    const ret = [];
    for (const rule of ruleArray) {
      switch (rule.ruleType) {
        case "IfStmt":
          ret.push(
            ...this.flattenIfStmt(rule.requirement.ifPart.ruleArray),
            ...this.flattenIfStmt(rule.requirement.elsePart?.ruleArray ?? []),
          );
          break;
        default:
          ret.push(rule);
      }
    }
    return ret;
  }

  async normalizeCourseId(courseIdLike: string) {
    // "ELECTIVE @" is typically used as a pseudo-course and can be safely ignored.
    if (courseIdLike.match(AuditParser.ELECTIVE_REGEX)) return [];
    const [department, courseNumber] = courseIdLike.split(" ");
    if (courseNumber === "@") {
      // Department-wide wildcards.
      return this.db.select().from(course).where(eq(course.shortenedDept, department));
    }
    if (courseNumber.match(AuditParser.WILDCARD_REGEX)) {
      // Wildcard course numbers.
      return await this.db
        .select()
        .from(course)
        .where(eq(course.shortenedDept, department))
        .then((rows) =>
          rows.filter((x) =>
            x.courseNumber.match(
              // we assume @@@ and longer never happen (#122)
              new RegExp(`^${courseNumber.replace("@@", "\\w{2,}").replace("@", "\\w+")}`),
            ),
          ),
        );
    }
    if (courseNumber.match(AuditParser.RANGE_REGEX)) {
      // Course number ranges.
      const [minCourseNumber, maxCourseNumber] = courseNumber.split("-");
      return await this.db
        .select()
        .from(course)
        .where(eq(course.shortenedDept, department))
        .then((rows) =>
          rows.filter(
            (x) =>
              x.courseNumeric >= Number.parseInt(minCourseNumber.replaceAll(/[A-Z]/g, ""), 10) &&
              x.courseNumeric <= Number.parseInt(maxCourseNumber.replaceAll(/[A-Z]/g, ""), 10),
          ),
        );
    }
    // Probably a normal course, just make sure that it exists.
    return this.db
      .select()
      .from(course)
      .where(eq(course.id, `${department}${courseNumber}`))
      .limit(1);
  }

  generateRequirementId(requirementType: string, contentsSalt: string): string {
    const requirementObjectStr = JSON.stringify({
      requirementType,
      contentsSalt,
    });

    const requirementId = createHash("md5")
      .update(requirementObjectStr)
      .digest("base64url")
      .slice(0, 10);

    const existingRequirementObjectStr = this.requirementIdMap.has(requirementId)
      ? this.requirementIdMap.get(requirementId)
      : null;
    if (existingRequirementObjectStr && existingRequirementObjectStr !== requirementObjectStr) {
      console.error("Collision detected between two requirementIds");
    }
    this.requirementIdMap.set(requirementId, requirementObjectStr);

    return requirementId;
  }

  /**
   * Certain requirements change label depending on whether they've been fulfilled.
   * This is undesirable for archival so we will quash these.
   * @param label The label before transformation.
   * @private
   */
  private static suppressLabelPolymorphism(label: string) {
    return label.replaceAll(/ Satisfied/g, " Required").replaceAll(/ satisfied/g, " required");
  }

  checkSpecializationIsRequired(ruleArray: Rule[]) {
    // We infer whether a major requires a specialization by searching for a
    // conditional rule with text that matches words related to "specialization."

    // Hard-code exclusion for B.S. ChemE, because the requirement can instead be
    // fulfilled with 16 units.
    const chemETextList = [
      "16 units of approved technical electives or",
      "contact advisor to select a specialization.",
    ];
    return ruleArray.some((rule) => {
      return (
        rule.ifElsePart === "ElsePart" &&
        rule.proxyAdvice?.textList.some((x) => AuditParser.SPECIALIZATION_ADJACENT_REGEX.test(x)) &&
        !rule.proxyAdvice?.textList.every((x, i) => x === chemETextList[i])
      );
    });
  }

  async parseQualifiers(qualifierArray: QualifierClause[], programId: DegreeWorksProgramId) {
    if (!this.potentialMajors || !this.potentialSpecs) {
      throw Error("[AuditParser] does not have a reference to possible programs");
    }
    const qualifiers = new Map<QualifierClause["name"], DegreeWorksRequirementQualifier>();
    for (const qualifier of qualifierArray) {
      switch (qualifier.name) {
        case "NONEXCLUSIVE": {
          if (!qualifiers.has("NONEXCLUSIVE")) {
            qualifiers.set("NONEXCLUSIVE", {
              qualifierType: "NonExclusive",
              appliedBlocks: [],
            });
          }

          const nonExclusiveQualifier = qualifiers.get(
            "NONEXCLUSIVE",
          ) as DegreeWorksNonExclusivityQualifier;

          const appliedBlockIds =
            qualifier.subTextList?.join("").replaceAll(/[ ()]/g, "").split(",") ?? [];
          for (const blockId of appliedBlockIds) {
            let [programType, code] = blockId.split("=");

            // Preprocessing Steps:
            // A set of BA programs share the same header, stating that every program in the set can share 2 classes with any other program in the set
            // This includes a qualifer that tries to share 2 classes with itself
            // We assume any qualifier that references itself with the same programType and code is meaningless because the correct way to share internally is with `THISBLOCK`
            if (programType === programId.programType && code === programId.code) {
              continue;
            }
            // The correct way to state classes can be shared with other requirements in the same program is by using `THISBLOCK`
            // we convert and serve this data as an absolute reference
            if (programType === "THISBLOCK") {
              programType = programId.programType;
              code = programId.code;
            }
            if (programType === "ALLBLOCKS") {
              nonExclusiveQualifier.appliedBlocks.push(
                ...([
                  { programType: "COLLEGE" },
                  { programType: "MAJOR" },
                  { programType: "SPEC" },
                  { programType: "MINOR" },
                ] as { programType: (typeof DegreeWorksProgramType)[number] }[]),
              );
              continue;
            }

            const parsedProgramType = programTypeSchema.parse(programType);
            if (!code) {
              nonExclusiveQualifier.appliedBlocks.push({
                programType: parsedProgramType,
                maxShared: qualifier.classes,
              });
              continue;
            }

            const parsedCodes: string[] = [];
            switch (parsedProgramType) {
              case "MAJOR":
              case "SPEC": {
                // The degree type is not given as part of the code and must be inferred
                // If parsing an undergraduate degree, different program ids cannot share the same code (i.e BA-201 cannot exist as BS-201 exists)
                // So we can match the correct degree
                let foundDegree: string | undefined;
                const ineligibleProgramKey = `${programId.school}:${programId.programType}:${code}`;
                if (programId.school === "U" || programId.programType !== "MAJOR") {
                  foundDegree = this.potentialMajors.find(
                    ({ majorCode, degreeCode }) =>
                      code.startsWith(majorCode) && degreeCode.startsWith("B"),
                  )?.degreeCode;
                  if (
                    foundDegree === undefined &&
                    !this.ineligiblePrograms.has(ineligibleProgramKey)
                  ) {
                    this.ineligiblePrograms.add(ineligibleProgramKey);
                    console.warn(
                      `No undergrad program found with ${parsedProgramType} code, ${code}`,
                    );
                  }
                }
                // If parsing a grad degree, PHD and MS can have the same code
                // We assume that the program that is being referred to shares the same degree as this program
                else {
                  foundDegree = this.potentialMajors.find(
                    ({ majorCode, degreeCode }) =>
                      code.startsWith(majorCode) && degreeCode === programId.degreeType,
                  )?.degreeCode;
                  if (
                    foundDegree === undefined &&
                    !this.ineligiblePrograms.has(ineligibleProgramKey)
                  ) {
                    this.ineligiblePrograms.add(ineligibleProgramKey);
                    console.log(programId);
                    console.warn(
                      `No ${programId.degreeType} program found with MAJOR code, ${code}`,
                    );
                  }
                }

                if (!foundDegree) break;
                if (parsedProgramType === "SPEC" && code.endsWith("@")) {
                  // The '@' wildcard can be used to denote a sharing with all specializations of a major, i.e `BS-153@`
                  // note that we filter through potential specialzations, some of which may be outdated
                  parsedCodes.push(
                    ...this.potentialSpecs
                      .filter((spec) => spec.startsWith(code.slice(0, code.length - 1)))
                      .map((matchedSpec) => `${foundDegree}-${matchedSpec}`),
                  );
                } else {
                  parsedCodes.push(`${foundDegree}-${code}`);
                }
                break;
              }
              case "MINOR":
              case "COLLEGE":
              case "LIBL":
                // code is given in the numerical representation of a college, i.e "55" for School of Biological Science
                parsedCodes.push(code);
                break;
              case "OTHER":
                // code can be "LIBL" | "AHPER" | "AHGEO" | "345O" | "429O" | "153HON"
                // LIBL refers to Liberal Learnings
                // "AHPER" and "AHGEO" refers to the Art History Specialzations, which are special cases that are excepted in Scraper.ts.
                // "345O" and "429O" are the "345 (BA English) OTHER" and "429 (BA History) OTHER" blocks (see pr 386)
                // "153HON" likley stands for an outdated honors chemistry program

                // In any case, "LIBL" is the only code that has a known meaningful value
                if (!["LIBL", "AHPER", "AHGEO", "345O", "429O", "153HON"].includes(code)) {
                  console.warn("Unkown OTHER block code:", code);
                }
                if (code === "LIBL") parsedCodes.push("LIBL");
                break;
            }
            nonExclusiveQualifier.appliedBlocks.push(
              ...parsedCodes.map((c) => {
                return {
                  programType: parsedProgramType,
                  code: c,
                  maxShared: qualifier.classes,
                };
              }),
            );
          }
          break;
        }
        case "EXCLUSIVE":
          if (!qualifiers.has("EXCLUSIVE")) {
            qualifiers.set("EXCLUSIVE", {
              qualifierType: "Exclusive",
            });
          }
      }
    }
    return qualifiers.values().toArray();
  }

  async ruleArrayToRequirements(ruleArray: Rule[], blockId: DegreeWorksProgramId) {
    const ret: DegreeWorksRequirement[] = [];
    for (const rule of ruleArray) {
      switch (rule.ruleType) {
        case "Block":
        case "Noncourse":
          break;
        case "Course": {
          const includedCourses: [string, WithClause[]][] = rule.requirement.courseArray.map(
            (x) => [
              `${x.discipline} ${x.number}${x.numberEnd ? `-${x.numberEnd}` : ""}`,
              x.withArray ? x.withArray : [],
            ],
          );
          const includeTreesById = new Map<string, CourseConstraintTree[]>();
          const excludeInvertedTreesById = new Map<string, CourseConstraintTree[]>();
          const pushTree = (
            map: Map<string, CourseConstraintTree[]>,
            id: string,
            tree: CourseConstraintTree | null,
          ) => {
            if (tree === null) return;
            const trees = map.get(id) ?? [];
            trees.push(tree);
            map.set(id, trees);
          };

          const toInclude: Map<string, typeof course.$inferSelect> = new Map(
            await Promise.all(
              includedCourses.map(([x, withArray]) =>
                this.normalizeCourseId
                  .bind(this)(x)
                  .then((x) => [x, withArray] as [(typeof course.$inferSelect)[], WithClause[]]),
              ),
            ).then((x) =>
              x
                .flatMap(([classes, withArray]) => {
                  const tree = withArrayToTree(withArray);
                  const filtered: (typeof course.$inferSelect)[] = [];
                  for (const c of classes) {
                    const match = classifyTree(c, tree, this.catalogYear);
                    if (match === "never") continue;
                    filtered.push(c);
                    if (match === "sometimes") {
                      pushTree(includeTreesById, c.id, tree);
                    }
                  }
                  return filtered;
                })
                .map((y) => [y.id, y]),
            ),
          );

          const excludedCourses: [string, WithClause[]][] =
            rule.requirement.except?.courseArray.map((x) => [
              `${x.discipline} ${x.number}${x.numberEnd ? `-${x.numberEnd}` : ""}`,
              x.withArray ? x.withArray : [],
            ]) ?? [];
          const toExclude = new Set<string>();
          await Promise.all(
            excludedCourses.map(([x, withArray]) =>
              this.normalizeCourseId
                .bind(this)(x)
                .then((x) => [x, withArray] as [(typeof course.$inferSelect)[], WithClause[]]),
            ),
          ).then((x) => {
            for (const [classes, withArray] of x) {
              if (withArray.length === 0) {
                for (const c of classes) {
                  toExclude.add(c.id);
                }
                continue;
              }

              const invertedTree = invertWithArrayToTree(withArray);
              for (const c of classes) {
                const match = classifyTree(c, invertedTree, this.catalogYear);
                if (match === "never") {
                  toExclude.add(c.id);
                  continue;
                }
                if (match === "sometimes" && toInclude.has(c.id)) {
                  pushTree(excludeInvertedTreesById, c.id, invertedTree);
                }
              }
            }
          });

          const courses = Array.from(toInclude)
            .filter(([x]) => !toExclude.has(x))
            .sort(([, a], [, b]) =>
              a.department === b.department
                ? a.courseNumeric - b.courseNumeric || this.lexOrd(a.courseNumber, b.courseNumber)
                : this.lexOrd(a.department, b.department),
            )
            .map(([x]) => x);

          const qualifiers = rule.requirement.qualifierArray
            ? await this.parseQualifiers(rule.requirement.qualifierArray, blockId)
            : [];
          const hasQualifiers = qualifiers.length !== 0;

          const courseConstraints: Record<string, CourseConstraintTree> = {};
          for (const id of courses) {
            const tree = andTrees([
              orTrees(includeTreesById.get(id) ?? []),
              ...(excludeInvertedTreesById.get(id) ?? []),
            ]);

            if (tree !== null) {
              courseConstraints[id] = tree;
            }
          }
          const optionalCourseConstraints =
            Object.keys(courseConstraints).length > 0 ? { courseConstraints } : {};

          if (rule.requirement.classesBegin) {
            const label = AuditParser.suppressLabelPolymorphism(rule.label);
            const requirementType = "Course";
            const contentsSalt = courses.join("_");
            const requirementId = this.generateRequirementId(requirementType, contentsSalt);
            ret.push({
              label,
              requirementId,
              requirementType,
              ...(hasQualifiers && { qualifiers }),
              courseCount: Number.parseInt(rule.requirement.classesBegin, 10),
              courses,
              ...optionalCourseConstraints,
            });
          } else if (rule.requirement.creditsBegin) {
            const label = AuditParser.suppressLabelPolymorphism(rule.label);
            const requirementType = "Unit";
            const contentsSalt = courses.join("_");
            const requirementId = this.generateRequirementId(requirementType, contentsSalt);
            ret.push({
              label,
              requirementId,
              requirementType,
              ...(hasQualifiers && { qualifiers }),
              unitCount: Number.parseInt(rule.requirement.creditsBegin, 10),
              courses,
              ...optionalCourseConstraints,
            });
          }
          break;
        }
        case "Group": {
          const label = AuditParser.suppressLabelPolymorphism(rule.label);
          const requirementType = "Group";
          const requirements = await this.ruleArrayToRequirements(rule.ruleArray, blockId);
          const contentsSalt = requirements.map((req) => req.requirementId).join("_");
          const requirementId = this.generateRequirementId(requirementType, contentsSalt);
          ret.push({
            label,
            requirementId,
            requirementType,
            requirementCount: Number.parseInt(rule.requirement.numberOfGroups, 10),
            requirements,
          });
          break;
        }
        case "IfStmt": {
          const rules = this.flattenIfStmt([rule]);
          if (!rules.some((x) => x.ruleType === "Block")) {
            if (rules.length > 1) {
              const label = "Select 1 of the following";
              const requirementType = "Group";
              const requirements = await this.ruleArrayToRequirements(rules, blockId);
              const contentsSalt = requirements.map((req) => req.requirementId).join("_");
              const requirementId = this.generateRequirementId(requirementType, contentsSalt);
              ret.push({
                label,
                requirementId,
                requirementType,
                requirementCount: 1,
                requirements,
              });
            } else if (rules.length === 1) {
              ret.push(...(await this.ruleArrayToRequirements(rules, blockId)));
            }
          }
          break;
        }
        case "Complete":
        case "Incomplete": {
          const label = AuditParser.suppressLabelPolymorphism(rule.label);
          const requirementType = "Marker";
          const contentsSalt = label;
          const requirementId = this.generateRequirementId(requirementType, contentsSalt);
          ret.push({
            label,
            requirementId,
            requirementType,
          });
          break;
        }
        case "Subset": {
          const label = AuditParser.suppressLabelPolymorphism(rule.label);
          const requirementType = "Group";
          const requirements = await this.ruleArrayToRequirements(rule.ruleArray, blockId);
          const contentsSalt = requirements.map((req) => req.requirementId).join("_");
          const requirementId = this.generateRequirementId(requirementType, contentsSalt);
          ret.push({
            label,
            requirementId,
            requirementType,
            requirementCount: Object.keys(requirements).length,
            requirements,
          });
        }
      }
    }
    return ret;
  }

  parseBlockId(blockId: string) {
    const [school, programType, code, degreeType] = blockId.split("-");
    return { school, programType, code, degreeType } as DegreeWorksProgramId;
  }
}
