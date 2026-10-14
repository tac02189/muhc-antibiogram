// Self-test for verify-data.mjs.
//
// Run: node verify-controls.mjs        (after the pipeline; exits 1 on any miss)
//
// Each control corrupts a COPY of src/data/antibiogram.json in one specific way
// and must make verify-data.mjs exit 1 WITH THE DIAGNOSTIC NAMED FOR IT; the
// unmodified file must exit 0. A verifier that cannot fail is worth nothing,
// and a passing run looks the same either way — so run this after ANY edit to
// verify-data.mjs. Controls 1-14 are the ones CLAUDE.md has listed since
// 2026-10-01 (until 2026-10-13 they were rebuilt by hand each time); 15-27
// cover intrinsic resistance, the "Not tested" entries notes now hang on, and
// the organism ids those notes point at.
//
// Exit status alone is not enough: node also exits 1 when the verifier
// crashes, and a control can fail on some unrelated check while the one it
// targets has rotted. So each control names the failure it must produce, and
// a control that exits 1 without it is reported as a miss (peer review,
// 2026-10-13).
//
// Nothing under src/ is touched: copies go to a temp directory, which is
// removed afterwards.

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data", "antibiogram.json");
const VERIFY = join(__dirname, "verify-data.mjs");
const original = JSON.parse(await readFile(DATA, "utf8"));

const org = (ab, id) => {
  const o = ab.organisms.find((x) => x.id === id);
  if (!o) throw new Error(`control setup: no organism "${id}" — update this control for the new PDF`);
  return o;
};
const bucket = (ab, id, aud) => {
  const b = org(ab, id).data[aud];
  if (!b) throw new Error(`control setup: "${id}" has no "${aud}" bucket`);
  return b;
};
const sus = (ab, id, aud) => bucket(ab, id, aud).susceptibilities;
const ir = (ab, id, aud) => (bucket(ab, id, aud).intrinsicResistance ||= []);
const needKey = (obj, key, value, what) => {
  if (!(key in obj) || (value !== undefined && obj[key] !== value)) {
    throw new Error(`control setup: ${what} no longer has ${key}=${value} — update this control`);
  }
};
const needIR = (list, slug, what) => {
  if (!list.includes(slug)) throw new Error(`control setup: ${what} is no longer intrinsically resistant to ${slug}`);
};

// [name, mutate(copy), substring the verifier's failure output must contain]
const CONTROLS = [
  ["1 wrong value", (ab) => (sus(ab, "escherichia-coli", "all").ampicillin = 25), "Check C — Escherichia coli [all] ampicillin:"],
  [
    "2 adjacent-row swap",
    (ab) => {
      const a = sus(ab, "enterococcus-faecalis", "all"), b = sus(ab, "enterococcus-faecium", "all");
      [a.ampicillin, b.ampicillin] = [b.ampicillin, a.ampicillin];
    },
    "Check C — Enterococcus faecium [all] ampicillin:",
  ],
  [
    "3 within-row drug swap",
    (ab) => {
      const s = sus(ab, "escherichia-coli", "all");
      [s.ampicillin, s["ampicillin-sulbactam"]] = [s["ampicillin-sulbactam"], s.ampicillin];
    },
    "Check C — Escherichia coli [all] ampicillin-sulbactam:",
  ],
  ["4 plausible-but-wrong value", (ab) => (sus(ab, "escherichia-coli", "all").ceftriaxone += 1), "Check C — Escherichia coli [all] ceftriaxone:"],
  ["5 dropped-to-null", (ab) => (sus(ab, "klebsiella-pneumoniae", "all").meropenem = null), "value DROPPED"],
  [
    "6 invented value over a dash",
    (ab) => {
      const s = sus(ab, "enterococcus-faecalis", "all");
      needKey(s, "erythromycin", null, "E. faecalis all");
      s.erythromycin = 50;
    },
    'erythromycin: PDF p2 shows "-" (not tested) but JSON records 50',
  ],
  [
    "7 deleted key",
    (ab) => {
      const s = sus(ab, "staphylococcus-aureus-mssa", "all");
      needKey(s, "oxacillin", undefined, "MSSA all");
      delete s.oxacillin;
    },
    "oxacillin: PDF p2 shows 100 but the JSON has NO SUCH KEY",
  ],
  ["8 invented drug with no column", (ab) => (sus(ab, "escherichia-coli", "all").penicillin = 40), "has NO COLUMN for that drug — invented"],
  ["9 deleted audience bucket", (ab) => delete org(ab, "escherichia-coli").data.ed, 'NO matching JSON organism: "Escherichia coli'],
  [
    "10 deleted organism",
    (ab) => (ab.organisms = ab.organisms.filter((o) => o.id !== "staphylococcus-aureus-mssa")),
    'NO matching JSON organism: "Staphylococcus aureus (MSSA)',
  ],
  ["11 organisms: []", (ab) => (ab.organisms = []), "NO matching JSON organism"],
  [
    "12 unmatchable name + corrupted value",
    (ab) => {
      const o = org(ab, "klebsiella-oxytoca");
      o.name = "Klebsiella zzzzz";
      o.data.all.susceptibilities.meropenem = 50;
    },
    "Check B — Klebsiella zzzzz [all]",
  ],
  // Another number printed on the same row (the nitrofurantoin count), which
  // the first verifier accepted.
  [
    "13 wrong isolateCount",
    (ab) => {
      const b = bucket(ab, "staphylococcus-aureus-mssa", "all");
      b.isolateCount = b.nitrofurantoinTested;
    },
    "Staphylococcus aureus (MSSA) [all] isolateCount:",
  ],
  ["14 wrong nitrofurantoinTested", (ab) => (bucket(ab, "enterococcus-faecalis", "all").nitrofurantoinTested -= 1), "nitrofurantoinTested:"],
  [
    "15 dropped intrinsic resistance",
    (ab) => {
      const list = ir(ab, "enterococcus-faecalis", "all");
      needIR(list, "ceftriaxone", "E. faecalis all");
      list.splice(list.indexOf("ceftriaxone"), 1);
    },
    "ceftriaxone: PDF p2 marks it intrinsically resistant (black cell) but the JSON does not record it",
  ],
  [
    "16 invented intrinsic resistance over a dash",
    (ab) => ir(ab, "enterococcus-faecalis", "all").push("erythromycin"),
    "erythromycin: JSON records intrinsic resistance but the PDF p2 cell is not black",
  ],
  [
    "17 intrinsic resistance on the wrong drug",
    (ab) => {
      const list = ir(ab, "pseudomonas-aeruginosa", "all");
      needIR(list, "minocycline", "Pseudomonas all");
      list[list.indexOf("minocycline")] = "tobramycin";
    },
    "tobramycin: JSON records intrinsic resistance but the PDF p3 cell is not black",
  ],
  [
    "18 black cell also given a value",
    (ab) => (sus(ab, "enterococcus-faecalis", "all").ceftriaxone = 0),
    "ceftriaxone: PDF p2 cell is black (intrinsic resistance) but the JSON records 0",
  ],
  [
    "19 black cell recorded as not tested",
    (ab) => {
      const list = ir(ab, "enterococcus-faecalis", "all");
      needIR(list, "clindamycin", "E. faecalis all");
      list.splice(list.indexOf("clindamycin"), 1);
      sus(ab, "enterococcus-faecalis", "all").clindamycin = null;
    },
    "clindamycin: PDF p2 marks it intrinsically resistant (black cell) but the JSON does not record it",
  ],
  [
    "20 every intrinsicResistance list deleted",
    (ab) => {
      for (const o of ab.organisms) for (const b of Object.values(o.data)) delete b.intrinsicResistance;
    },
    "Staphylococcus aureus (MRSA) [all] penicillin-iv: PDF p2 marks it intrinsically resistant",
  ],
  ["21 invented intrinsic resistance, no column", (ab) => ir(ab, "escherichia-coli", "all").push("fluconazole"), "fluconazole: JSON records intrinsic resistance but PDF p3 has NO COLUMN"],
  // Only Check D's overlap test can catch this: the IR entry is still there,
  // and Check C never inspects a null against an empty cell.
  [
    "22 black cell kept AND recorded as not tested",
    (ab) => {
      needIR(ir(ab, "enterococcus-faecalis", "all"), "ceftriaxone", "E. faecalis all");
      sus(ab, "enterococcus-faecalis", "all").ceftriaxone = null;
    },
    "ceftriaxone: PDF p2 cell is black (intrinsic resistance) but the JSON records null",
  ],
  // The "Not tested" entries the organism-specific notes now hang on.
  [
    "23 deleted dash: Pseudomonas gentamicin",
    (ab) => {
      const s = sus(ab, "pseudomonas-aeruginosa", "all");
      needKey(s, "gentamicin", null, "Pseudomonas all");
      delete s.gentamicin;
    },
    'Pseudomonas aeruginosa [all] gentamicin: PDF p3 shows "-" (not tested) but the JSON has NO SUCH KEY',
  ],
  [
    "24 deleted dash: E. cloacae pip-tazo",
    (ab) => {
      const s = sus(ab, "enterobacter-cloacae", "all");
      needKey(s, "piperacillin-tazobactam", null, "E. cloacae all");
      delete s["piperacillin-tazobactam"];
    },
    'piperacillin-tazobactam: PDF p3 shows "-" (not tested) but the JSON has NO SUCH KEY',
  ],
  ["25 duplicated intrinsic resistance", (ab) => ir(ab, "enterococcus-faecalis", "all").push("clindamycin"), "intrinsicResistance lists a drug more than once"],
  // Found by Codex's experiments, 2026-10-14: both passed before.
  [
    "26 invented null where the page has no column",
    (ab) => {
      const s = sus(ab, "pseudomonas-aeruginosa", "ed");
      if ("minocycline" in s) throw new Error("control setup: Pseudomonas ED now has a minocycline column — pick another drug");
      s.minocycline = null;
    },
    'minocycline: JSON records "not tested" (null) but PDF p4 has NO COLUMN for that drug',
  ],
  [
    "27 two organisms' ids swapped",
    (ab) => {
      const a = org(ab, "escherichia-coli"), b = org(ab, "pseudomonas-aeruginosa");
      [a.id, b.id] = [b.id, a.id];
    },
    'organism "Escherichia coli" has id "pseudomonas-aeruginosa"',
  ],
];

const dir = await mkdtemp(join(tmpdir(), "antibiogram-controls-"));
const run = (path) => {
  const r = spawnSync(process.execPath, [VERIFY], {
    env: { ...process.env, ANTIBIOGRAM_JSON: path },
    encoding: "utf8",
  });
  const failureLines = [...r.stdout.matchAll(/^ {2}x (.*)$/gm)].map((m) => m[1]);
  return { status: r.status, failureLines, output: r.stdout + r.stderr };
};

let misses = 0;
try {
  const clean = run(DATA);
  console.log(`baseline (unmodified data) -> exit ${clean.status} ${clean.status === 0 ? "ok" : "PROBLEM: must exit 0"}`);
  if (clean.status !== 0) {
    misses++;
    console.log(clean.output);
  }
  for (const [name, mutate, expected] of CONTROLS) {
    const copy = structuredClone(original);
    mutate(copy);
    const path = join(dir, `control-${name.split(" ")[0]}.json`);
    await writeFile(path, JSON.stringify(copy), "utf8");
    const r = run(path);
    const hit = r.failureLines.find((l) => l.includes(expected));
    const ok = r.status === 1 && hit !== undefined;
    if (!ok) misses++;
    console.log(
      `${ok ? "fails as it should" : "MISSED            "}  ${name.padEnd(44)} ${
        ok ? hit.slice(0, 100) : `exit ${r.status}; expected a failure containing: ${expected}`
      }`
    );
    if (!ok && r.failureLines.length === 0) console.log(r.output.slice(0, 600));
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("");
if (misses) {
  console.log(`${misses} problem(s) — the verifier is not trustworthy until every control fails as named and the baseline passes.`);
  process.exit(1);
}
console.log(`All ${CONTROLS.length} controls fail with the diagnostic named for them, and the unmodified data passes.`);
