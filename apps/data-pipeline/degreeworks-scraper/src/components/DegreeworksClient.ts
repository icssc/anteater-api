import type { Block, DWAuditResponse, DWMappingResponse, UndergraduateRequirements } from "$types";
import fetch from "cross-fetch";

export class DegreeworksClient {
  private static readonly API_URL = "https://reg.uci.edu/RespDashboard/api";
  private static readonly AUDIT_URL = `${DegreeworksClient.API_URL}/audit`;
  private catalogYear = "";

  private constructor(
    private readonly studentId: string,
    private readonly headers: HeadersInit,
    private readonly delay: number,
  ) {}

  static async new(
    studentId: string,
    headers: HeadersInit,
    delay = 1000,
  ): Promise<DegreeworksClient> {
    const dw = new DegreeworksClient(studentId, headers, delay);
    /**
     * Depending on when we are scraping, the catalog year may be the academic year that
     * started the previous calendar year, or the one that will start this calendar year.
     *
     * We determine the catalog year by seeing if we can fetch the major data for the
     * B.S. in Computer Science for the latter. If it is available, then we use that
     * as the catalog year. Otherwise, we use the former.
     */
    const currentYear = new Date().getUTCFullYear();
    dw.catalogYear = `${currentYear}${currentYear + 1}`;
    const dataThisYear = await dw.getMajorAudit("BS", "U", "201");
    if (!dataThisYear?.major) {
      dw.catalogYear = `${currentYear - 1}${currentYear}`;
    }
    console.log(`[DegreeworksClient.new] Set catalogYear to ${dw.catalogYear}`);
    return dw;
  }

  sleep = (ms: number = this.delay) => new Promise((r) => setTimeout(r, ms));

  static formatQueryParams(params: Record<string, string>) {
    return Object.entries(params)
      .map((kv) => kv.map(encodeURIComponent).join("="))
      .join("&");
  }

  async getUgradRequirements(): Promise<UndergraduateRequirements | undefined> {
    const params = DegreeworksClient.formatQueryParams({
      studentId: this.studentId,
      // more schools are possible, see this.getMapping("schools"), but we want undergrad requirements
      school: "U",
      // there is no difference regardless of which of the four bachelor's degrees we ask for: BA, BFA, BMUS, BS
      degree: "BS",
    });
    const res = await fetch(`${DegreeworksClient.AUDIT_URL}?${params}`, {
      method: "GET",
      headers: this.headers,
    });
    await this.sleep();

    const json: DWAuditResponse = await res.json().catch(() => ({ error: "" }));
    if ("error" in json) {
      return;
    }

    // "DEGREE" block doesn't contain any material requirements, "SCHOOL" block has what we need
    const ucRequirements = json.blockArray.find((b) => b.requirementType === "SCHOOL");
    if (!ucRequirements) {
      return;
    }
    const geRequirements = json.blockArray.find((b) => b.requirementType === "PROGRAM");
    if (!geRequirements) {
      return;
    }

    const honorsFourRequirements = json.blockArray.find(
      (b) => b.requirementType === "OTHER" && b.requirementValue === "CHP",
    );

    return {
      UC: ucRequirements,
      GE: geRequirements,
      CHC4: honorsFourRequirements,
    };
  }

  /**
   * @param degree a degree code, e.g. "BS"
   * @param school this corresponds to the UCI notion of division, e.g. "U" or "G"
   * @param majorCode a major code
   * @param college this corresponds to the UCI notion of school, e.g. 55 for the school of bio sci
   */
  async getMajorAudit(
    degree: string,
    school: string,
    majorCode: string,
    college?: string,
  ): Promise<
    | {
        college?: Block;
        major?: Block;
      }
    | undefined
  > {
    const res = await fetch(DegreeworksClient.AUDIT_URL, {
      method: "POST",
      body: JSON.stringify({
        catalogYear: this.catalogYear,
        degree,
        school,
        studentId: this.studentId,
        classes: [],
        goals: [
          { code: "MAJOR", value: majorCode },
          ...(college ? [{ code: "COLLEGE", value: college }] : []),
        ],
      }),
      headers: this.headers,
    });
    await this.sleep();
    const json: DWAuditResponse = await res.json().catch(() => ({ error: "" }));

    if ("error" in json) {
      return undefined;
    }

    return {
      college: json.blockArray.find(
        (x) => x.requirementType === "COLLEGE" && x.requirementValue === college,
      ),
      major: json.blockArray.find(
        (x) => x.requirementType === "MAJOR" && x.requirementValue === majorCode,
      ),
    };
  }

  async getMinorAudit(minorCode: string): Promise<Block | undefined> {
    const res = await fetch(DegreeworksClient.AUDIT_URL, {
      method: "POST",
      body: JSON.stringify({
        catalogYear: this.catalogYear,
        studentId: this.studentId,
        degree: "BA",
        school: "U",
        classes: [],
        goals: [
          { code: "MAJOR", value: "000" },
          { code: "MINOR", value: minorCode },
        ],
      }),
      headers: this.headers,
    });
    await this.sleep();
    const json: DWAuditResponse = await res.json().catch(() => ({ error: "" }));
    return "error" in json
      ? undefined
      : json.blockArray.find(
          (x) => x.requirementType === "MINOR" && x.requirementValue === minorCode,
        );
  }

  async getSpecAudit(
    degree: string,
    school: string,
    majorCode: string,
    specCode: string,
  ): Promise<Block | undefined> {
    const res = await fetch(DegreeworksClient.AUDIT_URL, {
      method: "POST",
      body: JSON.stringify({
        catalogYear: this.catalogYear,
        degree,
        school,
        studentId: this.studentId,
        classes: [],
        goals: [
          { code: "MAJOR", value: majorCode },
          { code: "SPEC", value: specCode },
          { code: "OTHER", value: specCode },
        ],
      }),
      headers: this.headers,
    });
    await this.sleep();
    const json: DWAuditResponse = await res.json().catch(() => ({ error: "" }));
    return "error" in json
      ? undefined
      : json.blockArray.find(
          (x) =>
            (x.requirementType === "SPEC" || x.requirementType === "OTHER") &&
            x.requirementValue === specCode,
        );
  }

  async getMapping<T extends string>(path: T): Promise<Map<string, string>> {
    const res = await fetch(`${DegreeworksClient.API_URL}/validations/special-entities/${path}`, {
      headers: this.headers,
    });
    await this.sleep();
    const json: DWMappingResponse<T> = await res.json();
    return new Map(json._embedded[path].map((x) => [x.key, x.description]));
  }

  getCatalogYear() {
    return this.catalogYear;
  }
}
