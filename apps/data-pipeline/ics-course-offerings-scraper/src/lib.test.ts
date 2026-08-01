import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeIcsCourseId,
  parseCurrentAcademicYear,
  parseIcsCourseOfferings,
  resolveIcsInstructors,
} from "./lib.ts";

const listingHtml = `
  <table id="listing">
    <thead>
      <tr>
        <th>Course</th>
        <th>Title</th>
        <th>description</th>
        <th>Fall 2025</th>
        <th>Winter 2026</th>
        <th>Spring 2026</th>
        <th>Summer 2026</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>CS 122</td>
        <td><div class="visited">CS 122C</div><div>Principles of Data Management</div></td>
        <td>Description</td>
        <td><a href="https://directory.uci.edu/index.php?uid=mshindle">Mike Shindler</a> (2)</td>
        <td>
          <a href="https://www.ics.uci.edu/~dillenco">Michael Dillencourt</a><br>
          <a href="https://directory.uci.edu/index.php?uid=ipanagea">Ioannis Panageas</a>
        </td>
        <td><a href="https://directory.uci.edu/index.php?uid=TBD">TBD</a> (3)</td>
        <td><a href="https://directory.uci.edu/index.php?uid=summer">Summer Instructor</a></td>
      </tr>
      <tr>
        <td>ICS 031</td>
        <td><div class="visited">ICS 31</div><div>Introduction to Programming</div></td>
        <td>Description</td>
        <td>&nbsp;</td>
        <td><a href="https://directory.uci.edu/index.php?uid=TENTAT">TENTATIVE</a></td>
        <td>
          <a href="https://directory.uci.edu/index.php?uid=alfaro">Shannon Alfaro</a><br>
          <a href="https://directory.uci.edu/index.php?uid=TBD">TBD</a> (2)
        </td>
        <td>&nbsp;</td>
      </tr>
    </tbody>
  </table>
`;

test("normalizes supported ICS source course IDs", () => {
  assert.equal(normalizeIcsCourseId("CS 161"), "COMPSCI161");
  assert.equal(normalizeIcsCourseId("CSE 41"), "CSE41");
  assert.equal(normalizeIcsCourseId("ICS 031"), "I&CSCI31");
  assert.equal(normalizeIcsCourseId("ICS H32"), "I&CSCIH32");
  assert.equal(normalizeIcsCourseId("INF 131"), "IN4MATX131");
  assert.equal(normalizeIcsCourseId("STATS 67"), "STATS67");
  assert.equal(normalizeIcsCourseId("MATH 2A"), null);
});

test("reads the current academic year from the landing page", () => {
  assert.equal(
    parseCurrentAcademicYear(
      '<select id="year"><option value="2026">2026-2027</option><option value="2025">2025-2026</option></select>',
    ),
    2026,
  );
});

test("parses one, multiple, TBD, empty, and academic-year-boundary offerings", () => {
  const offerings = parseIcsCourseOfferings(listingHtml, 2025);

  assert.deepEqual(
    offerings.map(({ courseId, academicYear, year, quarter }) => ({
      courseId,
      academicYear,
      year,
      quarter,
    })),
    [
      {
        courseId: "COMPSCI122C",
        academicYear: "2025-2026",
        year: "2025",
        quarter: "Fall",
      },
      {
        courseId: "COMPSCI122C",
        academicYear: "2025-2026",
        year: "2026",
        quarter: "Winter",
      },
      {
        courseId: "COMPSCI122C",
        academicYear: "2025-2026",
        year: "2026",
        quarter: "Spring",
      },
      {
        courseId: "I&CSCI31",
        academicYear: "2025-2026",
        year: "2026",
        quarter: "Winter",
      },
      {
        courseId: "I&CSCI31",
        academicYear: "2025-2026",
        year: "2026",
        quarter: "Spring",
      },
    ],
  );

  assert.equal(offerings[0].instructors.length, 1);
  assert.equal(offerings[1].instructors.length, 2);
  assert.equal(offerings[2].instructors.length, 1);
  assert.equal(offerings[2].instructors[0].isPlaceholder, true);
});

test("intentionally ignores a populated Summer column", () => {
  const offerings = parseIcsCourseOfferings(listingHtml, 2025);
  assert.equal(
    offerings.some(({ instructors }) =>
      instructors.some(({ name }) => name === "Summer Instructor"),
    ),
    false,
  );
});

test("resolves canonical instructors, multiple instructors, and TBD counts", () => {
  const offerings = parseIcsCourseOfferings(listingHtml, 2025);
  const known = [
    { ucinetid: "mshindle", name: "Michael Shindler" },
    { ucinetid: "dillenco", name: "Michael Dillencourt" },
    { ucinetid: "ipanagea", name: "Ioannis Panageas" },
  ];

  assert.deepEqual(resolveIcsInstructors(offerings[0].instructors, known), [
    { status: "assigned", name: "Michael Shindler", ucinetid: "mshindle" },
  ]);
  assert.deepEqual(resolveIcsInstructors(offerings[1].instructors, known), [
    { status: "assigned", name: "Michael Dillencourt", ucinetid: "dillenco" },
    { status: "assigned", name: "Ioannis Panageas", ucinetid: "ipanagea" },
  ]);
  assert.deepEqual(resolveIcsInstructors(offerings[2].instructors, known), [
    { status: "tbd", name: "TBD", ucinetid: null },
  ]);
});

test("rejects term headers outside the selected academic-year boundary", () => {
  assert.throws(
    () => parseIcsCourseOfferings(listingHtml.replace("Winter 2026", "Winter 2025"), 2025),
    /expected Winter 2026/,
  );
});
