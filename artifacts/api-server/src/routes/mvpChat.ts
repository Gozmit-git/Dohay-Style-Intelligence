import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, mvpProfiles, mvpThreads, wardrobeUploads } from "@workspace/db";
import * as api from "@workspace/api-zod";
import { handler, input, param } from "../lib/mvpHttp";
import {
  addMessage, consentFor, imageDataFor, itemsFor, messagesFor, MvpError, profileFor, storage,
  threadApi, threadFor, uploadsFor,
} from "../lib/mvpData";
import { createScanJob } from "../lib/mvpJobs";
import { postToAiService } from "../lib/wardrobeAi";
import { weatherContext } from "../lib/outfitEngine";
import { formatStylingContext } from "../lib/stylingContext";

const router = Router();
router.get("/profile", handler(async (_req, res, userId) => {
  res.json(api.GetMvpProfileResponse.parse(await profileFor(userId)));
}));
router.post("/profile", handler(async (req, res, userId) => {
  const data = input(api.SaveMvpProfileBody, req.body);
  if (data.selfiePath) {
    if (!data.imageConsent) throw new MvpError(400, "Image consent is required before adding a selfie.");
    await uploadsFor(userId, [data.selfiePath]);
  }
  const consentAt = data.imageConsent ? new Date() : null;
  await db.insert(mvpProfiles).values({ userId, data, consentAt }).onConflictDoUpdate({
    target: mvpProfiles.userId, set: { data, consentAt, updatedAt: new Date() },
  });
  res.json(api.SaveMvpProfileResponse.parse(await profileFor(userId)));
}));
router.post("/uploads", handler(async (req, res, userId) => {
  await consentFor(userId);
  const data = input(api.CreateMvpUploadBody, req.body);
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(wardrobeUploads).values({
    userId, objectPath, originalName: data.name, contentType: data.contentType, size: data.size,
  });
  res.json(api.CreateMvpUploadResponse.parse({ uploadURL, objectPath }));
}));
router.get("/threads", handler(async (_req, res, userId) => {
  const rows = await db.select().from(mvpThreads).where(eq(mvpThreads.userId, userId))
    .orderBy(desc(mvpThreads.updatedAt)).limit(100);
  res.json(api.ListMvpThreadsResponse.parse(rows.map(threadApi)));
}));
router.post("/threads", handler(async (req, res, userId) => {
  const data = input(api.CreateMvpThreadBody, req.body);
  const [thread] = await db.insert(mvpThreads).values({
    userId, title: data.title?.trim() || "New conversation",
  }).returning();
  res.status(201).json(api.CreateMvpThreadResponse.parse(threadApi(thread)));
}));
router.get("/threads/:threadId/messages", handler(async (req, res, userId) => {
  res.json(api.ListMvpMessagesResponse.parse(await messagesFor(userId, param(req, "threadId"))));
}));
router.post("/threads/:threadId/messages", handler(async (req, res, userId) => {
  const threadId = param(req, "threadId");
  const thread = await threadFor(userId, threadId);
  const data = input(api.SendMvpMessageBody, req.body);
  const paths = data.objectPaths || [];
  const isFitCheck = data.photoPurpose !== "wardrobe";
  if (isFitCheck && paths.length > 3) throw new MvpError(400, "Use up to three outfit photos for a quick fit check.");
  if (!data.content.trim() && !paths.length) throw new MvpError(400, "Type a message or attach a clothing photo.");
  if (paths.length) { await consentFor(userId); await uploadsFor(userId, paths); }
  let content = data.content.trim() || (isFitCheck ? "How does my outfit look? Give me a quick fit check." : "Help me add these clothes to my wardrobe.");
  let currentContext = "";
  if (data.stylingContext && (!paths.length || isFitCheck)) {
    const resolved = await weatherContext(data.stylingContext);
    currentContext = formatStylingContext(resolved.context, resolved.warnings);
    if (currentContext) content += `\n\n${currentContext}`;
  }
  await addMessage(userId, threadId, "user",
    content,
    paths, { intent: paths.length && !isFitCheck ? "add_wardrobe" : "chat" });
  if (thread.title === "New conversation") await db.update(mvpThreads).set({
    title: (data.content.trim() || (isFitCheck ? "Quick outfit fit check" : "Adding clothes to my wardrobe")).slice(0, 80),
  }).where(and(eq(mvpThreads.id, threadId), eq(mvpThreads.userId, userId)));
  if (paths.length && isFitCheck) {
    try {
      const result = await postToAiService<{ reply: string }>("/fit-check", {
        images: await imageDataFor(userId, paths), message: content,
        profile: await profileFor(userId),
      });
      const message = await addMessage(userId, threadId, "assistant", result.reply);
      res.json(api.SendMvpMessageResponse.parse(message));
      return;
    } catch (error) {
      throw new MvpError(502, error instanceof Error ? error.message : "Your fit check could not finish. Please retry.");
    }
  }
  if (paths.length) {
    const job = await createScanJob(userId, paths, threadId);
    const message = await addMessage(userId, threadId, "assistant",
      "I’m checking your photos for clothing and accessories. I’ll show you editable suggestions—nothing enters your wardrobe until you confirm it.",
      [], { jobId: job.id, intent: "add_wardrobe" });
    res.json(api.SendMvpMessageResponse.parse(message));
    return;
  }
  const history = await messagesFor(userId, threadId);
  const profile = await profileFor(userId);
  const recentOutfitPhoto = [...history.slice(-12)].reverse().find((m) => m.role === "user" && m.intent === "chat" && m.attachments.length);
  try {
    const result = await postToAiService<{
      reply: string; intent: "chat" | "recommend" | "add_wardrobe";
      suggestedContext: { occasion: string | null; dressCode: string | null; exclusions: string[]; activities: string; outdoor: boolean } | null;
    }>("/assistant", {
      messages: history.slice(-30).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
      profile, wardrobe: await itemsFor(userId), currentContext,
      images: profile.imageConsent && recentOutfitPhoto ? await imageDataFor(userId, recentOutfitPhoto.attachments.slice(0, 3)) : [],
    });
    const suggestedContext = result.suggestedContext?.occasion && result.suggestedContext?.dressCode
      ? result.suggestedContext : null;
    const message = await addMessage(userId, threadId, "assistant", result.reply, [], {
      intent: result.intent, suggestedContext,
    });
    res.json(api.SendMvpMessageResponse.parse(message));
  } catch (error) {
    throw new MvpError(502, error instanceof Error ? error.message : "DOHAY could not reply. Please try again.");
  }
}));
export default router;
