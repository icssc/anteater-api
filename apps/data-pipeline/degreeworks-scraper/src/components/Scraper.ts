import { AuditParser, DegreeworksClient } from "$components";
import type { Block } from "$types";
import type { database } from "@packages/db";
import type { DegreeWorksProgram, DegreeWorksRequirement } from "@packages/db/schema";
import type { JwtPayload } from "jwt-decode";
import { jwtDecode } from "jwt-decode";
import type { z } from "zod";
import {
  type reportSchema,
  reportsResponseSchema,
  type rewardTypeSchema,
  rewardTypesResponseSchema,
} from "./schema.ts";

const JWT_HEADER_PREFIX_LENGTH = 7;

// (school code, major code, degree code)
type ProgramTriplet = [string, string, string];

export class Scraper {
  private ap!: AuditParser;
  private dw!: DegreeworksClient;

  private degrees = new Map<string, string>();
  private majorPrograms = new Set<string>();
  private minorPrograms = new Set<string>();
  private knownSpecializations = new Map<string, string>();

  private done = false;
  private parsedUgradRequirements = new Map<string, DegreeWorksRequirement[]>();
  private parsedMinorPrograms = new Map<string, DegreeWorksProgram>();
  // both undergrad majors and grad programs
  private parsedPrograms = new Map<string, DegreeWorksProgram>();
  private parsedSpecializations = new Map<string, DegreeWorksProgram>();
  private degreesAwarded = new Map<string, string>();

  private constructor() {}

  // some degreeShort from catalogue do not agree the degreeworks version but really are the same
  private transformDegreeShort(input: string): string {
    return (
      {
        "M.MGMT.": "M.I.M.",
      }?.[input] ?? input
    );
  }

  private findDwNameFor(
    awardTypesMap: Map<string, z.infer<typeof rewardTypeSchema>>,
    catalogueDegree: z.infer<typeof reportSchema>,
  ): IteratorObject<string> {
    return this.degrees
      .entries()
      .filter(
        ([_k, v]) =>
          v.toLowerCase() ===
          this.transformDegreeShort(
            awardTypesMap.get(catalogueDegree.degree.degreeCode as string)?.degreeShort as string,
          ).toLowerCase(),
      )
      .map(([k, _v]) => k);
  }

  /**
   * * The combination of school and major is not unique; Computer Science and Engineering is affiliated with two
   * schools simultaneously.
   * * It is not guaranteed that every triplet is valid; e.g. the Doctor of Pharmacy is mapped to two different objects
   * on DegreeWorks, meaning one is not valid. We also include all triples valid in 2006 and later, where triples which
   * were never valid while DegreeWorks was in use will most likely not be valid there.
   * * However, we operate under the assumption that every valid triplet is among the ones returned by this method.
   * @private
   */
  private async discoverValidDegrees(): Promise<ProgramTriplet[]> {
    const [awardTypes, reports] = await Promise.all([
      fetch("https://www.reg.uci.edu/mdsd/api/lookups/awardTypes").then((r) => r.json()),
      fetch("https://www.reg.uci.edu/mdsd/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // this is the broadest search possible as of this commit
        body: JSON.stringify({
          schoolCode: null,
          majorCode: null,
          majorTitle: null,
          majorStartTermYyyyst: null,
          majorEndTermYyyyst: null,
          majorActive: true,
          majorInactive: true,
          underGraduate: true,
          graduate: true,
          degreeListAwarded: null,
          degreeTitleRc: null,
          degreeStartTermYyyyst: null,
          degreeEndTermYyyyst: null,
          degreeActive: true,
          degreeInactive: true,
        }),
      }).then((r) => r.json()),
    ]);

    const awardTypesMap = new Map(
      rewardTypesResponseSchema.parse(awardTypes).map((ent) => [ent.degreeCode, ent]),
    );

    return reportsResponseSchema
      .parse(reports)
      .filter(
        (ent) =>
          ent.degree.degreeCode != null &&
          (!ent.major.endTermYyyyst ||
            // the oldest major in degreeworks as of this commit is applied ecology, invalidated during
            // academic year 2006-2007, so any major older than this is clearly out of the question

            // note that this parse will break if degrees are ever invalidated during or after calendar year 2050 (even
            // though degrees invalidated before UCI's founding in 1965 are theoretically unambiguous) because the
            // two-digit year 49 is interpreted by new Date as the year 1949
            new Date(`${ent.major.endTermYyyyst.slice(1)}-01-01`).getUTCFullYear() >= 2006) &&
          this.majorPrograms.has(ent.major.majorCode),
      )
      .flatMap((ent) => {
        const withMatchedDegree = this.findDwNameFor(awardTypesMap, ent)
          .map((dwName) => [ent.school.schoolCode, ent.major.majorCode, dwName])
          .toArray() as ProgramTriplet[];

        if (withMatchedDegree.length === 0) {
          console.log(
            `warning: no degree code matched for school and major (${ent.school.schoolCode}, ${ent.major.majorCode})`,
          );
        }

        return withMatchedDegree;
      });
  }

  private async scrapePrograms(degrees: Iterable<ProgramTriplet>) {
    const ret = new Map<string, DegreeWorksProgram>();
    for (const [schoolCode, majorCode, degreeCode] of degrees) {
      const audit = await this.dw.getMajorAudit(
        degreeCode,
        // bachelor's degrees probably get an abbreviation starting with B
        degreeCode.startsWith("B") ? "U" : "G",
        majorCode,
      );

      if (!audit) {
        console.log(
          `Requirements block not found (majorCode = ${majorCode}, degree = ${degreeCode})`,
        );
        continue;
      }

      if (ret.has(audit.title)) {
        console.log(
          `Requirements block already exists for "${audit.title}" (majorCode = ${majorCode}, degree = ${degreeCode})`,
        );
        continue;
      }
      ret.set(
        audit.title,
        await this.ap.parseBlock(`${schoolCode}-MAJOR-${majorCode}-${degreeCode}`, audit),
      );
      console.log(
        `Requirements block found and parsed for "${audit.title}" (majorCode = ${majorCode}, degree = ${degreeCode})`,
      );
    }
    return ret;
  }

  /**
   * We are not provided the list of specializations associated with a major, just the list of specializations.
   * so we must match every specialization to a major. We employ some heuristics to do this.
   * @param specCode the code associated with a specialization
   * @private
   */
  private inferSpecializationMajorCode(specCode: string): string | undefined {
    // there seems to be a soft convention that specializations are their major ID followed by uppercase letters
    // starting from A; let's try to use that first

    const maybeMajorCodePart = specCode.slice(0, specCode.length - 1);
    if (this.parsedPrograms.has(maybeMajorCodePart)) {
      return maybeMajorCodePart;
    }

    return undefined;
  }

  async run() {
    if (this.done) throw new Error("This scraper instance has already finished its run.");
    console.log("[Scraper] degreeworks-scraper starting");

    const ugradReqs = await this.dw.getUgradRequirements();
    if (!ugradReqs) {
      console.log("Can't get undergrad reqs...");
      return;
    }

    const [ucRequirements, geRequirements] = ugradReqs;
    this.parsedUgradRequirements.set(
      "UC",
      await this.ap.ruleArrayToRequirements(ucRequirements.ruleArray),
    );
    this.parsedUgradRequirements.set(
      "GE",
      await this.ap.ruleArrayToRequirements(geRequirements.ruleArray),
    );
    console.log("Fetched university and GE requirements");

    this.degrees = await this.dw.getMapping("degrees");
    console.log(`Fetched ${this.degrees.size} degrees`);
    this.majorPrograms = new Set((await this.dw.getMapping("majors")).keys());
    console.log(`Fetched ${this.majorPrograms.size} major programs`);

    console.log("[Scraper] discovering valid degrees");
    const validDegrees = await this.discoverValidDegrees();

    this.minorPrograms = new Set((await this.dw.getMapping("minors")).keys());
    console.log(`Fetched ${this.minorPrograms.size} minor programs`);
    this.parsedMinorPrograms = new Map<string, DegreeWorksProgram>();
    console.log("Scraping minor program requirements");
    for (const minorCode of this.minorPrograms) {
      const audit = await this.dw.getMinorAudit(minorCode);
      if (!audit) {
        console.log(`Requirements block not found (minorCode = ${minorCode})`);
        continue;
      }
      this.parsedMinorPrograms.set(
        audit.title,
        await this.ap.parseBlock(`U-MINOR-${minorCode}`, audit),
      );
      console.log(
        `Requirements block found and parsed for "${audit.title}" (minorCode = ${minorCode})`,
      );
    }

    console.log("Scraping undergraduate and graduate program requirements");
    this.parsedPrograms = await this.scrapePrograms(validDegrees);

    this.parsedSpecializations = new Map<string, DegreeWorksProgram>();
    console.log("Scraping all specialization requirements");

    this.knownSpecializations = await this.dw.getMapping("specializations");

    const ugradPrograms = new Map<string, DegreeWorksProgram>();
    const postGradPrograms = new Map<string, DegreeWorksProgram>();
    for (const [key, prog] of this.parsedPrograms.entries()) {
      (prog.degreeType?.startsWith("B") ? ugradPrograms : postGradPrograms).set(key, prog);
    }

    for (const [specCode, specName] of this.knownSpecializations.entries()) {
      const associatedMajorCode = this.inferSpecializationMajorCode(specCode);

      let specBlock: Block | undefined;

      if (associatedMajorCode) {
        const associatedProgram = this.parsedPrograms.get(
          associatedMajorCode,
        ) as DegreeWorksProgram;
        if (!associatedProgram.degreeType) throw new Error("Degree type is undefined");

        specBlock = await this.dw.getSpecAudit(
          associatedProgram.degreeType,
          associatedProgram.school,
          associatedProgram.code,
          specCode,
        );
      } else {
        console.log(
          `warning: bruteforcing major associated with specialization ${specCode}: ${specName}`,
        );
        // much more likely to have been an undergrad program
        for (const [ugradProgramCode, ugradProgram] of ugradPrograms.entries()) {
          if (!ugradProgram.degreeType) throw new Error("Degree type is undefined");

          const try_ = await this.dw.getSpecAudit(
            ugradProgram.degreeType,
            ugradProgram.school,
            ugradProgram.code,
            specCode,
          );
          if (try_) {
            specBlock = try_;
            break;
          }
        }
      }

      if (!specBlock) {
        console.log(`todo ${specCode}`);
      }
    }

    // TODO: optional specs e.g. ACM and chem

    // for (const [, {specs, school, code: majorCode, degreeType: degree}] of [
    //   ...this.parsedPrograms
    // ]) {
    //   if (!degree) throw new Error("Degree type is undefined");
    //   for (const specCode of specs) {
    //     const audit = await this.dw.getSpecAudit(degree, school, majorCode, specCode);
    //     if (!audit) {
    //       console.log(
    //         `Requirements block not found (school = ${school}, majorCode = ${majorCode}, specCode = ${specCode}, degree = ${degree})`,
    //       );
    //       continue;
    //     }
    //     this.parsedSpecializations.set(
    //       specCode,
    //       await this.ap.parseBlock(`${school}-SPEC-${specCode}-${degree}`, audit),
    //     );
    //     console.log(
    //       `Requirements block found and parsed for "${audit.title}" (specCode = ${specCode})`,
    //     );
    //   }
    // }
    this.degreesAwarded = new Map(
      Array.from(new Set(this.parsedPrograms.entries().map(([, x]) => x.degreeType ?? ""))).map(
        (x): [string, string] => [x, this.degrees?.get(x) ?? ""],
      ),
    );

    // Post-processing steps.

    // As of this commit, the only program which seems to require both of
    // its "specializations" is the B.A. in Art History. There's probably a
    // cleaner way to address this, but this is such an insanely niche case
    // that it's probably not worth the effort to write a general solution.

    const x = this.parsedPrograms.get("Major in Art History") as DegreeWorksProgram;
    const y = this.parsedSpecializations.get("AHGEO") as DegreeWorksProgram;
    const z = this.parsedSpecializations.get("AHPER") as DegreeWorksProgram;
    if (x && y && z) {
      x.specs = [];
      x.requirements = [...x.requirements, ...y.requirements, ...z.requirements];
      this.parsedSpecializations.delete("AHGEO");
      this.parsedSpecializations.delete("AHPER");
      this.parsedPrograms.set("Major in Art History", x);
    }

    this.done = true;
  }
  get() {
    if (!this.done) throw new Error("This scraper instance has not yet finished its run.");
    return {
      parsedUgradRequirements: this.parsedUgradRequirements,
      parsedMinorPrograms: this.parsedMinorPrograms,
      parsedPrograms: this.parsedPrograms,
      parsedSpecializations: this.parsedSpecializations,
      degreesAwarded: this.degreesAwarded,
    };
  }
  static async new(meta: {
    authCookie: string;
    db: ReturnType<typeof database>;
  }): Promise<Scraper> {
    const { authCookie, db } = meta;
    const studentId = jwtDecode<JwtPayload>(authCookie.slice(JWT_HEADER_PREFIX_LENGTH))?.sub;
    if (studentId?.length !== 8) throw new Error("Could not parse student ID from auth cookie.");
    const headers = {
      "Content-Type": "application/json",
      Cookie: `X-AUTH-TOKEN=${authCookie}`,
      Origin: "https://reg.uci.edu",
    };
    const scraper = new Scraper();
    scraper.ap = new AuditParser(db);
    scraper.dw = await DegreeworksClient.new(studentId, headers);
    return scraper;
  }
}
