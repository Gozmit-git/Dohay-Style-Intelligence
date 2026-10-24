import assert from "node:assert/strict";
import { test } from "node:test";
import { ListMvpMessagesResponse, SendMvpMessageBody, SendMvpMessageResponse } from "@workspace/api-zod";

const message = {
  id: "test-message", threadId: "test-thread", role: "assistant", content: "Hello.",
  attachments: [], jobId: null, outfitIds: [], intent: "chat",
  suggestedContext: null, createdAt: new Date(0).toISOString(),
};
test("photo messages default to outfit review; wardrobe scans require explicit choice", () => {
  const body = { content: "How do I look?", objectPaths: ["/objects/uploads/test"] };
  assert.equal(SendMvpMessageBody.parse(body).photoPurpose, "fit_check");
  assert.equal(SendMvpMessageBody.parse({ ...body, photoPurpose: "wardrobe" }).photoPurpose, "wardrobe");
});
test("ordinary chat accepts a null outfit context in send and history responses", () => {
  assert.equal(SendMvpMessageResponse.parse(message).suggestedContext, null);
  assert.equal(ListMvpMessagesResponse.parse([message])[0].suggestedContext, null);
});
test("outfit chat also accepts a concrete confirmed context", () => {
  const result = SendMvpMessageResponse.parse({
    ...message, intent: "recommend",
    suggestedContext: { occasion: "Dinner", dressCode: "smart_casual" },
  });
  assert.equal(result.suggestedContext?.occasion, "Dinner");
});
test("real stylist reply passes the public chat response contract", {
  skip: process.env.DOHAY_LIVE_TEST !== "1",
}, async () => {
  const response = await fetch("http://127.0.0.1:8765/assistant", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello, what can you help me with?" }],
      profile: { stylePreferences: [], preferredPalette: [], comfortRestrictions: [], imageConsent: false },
      wardrobe: [],
    }), signal: AbortSignal.timeout(60_000),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const reply = await response.json() as { reply: string; intent: string; suggestedContext: { occasion?: string; dressCode?: string } | null };
  assert(reply.reply.length > 0);
  const suggestedContext = reply.suggestedContext?.occasion && reply.suggestedContext?.dressCode
    ? reply.suggestedContext : null;
  assert(SendMvpMessageResponse.safeParse({
    ...message, content: reply.reply, intent: reply.intent, suggestedContext,
  }).success);
});
