// Builds normalised USDA FoodData Central rows (SR Legacy, Foundation, FNDDS) for reference_foods.
//
//   node scripts/ref/usda.mjs                 # download (if needed), extract, build all three
//   node scripts/ref/usda.mjs --only sr       # sr | foundation | fndds (comma separated)
//   node scripts/ref/usda.mjs --refresh       # re-download even when raw CSVs already exist
//
// Source: https://fdc.nal.usda.gov/download-datasets (public domain / CC0). Downloaded files are untrusted
// data: we only ever read CSVs from them. Output: data/reference/usda_{sr,foundation,fndds}.json (gitignored).
// No npm dependencies: built-in fetch, bsdtar/PowerShell/unzip for extraction, own streaming CSV parser.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'data', 'reference', 'raw', 'usda');
const OUT = path.join(ROOT, 'data', 'reference');
const BASE = 'https://fdc.nal.usda.gov';

const DATASETS = {
  sr: {
    source: 'usda_sr', pattern: /FoodData_Central_sr_legacy_food_csv_([0-9-]+)\.zip/g,
    fallback: 'FoodData_Central_sr_legacy_food_csv_2018-04.zip', out: 'usda_sr.json',
  },
  foundation: {
    source: 'usda_foundation', pattern: /FoodData_Central_foundation_food_csv_([0-9-]+)\.zip/g,
    fallback: 'FoodData_Central_foundation_food_csv_2026-04-30.zip', out: 'usda_foundation.json',
  },
  fndds: {
    source: 'usda_fndds', pattern: /FoodData_Central_survey_food_csv_([0-9-]+)\.zip/g,
    fallback: 'FoodData_Central_survey_food_csv_2024-10-31.zip', out: 'usda_fndds.json',
  },
};

// nutrient_id -> per100 key (units verified at runtime against nutrient.csv)
const NUTRIENTS = {
  1003: ['proteinG', 'G'], 1004: ['fatG', 'G'], 1005: ['carbsG', 'G'], 1079: ['fiberG', 'G'],
  2000: ['sugarG', 'G'], 1063: ['sugarAltG', 'G'], 1093: ['sodiumMg', 'MG'], 1092: ['potassiumMg', 'MG'],
  1087: ['calciumMg', 'MG'], 1089: ['ironMg', 'MG'], 1162: ['vitCMg', 'MG'],
  1008: ['kcal', 'KCAL'], 2047: ['kcalA1', 'KCAL'], 2048: ['kcalA2', 'KCAL'],
};
const KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'vitCMg'];

// ---------- CSV (streaming, quoted fields, embedded newlines, "" escapes) ----------
async function readCsv(file, onRow) {
  const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let header = null, row = [], field = '', inQ = false, pendingQuote = false, n = 0;
  const endRow = () => {
    row.push(field); field = '';
    if (!(row.length === 1 && row[0] === '')) {
      if (!header) header = row.map((h) => h.replace(/^\uFEFF/, ''));
      else { const o = {}; for (let i = 0; i < header.length; i++) o[header[i]] = row[i] ?? ''; onRow(o); n++; }
    }
    row = [];
  };
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (pendingQuote) { // previous char was a quote inside a quoted field
        pendingQuote = false;
        if (c === '"') { field += '"'; continue; }
        inQ = false; // it was the closing quote; fall through to handle c
      }
      if (inQ) { if (c === '"') pendingQuote = true; else field += c; continue; }
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') endRow();
      else if (c !== '\r') field += c;
    }
  }
  if (pendingQuote) inQ = false;
  if (field !== '' || row.length) endRow();
  return n;
}

// ---------- download + extract ----------
function findDir(dir) { // folder containing food.csv
  if (!fs.existsSync(dir)) return null;
  if (fs.existsSync(path.join(dir, 'food.csv'))) return dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const r = findDir(path.join(dir, e.name)); if (r) return r; }
  }
  return null;
}

let pageCache = null;
async function latestZip(ds) {
  try {
    pageCache ??= await (await fetch(`${BASE}/download-datasets`)).text();
    const found = [...pageCache.matchAll(ds.pattern)].map((m) => ({ name: m[0], date: m[1] }));
    if (found.length) return found.sort((a, b) => a.date.localeCompare(b.date)).pop().name;
  } catch (e) { console.warn('could not read download page, using pinned file:', e.message); }
  return ds.fallback;
}

function extract(zip, dest) {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  if (process.platform === 'win32') {
    const bsdtar = path.join(sysRoot, 'System32', 'tar.exe');
    try { execFileSync(bsdtar, ['-xf', zip, '-C', dest], { stdio: 'inherit' }); return; } catch { /* fall through */ }
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`], { stdio: 'inherit' });
  } else {
    try { execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'inherit' }); }
    catch { execFileSync('tar', ['-xf', zip, '-C', dest], { stdio: 'inherit' }); }
  }
}

async function ensureRaw(key, refresh) {
  const ds = DATASETS[key];
  const dir = path.join(RAW, key);
  fs.mkdirSync(dir, { recursive: true });
  let found = refresh ? null : findDir(dir);
  if (!found) {
    if (fs.readdirSync(dir).length) { // never mix with leftovers
      if (!refresh) throw new Error(`${dir} is non-empty but has no food.csv; delete it or pass --refresh`);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    }
    const name = await latestZip(ds);
    const url = `${BASE}/fdc-datasets/${name}`;
    console.log(`[${key}] downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${res.status} ${url}`);
    const zip = path.join(dir, name);
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    console.log(`[${key}] ${fs.statSync(zip).size} bytes; extracting`);
    extract(zip, dir);
    found = findDir(dir);
    if (!found) throw new Error(`no food.csv after extracting ${zip}`);
  }
  const zips = fs.readdirSync(dir).filter((f) => f.endsWith('.zip'));
  return { dir: found, release: zips[0] ?? path.basename(found) };
}

// ---------- naming ----------
const STATE_WORDS = new Set(['raw', 'cooked', 'boiled', 'roasted', 'fried', 'baked', 'grilled', 'steamed', 'broiled', 'canned', 'dried', 'stewed', 'braised', 'toasted', 'microwaved']);
function cleanName(s) {
  let n = s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/[\s,;.]+$/, '').trim();
  const letters = n.replace(/[^A-Za-z]/g, '');
  if (letters.length > 3 && (letters.match(/[A-Z]/g) ?? []).length / letters.length > 0.8) n = n.toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
const lc = (s) => s.toLowerCase();
function deriveAliases(display, original) {
  const out = [];
  const add = (a) => { a = a.replace(/\s+/g, ' ').trim(); if (a && lc(a) !== lc(display) && !out.some((x) => lc(x) === lc(a))) out.push(a); };
  add(original);
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
  if (/\(|\bNFS\b|\bNS as to\b/.test(display) && parts.length > 1) {
    const stripped = parts.filter((p) => !/^(NFS|NS as to .*)$/i.test(p));
    if (stripped.length && stripped.length < parts.length) add(lc(stripped.join(', ')));
  }
  // "Chapati or roti, plain" -> "chapati, plain", "roti, plain"
  const head = parts[0] ?? '';
  const orSplit = head.split(/ or /i);
  if (orSplit.length === 2 && orSplit.every((w) => w.trim().split(' ').length <= 3)) {
    for (const w of orSplit) add(lc([w.trim(), ...parts.slice(1)].join(', ')));
  }
  // "Rice, white, long-grain, cooked" -> "white rice, cooked", "cooked rice"
  if (parts.length >= 2) {
    const last = lc(parts[parts.length - 1]);
    const stateWord = STATE_WORDS.has(last) ? last : (parts.length > 2 && STATE_WORDS.has(lc(parts[parts.length - 2])) ? lc(parts[parts.length - 2]) : null);
    const mod = lc(parts[1]);
    const simpleHead = head.split(' ').length <= 2 && !/ or /i.test(head);
    if (simpleHead && !STATE_WORDS.has(mod) && mod.split(' ').length <= 2 && !/ or |\d|\(/.test(mod) && parts.length >= 3) {
      add(`${mod} ${lc(head)}${stateWord ? ', ' + stateWord : ''}`);
    }
    if (simpleHead && (stateWord === 'cooked' || stateWord === 'raw') && parts.length >= 2) add(`${stateWord} ${lc(head)}`);
  }
  return out.slice(0, 4); // original + up to 3 derived
}

function stateFromName(name) {
  const n = lc(name);
  if (/\b(raw|uncooked|fresh)\b/.test(n) && !/\b(cooked|boiled|roasted|fried|baked)\b/.test(n)) return 'raw';
  if (/\b(cooked|boiled|roasted|fried|baked|grilled|steamed|broiled|stewed|braised|toasted|microwaved|pan-fried|deep-fried|sauteed|sautéed)\b/.test(n)) return 'cooked';
  return 'unknown';
}

// ---------- portions ----------
function fmtAmount(a) {
  const v = parseFloat(a);
  if (!isFinite(v) || v <= 0) return '';
  return String(Math.round(v * 100) / 100);
}
function portionPriority(label) {
  const l = lc(label);
  if (/\bcubic\b|yields|guideline|quantity not|\bnlea\b|undetermined/.test(l)) return 99;
  if (/\bslice|piece|medium|large|small|serving|bowl|sandwich|patty|cookie|roll|egg|fruit|each|item|unit|fillet|breast|bar|stick|link|container|packet|bag/.test(l)) return 0;
  if (/\bcup\b/.test(l)) return 1;
  if (/\btbsp|tablespoon|\btsp|teaspoon/.test(l)) return 2;
  if (/\bfl oz|\boz\b|ounce|\bg\b|gram|\bml\b|liter|pint|quart/.test(l)) return 3;
  return 1;
}
function buildPortions(list) {
  const seen = new Set();
  const cand = [];
  for (const p of list) {
    if (!(p.grams > 0) || p.grams > 5000) continue;
    let label = p.label.replace(/\s+/g, ' ').replace(/[\s,;]+$/, '').trim();
    if (!label || label.length > 60) continue;
    const pr = portionPriority(label);
    if (pr >= 99) continue;
    const k = lc(label);
    if (seen.has(k)) continue;
    seen.add(k);
    cand.push({ label, grams: Math.round(p.grams * 10) / 10, pr, seq: p.seq });
  }
  cand.sort((a, b) => a.pr - b.pr || a.seq - b.seq);
  return cand.slice(0, 8).map(({ label, grams }) => ({ label, grams }));
}

// ---------- build ----------
const DROP_NAME = /\binfant formula\b|\bbabyfood\b|\bbaby food\b|\bdietary supplement|\bsupplement\b/i;
const DISH_WWEIA = (c) => (c >= 3002 && c <= 3744 && c !== 3504 ? true : c === 3804 || c === 3806 || c === 3808 || c === 3504);

async function build(key, refresh) {
  const ds = DATASETS[key];
  const { dir, release } = await ensureRaw(key, refresh);
  const f = (n) => path.join(dir, n);

  // nutrient units sanity
  const units = {}, nbrToId = {};
  await readCsv(f('nutrient.csv'), (r) => { units[r.id] = (r.unit_name || '').toUpperCase(); nbrToId[r.nutrient_nbr] = r.id; });
  for (const [id, [k, u]] of Object.entries(NUTRIENTS)) {
    if (units[id] && units[id] !== u) throw new Error(`nutrient ${id} (${k}) unit is ${units[id]}, expected ${u}`);
  }

  const wanted = key === 'sr' ? 'sr_legacy_food' : key === 'foundation' ? 'foundation_food' : 'survey_fndds_food';
  const foods = new Map();
  await readCsv(f('food.csv'), (r) => {
    if (r.data_type === wanted) foods.set(r.fdc_id, { id: r.fdc_id, desc: r.description, cat: r.food_category_id, pub: r.publication_date });
  });

  const catName = new Map();
  if (key === 'fndds') {
    await readCsv(f('wweia_food_category.csv'), (r) => catName.set(r.wweia_food_category, r.wweia_food_category_description));
    await readCsv(f('survey_fndds_food.csv'), (r) => {
      const fo = foods.get(r.fdc_id); if (fo) { fo.cat = r.wweia_category_number; fo.foodCode = r.food_code; }
    });
  } else {
    await readCsv(f('food_category.csv'), (r) => catName.set(r.id, r.description));
    if (key === 'sr') await readCsv(f('sr_legacy_food.csv'), (r) => { const fo = foods.get(r.fdc_id); if (fo) fo.ndb = r.NDB_number; });
    if (key === 'foundation') await readCsv(f('foundation_food.csv'), (r) => { const fo = foods.get(r.fdc_id); if (fo) fo.ndb = r.NDB_number; });
  }

  const nut = new Map(); // fdc_id -> {key: value}
  await readCsv(f('food_nutrient.csv'), (r) => {
    // FNDDS food_nutrient.csv stores nutrient_nbr (e.g. 208, 301) in its nutrient_id column; SR/Foundation store the real id.
    const spec = NUTRIENTS[key === 'fndds' ? nbrToId[r.nutrient_id] : r.nutrient_id];
    if (!spec || !foods.has(r.fdc_id)) return;
    const v = parseFloat(r.amount);
    if (!isFinite(v)) return;
    let o = nut.get(r.fdc_id); if (!o) nut.set(r.fdc_id, (o = {}));
    if (o[spec[0]] === undefined) o[spec[0]] = v;
  });

  const units2 = new Map();
  await readCsv(f('measure_unit.csv'), (r) => units2.set(r.id, r.name));
  const portions = new Map();
  await readCsv(f('food_portion.csv'), (r) => {
    if (!foods.has(r.fdc_id)) return;
    const grams = parseFloat(r.gram_weight);
    const amt = fmtAmount(r.amount);
    const unit = units2.get(r.measure_unit_id);
    const desc = (r.portion_description || '').trim();
    const mod = (r.modifier || '').trim();
    let label;
    if (key === 'fndds') label = desc; // "1 cup", "1 medium", "1 slice"; modifier is an opaque numeric code
    else {
      const unitPart = unit && unit !== 'undetermined' ? unit : '';
      const base = [amt, unitPart].filter(Boolean).join(' ');
      const extra = desc || mod;
      label = unitPart ? (extra ? `${base}, ${extra}` : base) : [amt || '1', extra].filter(Boolean).join(' ');
    }
    let arr = portions.get(r.fdc_id); if (!arr) portions.set(r.fdc_id, (arr = []));
    arr.push({ label, grams, seq: parseInt(r.seq_num, 10) || 999 });
  });

  const rows = [];
  const dropped = { baby_formula_supp: 0, no_nutrition: 0, no_nutrients_at_all: 0 };
  const estimated = [];
  for (const fo of foods.values()) {
    const catDesc = catName.get(fo.cat) ?? '';
    if (DROP_NAME.test(fo.desc)) { dropped.baby_formula_supp++; continue; }
    if (key === 'sr' && /^(Baby Foods|Quality Control Materials)$/i.test(catDesc)) { dropped.baby_formula_supp++; continue; }
    if (key === 'fndds' && /^(Baby|Formula|Human milk)/i.test(catDesc)) { dropped.baby_formula_supp++; continue; }
    const n = nut.get(fo.id);
    if (!n) { dropped.no_nutrients_at_all++; continue; }
    const per = {
      proteinG: n.proteinG ?? 0, carbsG: n.carbsG ?? 0, fatG: n.fatG ?? 0, fiberG: n.fiberG ?? 0,
      sugarG: n.sugarG ?? n.sugarAltG ?? 0, sodiumMg: n.sodiumMg ?? 0, potassiumMg: n.potassiumMg ?? 0,
      calciumMg: n.calciumMg ?? 0, ironMg: n.ironMg ?? 0, vitCMg: n.vitCMg ?? 0,
    };
    let kcal = n.kcal ?? n.kcalA1 ?? n.kcalA2;
    let kcalEstimated = false;
    if (kcal === undefined) {
      kcal = 4 * per.proteinG + 4 * per.carbsG + 9 * per.fatG; kcalEstimated = true;
    }
    if (kcal <= 0 && per.proteinG <= 0 && per.carbsG <= 0 && per.fatG <= 0) { dropped.no_nutrition++; continue; }
    const out = { kcal: Math.round(kcal), ...per };
    for (const k of KEYS) { out[k] = Math.max(0, Math.round(out[k] * 100) / 100); }
    const display = cleanName(fo.desc);
    let state;
    if (key === 'fndds') state = DISH_WWEIA(parseInt(fo.cat, 10)) ? 'dish' : stateFromName(display);
    else state = stateFromName(display);
    const row = {
      id: `${ds.source}:${fo.id}`, source: ds.source, code: fo.id, name: display,
      aliases: deriveAliases(display, fo.desc.replace(/\s+/g, ' ').trim()),
      region: 'US', category: catDesc || null, state,
      per100: Object.fromEntries(KEYS.map((k) => [k, out[k]])),
      portions: buildPortions(portions.get(fo.id) ?? []),
      meta: { dataType: wanted, release, published: fo.pub || undefined, ndb: fo.ndb || undefined, foodCode: fo.foodCode || undefined, kcalEstimated: kcalEstimated || undefined },
    };
    rows.push(row);
    if (kcalEstimated) estimated.push(row.id);
  }
  rows.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, ds.out), JSON.stringify(rows, null, 0));
  return { key, rows, dropped, estimated, release, foodsRead: foods.size };
}

// ---------- validation ----------
function validate(rows) {
  const bad = [], outliers = [];
  for (const r of rows) {
    const keys = Object.keys(r.per100);
    if (keys.length !== KEYS.length || !KEYS.every((k) => Number.isFinite(r.per100[k]) && r.per100[k] >= 0)) bad.push(r.id);
    const p = r.per100;
    const at = 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
    if (p.kcal > 30 && Math.abs(p.kcal - at) / p.kcal > 0.25) outliers.push({ id: r.id, name: r.name, kcal: p.kcal, atwater: Math.round(at), fiber: p.fiberG });
  }
  return { bad, outliers };
}

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const onlyIdx = args.indexOf('--only');
const keys = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : Object.keys(DATASETS);
const all = [];
for (const k of keys) {
  if (!DATASETS[k]) throw new Error(`unknown dataset ${k}`);
  const res = await build(k, refresh);
  const v = validate(res.rows);
  console.log(`\n== ${k} (${res.release}): ${res.rows.length} rows from ${res.foodsRead} foods; dropped ${JSON.stringify(res.dropped)}; kcal estimated for ${res.estimated.length}`);
  console.log(`   invalid rows: ${v.bad.length}; Atwater outliers (>25%): ${v.outliers.length}`);
  for (const o of v.outliers.slice(0, 12)) console.log('   outlier', JSON.stringify(o));
  const withPortions = res.rows.filter((r) => r.portions.length).length;
  console.log(`   rows with portions: ${withPortions}; states: ${JSON.stringify(res.rows.reduce((a, r) => (a[r.state] = (a[r.state] ?? 0) + 1, a), {}))}`);
  all.push(...res.rows);
}
console.log(`\ntotal rows: ${all.length}`);
const find = (re, src) => all.find((r) => (!src || r.source === src) && re.test(r.name));
for (const [label, re, src] of [['white rice cooked', /^Rice, white, long-grain, regular, (enriched, )?cooked/i, 'usda_sr'], ['chicken breast cooked', /^Chicken, broilers or fryers, breast, meat only, cooked, roasted/i, 'usda_sr'], ['banana', /^Bananas, raw/i, 'usda_sr'], ['egg whole raw', /^Egg, whole, raw, fresh/i, 'usda_sr'], ['chapati', /^Chapati or roti, plain/i, 'usda_fndds'], ['dosa', /^Dosa/i, 'usda_fndds'], ['samosa', /^Samosa/i, 'usda_fndds']]) {
  const r = find(re, src);
  console.log(`spot ${label}:`, r ? JSON.stringify({ id: r.id, name: r.name, aliases: r.aliases, state: r.state, category: r.category, per100: r.per100, portions: r.portions.slice(0, 4) }) : 'NOT FOUND');
}
