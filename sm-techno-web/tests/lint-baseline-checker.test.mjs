import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANCHOR_RADIUS,
  COMPILER_RULE,
  evaluateDiagnostics,
  normalizeFilename,
  validateBaselineCounts,
} from "../scripts/check-lint-baseline.mjs";

// Virtual project for the fixtures: a single file whose lines can be
// addressed by the injected reader. The anchor of a diagnostic on line N with
// column C is the normalized window of +/- ANCHOR_RADIUS around C on that
// line, so fixtures below derive expected behavior from that contract.
const VIRTUAL_FILE = "components/example.tsx";
const virtualLines = [
  "const FIRST = 'line one';",
  "const SECOND = 'line two';",
  "const THIRD = 'line three';",
  "const FOURTH = 'line four';",
];
function readVirtualLine(file, line) {
  if (file !== VIRTUAL_FILE) throw new Error("unknown file");
  return virtualLines[line - 1];
}

function diagnostic({ line = 2, column = 7, subtype = "EffectSetState", file = VIRTUAL_FILE, code = COMPILER_RULE } = {}) {
  return {
    code,
    severity: "error",
    message: `${subtype}: fixture message`,
    filename: file,
    labels: [{ span: { line, column, offset: 0, length: 3 } }],
  };
}

function baselineEntry({ subtype = "EffectSetState", file = VIRTUAL_FILE, line = 2, column = 7, occurrence = 1 } = {}) {
  const text = readVirtualLine(file, line);
  const center = Math.max(0, Math.min(text.length, column - 1));
  const start = Math.max(0, center - ANCHOR_RADIUS);
  const anchor = text.slice(start, Math.min(text.length, center + ANCHOR_RADIUS)).replace(/\s+/g, " ").trim();
  return { rule: COMPILER_RULE, subtype, file, anchor, occurrence, reason: "fixture" };
}

test("exact baseline passes", () => {
  const { problems, fingerprintCount } = evaluateDiagnostics(
    [diagnostic({ subtype: "EffectSetState" }), diagnostic({ subtype: "Refs", line: 3, column: 7 })],
    readVirtualLine,
    [baselineEntry({ subtype: "EffectSetState" }), baselineEntry({ subtype: "Refs", line: 3 })],
  );
  assert.deepEqual(problems, []);
  assert.equal(fingerprintCount, 2);
});

test("new compiler diagnostic fails", () => {
  const { problems } = evaluateDiagnostics(
    [diagnostic(), diagnostic({ line: 3 })],
    readVirtualLine,
    [baselineEntry()],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /new-or-changed-diagnostic/);
  assert.match(problems[0], /components\/example\.tsx/);
});

test("missing baseline diagnostic fails", () => {
  const { problems } = evaluateDiagnostics(
    [diagnostic()],
    readVirtualLine,
    [baselineEntry(), baselineEntry({ line: 3 })],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /missing-baseline-diagnostic/);
});

test("changed subtype fails", () => {
  const { problems } = evaluateDiagnostics(
    [diagnostic({ subtype: "Refs" })],
    readVirtualLine,
    [baselineEntry({ subtype: "EffectSetState" })],
  );
  assert.equal(problems.length, 2, "subtype change is both an unexpected new entry and a missing baseline entry");
  assert.ok(problems.some((problem) => /new-or-changed-diagnostic.*Refs/.test(problem)));
  assert.ok(problems.some((problem) => /missing-baseline-diagnostic.*EffectSetState/.test(problem)));
});

test("non-compiler lint error fails", () => {
  const { problems } = evaluateDiagnostics(
    [
      diagnostic(),
      {
        code: "eslint(no-unused-vars)",
        severity: "error",
        message: "Variable 'x' is declared but never used.",
        filename: VIRTUAL_FILE,
        labels: [],
      },
    ],
    readVirtualLine,
    [baselineEntry()],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /non-compiler lint error/);
});

test("duplicate count fails", () => {
  const { problems } = evaluateDiagnostics(
    [diagnostic(), diagnostic({ column: 13 })],
    readVirtualLine,
    [baselineEntry()],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /new-or-changed-diagnostic/);
  assert.match(problems[0], /#2/);
});

test("line drift with the same anchor passes", () => {
  // Same code content moved to a different line number: the anchor is
  // identical, so the gate must not fail.
  const lines = ["// new leading comment", ...virtualLines];
  const readShifted = (file, line) => (file === VIRTUAL_FILE ? lines[line - 1] : undefined);
  const { problems } = evaluateDiagnostics(
    [diagnostic({ line: 3 })],
    readShifted,
    [baselineEntry({ line: 2 })],
  );
  assert.deepEqual(problems, []);
});

test("changed anchor fails", () => {
  // Same file and rule, but the source text at the diagnostic changed.
  const lines = [...virtualLines];
  lines[1] = "const REWRITTEN = 'line two edited';";
  const readEdited = (file, line) => (file === VIRTUAL_FILE ? lines[line - 1] : undefined);
  const { problems } = evaluateDiagnostics([diagnostic({ line: 2 })], readEdited, [baselineEntry({ line: 2 })]);
  assert.ok(problems.length >= 1);
  assert.ok(problems.some((problem) => /new-or-changed-diagnostic/.test(problem)));
});

test("filenames normalize across platforms", () => {
  assert.equal(normalizeFilename("components/example.tsx"), "components/example.tsx");
  assert.equal(normalizeFilename(".\\components\\example.tsx"), "components/example.tsx");
  assert.equal(
    normalizeFilename("D:/repo/sm-techno-web/components/example.tsx", "D:/repo/sm-techno-web"),
    "components/example.tsx",
  );
  assert.equal(
    normalizeFilename("D:\\repo\\sm-techno-web\\components\\example.tsx", "D:\\repo\\sm-techno-web"),
    "components/example.tsx",
  );
});

test("unfingerprintable diagnostic fails closed", () => {
  const { problems } = evaluateDiagnostics(
    [{ ...diagnostic(), labels: [] }],
    readVirtualLine,
    [],
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /could not be fingerprinted/);
});

test("stale baseline counts block fails", () => {
  const entries = [baselineEntry({ subtype: "EffectSetState" }), baselineEntry({ subtype: "Refs", line: 3 })];
  assert.deepEqual(validateBaselineCounts(entries, { EffectSetState: 1, Refs: 1 }), []);
  const stale = validateBaselineCounts(entries, { EffectSetState: 2, Refs: 1 });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /EffectSetState declares 2 but has 1/);
  assert.notDeepEqual(validateBaselineCounts(entries, undefined), ["must-be-empty"]);
});
