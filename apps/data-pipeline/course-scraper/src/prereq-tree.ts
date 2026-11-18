import type { database } from "@packages/db";
import { eq, inArray } from "@packages/db/drizzle";
import type { CoursePrerequisite, Prerequisite, PrerequisiteTree } from "@packages/db/schema";
import { course, prerequisite } from "@packages/db/schema";

export const isPrereq = (x: Prerequisite | PrerequisiteTree): x is Prerequisite =>
  "prereqType" in x;

const isCoursePrereqIn =
  (courseIds: string[]) =>
  (x: Prerequisite | PrerequisiteTree): x is CoursePrerequisite =>
    isPrereq(x) && x.prereqType === "course" && courseIds.includes(x.courseId);

// Standing/affiliation prerequisites don't belong in the prerequisite
// junction table, so they are excluded from the resulting list.
export function prereqTreeToList(tree: PrerequisiteTree): string[] {
  const children = tree.AND ?? tree.OR ?? [];

  return children.flatMap((x) => {
    if (!isPrereq(x)) return prereqTreeToList(x);
    if (x.prereqType === "standing" || x.prereqType === "affiliation") return [];

    return [x.prereqType === "course" ? x.courseId.replaceAll(" ", "") : x.examName];
  });
}

// Returns a copy of the tree where any course in `courseIds` can be satisfied by any other.
// NOT subtrees are restrictions, so they are left as-is.
export function addEquivalentCourses(
  tree: PrerequisiteTree,
  courseIds: string[],
): PrerequisiteTree {
  const isEquivalent = isCoursePrereqIn(courseIds);
  const recurse = (x: Prerequisite | PrerequisiteTree) =>
    isPrereq(x) ? x : addEquivalentCourses(x, courseIds);
  const result = { ...tree };

  if (tree.AND) {
    // A required course becomes an OR of itself and its equivalents.
    result.AND = tree.AND.map((x) =>
      isEquivalent(x)
        ? { OR: courseIds.map((id) => (id === x.courseId ? x : { ...x, courseId: id })) }
        : recurse(x),
    );
  }

  if (tree.OR) {
    const children = tree.OR.map(recurse);
    for (const x of children.filter(isEquivalent)) {
      for (const id of courseIds) {
        if (!children.some((y) => isEquivalent(y) && y.courseId === id && y.coreq === x.coreq)) {
          children.push({ ...x, courseId: id });
        }
      }
    }
    result.OR = children;
  }

  return result;
}

/**
 * Some courses were renamed (e.g. I&C SCI 32A to I&C SCI H32), but other courses' prerequisites
 * use the old and new names inconsistently. This shim makes every course that requires one of
 * `courseIds` accept any of them, in both its prerequisite tree and the prerequisite table.
 */
export async function patchEquivalentCourses(meta: {
  db: ReturnType<typeof database>;
  courseIds: string[];
}) {
  const { db, courseIds } = meta;
  const prerequisiteIds = courseIds.map((id) => id.replaceAll(" ", ""));
  const courses = await db
    .select({
      id: course.id,
      prerequisiteTree: course.prerequisiteTree,
      dependencyDept: prerequisite.dependencyDept,
    })
    .from(prerequisite)
    .innerJoin(course, eq(course.id, prerequisite.dependencyId))
    .where(inArray(prerequisite.prerequisiteId, prerequisiteIds))
    .then((x) => new Map(x.map((row) => [row.id, row])));

  await db.transaction(async (tx) => {
    for (const { id, prerequisiteTree, dependencyDept } of courses.values()) {
      const newPrereqTree = addEquivalentCourses(prerequisiteTree, courseIds);
      if (JSON.stringify(newPrereqTree) !== JSON.stringify(prerequisiteTree)) {
        await tx.update(course).set({ prerequisiteTree: newPrereqTree }).where(eq(course.id, id));
      }

      // Trees can already list both courses (e.g. from the old H32 shim) without matching rows.
      const prereqList = prereqTreeToList(newPrereqTree);
      const prereqRows = prerequisiteIds
        .filter((p) => prereqList.includes(p))
        .map((p) => ({ prerequisiteId: p, dependencyId: id, dependencyDept }));
      if (prereqRows.length) {
        await tx.insert(prerequisite).values(prereqRows).onConflictDoNothing();
      }
    }
  });
}
