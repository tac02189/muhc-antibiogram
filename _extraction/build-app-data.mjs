// Transform extracted tables-v2.json into the final app data structure.
// Produces:
//   ../src/data/antibiogram.json   — organisms × audiences × susceptibilities
//   ../src/data/antibiotics.json   — drug metadata (class, route)
//   ../src/data/syndromes.json     — empiric recommendations per EM syndrome
//   ../src/data/supplementary.json — ESBL/CRE rates, blood culture rapid Dx, beta-lactam cross-reactivity

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(await readFile(join(__dirname, "tables-v2.json"), "utf8"));

const OUT_DIR = join(__dirname, "..", "src", "data");
await mkdir(OUT_DIR, { recursive: true });

// --- Organism ID + gram-stain lookup ---
// IDs are kebab-case stable slugs. Gram status is clinically derived from genus.
function slug(name) {
  return name
    .toLowerCase()
    .replace(/[()*^]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const GRAM_BY_GENUS = {
  Staphylococcus: "positive",
  Streptococcus: "positive",
  Enterococcus: "positive",
  Listeria: "positive",
  Escherichia: "negative",
  Klebsiella: "negative",
  Enterobacter: "negative",
  Citrobacter: "negative",
  Proteus: "negative",
  Serratia: "negative",
  Pseudomonas: "negative",
  Stenotrophomonas: "negative",
  Raoultella: "negative",
  Acinetobacter: "negative",
  Haemophilus: "negative",
  Neisseria: "negative",
  Salmonella: "negative",
  Hafnia: "negative",
  Yersinia: "negative",
  Bacteroides: "negative",
  Candida: "fungus",
  Nakaseomyces: "fungus",
  Pichia: "fungus",
  Cryptococcus: "fungus",
};

function gramOf(name) {
  const genus = name.split(/\s+/)[0];
  return GRAM_BY_GENUS[genus] || "unknown";
}

// --- Build the master organism list across all audiences ---
const PAGE_TO_AUDIENCE = {
  page2: "all",
  page3: "all",
  page4: "ed",
  page5: "icu",
  page6: "all", // fungal — same scope as all locations
  page7: "peds",
};

const organismMap = new Map(); // name → { id, name, gramStain, data: { audience: {...} } }

for (const [pageKey, table] of Object.entries(tables)) {
  const audience = PAGE_TO_AUDIENCE[pageKey];
  for (const org of table.organisms) {
    let entry = organismMap.get(org.name);
    if (!entry) {
      entry = {
        id: slug(org.name),
        name: org.name,
        gramStain: gramOf(org.name),
        data: {},
      };
      organismMap.set(org.name, entry);
    }
    // For pages 2+3 (both audience=all), merge susceptibilities into the same audience block.
    if (!entry.data[audience]) {
      entry.data[audience] = {
        isolateCount: org.isolateCount,
        susceptibilities: { ...org.susceptibilities },
        nitrofurantoinTested: org.nitrofurantoinTested,
      };
    } else {
      // Merge — page 3 might add gram-negative drugs to a same-audience entry.
      Object.assign(entry.data[audience].susceptibilities, org.susceptibilities);
      if (entry.data[audience].isolateCount == null) {
        entry.data[audience].isolateCount = org.isolateCount;
      }
    }
  }
}

const organisms = [...organismMap.values()].sort((a, b) => {
  // Sort: fungi last; within bacteria, gram-positive first, then alphabetic.
  const order = { positive: 0, negative: 1, fungus: 2, unknown: 3 };
  const o = (order[a.gramStain] ?? 9) - (order[b.gramStain] ?? 9);
  if (o !== 0) return o;
  return a.name.localeCompare(b.name);
});

// --- Antibiotic metadata ---
// Classes used for grouping in the UI. Routes affect dosing decisions.
const antibiotics = {
  penicillin: { name: "Penicillin", class: "penicillin", routes: ["IV", "PO"] },
  oxacillin: { name: "Oxacillin", class: "penicillin", routes: ["IV"], notes: "Susceptibility implies cefazolin & cephalexin susceptibility." },
  ampicillin: { name: "Ampicillin", class: "penicillin", routes: ["IV", "PO"] },
  "ampicillin-sulbactam": { name: "Ampicillin/sulbactam", class: "beta-lactam/inhibitor", routes: ["IV"] },
  "piperacillin-tazobactam": { name: "Piperacillin/tazobactam", class: "beta-lactam/inhibitor", routes: ["IV"], notes: "Avoid for HECK-Yes organisms (inducible AmpC)." },
  cefazolin: { name: "Cefazolin", class: "1st-gen cephalosporin", routes: ["IV"], notes: "Urinary isolates only on the panel." },
  cefoxitin: { name: "Cefoxitin", class: "2nd-gen cephalosporin (cephamycin)", routes: ["IV"] },
  ceftriaxone: { name: "Ceftriaxone (= cefotaxime)", class: "3rd-gen cephalosporin", routes: ["IV"] },
  ceftazidime: { name: "Ceftazidime", class: "3rd-gen cephalosporin (anti-pseudo)", routes: ["IV"] },
  cefepime: { name: "Cefepime", class: "4th-gen cephalosporin", routes: ["IV"] },
  meropenem: { name: "Meropenem", class: "carbapenem", routes: ["IV"] },
  amikacin: { name: "Amikacin", class: "aminoglycoside", routes: ["IV"], notes: "For Pseudomonas, urinary tract infections only." },
  gentamicin: { name: "Gentamicin", class: "aminoglycoside", routes: ["IV"], notes: "No longer recommended for Pseudomonas per CLSI." },
  "gentamicin-synergy": { name: "Gentamicin synergy", class: "aminoglycoside (synergy)", routes: ["IV"], notes: "For Enterococcus, combined with cell-wall agent." },
  tobramycin: { name: "Tobramycin", class: "aminoglycoside", routes: ["IV"] },
  clindamycin: { name: "Clindamycin", class: "lincosamide", routes: ["IV", "PO"] },
  erythromycin: { name: "Erythromycin", class: "macrolide", routes: ["IV", "PO"] },
  vancomycin: { name: "Vancomycin", class: "glycopeptide", routes: ["IV", "PO"], notes: "PO only for C. difficile." },
  rifampin: { name: "Rifampin", class: "rifamycin", routes: ["IV", "PO"], notes: "Adjunct only — never monotherapy." },
  linezolid: { name: "Linezolid", class: "oxazolidinone", routes: ["IV", "PO"] },
  tetracycline: { name: "Tetracycline", class: "tetracycline", routes: ["PO"] },
  minocycline: { name: "Minocycline", class: "tetracycline", routes: ["IV", "PO"], notes: "Inadequate blood levels — don't use for bacteremia." },
  "tmp-smx": { name: "TMP-SMX (Bactrim)", class: "sulfonamide", routes: ["IV", "PO"] },
  levofloxacin: { name: "Levofloxacin", class: "fluoroquinolone", routes: ["IV", "PO"] },
  ciprofloxacin: { name: "Ciprofloxacin", class: "fluoroquinolone", routes: ["IV", "PO"] },
  nitrofurantoin: { name: "Nitrofurantoin", class: "nitrofuran", routes: ["PO"], notes: "Urinary tract only — no systemic activity." },
  fluconazole: { name: "Fluconazole", class: "azole antifungal", routes: ["IV", "PO"] },
  voriconazole: { name: "Voriconazole", class: "azole antifungal", routes: ["IV", "PO"] },
  caspofungin: { name: "Caspofungin", class: "echinocandin", routes: ["IV"], notes: "NOT for CNS or urinary infections." },
  micafungin: { name: "Micafungin", class: "echinocandin", routes: ["IV"], notes: "NOT for CNS or urinary infections." },
};

// --- Audience metadata ---
const audiences = {
  all: {
    name: "All Locations & Ages",
    description: "MUHC University Hospital, all inpatient locations (excluding clinics). January – December 2025.",
    short: "All",
  },
  ed: {
    name: "Emergency Department",
    description: "MUHC ED (Main), all ages excluding clinics. January 2024 – December 2025.",
    short: "ED",
  },
  icu: {
    name: "Intensive Care Units",
    description: "CICU, MICU3, MICU5, NSICU, SICU. January 2024 – December 2025.",
    short: "ICU",
  },
  peds: {
    name: "Children's Hospital",
    description: "NICU, Well Nursery, Peds, PICU, Youth Psych (excluding clinics). January 2024 – December 2025.",
    short: "Peds",
  },
};

// --- Top-level antibiogram structure ---
const antibiogram = {
  version: "2026",
  source: "MUHC University Hospital Antibiogram 2026",
  lastUpdated: "2026-03-07",
  microLabPhone: "573-882-1287",
  infectionPreventionPhone: "573-882-6880",
  legend: {
    susceptibilityBands: [
      { min: 80, max: 100, label: "Good susceptibility" },
      { min: 41, max: 79, label: "Moderate susceptibility" },
      { min: 0, max: 40, label: "Poor susceptibility" },
    ],
    isolateMinimum: 30,
    isolateNote: "Data for fewer than 30 isolates is not statistically significant per CLSI. Interpret cautiously.",
  },
  audiences,
  organisms,
};

await writeFile(join(OUT_DIR, "antibiogram.json"), JSON.stringify(antibiogram, null, 2), "utf8");
console.log(`Wrote antibiogram.json — ${organisms.length} organisms`);

await writeFile(join(OUT_DIR, "antibiotics.json"), JSON.stringify(antibiotics, null, 2), "utf8");
console.log(`Wrote antibiotics.json — ${Object.keys(antibiotics).length} drugs`);

// --- Syndromes: scaffold with placeholder empiric choices grounded in the local antibiogram + IDSA guidance.
// Thiago will review and edit each card before v1.0 launch.
const syndromes = [
  {
    id: "uti-uncomplicated",
    name: "Uncomplicated UTI",
    icon: "droplet",
    context: "Otherwise healthy outpatient, no recent abx, no urologic abnormalities. Female non-pregnant.",
    firstLine: [
      { drug: "nitrofurantoin", dose: "100 mg PO BID × 5 d", rationale: "Local E. coli susceptibility ~97%. Excellent urinary concentration." },
      { drug: "tmp-smx", dose: "1 DS PO BID × 3 d", rationale: "Local E. coli susceptibility ~75%. Avoid if local resistance > 20% or recent TMP-SMX use." },
    ],
    alternatives: [
      { drug: "cefazolin", dose: "Cephalexin 500 mg PO QID × 5–7 d", rationale: "Cephalexin reasonable second-line, especially for ESBL concerns are low." },
    ],
    avoid: [
      { drug: "ciprofloxacin", reason: "Reserve fluoroquinolones — local E. coli FQ susceptibility ~70–75%; ADRs (tendon, QT, neurologic)." },
      { drug: "ampicillin", reason: "Local E. coli susceptibility ~52% — inadequate empiric coverage." },
    ],
    duration: "3–5 days (3 d TMP-SMX, 5 d nitrofurantoin)",
    notes: "Confirm uncomplicated criteria. For pregnant, complicated, or pyelo cases, see Complicated UTI / Pyelonephritis.",
    relevantOrganisms: ["escherichia-coli", "klebsiella-pneumoniae", "proteus-mirabilis", "staphylococcus-coagulase-negative-cons"],
  },
  {
    id: "uti-complicated",
    name: "Complicated UTI / Pyelonephritis",
    icon: "droplets",
    context: "Pyelonephritis, urosepsis, indwelling catheter, male, pregnant, or urologic abnormalities.",
    firstLine: [
      { drug: "ceftriaxone", dose: "1–2 g IV q24h", rationale: "Local gram-negative susceptibility ~81–92%. First-line empiric for inpatient pyelo." },
    ],
    alternatives: [
      { drug: "piperacillin-tazobactam", dose: "3.375–4.5 g IV q6–8h", rationale: "If sepsis, recent broad-spectrum abx, or healthcare exposure. Avoid for HECK-Yes organisms." },
      { drug: "cefepime", dose: "1–2 g IV q8–12h", rationale: "If Pseudomonas risk or AmpC concern." },
    ],
    avoid: [
      { drug: "ampicillin-sulbactam", reason: "Local E. coli susceptibility ~63–65% — borderline coverage for empiric." },
      { drug: "nitrofurantoin", reason: "Does NOT achieve adequate tissue levels — urinary tract concentration only. Don't use for pyelo." },
    ],
    duration: "5–7 days (depending on agent — see Shorter Is Better)",
    notes: "If patient has had recent abx, ESBL history, or healthcare exposure — consider cefepime or carbapenem and consult ID.",
    relevantOrganisms: ["escherichia-coli", "klebsiella-pneumoniae", "proteus-mirabilis", "enterococcus-faecalis", "pseudomonas-aeruginosa"],
  },
  {
    id: "cap",
    name: "Community-Acquired Pneumonia (CAP)",
    icon: "wind",
    context: "Outpatient or inpatient (non-ICU) without risk factors for MRSA or Pseudomonas.",
    firstLine: [
      { drug: "ceftriaxone", dose: "1–2 g IV q24h + macrolide or doxycycline", rationale: "Inpatient non-ICU. Covers S. pneumoniae, H. influenzae, Moraxella." },
    ],
    alternatives: [
      { drug: "levofloxacin", dose: "750 mg IV/PO q24h", rationale: "Respiratory fluoroquinolone monotherapy. Use when beta-lactam contraindicated." },
    ],
    avoid: [
      { drug: "vancomycin", reason: "Not needed empirically unless MRSA risk factors (recent hospitalization, prior MRSA, severe CAP)." },
    ],
    duration: "3–5 days (if afebrile and clinically improving)",
    notes: "Per IDSA 2019. Add vancomycin OR linezolid for MRSA risk; add piperacillin-tazobactam OR cefepime for Pseudomonas risk.",
    relevantOrganisms: ["streptococcus-pneumoniae-non-sterile", "staphylococcus-aureus-mssa", "staphylococcus-aureus-mrsa"],
  },
  {
    id: "hap-vap",
    name: "Hospital / Ventilator-Associated Pneumonia",
    icon: "wind",
    context: "Pneumonia developing ≥ 48 h after admission or ≥ 48 h after intubation.",
    firstLine: [
      { drug: "cefepime", dose: "2 g IV q8h + vancomycin 15–20 mg/kg IV q8–12h", rationale: "Empiric coverage of Pseudomonas + MRSA. Local Pseudomonas cefepime susceptibility ~93–94%." },
    ],
    alternatives: [
      { drug: "piperacillin-tazobactam", dose: "4.5 g IV q6h (extended infusion) + vancomycin", rationale: "If no AmpC concern. ICU Pseudomonas pip-tazo ~92%." },
      { drug: "meropenem", dose: "1 g IV q8h + vancomycin", rationale: "If ESBL or carbapenem-needed pathogens suspected." },
    ],
    avoid: [
      { drug: "ceftriaxone", reason: "No Pseudomonas coverage — inadequate empiric for HAP/VAP." },
    ],
    duration: "5–7 days (depending on pathogen)",
    notes: "Per IDSA 2016. De-escalate based on culture data. Add linezolid alternative if vancomycin contraindicated.",
    relevantOrganisms: ["pseudomonas-aeruginosa", "staphylococcus-aureus-mrsa", "klebsiella-pneumoniae", "enterobacter-cloacae", "escherichia-coli"],
  },
  {
    id: "ssti",
    name: "Skin & Soft Tissue Infection",
    icon: "shield",
    context: "Non-purulent cellulitis vs purulent (abscess/furuncle). Severity determines coverage.",
    firstLine: [
      { drug: "cefazolin", dose: "Cephalexin 500 mg PO QID (mild) or cefazolin 1–2 g IV q8h (mod)", rationale: "Non-purulent cellulitis: targets Streptococcus. Local MSSA cefazolin ~100% (via oxacillin)." },
      { drug: "tmp-smx", dose: "1–2 DS PO BID", rationale: "Purulent / suspected MRSA. Local MRSA TMP-SMX ~65–73%." },
    ],
    alternatives: [
      { drug: "clindamycin", dose: "300–450 mg PO TID or 600 mg IV q8h", rationale: "Beta-lactam allergy. Local MRSA clindamycin ~69–91% — variable, check sensitivities." },
      { drug: "vancomycin", dose: "15–20 mg/kg IV q8–12h", rationale: "Severe / inpatient MRSA-suspected. Local MRSA 100%." },
      { drug: "linezolid", dose: "600 mg IV/PO q12h", rationale: "PO option for MRSA outpatient bridge." },
    ],
    avoid: [
      { drug: "ciprofloxacin", reason: "Poor Strep coverage and overuse driving resistance." },
    ],
    duration: "5–7 days (non-purulent cellulitis 5 d)",
    notes: "Per IDSA 2014. Source control (I&D) is the primary treatment for abscess.",
    relevantOrganisms: ["staphylococcus-aureus-mssa", "staphylococcus-aureus-mrsa", "streptococcus-pyogenes-gas", "streptococcus-agalactiae-gbs"],
  },
  {
    id: "intra-abdominal",
    name: "Intra-Abdominal Infection",
    icon: "circle",
    context: "Community-acquired complicated IAI (perforated appendix, diverticulitis, secondary peritonitis).",
    firstLine: [
      { drug: "ceftriaxone", dose: "1–2 g IV q24h + metronidazole 500 mg IV q8h", rationale: "Covers gram-negatives + anaerobes. Standard for community-acquired moderate severity." },
    ],
    alternatives: [
      { drug: "piperacillin-tazobactam", dose: "3.375–4.5 g IV q6–8h", rationale: "Single-agent for severe/healthcare-associated. Covers Pseudomonas + anaerobes." },
      { drug: "ampicillin-sulbactam", dose: "3 g IV q6h", rationale: "If pip-tazo unavailable. Note Enterococcus coverage added by ampicillin." },
    ],
    avoid: [
      { drug: "ciprofloxacin", reason: "Insufficient gram-negative coverage as monotherapy locally." },
    ],
    duration: "4 days post source control (STOP-IT trial)",
    notes: "Source control (drainage, surgery) is essential. Per IDSA/SIS. Add Enterococcus coverage (ampicillin) for severe / immunocompromised.",
    relevantOrganisms: ["escherichia-coli", "klebsiella-pneumoniae", "enterococcus-faecalis", "bacteroides-fragilis", "pseudomonas-aeruginosa"],
  },
];

await writeFile(join(OUT_DIR, "syndromes.json"), JSON.stringify(syndromes, null, 2), "utf8");
console.log(`Wrote syndromes.json — ${syndromes.length} syndromes (placeholders pending clinical review)`);

// --- Supplementary: ESBL/CRE rates, Shorter is Better durations, blood-culture rapid Dx, beta-lactam cross-reactivity ---
// These are transcribed from layout.txt pages 8-13. Manually structured for app use.

const supplementary = {
  resistance: {
    esbl: {
      title: "ESBL Rates, n/N (%)",
      organisms: [
        { name: "E. coli",            all: "104/1265 (8)",  ed: "104/1766 (6)", icu: "23/254 (9)",  peds: "3/60 (5)" },
        { name: "K. oxytoca",         all: "3/52 (6)",      ed: "2/46 (4)",     icu: null,           peds: "1/12 (8)" },
        { name: "K. pneumoniae",      all: "45/322 (14)",   ed: "36/352 (10)",  icu: "12/122 (10)", peds: "0/21 (0)" },
        { name: "P. mirabilis",       all: "10/176 (6)",    ed: "10/211 (5)",   icu: "3/53 (6)",    peds: null },
      ],
      note: "ED, ICU, and Children's Hospital data span 2024–2025.",
    },
    cre: {
      title: "CRE Rates, n/N (%)",
      definition: "Per CDC: Enterobacterales resistant to any carbapenem.",
      organisms: [
        { name: "E. coli",        all: "4/1265 (0.3)", ed: "2/1766 (0.1)", icu: "1/254 (0.4)", peds: "0/60 (0)" },
        { name: "K. oxytoca",     all: "0/57 (0)",     ed: "0/48 (0)",     icu: null,           peds: "0/12 (0)" },
        { name: "K. pneumoniae", all: "5/322 (1.6)",  ed: "2/352 (0.6)",  icu: "3/122 (2.5)", peds: "0/21 (0)" },
        { name: "P. mirabilis",  all: "0/176 (0)",    ed: "0/211 (0)",    icu: "0/53 (0)",    peds: null },
        { name: "A. baumannii",  all: "15/27 (56)",   ed: null,            icu: null,           peds: null },
      ],
      note: "A. baumannii carbapenem resistance reported for 2024–2025 (All Locations).",
    },
    pneumoBreakpoints: {
      title: "S. pneumoniae Breakpoints (μg/mL)",
      rows: [
        { site: "Meningitis/CSF",       penicillin: "IV: ≤ 0.06 (S); ≥ 0.12 (R)",   ceftriaxone: "≤ 0.5 (S); 1 (I); ≥ 2 (R)" },
        { site: "Sterile, Non-CSF",     penicillin: "IV: ≤ 2 (S); 4 (I); ≥ 8 (R)",  ceftriaxone: "≤ 1 (S); 2 (I); ≥ 4 (R)" },
        { site: "Non-Sterile",          penicillin: "PO: ≤ 0.06 (S); 0.12–1 (I); ≥ 2 (R)", ceftriaxone: "Same as sterile, non-meningitis/CSF" },
      ],
    },
  },
  durations: {
    title: "Shorter is Better — Antibiotic Durations",
    source: "https://www.bradspellberg.com/shorter-is-better",
    rows: [
      { condition: "Community-acquired pneumonia", duration: "3–5 days" },
      { condition: "Hospital/ventilator pneumonia", duration: "5–7 days (depending on pathogen)" },
      { condition: "Cystitis", duration: "3–7 days (depending on agent)" },
      { condition: "Pyelonephritis / complicated UTI", duration: "5–7 days (depending on agent)" },
      { condition: "Catheter-associated UTI", duration: "3–7 days (depending on patient factors)" },
      { condition: "Skin & soft tissue infection", duration: "5–7 days" },
      { condition: "Non-purulent cellulitis", duration: "5 days" },
      { condition: "Intra-abdominal infection (with source control)", duration: "4 days" },
      { condition: "Clostridiodes difficile", duration: "10 days" },
      { condition: "COPD exacerbation (when indicated)", duration: "5 days (3 d if azithromycin)" },
      { condition: "Sinusitis (when indicated)", duration: "5 days" },
      { condition: "Bacteremia — uncomplicated MSSA/MRSA", duration: "14 days" },
      { condition: "Bacteremia — complicated MSSA/MRSA", duration: "4–6 weeks" },
      { condition: "Bacteremia — uncomplicated gram-negative", duration: "7 days" },
      { condition: "Bacteremia — other uncomplicated", duration: "7–14 days" },
    ],
  },
  bloodCulture: {
    title: "Blood Culture Rapid Diagnostics & Empiric Treatment",
    gramPositive: [
      {
        result: "Methicillin-Susceptible Staphylococcus epidermidis (CoNS)",
        empiric: "Vancomycin initially (clinical correlation — often contaminant)",
        notes: "CoNS in only one set: likely contamination. S. epidermidis is often oxacillin resistant — don't confuse with S. aureus.",
      },
      {
        result: "Methicillin-Resistant Staphylococcus epidermidis (CoNS)",
        empiric: "Vancomycin initially (clinical correlation — often contaminant)",
        notes: "Stop antimicrobials if clinical concern for infection is low.",
      },
      { result: "Oxacillin-Susceptible Staphylococcus lugdunensis", empiric: "Cefazolin or Nafcillin", notes: "CoNS but considered a pathogen." },
      { result: "Oxacillin-Resistant Staphylococcus lugdunensis", empiric: "Vancomycin", notes: "" },
      { result: "Oxacillin-Susceptible Staphylococcus aureus (MSSA)", empiric: "Cefazolin or Nafcillin", notes: "S. aureus is never a contaminant. ID consult. Minimum 14 d therapy." },
      { result: "Oxacillin-Resistant Staphylococcus aureus (MRSA)", empiric: "Vancomycin", notes: "S. aureus is never a contaminant. ID consult. Minimum 14 d therapy." },
      { result: "Streptococcus pneumoniae", empiric: "Ceftriaxone ± Vancomycin*", notes: "*Add vancomycin if meningitis or severe infection." },
      { result: "Streptococcus pyogenes (GAS), S. agalactiae (GBS), S. anginosus group", empiric: "Ampicillin or Cefazolin", notes: "Beta-hemolytic Strep routinely susceptible to beta-lactams." },
      { result: "Streptococcus species other than the above", empiric: "Ceftriaxone initially (clinical correlation — often contaminant)", notes: "Single-set growth: skin contamination possible." },
      { result: "Enterococcus faecalis (non-VRE)", empiric: "Ampicillin", notes: "ID consult. If vanA/vanB NOT detected, vancomycin likely susceptible." },
      { result: "Enterococcus faecium (non-VRE)", empiric: "Vancomycin", notes: "ID consult. If vanA/vanB NOT detected, vancomycin likely susceptible." },
      { result: "Vancomycin-Resistant Enterococcus (VRE)", empiric: "Daptomycin or Linezolid", notes: "ID consult required." },
      { result: "Listeria monocytogenes", empiric: "Ampicillin", notes: "ID consult. Concern for meningitis." },
    ],
    gramNegative: [
      {
        result: "E. coli, Klebsiella oxytoca, K. pneumoniae, Proteus spp.",
        empiric: "Continue current therapy with gram-negative activity",
        notes: "When ESBL NOT detected: ceftriaxone, cefepime, and pip-tazo likely cover.",
      },
      { result: "Salmonella spp.", empiric: "Ceftriaxone or Ampicillin-Sulbactam", notes: "Uncommon but likely pathogenic." },
      { result: "Haemophilus influenzae", empiric: "Ceftriaxone or Ampicillin-Sulbactam", notes: "Beta-lactamase production is narrow. NOT ESBL." },
      { result: "Neisseria meningitidis", empiric: "Ceftriaxone", notes: "" },
      {
        result: "Enterobacter cloacae complex, K. aerogenes, Citrobacter freundii, Hafnia alvei, Yersinia enterocolitica (HECK-Yes)",
        empiric: "Cefepime",
        notes: "Inducible AmpC. Avoid ceftriaxone and pip-tazo even if labeled susceptible (unless discussed with ID). If cefepime MIC > 4, use carbapenem.",
      },
      {
        result: "Pseudomonas aeruginosa",
        empiric: "Piperacillin-Tazobactam or Cefepime",
        notes: "If not improving or MDR concern: add tobramycin. ID consult.",
      },
      { result: "Acinetobacter spp.", empiric: "Ampicillin-Sulbactam (high dose)", notes: "Consult ID." },
      { result: "Serratia marcescens", empiric: "Cefepime", notes: "Low AmpC risk. If cefoxitin resistant, use cefepime." },
      { result: "Stenotrophomonas maltophilia", empiric: "Sulfamethoxazole-Trimethoprim", notes: "Minocycline has inadequate blood levels — don't use for bacteremia. Often colonizer." },
      { result: "Bacteroides fragilis", empiric: "Include anaerobic coverage", notes: "Options: metronidazole, pip-tazo, or amp-sulbactam." },
    ],
    resistanceMarkers: [
      { marker: "CTX-M", drug: "Ertapenem", notes: "Indicates ESBL producer, usually Klebsiella spp. or E. coli." },
      { marker: "KPC", drug: "Meropenem-Vaborbactam", notes: "ID consult required. Indicates carbapenemase producer (CRE)." },
      { marker: "OXA", drug: "Ceftazidime-Avibactam (Acinetobacter: ampicillin-sulbactam)", notes: "ID consult required. Acinetobacter: amp-sulbactam best empiric; meropenem likely resistant." },
      { marker: "IMP / NDM / VIM", drug: "Cefiderocol", notes: "ID consult required. CRE not susceptible to ceftazidime-avibactam." },
    ],
    yeast: [
      { result: "Candida albicans", empiric: "Fluconazole", notes: "Susceptible to fluconazole in 100% of local cases." },
      { result: "Candida auris", empiric: "Micafungin", notes: "Commonly resistant to antifungals. Isolation precautions. ID consult." },
      { result: "Nakaseomyces glabratus (formerly C. glabrata)", empiric: "Micafungin", notes: "De-escalate to fluconazole if susceptible." },
      { result: "Pichia kudriavzevii (formerly C. krusei)", empiric: "Micafungin", notes: "Routinely resistant to fluconazole." },
      { result: "Candida parapsilosis", empiric: "Micafungin", notes: "Susceptible to micafungin in 100% of local cases." },
      { result: "Candida tropicalis", empiric: "Micafungin or Fluconazole", notes: "Fluconazole susceptibility varies. Micafungin if critically ill." },
      { result: "Cryptococcus neoformans/gattii", empiric: "Amphotericin B", notes: "ID consult strongly recommended." },
      { result: "Yeast not identified by BioFire", empiric: "Micafungin", notes: "Treat initially and consult ID." },
    ],
  },
  betaLactamCrossReactivity: {
    title: "Allergic Cross-Reactivity Between β-Lactams",
    note: "Chart addresses cross-reactivity with cephalosporins. Avoid penicillins in true penicillin allergy.",
    columns: ["Drug", "Identical R1/R2 side chains (highest risk)", "Similar R1/R2 (low risk; caution if life-threatening prior)"],
    rows: [
      ["Ampicillin",   "CEPHALEXIN, CEFACLOR",              "Cefadroxil, cefprozil"],
      ["Amoxicillin",  "CEFADROXIL, CEFPROZIL",             "Cephalexin, cefaclor"],
      ["Cefaclor",     "AMPICILLIN, CEPHALEXIN",            "Penicillin, piperacillin, amoxicillin, cefadroxil, cefprozil"],
      ["Cefadroxil",   "AMOXICILLIN, CEFPROZIL",            "Penicillin, piperacillin, ampicillin, cephalexin, cefaclor"],
      ["Cefazolin",    "NONE",                              "NONE"],
      ["Cefdinir",     "CEFIXIME",                          "Ceftibuten, ceftriaxone, cefotaxime, cefpodoxime, ceftazidime, cefepime, ceftaroline, ceftolozane, cefiderocol"],
      ["Cefepime",     "CEFTRIAXONE, CEFOTAXIME, CEFPODOXIME", "Cefuroxime, ceftibuten, cefdinir, cefixime, ceftazidime, ceftaroline, ceftolozane, cefiderocol"],
      ["Cefixime",     "CEFDINIR",                          "Cefuroxime, ceftibuten, ceftriaxone, cefotaxime, cefpodoxime, ceftazidime, cefepime, ceftaroline, ceftolozane, cefiderocol"],
      ["Cefoxitin",    "CEFUROXIME",                        "Cefotaxime"],
      ["Cefpodoxime",  "CEFTRIAXONE, CEFEPIME, CEFOTAXIME", "Cefuroxime, ceftibuten, cefdinir, cefixime, ceftazidime, ceftaroline, ceftolozane, cefiderocol"],
      ["Cefprozil",    "AMOXICILLIN, CEFADROXIL",           "Penicillin, piperacillin, ampicillin, cephalexin, cefaclor"],
      ["Ceftaroline",  "NONE",                              "Cefuroxime, ceftibuten, cefdinir, cefixime, ceftriaxone, cefotaxime, cefpodoxime, ceftazidime, cefepime, ceftolozane, cefiderocol"],
      ["Ceftazidime",  "AZTREONAM, CEFIDEROCOL",            "Ceftibuten, cefdinir, cefixime, ceftriaxone, cefotaxime, cefpodoxime, cefepime, ceftaroline, ceftolozane"],
      ["Ceftibuten",   "NONE",                              "Cefdinir, cefixime, ceftriaxone, cefotaxime, cefpodoxime, ceftazidime, cefepime, ceftaroline, ceftolozane, cefiderocol"],
      ["Ceftolozane",  "NONE",                              "Ceftibuten, cefdinir, cefixime, ceftriaxone, cefotaxime, cefpodoxime, ceftazidime, cefepime, ceftaroline, cefiderocol"],
      ["Ceftriaxone",  "CEFEPIME, CEFOTAXIME, CEFPODOXIME", "Cefuroxime, ceftibuten, cefdinir, cefixime, ceftazidime, ceftaroline, ceftolozane, cefiderocol"],
      ["Cefuroxime",   "CEFOXITIN",                         "Cefixime, ceftriaxone, cefotaxime, cefpodoxime, cefepime, ceftaroline"],
      ["Cephalexin",   "AMPICILLIN, CEFACLOR",              "Penicillin, piperacillin, amoxicillin, cefadroxil, cefprozil"],
      ["Penicillin G", "—",                                 "Cefadroxil, cephalexin, cefprozil, cefaclor"],
    ],
  },
};

await writeFile(join(OUT_DIR, "supplementary.json"), JSON.stringify(supplementary, null, 2), "utf8");
console.log(`Wrote supplementary.json — ESBL/CRE + durations + blood culture + cross-reactivity`);

console.log(`\nAll data files written to ${OUT_DIR}`);
