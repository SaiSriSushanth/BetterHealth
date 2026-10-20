import { describe, expect, it } from "vitest";
import type { GroundedItem } from "../../../../lib/grounding/types";
import { ZERO } from "../../../../lib/nutrition/estimate";
import { allItemsLookSane, groundedLooksSane, itemsLookSane, makeBody, toResponseItem } from "./logic";

const gi = (o: Partial<GroundedItem> = {}): GroundedItem => ({
  name: "steamed rice", portion: "1 cup", grams: 158,
  nutrients: { ...ZERO, kcal: 206, proteinG: 4.3, carbsG: 44.5, fatG: 0.4 },
  ref: { source: "ai", name: "steamed rice" }, ...o,
});

describe("photo route logic", () => {
  it("parses the request body and tolerates bad locale", () => {
    const B = makeBody(1000);
    expect(B.parse({ image: "x", locale: { region: "IN", lang: "en-IN", tz: "Asia/Kolkata" }, hint: "two idli" }).locale?.region).toBe("IN");
    expect(B.parse({ image: "x", locale: "nope" }).locale).toBeUndefined();
    expect(B.safeParse({ image: "x".repeat(2000) }).success).toBe(false);
  });
  it("throws away inconsistent AI macros but allows alcohol", () => {
    expect(itemsLookSane([gi({ nutrients: { ...gi().nutrients, kcal: 900 } })])).toBe(false);
    const wine = gi({ name: "glass of red wine", nutrients: { ...ZERO, kcal: 125, proteinG: 0.1, carbsG: 3.8 } });
    expect(itemsLookSane([wine])).toBe(true);
    expect(itemsLookSane([gi()])).toBe(true);
  });
  it("applies the strict check to AI items only; DB items get a looser range check", () => {
    const dbOff = gi({ ref: { source: "ifct", name: "Rice" }, nutrients: { ...gi().nutrients, kcal: 280 } });
    expect(allItemsLookSane([dbOff])).toBe(true);
    expect(allItemsLookSane([{ ...dbOff, ref: { source: "ai", name: "Rice" } }])).toBe(false);
  });
  it("rejects physically impossible grounded numbers", () => {
    expect(groundedLooksSane(gi({ nutrients: { ...ZERO, kcal: 500, carbsG: 300 } }))).toBe(false);
    expect(groundedLooksSane(gi({ grams: 100, nutrients: { ...ZERO, kcal: 1200 } }))).toBe(false);
    expect(groundedLooksSane(gi({ nutrients: { ...gi().nutrients, kcal: Number.NaN } }))).toBe(false);
    expect(groundedLooksSane(gi())).toBe(true);
  });
  it("maps to the backwards compatible response shape", () => {
    const r = toResponseItem(gi({ ref: { source: "usda", name: "Rice", score: 0.9 } }));
    expect(r).toMatchObject({ name: "steamed rice", portion: "1 cup", grams: 158, ref: { source: "usda", name: "Rice", score: 0.9 } });
    expect(toResponseItem(gi()).ref).toEqual({ source: "ai", name: "steamed rice" });
  });
});
