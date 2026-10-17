import { describe, expect, it } from "vitest";
import { estimateFromTable, macrosAreConsistent, normalize, parseSegment } from "./estimate";

describe("estimate", () => {
  it("normalizes text", () => {
    expect(normalize("  Two  Eggs!! ")).toBe("two eggs");
  });
  it("parses quantities and units", () => {
    expect(parseSegment("150g rice")).toMatchObject({ quantity: 150, unitGrams: 1, name: "rice" });
    expect(parseSegment("2 eggs")).toMatchObject({ quantity: 2, unitGrams: null, name: "eggs" });
    expect(parseSegment("a banana")).toMatchObject({ quantity: 1, name: "banana" });
    expect(parseSegment("1/2 cup oats")).toMatchObject({ quantity: 0.5, unitGrams: 240, name: "oats" });
  });
  it("estimates a multi-item meal", () => {
    const e = estimateFromTable("2 eggs and a banana");
    expect(e.items).toHaveLength(2);
    expect(e.items[0].nutrients.kcal).toBeGreaterThan(120);
    expect(e.items[0].nutrients.kcal).toBeLessThan(200);
    expect(e.unmatched).toEqual([]);
  });
  it("does not treat a cup of dry oats like a cup of water", () => {
    const e = estimateFromTable("1 cup oats");
    expect(e.items).toHaveLength(1);
    expect(e.items[0].nutrients.kcal).toBeLessThan(450);
  });
  it("handles unicode fractions, number words and trailing dots", () => {
    expect(parseSegment("½ cup rice")).toMatchObject({ quantity: 0.5 });
    expect(parseSegment("ten almonds")).toMatchObject({ quantity: 10, name: "almonds" });
    expect(parseSegment("1 cup oats.")).toMatchObject({ name: "oats" });
    expect(parseSegment("half an avocado")).toMatchObject({ quantity: 0.5, name: "avocado" });
  });
  it("clamps absurd quantities", () => {
    const e = estimateFromTable("99999999 g rice");
    expect(e.items[0].grams).toBeLessThanOrEqual(5000);
  });
  it("reports unmatched foods", () => {
    expect(estimateFromTable("qwxzy blorp").unmatched).toEqual(["qwxzy blorp"]);
  });
  it("sanity-checks macros", () => {
    const n = { kcal: 200, proteinG: 10, carbsG: 20, fatG: 9, fiberG: 0, sugarG: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0, vitCMg: 0 };
    expect(macrosAreConsistent(n)).toBe(true);
    expect(macrosAreConsistent({ ...n, kcal: 900 })).toBe(false);
  });
});
