import { and, eq, asc, desc } from "drizzle-orm";
import {
  db, mvpProfiles, mvpThreads, mvpMessages, mvpJobs, mvpOutfits, mvpOutfitItems,
  wardrobeItems, wardrobeUploads,
} from "@workspace/db";
import type {
  MvpAttributes, MvpContext, MvpDraft, MvpItem, MvpJob, MvpMessage,
  MvpOutfit, MvpProfile, MvpThread,
} from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";
import { MvpError } from "./mvpError";
export { MvpError } from "./mvpError";

export const storage = new ObjectStorageService();
export function validId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
    throw new MvpError(404, "This resource was not found.");
  return id;
}
export async function profileFor(userId: string): Promise<MvpProfile> {
  const [row] = await db.select().from(mvpProfiles).where(eq(mvpProfiles.userId, userId));
  return {
    id: userId, stylePreferences: [], preferredPalette: [], comfortRestrictions: [],
    defaultDressCode: null, selfiePath: null,
    ...row?.data, imageConsent: Boolean(row?.consentAt),
  } as MvpProfile;
}
export async function consentFor(userId: string): Promise<void> {
  if (!(await profileFor(userId)).imageConsent)
    throw new MvpError(403, "Please give image-processing consent in your profile before uploading or analyzing personal photos.");
}
export async function threadFor(userId: string, id: string) {
  const [row] = await db.select().from(mvpThreads).where(and(
    eq(mvpThreads.id, validId(id)), eq(mvpThreads.userId, userId),
  ));
  if (!row) throw new MvpError(404, "Conversation not found.");
  return row;
}
export function threadApi(row: typeof mvpThreads.$inferSelect): MvpThread {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}
export function messageApi(row: typeof mvpMessages.$inferSelect): MvpMessage {
  return {
    id: row.id, threadId: row.threadId, role: row.role as "user" | "assistant",
    content: row.content, attachments: row.attachments,
    jobId: typeof row.meta.jobId === "string" ? row.meta.jobId : null,
    outfitIds: (row.meta.outfitIds as string[]) ?? [],
    intent: (row.meta.intent as MvpMessage["intent"]) ?? "chat",
    suggestedContext: (row.meta.suggestedContext as MvpContext) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function addMessage(
  userId: string, threadId: string, role: "user" | "assistant", content: string,
  attachments: string[] = [], meta: Record<string, unknown> = {},
): Promise<MvpMessage> {
  const [row] = await db.insert(mvpMessages).values({
    userId, threadId, role, content, attachments, meta,
  }).returning();
  await db.update(mvpThreads).set({ updatedAt: new Date() }).where(eq(mvpThreads.id, threadId));
  return messageApi(row);
}
export async function messagesFor(userId: string, threadId: string): Promise<MvpMessage[]> {
  await threadFor(userId, threadId);
  return (await db.select().from(mvpMessages).where(and(
    eq(mvpMessages.threadId, threadId), eq(mvpMessages.userId, userId),
  )).orderBy(asc(mvpMessages.createdAt))).map(messageApi);
}
export function legacyAttributes(record: Record<string, unknown>): MvpAttributes {
  if (record.mvp) return record.mvp as MvpAttributes;
  const text = `${record.category} ${record.subtype}`.toLowerCase();
  const category: MvpAttributes["category"] = /shoe|boot|sneaker|sandal|loafer/.test(text)
    ? "footwear" : /jacket|coat|blazer|outer/.test(text) ? "outerwear"
    : /dress|jumpsuit|one.piece/.test(text) ? "one_piece"
    : /pant|trouser|skirt|short|jean|bottom/.test(text) ? "bottom"
    : /bag|belt|hat|watch|accessor|scarf|jewel/.test(text) ? "accessory" : "top";
  const roles = { top: "base", bottom: "bottom", one_piece: "one_piece", outerwear: "outer", footwear: "footwear", accessory: "accessory" } as const;
  return {
    category, subcategory: String(record.subtype || record.category || "Garment"),
    colors: [String(record.primaryColor || "Unknown"), ...((record.secondaryColors as string[]) || [])],
    pattern: String(record.pattern || "") || null,
    formality: /formal|business/.test(String(record.style).toLowerCase()) ? "business" : /smart/.test(String(record.style).toLowerCase()) ? "smart_casual" : "casual",
    layerRole: roles[category], occasionTags: (record.occasions as string[]) || [],
    seasonTags: (record.seasons as string[]) || [], styleTags: record.style ? [String(record.style)] : [],
    fabricEstimate: (record.fabricEstimate as string) || null, brand: (record.brand as string) || null,
    fabricComposition: (record.fabricComposition as string) || null,
    size: (record.size as string) || null, notes: (record.notes as string) || null,
    isAvailable: true, confidence: 0.6,
    attributeSources: (record.attributeSources as MvpAttributes["attributeSources"]) || [],
  };
}
export function itemApi(row: typeof wardrobeItems.$inferSelect): MvpItem {
  return {
    id: row.id, imagePaths: [row.imagePath, ...row.additionalImagePaths],
    attributes: legacyAttributes(row.record), createdAt: row.createdAt.toISOString(),
  };
}
export async function itemsFor(userId: string): Promise<MvpItem[]> {
  return (await db.select().from(wardrobeItems).where(eq(wardrobeItems.userId, userId))
    .orderBy(desc(wardrobeItems.createdAt))).map(itemApi);
}
export function legacyRecord(a: MvpAttributes, imagePaths: string[]): Record<string, unknown> {
  return {
    imagePath: imagePaths[0], additionalImagePaths: imagePaths.slice(1),
    category: a.category, subtype: a.subcategory, primaryColor: a.colors[0],
    secondaryColors: a.colors.slice(1), pattern: a.pattern || "", designDetails: [],
    silhouette: "", fit: null, style: a.styleTags.join(", "), fabricEstimate: a.fabricEstimate,
    fabricComposition: a.fabricComposition ?? null, constructionFeatures: [], occasions: a.occasionTags,
    seasons: a.seasonTags, brand: a.brand, size: a.size, purchasePrice: null,
    purchaseDate: null, notes: a.notes, attributeSources: a.attributeSources,
    allowDuplicate: false, mvp: a,
  };
}
export async function uploadsFor(userId: string, paths: string[]) {
  return Promise.all(paths.map(async (objectPath) => {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath))
      throw new MvpError(400, "Invalid private photo reference.");
    const [row] = await db.select().from(wardrobeUploads).where(and(
      eq(wardrobeUploads.userId, userId), eq(wardrobeUploads.objectPath, objectPath),
    ));
    if (!row) throw new MvpError(404, "A photo was not found in your account.");
    return row;
  }));
}
export async function imageDataFor(userId: string, paths: string[]) {
  const uploads = await uploadsFor(userId, paths);
  return Promise.all(uploads.map(async (upload) => {
    const file = await storage.getObjectEntityFile(upload.objectPath);
    const [bytes] = await file.download();
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new MvpError(400, "Each image must be non-empty and no larger than 10 MB.");
    return { contentType: upload.contentType, dataBase64: bytes.toString("base64") };
  }));
}
export function jobApi(row: typeof mvpJobs.$inferSelect): MvpJob {
  return {
    id: row.id, status: row.status as MvpJob["status"], threadId: row.threadId,
    drafts: (row.result.drafts as MvpDraft[]) ?? [],
    warnings: (row.result.warnings as string[]) ?? [], error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function outfitApi(row: typeof mvpOutfits.$inferSelect): Promise<MvpOutfit> {
  const links = await db.select().from(mvpOutfitItems).where(eq(mvpOutfitItems.outfitId, row.id));
  return {
    id: row.id, itemIds: links.map((x) => x.itemId), context: row.context as unknown as MvpContext,
    score: row.score, breakdown: row.breakdown as unknown as MvpOutfit["breakdown"],
    explanation: row.explanation, saved: row.saved, feedback: row.feedback,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function outfitFor(userId: string, id: string) {
  const [row] = await db.select().from(mvpOutfits).where(and(
    eq(mvpOutfits.id, validId(id)), eq(mvpOutfits.userId, userId),
  ));
  if (!row) throw new MvpError(404, "Outfit not found.");
  return row;
}
