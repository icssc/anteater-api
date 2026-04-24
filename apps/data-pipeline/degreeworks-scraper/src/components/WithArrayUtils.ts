import type { course, Term } from "@packages/db/schema";
import type { WithClause } from "$types";

// For every (course, withClause) pair, the course's possible values
// either all satisfy the clause, partially satisfy, or never satisfy the clause
// Each bucket must be handled differently depending on whether the clause
// comes from the included- or excluded-course list.
type ClauseResult = "always" | "sometimes" | "never";

// The withArray boolean semantics below are inferred, not confirmed.
// If we learn how DegreeWorks actually evaluates these statements, we
// may need to rewrite much of the classifier logic

export function classifyWithArray(
  c: typeof course.$inferSelect,
  withArray: WithClause[],
  catalogYear: string,
): ClauseResult {
  if (withArray.length === 0) return "always";
  const groupResults = splitOrGroups(withArray).map((g) => classifyGroup(c, g, catalogYear));
  if (groupResults.some((r) => r === "always")) return "always";
  if (groupResults.every((r) => r === "never")) return "never";
  return "sometimes";
}

function classifyGroup(
  c: typeof course.$inferSelect,
  group: WithClause[],
  catalogYear: string,
): ClauseResult {
  const clauseResults = group.map((w) => evaluateWithClause(c, w, catalogYear));
  if (clauseResults.some((r) => r === "never")) return "never";
  if (clauseResults.every((r) => r === "always")) return "always";
  return "sometimes";
}

function classifyClause<T>(values: readonly T[], matches: (value: T) => boolean): ClauseResult {
  if (values.every(matches)) return "always";
  if (values.some(matches)) return "sometimes";
  return "never";
}

function splitOrGroups(withArray: WithClause[]): WithClause[][] {
  // Assumption: DegreeWorks groups AND clauses together and evaluates OR between those groups:
  // "A AND B OR C AND D" => [(A,B), (C,D)].
  const orGroups: WithClause[][] = [];
  let currentGroup: WithClause[] = [];

  for (const withClause of withArray) {
    if (withClause.connector === "OR") {
      if (currentGroup.length > 0) {
        orGroups.push(currentGroup);
      }
      currentGroup = [withClause];
    } else {
      currentGroup.push(withClause);
    }
  }
  if (currentGroup.length > 0) {
    orGroups.push(currentGroup);
  }
  return orGroups;
}

function evaluateWithClause(
  c: typeof course.$inferSelect,
  withClause: WithClause,
  catalogYear: string,
): ClauseResult {
  switch (withClause.code) {
    case "DWCREDIT":
    case "DWCREDITS": {
      const value = Number.parseInt(withClause.valueList[0], 10);
      const units = possibleUnitsForCourse(c);
      return classifyClause(units, (u) => satisfies(u, withClause.operator, value));
    }
    case "DWTERM": {
      // valueList contains specific term(s) from the DWTERM constraint.
      // evaluates the predicate against any target in valueList with OR logic
      const terms = schoolYearTerms(catalogYear);
      const targets = withClause.valueList.map((dwtermRaw) => {
        const { year, term } = parseDWTerm(dwtermRaw);
        return termToOrdinal(year, term);
      });
      return classifyClause(terms, (t) =>
        targets.some((target) => satisfies(t, withClause.operator, target)),
      );
    }
    // There may be more withArray Codes that can be applied here to filter out courses
    // see https://github.com/icssc/anteater-api/pull/286
    default:
      return "always";
  }
}

function possibleUnitsForCourse(c: typeof course.$inferSelect): number[] {
  const minUnits = Number.parseInt(c.minUnits, 10);
  const maxUnits = Number.parseInt(c.maxUnits, 10);
  return Array.from({ length: maxUnits - minUnits + 1 }, (_, i) => minUnits + i);
}

function parseDWTerm(raw: string) {
  const [yearStr, termStr] = raw.split(" ");
  const year = Number.parseInt(yearStr, 10);
  const mapping = {
    FALL: "Fall",
    WINTER: "Winter",
    SPRING: "Spring",
    SUMMER1: "Summer1",
    SUMMER10WK: "Summer10wk",
    SUMMER2: "Summer2",
  } as const;
  const term = mapping[termStr as keyof typeof mapping];
  return { year, term };
}

function termToOrdinal(year: number, term: Term): number {
  const termOrder: Record<Term, number> = {
    Winter: 0,
    Spring: 1,
    Summer1: 2,
    Summer10wk: 3,
    Summer2: 4,
    Fall: 5,
  };
  return year * 10 + termOrder[term];
}

function schoolYearTerms(catalogYear: string): number[] {
  const startYear = Number.parseInt(catalogYear.slice(0, 4), 10);
  // protect against cases like 20262026
  const endYear = startYear + 1;
  return [
    termToOrdinal(startYear, "Fall"),
    termToOrdinal(endYear, "Winter"),
    termToOrdinal(endYear, "Spring"),
    termToOrdinal(endYear, "Summer1"),
    termToOrdinal(endYear, "Summer10wk"),
    termToOrdinal(endYear, "Summer2"),
  ];
}

function satisfies(value: number, operator: WithClause["operator"], target: number): boolean {
  switch (operator) {
    case "<":
      return value < target;
    case "<=":
      return value <= target;
    case "=":
      return value === target;
    case ">":
      return value > target;
    case ">=":
      return value >= target;
    case "<>":
      return value !== target;
  }
}

export function invertWithArray(withArray: WithClause[]): WithClause[] {
  if (withArray.length === 0) return [];
  if (withArray.length > 1) {
    throw new Error(
      `Expected exclusion inversion to contain exactly one clause, got ${withArray.length}`,
    );
  }

  const [clause] = withArray;
  if (clause.code !== "DWCREDIT" && clause.code !== "DWCREDITS") {
    throw new Error(
      `Expected exclusion inversion clause to be DWCREDIT or DWCREDITS, got ${clause.code}`,
    );
  }

  return [
    {
      ...clause,
      operator: invertOperator(clause.operator),
      connector: "",
    },
  ];
}

function invertOperator(op: WithClause["operator"]): WithClause["operator"] {
  const m: Record<WithClause["operator"], WithClause["operator"]> = {
    "<": ">=",
    "<=": ">",
    ">": "<=",
    ">=": "<",
    "=": "<>",
    "<>": "=",
  };
  return m[op];
}
