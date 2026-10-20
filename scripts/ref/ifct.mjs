// Builds data/reference/ifct.json from the Indian Food Composition Tables 2017 (NIN/ICMR) as published
// by the open `ifct2017` project on npm (@ifct2017/*, MIT). Node 22, ESM, no dependencies.
//
//   node scripts/ref/ifct.mjs            build from data/reference/raw/ifct (downloads it first if missing)
//   node scripts/ref/ifct.mjs --fetch    force re-download of the npm tarballs
//
// Downloaded files are untrusted data: we only read the CSVs, never execute anything from them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'data', 'reference', 'raw', 'ifct');
const OUT = path.join(ROOT, 'data', 'reference', 'ifct.json');
const PKGS = { compositions: '2.0.9', descriptions: '2.0.7', codes: '2.0.8', hierarchy: '2.0.9' };
const pkgDir = (n) => path.join(RAW, `ifct2017-${n}-${PKGS[n]}`, 'package');

function fetchAll() {
  fs.mkdirSync(RAW, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const [n, v] of Object.entries(PKGS)) {
    const tgz = path.join(RAW, `ifct2017-${n}-${v}.tgz`);
    if (!fs.existsSync(tgz)) {
      // npm pack only downloads; it does not run package scripts.
      execFileSync(npm, ['pack', `@ifct2017/${n}@${v}`, '--silent'], { cwd: RAW, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    const dir = path.join(RAW, `ifct2017-${n}-${v}`);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', dir], { stdio: 'inherit' });
  }
}

function parseCsv(s) {
  const rows = [];
  let r = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; }
    else f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows.filter((x) => x.length > 1 || x[0]);
}

if (process.argv.includes('--fetch') || !fs.existsSync(path.join(pkgDir('compositions'), 'index.csv'))) fetchAll();

// ---- compositions ----
const comp = parseCsv(fs.readFileSync(path.join(pkgDir('compositions'), 'index.csv'), 'utf8'));
const head = comp[0].map((h) => h.split('; ')[1]);
const col = (k) => head.indexOf(k);
const need = ['code', 'name', 'scie', 'lang', 'grup', 'enerc', 'protcnt', 'choavldf', 'fatce', 'fibtg', 'fsugar', 'na', 'k', 'ca', 'fe', 'vitc'];
for (const k of need) if (col(k) < 0) throw new Error('missing column ' + k);

// Units in this CSV (verified against the book's well-known values, see validation below):
//   enerc = kJ/100 g; macros (protcnt, choavldf, fatce, fibtg, fsugar) = g/100 g;
//   minerals (na, k, ca, fe) and vitc = g/100 g  -> x1000 to mg.
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

const CATEGORY = {
  'Cereals and Millets': 'cereal', 'Grain Legumes': 'legume', 'Green Leafy Vegetables': 'vegetable',
  'Other Vegetables': 'vegetable', 'Fruits': 'fruit', 'Roots and Tubers': 'vegetable',
  'Condiments and Spices': 'spice', 'Nuts and Oil Seeds': 'nut_seed', 'Sugars': 'sweet', 'Mushrooms': 'vegetable',
  'Miscellaneous Foods': 'beverage', 'Milk and Milk Products': 'dairy', 'Egg and Egg Products': 'egg',
  'Poultry': 'meat', 'Animal Meat': 'meat', 'Marine Fish': 'fish', 'Marine Shellfish': 'seafood',
  'Marine Mollusks': 'seafood', 'Fresh Water Fish and Shellfish': 'fish', 'Edible Oils and Fats': 'fat_oil',
};

// Spelling fixes in the source names (original name is kept as first alias).
const FIX = [
  [/\bomlet\b/gi, 'omelet'], [/\bquial\b/gi, 'quail'], [/\bGoosberry\b/gi, 'Gooseberry'], [/\bkernal\b/gi, 'kernel'],
  [/\bGround nut\b/gi, 'Groundnut (peanut)'], [/\bSoyabean\b/gi, 'Soybean'], [/\bSoya bean\b/gi, 'Soybean'],
  [/\bLadies finger\b/gi, 'Ladies finger (okra)'], [/\bBrinjal\b/g, 'Brinjal (eggplant)'], [/\bBlack berry\b/gi, 'Blackberry'],
  [/\bBean scarlet\b/gi, 'Scarlet bean'], [/\bBengal gram\b/gi, 'Bengal gram (chana)'], [/\bGreen gram\b/gi, 'Green gram (moong)'],
  [/\bBlack gram\b/gi, 'Black gram (urad)'], [/\bRed gram\b/gi, 'Red gram (toor/arhar)'],
  [/\bTapioca\b/g, 'Tapioca (cassava)'], [/\bCoconut Water\b/g, 'Coconut water'], [/\bChilli?es\b/gi, 'Chillies'],
];
function cleanName(raw) {
  let n = raw.trim().replace(/\s+/g, ' ');
  for (const [re, to] of FIX) n = n.replace(re, to);
  // "Brinjal (eggplant)-1" -> "Brinjal (eggplant), variety 1"
  n = n.replace(/\s*-\s*(\d+)$/, ', variety $1').replace(/\s+-\s+/g, ' - ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function stateOf(name, group) {
  const s = name.toLowerCase();
  if (/\b(boiled|omelet|omlet|roasted|fried|cooked|baked)\b/.test(s)) return 'cooked';
  return 'raw';
}

// ---- aliases ----
const LANG_PREFIX = /^(?:[A-Z][a-z]{0,3}\.\s*,?\s*)+/;
function langAliases(lang) {
  const out = [];
  // separators are mostly ";" but some rows use ", " before the next "Xx." language tag
  for (const seg of lang.split(/;|,\s*(?=[A-Z][a-z]{0,3}\.\s)/)) {
    const t = seg.trim().replace(LANG_PREFIX, '').replace(/\.$/, '').trim();
    if (t.length < 2) continue;
    for (const part of t.split(/\s*\/\s*/)) if (part.trim().length >= 2) out.push(part.trim());
  }
  return out;
}

// codes package: alias name "Aam (paka) (H.)" -> code(s) "E036-E042" or "G020, G021"
const codeAlias = new Map(); // code -> [alias]
function expandCodes(spec) {
  const out = [];
  for (const part of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Z])(\d{3})-([A-Z])(\d{3})$/);
    if (m && m[1] === m[3]) { for (let i = +m[2]; i <= +m[4]; i++) out.push(m[1] + String(i).padStart(3, '0')); }
    else if (/^[A-Z]\d{3}$/.test(part)) out.push(part);
  }
  return out;
}
for (const [name, codes] of parseCsv(fs.readFileSync(path.join(pkgDir('codes'), 'index.csv'), 'utf8')).slice(1)) {
  if (!name || !codes) continue;
  let a = name.replace(/\s*\((?:[A-Z][a-z]{0,3}\.(?:\s*,\s*)?)+\)\s*$/, '') // trailing "(H.)" "(P.,U.)"
    .replace(/\s*\((?:(?:[A-Z][a-z]{0,3}|Common|Sci)\.?\s*,?\s*)+\)\s*$/, '')
    .replace(/\s+/g, ' ').trim();
  if (a.length < 2) continue;
  for (const c of expandCodes(codes)) {
    if (!codeAlias.has(c)) codeAlias.set(c, []);
    codeAlias.get(c).push(a);
  }
}

const MAX_ALIASES = 40;
const rows = [];
const corrected = [];
for (const r of comp.slice(1)) {
  const g = (k) => r[col(k)];
  const code = g('code');
  const orig = g('name').trim();
  const name = cleanName(orig);
  const group = g('grup');
  const kj = num(g('enerc'));
  // available carbohydrate (choavldf); a few rows leave it 0 although total carbohydrate (cho) is reported -> fall back
  const carbs = num(g('choavldf')) || num(g('cho'));
  const per100 = {
    kcal: Math.round(kj / 4.184),
    proteinG: r1(num(g('protcnt'))),
    carbsG: r1(carbs),
    fatG: r1(num(g('fatce'))),
    fiberG: r1(num(g('fibtg'))),
    sugarG: r1(num(g('fsugar'))),
    sodiumMg: r1(num(g('na')) * 1000),
    potassiumMg: r1(num(g('k')) * 1000),
    calciumMg: r1(num(g('ca')) * 1000),
    ironMg: r2(num(g('fe')) * 1000),
    vitCMg: r2(num(g('vitc')) * 1000),
  };
  // Source gaps/errors in energy: oils/ghee have no kJ (derive Atwater); a few kJ values contradict the macros.
  const meta = {};
  const atw = Math.round(4 * per100.proteinG + 4 * per100.carbsG + 9 * per100.fatG);
  if (kj === 0 && atw > 0) { per100.kcal = atw; meta.kcalNote = 'source energy missing; derived 4P+4C+9F'; }
  else if (per100.kcal > 30 && (atw / per100.kcal < 0.6 || atw / per100.kcal > 1.4)) {
    meta.kcalNote = `source energy ${per100.kcal} kcal inconsistent with macros; replaced by 4P+4C+9F`;
    corrected.push(`${code} ${name}: ${per100.kcal} -> ${atw}`);
    per100.kcal = atw;
  }
  const seen = new Set([name.toLowerCase()]);
  const aliases = [];
  const add = (a) => {
    const t = a.trim();
    const k = t.toLowerCase();
    if (t.length < 2 || seen.has(k) || aliases.length >= MAX_ALIASES) return;
    seen.add(k); aliases.push(t);
  };
  if (orig !== name) aliases.push(orig), seen.add(orig.toLowerCase());
  if (g('scie')) add(g('scie'));
  for (const a of langAliases(g('lang'))) add(a);
  for (const a of codeAlias.get(code) ?? []) add(a);
  rows.push({
    id: `ifct:${code}`, source: 'ifct', code, name, aliases, region: 'IN',
    category: CATEGORY[group] ?? 'other', state: stateOf(orig, group), per100, portions: [],
    meta: { group, scientific: g('scie') || undefined, kj, ...meta },
  });
}

// ---- validate ----
const KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'vitCMg'];
let bad = 0;
const outliers = [];
const ids = new Set();
for (const row of rows) {
  if (ids.has(row.id)) { console.error('duplicate id', row.id); bad++; }
  ids.add(row.id);
  for (const k of KEYS) if (!Number.isFinite(row.per100[k]) || row.per100[k] < 0) { console.error('bad value', row.id, k); bad++; }
  const p = row.per100;
  if (p.kcal > 30) {
    const est = 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
    const ratio = est / p.kcal;
    if (ratio < 0.75 || ratio > 1.25) outliers.push(`${row.id} ${row.name}: kcal ${p.kcal} vs 4P+4C+9F ${Math.round(est)} (x${ratio.toFixed(2)})`);
  }
}
const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
console.log(`rows: ${rows.length}, invalid: ${bad}, with >0 aliases: ${rows.filter((r) => r.aliases.length).length}`);
console.log('kcal corrected for source inconsistencies:', corrected.length);
for (const c of corrected) console.log('  ' + c);
console.log(`kcal vs 4P+4C+9F outside +-25%: ${outliers.length}`);
for (const o of outliers) console.log('  ' + o);
console.log('spot checks:');
for (const c of ['A019', 'B021', 'A010', 'E010', 'L002', 'T013', 'F006', 'M004', 'G014', 'D076']) {
  const r = byCode[c];
  if (r) console.log(`  ${c} ${r.name} [${r.state}]`, JSON.stringify(r.per100));
}
if (bad) { console.error('validation failed'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
