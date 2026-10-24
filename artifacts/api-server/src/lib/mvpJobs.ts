import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, mvpJobs, mvpMessages, wardrobeItems } from "@workspace/db";
import { UpdateMvpItemBody, type MvpAttributes, type MvpDraft } from "@workspace/api-zod";
import { consentFor, imageDataFor, itemApi, jobApi, legacyRecord, messagesFor, MvpError, threadFor, uploadsFor } from "./mvpData";
import { postToAiService } from "./wardrobeAi";
import { logger } from "./logger";
import { discardPrivateImage, storePrivateImage } from "./privateImages";
import { garmentIdentity } from "./garmentIdentity";

const queue: string[] = [];
const active = new Set<string>();
let scheduled = false;

async function run(id: string): Promise<void> {
  const [job] = await db.select().from(mvpJobs).where(eq(mvpJobs.id, id));
  if (!job || job.status === "completed") return;
  const createdPaths: string[] = [];
  try {
    await consentFor(job.userId);
    await db.update(mvpJobs).set({ status: "running", error: null, updatedAt: new Date() }).where(eq(mvpJobs.id, id));
    const images = await imageDataFor(job.userId, job.objectPaths);
    if (job.result.kind === "styling_image") {
      const image = await postToAiService<{ dataBase64: string; contentType: string }>("/styling-image", {
        images: images.slice(0, 1), suggestions: String(job.result.suggestions).slice(0, 6000),
      });
      await consentFor(job.userId);
      const imagePath = await storePrivateImage(job.userId, image, "AI-styling-simulation.png");
      createdPaths.push(imagePath);
      await consentFor(job.userId);
      await db.update(mvpJobs).set({
        status: "completed", result: { ...job.result, imagePath }, error: null, updatedAt: new Date(),
      }).where(eq(mvpJobs.id, id));
      return;
    }
    const result = await postToAiService<{
      garments: {
        imageIndices: number[];
        attributes: unknown;
        isolatedImages: { dataBase64: string; contentType: string }[];
        reconstructedImage: { dataBase64: string; contentType: string };
        aiGeneratedImage: boolean;
      }[];
      warnings: string[];
    }>("/scan", { images });
    await consentFor(job.userId);
    if (!Array.isArray(result.garments)) throw new Error("The analysis response was incomplete. Please retry.");
    const prepared: {
      id: string;
      imagePaths: string[];
      sources: string[];
      attributes: MvpAttributes;
      digest: string;
      legacyDigest: string;
      sourceHash: string;
      aiGeneratedImage: boolean;
    }[] = [];
    for (const detection of result.garments.slice(0, 30)) {
      const sources = [...new Set(detection.imageIndices.map((index) => {
        if (!Number.isInteger(index) || !job.objectPaths[index]) throw new Error("The analysis returned an invalid image reference.");
        return job.objectPaths[index];
      }))];
      if (!sources.length || !detection.isolatedImages?.length) throw new Error("An item could not be separated from the photo. Please retry.");
      if (!detection.reconstructedImage || detection.aiGeneratedImage !== true) {
        throw new Error("An AI garment image could not be created. Your original photos are unchanged; retry the capture.");
      }
      const attributes = UpdateMvpItemBody.parse(detection.attributes);
      const roles = { top: "base", bottom: "bottom", one_piece: "one_piece", outerwear: "outer", footwear: "footwear", accessory: "accessory" } as const;
      attributes.layerRole = roles[attributes.category];
      const cutoutPaths = [];
      for (const image of detection.isolatedImages.slice(0, 3)) {
        const path = await storePrivateImage(job.userId, image, `${attributes.category}-source-cutout.png`);
        createdPaths.push(path); cutoutPaths.push(path);
      }
      const generatedPath = await storePrivateImage(job.userId, detection.reconstructedImage, `${attributes.category}-ai-reconstruction.png`);
      createdPaths.push(generatedPath);
      const imagePaths = [generatedPath, ...cutoutPaths];
      const rawHash = createHash("sha256").update(Buffer.from(images[detection.imageIndices[0]].dataBase64, "base64")).digest("hex");
      const occurrence = prepared.filter((item) => item.sourceHash === rawHash && item.attributes.category === attributes.category).length;
      prepared.push({ id: randomUUID(), imagePaths, sources, attributes, ...garmentIdentity(rawHash, attributes.category, attributes.subcategory, occurrence), sourceHash: rawHash, aiGeneratedImage: true });
    }
    const unused: string[] = [];
    await consentFor(job.userId);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"wardrobe:" + job.userId}))`);
      const drafts: MvpDraft[] = [];
      for (const item of prepared) {
        const [duplicate] = await tx.select().from(wardrobeItems).where(and(
          eq(wardrobeItems.userId, job.userId), inArray(wardrobeItems.imageDigest, [item.digest, item.legacyDigest]),
        )).limit(1);
        let row = duplicate ?? (await tx.insert(wardrobeItems).values({
          userId: job.userId, imagePath: item.imagePaths[0], additionalImagePaths: item.imagePaths.slice(1),
          imageDigest: item.digest, record: { ...legacyRecord(item.attributes, item.imagePaths), sourceImagePaths: item.sources, autoSaved: true, aiGeneratedImage: true },
        }).returning())[0];
        const previousSourcePaths = duplicate && Array.isArray(duplicate.record.sourceImagePaths)
          ? duplicate.record.sourceImagePaths.filter((path): path is string => typeof path === "string") : [];
        if (duplicate && (
          item.sources.some((path) => previousSourcePaths.includes(path))
          || item.sources.includes(duplicate.imagePath)
          || !Array.isArray(duplicate.record.sourceImagePaths)
        )) {
          row = (await tx.update(wardrobeItems).set({
            imagePath: item.imagePaths[0], additionalImagePaths: item.imagePaths.slice(1), imageDigest: item.digest,
            record: {
              ...duplicate.record,
              imagePath: item.imagePaths[0],
              additionalImagePaths: item.imagePaths.slice(1),
              sourceImagePaths: [...new Set([...previousSourcePaths, ...item.sources])],
              aiGeneratedImage: item.aiGeneratedImage,
            },
          }).where(eq(wardrobeItems.id, duplicate.id)).returning())[0];
        } else if (duplicate) unused.push(...item.imagePaths);
        drafts.push({ id: item.id, imagePaths: [row.imagePath, ...row.additionalImagePaths], attributes: itemApi(row).attributes, confirmedItemId: row.id });
      }
      await tx.update(mvpJobs).set({
        status: "completed", result: { drafts, warnings: result.warnings || [], kind: "scan" }, error: null, updatedAt: new Date(),
      }).where(eq(mvpJobs.id, id));
    });
    for (const path of unused) await discardPrivateImage(path);
  } catch (error) {
    for (const path of createdPaths) await discardPrivateImage(path);
    logger.warn({ err: error, jobId: id }, "Wardrobe scan could not finish");
    await db.update(mvpJobs).set({
      status: "failed", error: error instanceof Error ? error.message : "The photo scan failed. Please retry.",
      updatedAt: new Date(),
    }).where(eq(mvpJobs.id, id));
  }
}

function drain(): void {
  scheduled = false;
  while (active.size < 1 && queue.length) {
    const id = queue.shift()!;
    if (active.has(id)) continue;
    active.add(id);
    void run(id).finally(() => { active.delete(id); schedule(); });
  }
}
function schedule(): void {
  if (!scheduled) { scheduled = true; setImmediate(drain); }
}
function enqueue(id: string): void {
  if (!queue.includes(id) && !active.has(id)) queue.push(id);
  schedule();
}
export async function createScanJob(userId: string, objectPaths: string[], threadId?: string | null) {
  await consentFor(userId);
  await uploadsFor(userId, objectPaths);
  if (threadId) await threadFor(userId, threadId);
  const outstanding = await db.select({ id: mvpJobs.id }).from(mvpJobs).where(and(
    eq(mvpJobs.userId, userId), inArray(mvpJobs.status, ["pending", "running"]),
  )).limit(5);
  if (outstanding.length >= 5) throw new MvpError(429, "You already have five photo scans queued. Let one finish before starting another.");
  const [job] = await db.insert(mvpJobs).values({
    userId, objectPaths, threadId: threadId || null, status: "pending",
  }).returning();
  enqueue(job.id);
  return jobApi(job);
}
export async function resumeScanJobs(): Promise<void> {
  const unfinished = await db.select().from(mvpJobs).where(inArray(mvpJobs.status, ["pending", "running"]));
  for (const job of unfinished) {
    await db.update(mvpJobs).set({ status: "pending" }).where(eq(mvpJobs.id, job.id));
    enqueue(job.id);
  }
}

export async function createStylingImageJob(userId: string, threadId: string, sourceMessageId: string) {
  await consentFor(userId);
  const messages = await messagesFor(userId, threadId);
  const index = messages.findIndex((message) => message.id === sourceMessageId && message.role === "assistant" && !message.jobId);
  const source = messages.find((message) => message.id === sourceMessageId && message.role === "assistant");
  if (!source) throw new MvpError(404, "Styling reply not found.");
  if (source.canVisualize === false) throw new MvpError(400, "Share a clearer outfit photo before creating a styling image.");
  const position = index >= 0 ? index : messages.indexOf(source);
  const photo = messages.slice(0, position).reverse().find((message) =>
    message.role === "user" && message.intent === "chat" && message.attachments.length && message.canVisualize !== false);
  if (!photo) throw new MvpError(400, "Share an outfit selfie in this conversation first.");
  await uploadsFor(userId, photo.attachments.slice(0, 1));
  const job = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId + ":" + sourceMessageId}))`);
    const rows = await tx.select().from(mvpJobs).where(and(eq(mvpJobs.userId, userId), eq(mvpJobs.threadId, threadId)));
    const existing = rows.find((row) => row.result.kind === "styling_image" && row.result.sourceMessageId === sourceMessageId);
    if (existing && existing.status !== "failed") return existing;
    const pending = await tx.select({ id: mvpJobs.id }).from(mvpJobs).where(and(
      eq(mvpJobs.userId, userId), inArray(mvpJobs.status, ["pending", "running"]),
    ));
    if (pending.length >= 5) throw new MvpError(429, "Let one of your queued images finish before starting another.");
    const next = existing
      ? (await tx.update(mvpJobs).set({ status: "pending", error: null, updatedAt: new Date() }).where(eq(mvpJobs.id, existing.id)).returning())[0]
      : (await tx.insert(mvpJobs).values({
        userId, threadId, objectPaths: photo.attachments.slice(0, 1), status: "pending",
        result: { kind: "styling_image", sourceMessageId, suggestions: source.content },
      }).returning())[0];
    const [message] = await tx.select().from(mvpMessages).where(eq(mvpMessages.id, sourceMessageId));
    await tx.update(mvpMessages).set({ meta: { ...message.meta, jobId: next.id } }).where(eq(mvpMessages.id, sourceMessageId));
    return next;
  });
  if (job.status === "pending") enqueue(job.id);
  return jobApi(job);
}
