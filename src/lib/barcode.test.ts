import { describe, expect, it, vi } from "vitest";
import {
  expandUpcE, gtinCheckDigit, lookupBarcode, offToPer100, offUrl, parseOffResponse, productName, servingOf, unitOf, validateBarcode,
} from "./barcode";
import fixture from "./__fixtures__/off-nutella.json";

describe("barcode validation", () => {
  it("computes GTIN check digits", () => {
    expect(gtinCheckDigit("301762042200")).toBe(3); // Nutella EAN-13
    expect(gtinCheckDigit("544900000099")).toBe(6); // Coca-Cola EAN-13
    expect(gtinCheckDigit("9638507")).toBe(4); // EAN-8 96385074
    expect(gtinCheckDigit("03600029145")).toBe(2); // UPC-A 036000291452
  });
  it("accepts valid EAN-13, EAN-8, UPC-A and GTIN-14", () => {
    expect(validateBarcode("3017620422003")).toEqual({ ok: true, code: "3017620422003" });
    expect(validateBarcode("5449 0000 0099-6")).toEqual({ ok: true, code: "5449000000996" });
    expect(validateBarcode("96385074")).toEqual({ ok: true, code: "96385074" });
    expect(validateBarcode("036000291452")).toEqual({ ok: true, code: "036000291452" });
    expect(validateBarcode("10036000291459").ok).toBe(true);
  });
  it("expands UPC-E to UPC-A", () => {
    expect(expandUpcE("04252614")).toBe("042100005264");
    expect(validateBarcode("04252614")).toEqual({ ok: true, code: "042100005264" });
    expect(expandUpcE("12345670")).toBe("123456000070");
    expect(expandUpcE("21234567")).toBeNull();
  });
  it("rejects bad input with a plain reason", () => {
    expect(validateBarcode("")).toMatchObject({ ok: false });
    expect(validateBarcode("30176204220a3")).toMatchObject({ ok: false, reason: expect.stringMatching(/numbers only/) });
    expect(validateBarcode("123456789")).toMatchObject({ ok: false, reason: expect.stringMatching(/8, 12, 13 or 14/) });
    expect(validateBarcode("3017620422004")).toMatchObject({ ok: false, reason: expect.stringMatching(/last digit/) });
  });
});

describe("Open Food Facts conversion", () => {
  it("converts the per-100 g nutriments of a real response", () => {
    const n = offToPer100(fixture.product.nutriments)!;
    expect(n).toEqual({
      kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, fiberG: 0, sugarG: 56.3,
      sodiumMg: 42.8, potassiumMg: 506, calciumMg: 107, ironMg: 3.9, vitCMg: 0.4,
    });
  });
  it("falls back to salt / 2.5 and kJ, and defaults missing values to 0", () => {
    const n = offToPer100({ "energy-kj_100g": 418.4, proteins_100g: "3,5", salt_100g: 1 })!;
    expect(n.kcal).toBe(100);
    expect(n.proteinG).toBe(3.5);
    expect(n.sodiumMg).toBe(400);
    expect(n.fatG).toBe(0);
    expect(n.ironMg).toBe(0);
  });
  it("returns null without the main numbers", () => {
    expect(offToPer100(undefined)).toBeNull();
    expect(offToPer100({ "nova-group_100g": 4, salt_100g: 1 })).toBeNull();
  });
  it("builds names and servings", () => {
    expect(productName(fixture.product)).toBe("Nutella");
    expect(productName({ product_name: "Diet Coke", brands: "Coca-Cola" })).toBe("Coca-Cola Diet Coke");
    expect(productName({ brands: "Acme" })).toBe("Acme");
    expect(productName({ product_name: "Coca-Cola Original", brands: "COCA-COLA SERVICES SA/NV" })).toBe("Coca-Cola Original");
    const coke = { serving_size: "1 portion (330 ml)", serving_quantity: 330, quantity: "330 ml" };
    expect(servingOf(coke)).toEqual({ label: "1 portion (330 ml)", grams: 330 });
    expect(unitOf(coke)).toBe("ml");
    expect(unitOf(fixture.product)).toBe("g");
    expect(servingOf({ quantity: "1 l" })).toEqual({ label: "100 ml", grams: 100 });
    expect(servingOf(fixture.product)).toEqual({ label: "1 serving (15 g)", grams: 15 });
    expect(servingOf({})).toEqual({ label: "100 g", grams: 100 });
    expect(servingOf({ serving_quantity: 0 })).toEqual({ label: "100 g", grams: 100 });
  });
  it("parses found, not found and no-nutrition responses", () => {
    const found = parseOffResponse("3017620422003", 200, fixture);
    expect(found.kind).toBe("found");
    if (found.kind === "found") {
      expect(found.product.serving.grams).toBe(15);
      expect(found.product.packSize).toBe("400 g");
    }
    expect(parseOffResponse("1", 404, { status: 0 })).toEqual({ kind: "not_found", code: "1" });
    expect(parseOffResponse("1", 200, { status: 1, product: { product_name: "Water", nutriments: {} } }))
      .toEqual({ kind: "no_nutrition", code: "1", name: "Water" });
    expect(parseOffResponse("1", 500, { status: 1, product: {} }).kind).toBe("error");
  });
  it("fetches only the barcode URL and handles network failure", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const r = await lookupBarcode("3017620422003", { fetchFn: fetchFn as unknown as typeof fetch });
    expect(r.kind).toBe("found");
    expect(fetchFn).toHaveBeenCalledWith(offUrl("3017620422003"), expect.objectContaining({ credentials: "omit" }));
    const bad = await lookupBarcode("1", { fetchFn: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    expect(bad.kind).toBe("error");
  });
});
