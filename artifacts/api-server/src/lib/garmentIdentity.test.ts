import test from "node:test";
import assert from "node:assert/strict";
import { garmentIdentity } from "./garmentIdentity";

test("repeat scans do not duplicate an item just because the AI changes its label", () => {
  assert.equal(garmentIdentity("same-photo", "outerwear", "jacket", 0).digest,
    garmentIdentity("same-photo", "outerwear", "open blazer", 0).digest);
});
test("multiple garments or accessories of the same type remain separate", () => {
  assert.notEqual(garmentIdentity("same-photo", "accessory", "necklace", 0).digest,
    garmentIdentity("same-photo", "accessory", "necklace", 1).digest);
  assert.notEqual(garmentIdentity("same-photo", "top", "shirt", 0).digest,
    garmentIdentity("other-photo", "top", "shirt", 0).digest);
});
