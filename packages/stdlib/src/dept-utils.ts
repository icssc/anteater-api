export const DEPT_TO_ALIAS = {
  COMPSCI: "CS",
  EARTHSS: "ESS",
  "I&C SCI": "ICS",
  IN4MATX: "INF",
  ENGRMAE: "MAE",
  WRITING: "WR",
} as const;

export type DeptAliasMap = typeof DEPT_TO_ALIAS;
export type DeptCode = keyof DeptAliasMap;
