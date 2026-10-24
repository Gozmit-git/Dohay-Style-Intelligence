import assert from "node:assert/strict";
import { test } from "node:test";
import type { MvpContext, MvpItem, MvpProfile } from "@workspace/api-zod";
import { eligible, generateOutfits, scoreCombination, validCombination } from "./outfitEngine";

const profile: MvpProfile = {
  id: "test", stylePreferences: ["minimal"], preferredPalette: ["navy"],
  comfortRestrictions: [], defaultDressCode: null, imageConsent: true, selfiePath: null,
};
const context: MvpContext = { occasion: "Dinner", dressCode: "smart_casual", temperature: 22, outdoor: false, exclusions: [] };
function item(id: string, role: MvpItem["attributes"]["layerRole"], overrides: Partial<MvpItem["attributes"]> = {}): MvpItem {
  const categories = { base: "top", bottom: "bottom", one_piece: "one_piece", outer: "outerwear", footwear: "footwear", accessory: "accessory" } as const;
  return {
    id, imagePaths: [`/objects/uploads/${id}`], aiGeneratedImage: false, createdAt: new Date(0).toISOString(),
    attributes: {
      category: categories[role], subcategory: role, colors: ["navy"], pattern: "solid",
      formality: "smart_casual", layerRole: role, occasionTags: ["dinner"], seasonTags: ["spring"],
      styleTags: ["minimal"], fabricEstimate: null, brand: null, size: null, notes: null,
      isAvailable: true, confidence: .8, attributeSources: [], ...overrides,
    },
  };
}
const base = [item("shirt", "base"), item("trousers", "bottom"), item("loafers", "footwear")];

test("empty and incomplete wardrobes produce no invented outfit", () => {
  assert.equal(generateOutfits([], context, profile, []).length, 0);
  assert.equal(generateOutfits(base.slice(0, 2), context, profile, []).length, 0);
});
test("all generated IDs come from available provided wardrobe and are unique", () => {
  const items = [...base, item("second-shirt", "base"), item("unavailable", "base", { isAvailable: false })];
  const results = generateOutfits(items, context, profile, []);
  assert.equal(results.length, 2);
  for (const result of results) {
    assert(result.items.every((i) => items.some((own) => own.id === i.id) && i.attributes.isAvailable));
    assert.equal(new Set(result.items.map((i) => i.id)).size, result.items.length);
  }
});
test("hard formal dress code cannot be bypassed by a high style score", () => {
  assert.equal(generateOutfits(base, { ...context, dressCode: "formal" }, profile, []).length, 0);
  assert.equal(eligible(item("casual", "base", { formality: "casual" }), { ...context, dressCode: "business" }, profile), false);
});
test("cold outdoor conditions require an outer layer", () => {
  const cold = { ...context, temperature: 5, outdoor: true };
  assert.equal(generateOutfits(base, cold, profile, []).length, 0);
  const results = generateOutfits([...base, item("coat", "outer")], cold, profile, []);
  assert.equal(results.length, 1);
  assert(results[0].items.some((i) => i.id === "coat"));
});
test("one-piece replaces both top and bottom but still requires footwear", () => {
  assert(validCombination([item("dress", "one_piece"), base[2]], context, profile));
  assert(!validCombination([item("dress", "one_piece"), ...base], context, profile));
});
test("context exclusions and profile restrictions are hard filters", () => {
  assert.equal(generateOutfits(base, { ...context, exclusions: ["navy"] }, profile, []).length, 0);
  assert(!eligible(item("wool", "base", { fabricEstimate: "Wool-like" }), context, { ...profile, comfortRestrictions: ["avoid wool"] }));
});
test("swaps must still have a complete valid combination", () => {
  assert.throws(() => scoreCombination([base[0], base[1], item("extra-shirt", "base")], context, profile, []));
  assert.throws(() => scoreCombination([base[0], base[1], item("dirty-shoe", "footwear", { isAvailable: false })], context, profile, []));
});
test("normalised scoring follows the required 30/25/20/15/10 weights", () => {
  const result = scoreCombination(base, context, profile, []);
  const b = result.breakdown;
  assert.equal(result.score, b.occasionFit * .3 + b.compatibility * .25 + b.weather * .2 + b.style * .15 + b.layeringVariety * .1);
  assert(Object.values(b).every((n) => n >= 0 && n <= 1));
});
test("wear history reduces repetition, without overriding any hard constraint", () => {
  const fresh = scoreCombination(base, context, profile, []);
  const worn = scoreCombination(base, context, profile, [{ itemIds: base.map((i) => i.id), action: "worn", createdAt: new Date() }]);
  assert(worn.score < fresh.score);
});
test("up to three distinct core outfits are returned, never padded", () => {
  const results = generateOutfits([...base, item("shirt2", "base"), item("shirt3", "base"), item("shirt4", "base")], context, profile, []);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((o) => o.items.map((i) => i.id).sort().join(":"))).size, 3);
});
