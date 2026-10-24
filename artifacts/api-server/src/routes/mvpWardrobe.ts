import { Router } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db, mvpJobs, mvpMessages, mvpOutfits, mvpOutfitItems, wardrobeItems, wardrobeUploads,
} from "@workspace/db";
import * as api from "@workspace/api-zod";
import type { MvpAttributes, MvpDraft } from "@workspace/api-zod";
import { handler, input, param } from "../lib/mvpHttp";
import {
  consentFor, imageDataFor, itemApi, itemsFor, jobApi, legacyRecord, MvpError, profileFor, storage,
} from "../lib/mvpData";
import { createScanJob } from "../lib/mvpJobs";

const router = Router();
router.get("/jobs", handler(async (_req, res, userId) => {
  const rows = await db.select().from(mvpJobs).where(and(
    eq(mvpJobs.userId, userId), sql`coalesce(${mvpJobs.result}->>'kind', 'scan') = 'scan'`,
  )).orderBy(desc(mvpJobs.createdAt)).limit(10);
  res.json(api.ListMvpJobsResponse.parse(rows.map(jobApi)));
}));
const roles = { top: "base", bottom: "bottom", one_piece: "one_piece", outerwear: "outer", footwear: "footwear", accessory: "accessory" };
function approvedAttributes(value: MvpAttributes, original: MvpAttributes): MvpAttributes {
  if (roles[value.category] !== value.layerRole) throw new MvpError(400, "The category and layering role must match.");
  const sources = [...original.attributeSources];
  for (const [attribute, val] of Object.entries(value)) {
    if (["attributeSources", "confidence"].includes(attribute)) continue;
    if (JSON.stringify(val) !== JSON.stringify(original[attribute as keyof MvpAttributes])) {
      for (let i = sources.length - 1; i >= 0; i--) if (sources[i].attribute === attribute) sources.splice(i, 1);
      sources.push({ attribute, value: Array.isArray(val) ? val.join(", ") : String(val ?? "Unknown"), source: "user_provided" });
    }
  }
  return { ...value, attributeSources: sources };
}
router.post("/wardrobe/scan", handler(async (req, res, userId) => {
  const data = input(api.StartMvpScanBody, req.body);
  res.status(202).json(api.StartMvpScanResponse.parse(await createScanJob(userId, data.objectPaths, data.threadId)));
}));
router.get("/jobs/:jobId", handler(async (req, res, userId) => {
  const [job] = await db.select().from(mvpJobs).where(and(
    eq(mvpJobs.id, param(req, "jobId")), eq(mvpJobs.userId, userId),
  ));
  if (!job) throw new MvpError(404, "Photo analysis not found.");
  res.json(api.GetMvpJobResponse.parse(jobApi(job)));
}));
router.get("/wardrobe", handler(async (_req, res, userId) => {
  res.json(api.ListMvpWardrobeResponse.parse(await itemsFor(userId)));
}));
router.post("/wardrobe", handler(async (req, res, userId) => {
  await consentFor(userId);
  const data = input(api.ConfirmMvpItemBody, req.body);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from dohay_scan_jobs where id = ${data.jobId}::uuid and user_id = ${userId} for update`);
    const [job] = await tx.select().from(mvpJobs).where(and(eq(mvpJobs.id, data.jobId), eq(mvpJobs.userId, userId)));
    if (!job || job.status !== "completed") throw new MvpError(404, "The completed analysis was not found.");
    const drafts = (job.result.drafts || []) as MvpDraft[];
    const draft = drafts.find((d) => d.id === data.draftId);
    if (!draft) throw new MvpError(404, "Garment suggestion not found.");
    if (draft.confirmedItemId) {
      const [existing] = await tx.select().from(wardrobeItems).where(and(
        eq(wardrobeItems.id, draft.confirmedItemId), eq(wardrobeItems.userId, userId),
      ));
      if (existing) return itemApi(existing);
      throw new MvpError(409, "This suggestion has already been confirmed and removed. Start a new scan to add it again.");
    }
    if (draft.imagePaths.some((path) => job.objectPaths.includes(path)))
      throw new MvpError(400, "Upload this photo in Wardrobe again to automatically save separate garment images.");
    const attributes = approvedAttributes(data.attributes, draft.attributes);
    const images = await imageDataFor(userId, draft.imagePaths);
    const rawHash = createHash("sha256").update(Buffer.from(images[0].dataBase64, "base64")).digest("hex");
    const digest = createHash("sha256").update(rawHash + draft.attributes.category + draft.attributes.subcategory.toLowerCase()).digest("hex");
    if (!data.allowDuplicate) {
      const [duplicate] = await tx.select().from(wardrobeItems).where(and(
        eq(wardrobeItems.userId, userId), inArray(wardrobeItems.imageDigest, [digest, rawHash]),
      )).limit(1);
      if (duplicate) throw new MvpError(409, "This garment photo is already saved. Confirm a second copy only if you own another one.");
    }
    const [row] = await tx.insert(wardrobeItems).values({
      userId, imagePath: draft.imagePaths[0], additionalImagePaths: draft.imagePaths.slice(1),
      imageDigest: digest, record: legacyRecord(attributes, draft.imagePaths),
    }).returning();
    draft.confirmedItemId = row.id;
    await tx.update(mvpJobs).set({ result: { ...job.result, drafts }, updatedAt: new Date() }).where(eq(mvpJobs.id, job.id));
    return itemApi(row);
  });
  res.status(201).json(api.ConfirmMvpItemResponse.parse(result));
}));
router.patch("/wardrobe/:itemId", handler(async (req, res, userId) => {
  const id = param(req, "itemId");
  const [row] = await db.select().from(wardrobeItems).where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId)));
  if (!row) throw new MvpError(404, "Garment not found.");
  const original = itemApi(row);
  const attributes = approvedAttributes(input(api.UpdateMvpItemBody, req.body), original.attributes);
  const [updated] = await db.update(wardrobeItems).set({
    record: { ...row.record, ...legacyRecord(attributes, original.imagePaths) },
  }).where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId))).returning();
  res.json(api.UpdateMvpItemResponse.parse(itemApi(updated)));
}));
router.delete("/wardrobe/:itemId", handler(async (req, res, userId) => {
  const id = param(req, "itemId");
  const records = await db.select().from(wardrobeItems).where(eq(wardrobeItems.userId, userId));
  const all = records.map(itemApi);
  const item = all.find((i) => i.id === id);
  if (!item) throw new MvpError(404, "Garment not found.");
  const sourcePaths = (record: Record<string, unknown>) => Array.isArray(record.sourceImagePaths)
    ? record.sourceImagePaths.filter((path): path is string => typeof path === "string") : [];
  const profile = await profileFor(userId);
  const retainedPaths = new Set(records.filter((row) => row.id !== id).flatMap((row) => [row.imagePath, ...row.additionalImagePaths, ...sourcePaths(row.record)]));
  if (profile.selfiePath) retainedPaths.add(profile.selfiePath);
  const messages = await db.select().from(mvpMessages).where(eq(mvpMessages.userId, userId));
  for (const message of messages) for (const path of message.attachments) retainedPaths.add(path);
  const activeJobs = await db.select().from(mvpJobs).where(and(eq(mvpJobs.userId, userId), inArray(mvpJobs.status, ["pending", "running"])));
  for (const job of activeJobs) for (const path of job.objectPaths) retainedPaths.add(path);
  const removedPaths = [...new Set([...item.imagePaths, ...sourcePaths(records.find((row) => row.id === id)!.record)])].filter((path) => !retainedPaths.has(path));
  for (const path of removedPaths) {
    try { await (await storage.getObjectEntityFile(path)).delete({ ignoreNotFound: true }); }
    catch (error) { if (!(error instanceof Error && error.name === "ObjectNotFoundError")) throw error; }
  }
  await db.transaction(async (tx) => {
    const links = await tx.select().from(mvpOutfitItems).where(eq(mvpOutfitItems.itemId, id));
    if (links.length) await tx.delete(mvpOutfits).where(and(eq(mvpOutfits.userId, userId), inArray(mvpOutfits.id, links.map((l) => l.outfitId))));
    await tx.delete(wardrobeItems).where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId)));
    if (removedPaths.length) await tx.delete(wardrobeUploads).where(and(
      eq(wardrobeUploads.userId, userId), inArray(wardrobeUploads.objectPath, removedPaths),
    ));
    for (const message of messages) {
      const attachments = message.attachments.filter((p) => !removedPaths.includes(p));
      if (attachments.length !== message.attachments.length)
        await tx.update(mvpMessages).set({ attachments }).where(eq(mvpMessages.id, message.id));
    }
  });
  res.json(api.DeleteMvpItemResponse.parse({ deleted: true }));
}));
export default router;
