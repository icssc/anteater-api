import type { Block, Rule } from "$types";
import type { database } from "@packages/db";
import { eq } from "@packages/db/drizzle";
import type {
  DegreeWorksProgram,
  DegreeWorksProgramId,
  DegreeWorksRequirement,
} from "@packages/db/schema";
import { course } from "@packages/db/schema";

export class AuditParser {
  private static readonly specOrOtherMatcher = /"type":"(?:SPEC|OTHER)","value":"\w+"/g;
  private static readonly electiveMatcher = /ELECTIVE @+/;
  private static readonly wildcardMatcher = /\w@/;
  private static readonly rangeMatcher = /-\w+/;

  constructor(private readonly db: ReturnType<typeof database>) {
    console.log("[AuditParser.new] AuditParser initialized");
  }

  parseBlock = async (blockId: string, block: Block): Promise<DegreeWorksProgram> => ({
    ...this.parseBlockId(blockId),
    name: block.title,
    requirements: await this.ruleArrayToRequirements(block.ruleArray),
    // populate later
    specs: [],
  });

  lexOrd = new Intl.Collator().compare;

  // as of this commit, this field is usually not provided
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
    if (courseIdLike.match(AuditParser.electiveMatcher)) return [];
    const [department, courseNumber] = courseIdLike.split(" ");
    if (courseNumber === "@") {
      // Department-wide wildcards.
      return this.db.select().from(course).where(eq(course.shortenedDept, department));
    }
    if (courseNumber.match(AuditParser.wildcardMatcher)) {
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
    if (courseNumber.match(AuditParser.rangeMatcher)) {
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

  /**
   * Certain requirements change label depending on whether they've been fulfilled.
   * This is undesirable for archival so we will quash these.
   * @param label The label before transformation.
   * @private
   */
  private static suppressLabelPolymorphism(label: string) {
    return label.replaceAll(/ Satisfied/g, " Required").replaceAll(/ satisfied/g, " required");
  }

  async ruleArrayToRequirements(ruleArray: Rule[]) {
    const ret: DegreeWorksRequirement[] = [];
    for (const rule of ruleArray) {
      switch (rule.ruleType) {
        case "Block":
        case "Noncourse":
          break;
        case "Course": {
          const includedCourses = rule.requirement.courseArray.map(
            (x) => `${x.discipline} ${x.number}${x.numberEnd ? `-${x.numberEnd}` : ""}`,
          );
          const toInclude = new Map(
            await Promise.all(includedCourses.map(this.normalizeCourseId.bind(this))).then((x) =>
              x.flat().map((y) => [y.id, y]),
            ),
          );
          const excludedCourses =
            rule.requirement.except?.courseArray.map(
              (x) => `${x.discipline} ${x.number}${x.numberEnd ? `-${x.numberEnd}` : ""}`,
            ) ?? [];
          const toExclude = new Set<string>(
            await Promise.all(excludedCourses.map(this.normalizeCourseId.bind(this))).then((x) =>
              x.flat().map((y) => y.id),
            ),
          );
          const courses = Array.from(toInclude)
            .filter(([x]) => !toExclude.has(x))
            .sort(([, a], [, b]) =>
              a.department === b.department
                ? a.courseNumeric - b.courseNumeric || this.lexOrd(a.courseNumber, b.courseNumber)
                : this.lexOrd(a.department, b.department),
            )
            .map(([x]) => x);
          if (rule.requirement.classesBegin) {
            ret.push({
              label: AuditParser.suppressLabelPolymorphism(rule.label),
              requirementType: "Course",
              courseCount: Number.parseInt(rule.requirement.classesBegin, 10),
              courses,
            });
          } else if (rule.requirement.creditsBegin) {
            ret.push({
              label: AuditParser.suppressLabelPolymorphism(rule.label),
              requirementType: "Unit",
              unitCount: Number.parseInt(rule.requirement.creditsBegin, 10),
              courses,
            });
          }
          break;
        }
        case "Group": {
          ret.push({
            label: AuditParser.suppressLabelPolymorphism(rule.label),
            requirementType: "Group",
            requirementCount: Number.parseInt(rule.requirement.numberOfGroups),
            requirements: await this.ruleArrayToRequirements(rule.ruleArray),
          });
          break;
        }
        case "IfStmt": {
          const rules = this.flattenIfStmt([rule]);
          if (!rules.some((x) => x.ruleType === "Block")) {
            if (rules.length > 1) {
              ret.push({
                label: "Select 1 of the following",
                requirementType: "Group",
                requirementCount: 1,
                requirements: await this.ruleArrayToRequirements(rules),
              });
            } else if (rules.length === 1) {
              ret.push(...(await this.ruleArrayToRequirements(rules)));
            }
          }
          break;
        }
        case "Complete":
        case "Incomplete":
          ret.push({
            label: AuditParser.suppressLabelPolymorphism(rule.label),
            requirementType: "Marker",
          });
          break;
        case "Subset": {
          const requirements = await this.ruleArrayToRequirements(rule.ruleArray);
          ret.push({
            label: AuditParser.suppressLabelPolymorphism(rule.label),
            requirementType: "Group",
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
