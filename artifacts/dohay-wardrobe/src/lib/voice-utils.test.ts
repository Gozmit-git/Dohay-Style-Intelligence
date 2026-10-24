import assert from "node:assert/strict";
import { test } from "node:test";
import { appendDictation, speechChunks } from "./voice-utils";

test("dictation preserves an existing draft with one separator", () => {
  assert.equal(appendDictation("For dinner  ", " how does this look? "), "For dinner how does this look?");
  assert.equal(appendDictation("", "hello"), "hello");
});
test("dictation respects chat's 4,000-character input limit", () => {
  assert.equal(appendDictation("a".repeat(3990), "b".repeat(50)).length, 4000);
});
test("speech chunks preserve words and cover the complete advice", () => {
  const text = "A blue shirt pairs well with neutral trousers. ".repeat(30).trim();
  const chunks = speechChunks(text);
  assert(chunks.every((chunk) => chunk.length <= 160));
  assert.equal(chunks.join(" "), text);
});
test("spoken text removes formatting and reads empty content safely", () => {
  assert.deepEqual(speechChunks(""), []);
  assert.equal(speechChunks("**Overall:** nice. Visit https://example.com")[0], "Overall: nice. Visit link");
});
