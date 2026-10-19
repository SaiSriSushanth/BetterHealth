import type { Nutrients } from "./types";

/** Barcode validation and Open Food Facts lookup. Pure helpers plus one browser fetch; nothing is stored. */

export const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

/** GTIN mod-10 check: weights 3,1,3,1... from the digit left of the check digit. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function gtinValid(code: string): boolean {
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Expand an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A. Returns null if it is not UPC-E shaped. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  const last = d[5];
  let mfr: string;
  let prod: string;
  if (last === "0" || last === "1" || last === "2") { mfr = d[0] + d[1] + last + "00"; prod = "00" + d[2] + d[3] + d[4]; }
  else if (last === "3") { mfr = d[0] + d[1] + d[2] + "00"; prod = "000" + d[3] + d[4]; }
  else if (last === "4") { mfr = d[0] + d[1] + d[2] + d[3] + "0"; prod = "0000" + d[4]; }
  else { mfr = d.slice(0, 5); prod = "0000" + last; }
  return ns + mfr + prod + check;
}

export type BarcodeCheck =
  | { ok: true; code: string }
  | { ok: false; reason: string };

/** Accepts what a person types or a scanner reads: spaces and dashes are ignored. */
export function validateBarcode(raw: string): BarcodeCheck {
  const code = raw.replace(/[\s-]/g, "");
  if (!code) return { ok: false, reason: "Type the numbers under the barcode." };
  if (!/^\d+$/.test(code)) return { ok: false, reason: "A barcode is numbers only." };
  if (![8, 12, 13, 14].includes(code.length)) {
    return { ok: false, reason: "That is not a full barcode. It should be 8, 12, 13 or 14 digits." };
  }
  if (gtinValid(code)) return { ok: true, code };
  if (code.length === 8) {
    const upcA = expandUpcE(code);
    if (upcA && gtinValid(upcA)) return { ok: true, code: upcA };
  }
  return { ok: false, reason: "The last digit does not match. Check the numbers and try again." };
}

/* ---------- Open Food Facts ---------- */

export const OFF_FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity,quantity";
export const offUrl = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;

export interface OffProduct {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  serving_size?: string;
  serving_quantity?: number | string;
  quantity?: string;
}

export interface ScannedProduct {
  code: string;
  name: string;
  /** nutrients per 100 g (or 100 ml) */
  per100: Nutrients;
  serving: { label: string; grams: number };
  /** "ml" for drinks; amounts in ml are treated as grams */
  unit: "g" | "ml";
  /** what the pack says, e.g. "400 g" */
  packSize?: string;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const cap = (n: number, max: number) => Math.min(max, n);

/** OFF stores *_100g in grams for every nutrient except energy. Returns null when the main numbers are missing. */
export function offToPer100(nutriments: Record<string, unknown> | undefined): Nutrients | null {
  if (!nutriments) return null;
  const g = (k: string) => num(nutriments[`${k}_100g`]);
  let kcal = g("energy-kcal");
  if (kcal === null) {
    const kj = g("energy-kj") ?? g("energy");
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = g("proteins"), carbs = g("carbohydrates"), fat = g("fat");
  if (kcal === null && protein === null && carbs === null && fat === null) return null;
  const sodiumG = g("sodium") ?? (g("salt") !== null ? (g("salt") as number) / 2.5 : null);
  const mg = (v: number | null) => (v === null ? 0 : r1(cap(v * 1000, 50000)));
  return {
    kcal: Math.round(cap(kcal ?? (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9, 1000)),
    proteinG: r1(cap(protein ?? 0, 100)),
    carbsG: r1(cap(carbs ?? 0, 100)),
    fatG: r1(cap(fat ?? 0, 100)),
    fiberG: r1(cap(g("fiber") ?? 0, 100)),
    sugarG: r1(cap(g("sugars") ?? 0, 100)),
    sodiumMg: mg(sodiumG),
    potassiumMg: mg(g("potassium")),
    calciumMg: mg(g("calcium")),
    ironMg: mg(g("iron")),
    vitCMg: mg(g("vitamin-c")),
  };
}

export function productName(p: OffProduct): string {
  const name = (p.product_name ?? "").trim();
  const brands = (p.brands ?? "").split(",").map((b) => b.trim()).filter(Boolean);
  const brand = brands[0] ?? "";
  if (!name) return (brand || "Unnamed product").slice(0, 120);
  const lower = name.toLowerCase();
  // "Coca-Cola Original" by "COCA-COLA SERVICES SA/NV": the brand is already in the name.
  const named = brands.some((b) => {
    const key = b.toLowerCase().split(/\s+/)[0] ?? "";
    return lower.includes(b.toLowerCase()) || (key.length >= 3 && lower.includes(key));
  });
  return (named || !brand ? name : `${brand} ${name}`).slice(0, 120);
}

/** "ml" when the product is sold or served by volume. */
export function unitOf(p: OffProduct): "g" | "ml" {
  return /\d\s*(ml|cl|dl|l|fl\.? ?oz)\b/i.test(`${p.serving_size ?? ""} ${p.quantity ?? ""}`) ? "ml" : "g";
}

export function servingOf(p: OffProduct): { label: string; grams: number } {
  const unit = unitOf(p);
  const q = num(p.serving_quantity);
  if (q !== null && q >= 1 && q <= 2000) {
    const size = (p.serving_size ?? "").trim();
    // "15 g" -> "1 serving (15 g)"; "1 portion (330 ml)" stays as written.
    const label = !size ? `1 serving (${Math.round(q)} ${unit})`
      : /^\d[\d.,]*\s*[a-z. ]{0,6}$/i.test(size) ? `1 serving (${size})` : size;
    return { label: label.slice(0, 80), grams: Math.round(q) };
  }
  return { label: `100 ${unit}`, grams: 100 };
}

/** "400 g e" -> "400 g" (the e / ℮ mark means "estimated quantity"). */
function cleanQuantity(q: string | undefined): string | undefined {
  return q?.replace(/\s+(℮|e)$/i, "").trim().slice(0, 40) || undefined;
}

export type LookupResult =
  | { kind: "found"; product: ScannedProduct }
  | { kind: "no_nutrition"; code: string; name: string }
  | { kind: "not_found"; code: string }
  | { kind: "error"; message: string };

/** Turns an OFF v2 response body (and HTTP status) into a lookup result. */
export function parseOffResponse(code: string, status: number, body: unknown): LookupResult {
  const b = (body ?? {}) as { status?: number; product?: OffProduct };
  if (status === 404 || b.status === 0 || !b.product) return { kind: "not_found", code };
  if (status < 200 || status >= 300) return { kind: "error", message: "Open Food Facts did not answer properly. Try again in a moment." };
  const per100 = offToPer100(b.product.nutriments);
  const name = productName(b.product);
  if (!per100) return { kind: "no_nutrition", code, name };
  return {
    kind: "found",
    product: { code, name, per100, serving: servingOf(b.product), unit: unitOf(b.product), packSize: cleanQuantity(b.product.quantity) },
  };
}

/** Browser-side lookup. Sends only the barcode; gives up after 6 s. */
export async function lookupBarcode(code: string, opts: { fetchFn?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<LookupResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
  const onOuterAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);
  try {
    const res = await (opts.fetchFn ?? fetch)(offUrl(code), {
      signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" },
    });
    const body = await res.json().catch(() => null);
    return parseOffResponse(code, res.status, body);
  } catch (e) {
    if (opts.signal?.aborted) return { kind: "error", message: "Cancelled." };
    if ((e as Error)?.name === "AbortError") return { kind: "error", message: "Open Food Facts took too long to answer. Check your connection and try again." };
    return { kind: "error", message: "Could not reach Open Food Facts. Check your connection and try again." };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
