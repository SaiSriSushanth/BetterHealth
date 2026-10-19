import { describe, expect, it } from "vitest";
import { itemsLookSane, PhotoOut, toItems } from "./logic";

const item = (o: Record<string, unknown> = {}) => ({
  name: "steamed rice", portion: "1 cup", grams: 158.4, kcal: 205.6, protein_g: 4.25, carbs_g: 44.5, fat_g: 0.44,
  fiber_g: 0.6, sugar_g: 0.1, sodium_mg: 1.6, potassium_mg: 55, calcium_mg: 16, iron_mg: 1.9, vitc_mg: 0, ...o,
});

describe("photo route logic", () => {
  it("maps model output to rounded items", () => {
    const [i] = toItems(PhotoOut.parse({ items: [item()], confidence: "medium" }));
    expect(i).toMatchObject({ name: "steamed rice", portion: "1 cup", grams: 158 });
    expect(i.nutrients).toMatchObject({ kcal: 206, proteinG: 4.3, carbsG: 44.5, fatG: 0.4, sodiumMg: 2 });
  });
  it("rejects schema violations", () => {
    expect(PhotoOut.safeParse({ items: [item({ kcal: -1 })], confidence: "low" }).success).toBe(false);
    expect(PhotoOut.safeParse({ items: [item()], confidence: "sure" }).success).toBe(false);
    expect(PhotoOut.safeParse({ items: [item({ grams: 9000 })], confidence: "low" }).success).toBe(false);
  });
  it("throws away inconsistent macros but allows alcohol", () => {
    expect(itemsLookSane(toItems(PhotoOut.parse({ items: [item({ kcal: 900 })], confidence: "low" })))).toBe(false);
    const wine = item({ name: "glass of red wine", kcal: 125, protein_g: 0.1, carbs_g: 3.8, fat_g: 0 });
    expect(itemsLookSane(toItems(PhotoOut.parse({ items: [wine], confidence: "medium" })))).toBe(true);
    expect(itemsLookSane(toItems(PhotoOut.parse({ items: [item()], confidence: "high" })))).toBe(true);
  });
  it("fills blank names and portions", () => {
    const [i] = toItems(PhotoOut.parse({ items: [item({ name: " ", portion: "" })], confidence: "low" }));
    expect(i.name).toBe("Food");
    expect(i.portion).toBe("158 g");
  });
});
