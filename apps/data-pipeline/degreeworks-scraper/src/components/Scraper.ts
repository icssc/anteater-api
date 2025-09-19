import * as fs from "node:fs/promises";
import { AuditParser, DegreeworksClient } from "$components";
import type { Block, SpecializationCache } from "$types";
import type { database } from "@packages/db";
import type {
  DegreeWorksProgram,
  DegreeWorksProgramId,
  DegreeWorksRequirement,
} from "@packages/db/schema";
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
  private specializationCache = new Map<string, SpecializationCache | null>();

  private done = false;
  private parsedUgradRequirements = new Map<string, DegreeWorksRequirement[]>();
  private parsedMinorPrograms = new Map<string, DegreeWorksProgram>();
  // both undergrad majors and grad programs
  private parsedPrograms = new Map<string, DegreeWorksProgram>();
  private parsedSpecializations = new Map<string, DegreeWorksProgram>();
  private degreesAwarded = new Map<string, string>();

  private constructor() {}

  // some degreeShort from catalogue do not agree with the degreeworks version but really are the same
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
  private specializationParentCandidates(specCode: string): [string, DegreeWorksProgram][] {
    // there seems to be a soft convention that specializations are their major code followed by uppercase letters
    // starting from A; let's try to use that first

    const asSuffixedMajorCode = specCode.match(/^(.+)[A-Z]$/);

    if (asSuffixedMajorCode) {
      const [, maybeMajorCode] = asSuffixedMajorCode;
      return this.parsedPrograms
        .entries()
        .filter(([_k, prog]) => prog.code === maybeMajorCode)
        .toArray();
    }

    return [];
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
    const specCacheFilename = `spec-cache-${this.dw.getCatalogYear()}.json`;
    this.specializationCache = await fs
      .readFile(specCacheFilename, {
        encoding: "utf-8",
        flag: "a+",
      })
      .then((s) => new Map(Object.entries(JSON.parse(s === "" ? "{}" : s))));
    console.log(`loading ${this.specializationCache.size} cached specializations`);

    this.knownSpecializations = await this.dw.getMapping("specializations");

    for (const [specCode, specName] of this.knownSpecializations.entries()) {
      let specBlock: Block | undefined;
      let foundMajor: DegreeWorksProgramId | undefined;
      let newlyResolved = true;

      if (this.specializationCache.has(specCode)) {
        console.log(`found cached association for ${specCode}`);
        const got = this.specializationCache.get(specCode) as SpecializationCache | null;
        newlyResolved = false;

        if (got !== null) {
          specBlock = got.block;
          foundMajor = got.parent;
        }
      }

      if (newlyResolved && (!specBlock || !foundMajor)) {
        const majorCandidates = this.specializationParentCandidates(specCode);

        for (const [candidateName, candidate] of majorCandidates) {
          if (!candidate.degreeType) throw new Error("Degree type is undefined");

          specBlock = await this.dw.getSpecAudit(
            candidate.degreeType,
            candidate.degreeType.startsWith("B") ? "U" : "G",
            candidate.code,
            specCode,
          );

          if (specBlock) {
            foundMajor = candidate;
            break;
          }
        }
      }

      if (newlyResolved && (!specBlock || !foundMajor)) {
        console.log(
          `warning: bruteforcing major associated with specialization "${specName}" (specCode = ${specCode})`,
        );

        // TODO: much more likely to have been an undergrad program; try those first
        for (const [programCode, program] of this.parsedPrograms.entries()) {
          if (!program.degreeType) throw new Error("Degree type is undefined");

          const try_ = await this.dw.getSpecAudit(
            program.degreeType,
            program.degreeType.startsWith("B") ? "U" : "G",
            program.code,
            specCode,
          );

          if (try_) {
            specBlock = try_;
            foundMajor = program;
            break;
          }
        }
      }

      if (specBlock) {
        const foundMajorAssured = foundMajor as DegreeWorksProgram;
        console.log(
          `Specialization "${specName}" (specCode = ${specCode}) found to be associated with ` +
            `(majorCode = ${foundMajorAssured.code}, degree = ${foundMajorAssured.degreeType})`,
        );

        foundMajorAssured.specs.push(specCode);

        this.specializationCache.set(specCode, {
          // we are storing the entire program even though we only need the DegreeWorksProgramId supertype
          // however, this is fine because we never read the other fields (we couldn't because of the type system)
          parent: foundMajorAssured,
          block: specBlock,
        });

        this.parsedSpecializations.set(
          specCode,
          await this.ap.parseBlock(
            `${foundMajorAssured.school}-SPEC-${specCode}-${foundMajorAssured.degreeType}`,
            specBlock,
          ),
        );

        console.log(
          `Requirements block found and parsed for "${specBlock.title}" (specCode = ${specCode})`,
        );
      } else {
        console.log(
          `warning: no known major associated with "${specName}" (specCode = ${specCode})`,
        );

        this.specializationCache.set(specCode, null);
      }

      if (newlyResolved) {
        // don't write to disk if we resolved this latest iteration from cache
        await fs.writeFile(
          specCacheFilename,
          JSON.stringify(Object.fromEntries(this.specializationCache), undefined, 4),
        );
      }
    }

    // TODO: optional specs e.g. ACM and chem

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
