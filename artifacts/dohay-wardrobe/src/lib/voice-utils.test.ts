import { describe, expect, it } from "vitest";
import { appendDictation, speechChunks, speakReplyIfEnabled } from "./voice-utils";

describe("browser voice utilities", () => {
it("dictation preserves an existing draft with one separator", () => {
  expect(appendDictation("For dinner  ", " how does this look? ")).toBe("For dinner how does this look?");
  expect(appendDictation("", "hello")).toBe("hello");
});
it("dictation respects chat's 4,000-character input limit", () => {
  expect(appendDictation("a".repeat(3990), "b".repeat(50))).toHaveLength(4000);
});
it("speech chunks preserve words and cover the complete advice", () => {
  const text = "A blue shirt pairs well with neutral trousers. ".repeat(30).trim();
  const chunks = speechChunks(text);
  expect(chunks.every((chunk) => chunk.length <= 160)).toBe(true);
  expect(chunks.join(" ")).toBe(text);
});
it("spoken text removes formatting and reads empty content safely", () => {
  expect(speechChunks("")).toEqual([]);
  expect(speechChunks("**Overall:** nice. Visit https://example.com")[0]).toBe("Overall: nice. Visit link");
});
it("a reply uses the current opt-in setting when the response arrives", async () => {
  let autoSpeak = false;
  const speak = (id: string, text: string) => spoken.push([id, text]);
  const spoken: string[][] = [];
  const voice = { get autoSpeak() { return autoSpeak; }, speak };
  speakReplyIfEnabled(voice, "reply-default", "Not spoken by default");
  expect(spoken).toEqual([]);

  autoSpeak = true;
  speakReplyIfEnabled(voice, "reply-opted-in", "Read this reply");
  expect(spoken).toEqual([["reply-opted-in", "Read this reply"]]);

  let finish!: (reply: { id: string; content: string }) => void;
  const pendingReply = new Promise<{ id: string; content: string }>((resolve) => { finish = resolve; });
  autoSpeak = false;
  finish({ id: "reply-pending", content: "Do not read after opting out" });
  const reply = await pendingReply;
  speakReplyIfEnabled(voice, reply.id, reply.content);
  expect(spoken).toEqual([["reply-opted-in", "Read this reply"]]);
});
});
