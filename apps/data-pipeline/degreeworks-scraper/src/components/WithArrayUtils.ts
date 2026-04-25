import type { CourseConstraintTree, course, Term } from "@packages/db/schema";
import type { WithClause } from "$types";

// For every (course, withClause) pair, the course's possible values
// either all satisfy the clause, partially satisfy, or never satisfy the clause
// Each bucket must be handled differently depending on whether the clause
// comes from the included- or excluded-course list.
type ClauseResult = "always" | "sometimes" | "never";

// The withArray boolean semantics below are inferred, not confirmed.
// If we learn how DegreeWorks actually evaluates these statements, we
// may need to rewrite much of the tree creation logic

export function withArrayToTree(withArray: WithClause[]): CourseConstraintTree | null {
  return orTrees(splitOrGroups(withArray).map((group) => andTrees(group.map(clauseToLeaf))));
}

export function classifyTree(
  c: typeof course.$inferSelect,
  tree: CourseConstraintTree | null,
  catalogYear: string,
): ClauseResult {
  if (tree === null) return "always";
  if (tree.type === "leaf") return evaluateLeaf(c, tree, catalogYear);

  const childResults = tree.children.map((child) => classifyTree(c, child, catalogYear));

  if (tree.type === "AND") {
    if (childResults.some((r) => r === "never")) return "never";
    if (childResults.every((r) => r === "always")) return "always";
    return "sometimes";
  }
  if (childResults.some((r) => r === "always")) return "always";
  if (childResults.every((r) => r === "never")) return "never";
  return "sometimes";
}

// This only supports the exclusion patterns we currently know how to invert
// currently hardcoded for single unit constraint
export function invertWithArrayToTree(withArray: WithClause[]): CourseConstraintTree | null {
  if (withArray.length === 0) {
    throw new Error("Expected exclusion inversion to contain at least one clause");
  }
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

  return {
    type: "leaf",
    code: clause.code,
    operator: invertOperator(clause.operator),
    valueList: clause.valueList,
  };
}

export function andTrees(trees: (CourseConstraintTree | null)[]): CourseConstraintTree | null {
  return mergeTrees(trees, "AND");
}

export function orTrees(trees: (CourseConstraintTree | null)[]): CourseConstraintTree | null {
  return mergeTrees(trees, "OR");
}

function mergeTrees(
  trees: (CourseConstraintTree | null)[],
  type: "AND" | "OR",
): CourseConstraintTree | null {
  const children = trees.flatMap((tree): CourseConstraintTree[] => {
    if (tree === null) return [];
    return tree.type === type ? tree.children : [tree];
  });

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  return { type, children };
}

function clauseToLeaf(clause: WithClause): CourseConstraintTree {
  return {
    type: "leaf",
    code: clause.code,
    operator: clause.operator,
    valueList: clause.valueList,
  };
}

function classifyClause<T>(values: readonly T[], matches: (value: T) => boolean): ClauseResult {
  if (values.every(matches)) return "always";
  if (values.some(matches)) return "sometimes";
  return "never";
}

function splitOrGroups(withArray: WithClause[]): WithClause[][] {
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

function evaluateLeaf(
  c: typeof course.$inferSelect,
  leaf: Extract<CourseConstraintTree, { type: "leaf" }>,
  catalogYear: string,
): ClauseResult {
  switch (leaf.code) {
    case "DWCREDIT":
    case "DWCREDITS": {
      const value = Number.parseInt(leaf.valueList[0], 10);
      const units = possibleUnitsForCourse(c);
      return classifyClause(units, (u) => satisfies(u, leaf.operator, value));
    }
    case "DWTERM": {
      // valueList contains specific term(s) from the DWTERM constraint.
      // evaluates the predicate against any target in valueList with OR logic
      const terms = schoolYearTerms(catalogYear);
      const targets = leaf.valueList.map((dwtermRaw) => {
        const { year, term } = parseDWTerm(dwtermRaw);
        return termToOrdinal(year, term);
      });
      return classifyClause(terms, (t) =>
        targets.some((target) => satisfies(t, leaf.operator, target)),
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
