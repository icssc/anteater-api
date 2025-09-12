import { AuditParser, DegreeworksClient } from "$components";
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

  // note that the combination of major and degree is not unique, e.g. CSE, B.S.
  // which is associated with both merage and bren
  private async discoverValidDegrees(): Promise<ProgramTriplet[]> {
    const validDegreeKeys = new Set(this.degrees.keys());

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
      .flatMap((ent) =>
        this.findDwNameFor(awardTypesMap, ent)
          .map((dwName) => [ent.school.schoolCode, ent.major.majorCode, dwName])
          .toArray(),
      );
  }

  private async scrapePrograms(degrees: Iterable<ProgramTriplet>) {
    const ret = new Map<string, DegreeWorksProgram>();
    for (const [schoolCode, majorCode, degreeCode] of degrees) {
      // todo: school blocks
      // todo: humanities "liberal learnings"
      const audit = await this.dw.getMajorAudit(
        degreeCode,
        // bachelor's degrees probably get an abbreviation starting with B
        degreeCode.startsWith("B") ? "U" : "G",
        majorCode,
      );

      const majorBlock = audit?.major;
      if (!majorBlock) {
        console.log(
          `Requirements block not found (majorCode = ${majorCode}, degree = ${degreeCode})`,
        );
        continue;
      }

      if (ret.has(majorBlock.title)) {
        console.log(
          `Requirements block already exists for "${majorBlock.title}" (majorCode = ${majorCode}, degree = ${degreeCode})`,
        );
        continue;
      }
      ret.set(
        majorBlock.title,
        await this.ap.parseBlock(`${schoolCode}-MAJOR-${majorCode}-${degreeCode}`, majorBlock),
      );
      console.log(
        `Requirements block found and parsed for "${majorBlock.title}" (majorCode = ${majorCode}, degree = ${degreeCode})`,
      );
    }
    return ret;
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
    for (const [, { specs, school, code: majorCode, degreeType: degree }] of this.parsedPrograms) {
      if (!degree) throw new Error("Degree type is undefined");
      for (const specCode of specs) {
        const audit = await this.dw.getSpecAudit(degree, school, majorCode, specCode);
        if (!audit) {
          console.log(
            `Requirements block not found (school = ${school}, majorCode = ${majorCode}, specCode = ${specCode}, degree = ${degree})`,
          );
          continue;
        }
        this.parsedSpecializations.set(
          specCode,
          await this.ap.parseBlock(`${school}-SPEC-${specCode}-${degree}`, audit),
        );
        console.log(
          `Requirements block found and parsed for "${audit.title}" (specCode = ${specCode})`,
        );
      }
    }
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
