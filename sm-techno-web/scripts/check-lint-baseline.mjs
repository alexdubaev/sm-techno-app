#!/usr/bin/env node
// Strict versioned lint gate for the react-compiler baseline.
//
// Runs oxlint with machine-readable JSON output, fingerprints every
// react(react-compiler) diagnostic as (subtype, repo-relative file, source
// anchor, occurrence index), and requires the actual multiset to match the
// baseline in lint-baseline/react-compiler.json EXACTLY:
//   - a new or changed compiler diagnostic fails;
//   - a baseline diagnostic that disappears fails (the baseline must be
//     updated deliberately when a known issue is fixed);
//   - any non-compiler lint diagnostic fails;
//   - a diagnostic that cannot be fingerprinted fails.
// Line numbers are deliberately NOT part of the fingerprint: inserting lines
// above a diagnostic must not fail the gate. The anchor is a short normalized
// window of source text around the diagnostic column instead.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = path.join(frontendDir, "lint-baseline", "react-compiler.json");
export const COMPILER_RULE = "react(react-compiler)";
export const ANCHOR_RADIUS = 40;

/** Normalize a lint filename to a repo-relative forward-slash path. */
export function normalizeFilename(filename, projectDir = frontendDir) {
  let normalized = String(filename).replaceAll("\\", "/");
  const normalizedProject = projectDir.replaceAll("\\", "/").replace(/\/+$/, "") + "/";
  if (normalized.startsWith(normalizedProject)) {
    normalized = normalized.slice(normalizedProject.length);
  }
  normalized = normalized.replace(/^\.\//, "");
  return normalized;
}

/**
 * Build the stable source anchor for a diagnostic: a short whitespace-
 * normalized window of the diagnostic's own line centered on its column.
 */
export function anchorForLine(lineText, column) {
  const text = lineText.replace(/\r$/, "");
  const center = Math.max(0, Math.min(text.length, column - 1));
  const start = Math.max(0, center - ANCHOR_RADIUS);
  const end = Math.min(text.length, center + ANCHOR_RADIUS);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** Extract the compiler subtype ("EffectSetState", "Refs", "Invariant", ...). */
export function subtypeOf(message) {
  const separator = message.indexOf(":");
  return separator === -1 ? message.trim() : message.slice(0, separator).trim();
}

/**
 * Fingerprint every actual compiler diagnostic. `readSourceLine` is injected
 * so tests can supply virtual files. Returns { fingerprints, failures } where
 * failures lists diagnostics that could not be fingerprinted.
 */
export function fingerprintCompilerDiagnostics(diagnostics, readSourceLine) {
  const prepared = [];
  const failures = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== COMPILER_RULE) continue;
    const span = diagnostic.labels?.[0]?.span;
    const file = normalizeFilename(diagnostic.filename ?? "");
    if (!file || !span || typeof span.line !== "number" || typeof span.column !== "number") {
      failures.push({ file: diagnostic.filename, reason: "missing file or primary span" });
      continue;
    }
    let lineText;
    try {
      lineText = readSourceLine(file, span.line);
    } catch (error) {
      failures.push({ file, line: span.line, reason: `unreadable source: ${error.message}` });
      continue;
    }
    if (typeof lineText !== "string") {
      failures.push({ file, line: span.line, reason: "line out of range" });
      continue;
    }
    const anchor = anchorForLine(lineText, span.column);
    if (!anchor) {
      failures.push({ file, line: span.line, reason: "empty anchor" });
      continue;
    }
    prepared.push({ subtype: subtypeOf(diagnostic.message ?? ""), file, anchor, line: span.line, column: span.column });
  }
  // Deterministic order, then assign occurrence indexes per identical key so
  // repeated diagnostics on one anchor are distinguished by multiplicity.
  prepared.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.subtype.localeCompare(b.subtype));
  const counters = new Map();
  const fingerprints = prepared.map((entry) => {
    const key = `${entry.subtype}\u0000${entry.file}\u0000${entry.anchor}`;
    const occurrence = (counters.get(key) ?? 0) + 1;
    counters.set(key, occurrence);
    return { rule: COMPILER_RULE, subtype: entry.subtype, file: entry.file, anchor: entry.anchor, occurrence };
  });
  return { fingerprints, failures };
}

function fingerprintKey(entry) {
  return `${entry.rule ?? COMPILER_RULE}\u0000${entry.subtype}\u0000${entry.file}\u0000${entry.anchor}\u0000${entry.occurrence}`;
}

/**
 * Compare actual compiler fingerprints against the baseline as multisets.
 * Returns { ok, unexpected[], missing[] }.
 */
export function compareWithBaseline(actualFingerprints, baselineEntries) {
  const actualCounts = new Map();
  for (const entry of actualFingerprints) {
    const key = fingerprintKey(entry);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }
  const baselineCounts = new Map();
  const baselineProblems = [];
  for (const entry of baselineEntries) {
    if (entry.rule !== COMPILER_RULE) {
      baselineProblems.push(`baseline entry "${entry.file}" has unexpected rule "${entry.rule}"; only ${COMPILER_RULE} is allowed`);
      continue;
    }
    if (!entry.subtype || !entry.file || !entry.anchor || !Number.isInteger(entry.occurrence) || entry.occurrence < 1) {
      baselineProblems.push(`baseline entry for ${entry.file ?? "(missing file)"} is missing subtype/anchor/occurrence`);
      continue;
    }
    const key = fingerprintKey(entry);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
    if (baselineCounts.get(key) > 1) {
      baselineProblems.push(`baseline contains a duplicate entry for ${entry.file} (${entry.subtype} #${entry.occurrence})`);
    }
  }
  const unexpected = [];
  const remaining = new Map(actualCounts);
  for (const [key, count] of baselineCounts) {
    const actualCount = remaining.get(key) ?? 0;
    if (actualCount < count) {
      const [subtype, file, anchor, occurrence] = key.split("\u0000").slice(1);
      unexpected.push({
        kind: "missing-baseline-diagnostic",
        detail: `baseline expects ${count}x ${subtype} in ${file} (anchor "${anchor}", #${occurrence}) but found ${actualCount}x`,
      });
    }
    if (actualCount > 0) remaining.set(key, actualCount - count);
    else remaining.delete(key);
  }
  for (const [key, extra] of remaining) {
    if (extra <= 0) continue;
    const [subtype, file, anchor, occurrence] = key.split("\u0000").slice(1);
    unexpected.push({
      kind: "new-or-changed-diagnostic",
      detail: `found ${extra}x unexpected ${subtype} in ${file} (anchor "${anchor}", #${occurrence})`,
    });
  }
  const ok = unexpected.length === 0 && baselineProblems.length === 0;
  return { ok, unexpected, baselineProblems };
}

function runOxlint() {
  // The oxlint package does not export its bin path, so resolve it relative
  // to the package root instead of through the exports map.
  const oxlintBin = path.join(path.dirname(require.resolve("oxlint/package.json")), "bin", "oxlint");
  const result = spawnSync(process.execPath, [oxlintBin, "--format=json"], {
    cwd: frontendDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    return { error: `failed to start oxlint: ${result.error.message}` };
  }
  if (result.status !== 0 && result.status !== 1) {
    return { error: `oxlint exited with unexpected code ${result.status}: ${result.stderr?.slice(0, 500)}` };
  }
  const stdout = result.stdout.trim();
  if (!stdout.startsWith("{")) {
    return { error: `oxlint did not produce JSON output: ${stdout.slice(0, 200)}` };
  }
  return { json: JSON.parse(stdout) };
}

/**
 * Evaluate a full diagnostic run against the baseline. `readSourceLine` is
 * injected so unit tests can supply virtual files. Returns the list of
 * problems (empty means PASS).
 */
export function evaluateDiagnostics(diagnostics, readSourceLine, baselineEntries) {
  const nonCompiler = diagnostics.filter((diagnostic) => diagnostic.code !== COMPILER_RULE);
  const { fingerprints, failures } = fingerprintCompilerDiagnostics(diagnostics, readSourceLine);
  const { unexpected, baselineProblems } = compareWithBaseline(fingerprints, baselineEntries);

  const problems = [];
  for (const diagnostic of nonCompiler) {
    problems.push(`non-compiler lint ${diagnostic.severity ?? "issue"}: ${diagnostic.code} in ${diagnostic.filename}: ${String(diagnostic.message).split("\n")[0]}`);
  }
  for (const failure of failures) {
    problems.push(`compiler diagnostic could not be fingerprinted: ${failure.file}:${failure.line ?? "?"} — ${failure.reason}`);
  }
  problems.push(...baselineProblems.map((problem) => `invalid baseline: ${problem}`));
  problems.push(...unexpected.map((entry) => `${entry.kind}: ${entry.detail}`));
  return { problems, fingerprintCount: fingerprints.length };
}

/**
 * Keep the informational counts block honest: if it is present, it must match
 * the actual subtype distribution of the baseline entries.
 */
export function validateBaselineCounts(baselineEntries, declaredCounts) {
  if (!declaredCounts || typeof declaredCounts !== "object") return [];
  const actual = {};
  for (const entry of baselineEntries) {
    actual[entry.subtype] = (actual[entry.subtype] ?? 0) + 1;
  }
  const actualKeys = Object.keys(actual).sort();
  const declaredKeys = Object.keys(declaredCounts).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(declaredKeys)) {
    return [`baseline counts block is stale: declares subtypes [${declaredKeys.join(", ")}] but entries contain [${actualKeys.join(", ")}]`];
  }
  const problems = [];
  for (const subtype of actualKeys) {
    if (declaredCounts[subtype] !== actual[subtype]) {
      problems.push(`baseline counts block is stale: ${subtype} declares ${declaredCounts[subtype]} but has ${actual[subtype]} entries`);
    }
  }
  return problems;
}

function main() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const run = runOxlint();
  if (run.error) {
    console.error(`lint:ci: ${run.error}`);
    process.exit(1);
  }
  const { problems, fingerprintCount } = evaluateDiagnostics(run.json.diagnostics ?? [], (file, line) => {
    const lines = readFileSync(path.join(frontendDir, file), "utf8").split(/\r?\n/);
    return lines[line - 1];
  }, baseline.diagnostics ?? []);
  problems.push(...validateBaselineCounts(baseline.diagnostics ?? [], baseline.counts));

  if (problems.length > 0) {
    console.error(`lint:ci: FAILED with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`lint:ci: PASS — react-compiler diagnostics match the exact baseline (${fingerprintCount} entries, no other lint issues).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
