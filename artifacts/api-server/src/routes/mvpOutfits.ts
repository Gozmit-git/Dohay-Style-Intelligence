import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, mvpFeedback, mvpOutfits, mvpOutfitItems } from "@workspace/db";
import * as api from "@workspace/api-zod";
import type { MvpContext, MvpOutfit } from "@workspace/api-zod";
import { handler, input, param } from "../lib/mvpHttp";
import { addMessage, itemsFor, MvpError, outfitApi, outfitFor, profileFor, threadFor } from "../lib/mvpData";
import { generateOutfits, scoreCombination, validCombination, weatherContext, type OutfitHistory, type ScoredOutfit } from "../lib/outfitEngine";

const router = Router();
async function historyFor(userId: string): Promise<OutfitHistory> {
  const rows = await db.select().from(mvpFeedback).where(eq(mvpFeedback.userId, userId))
    .orderBy(desc(mvpFeedback.createdAt)).limit(100);
  if (!rows.length) return [];
  const links = await db.select().from(mvpOutfitItems).where(inArray(mvpOutfitItems.outfitId, rows.map((r) => r.outfitId)));
  return rows.map((r) => ({
    itemIds: links.filter((l) => l.outfitId === r.outfitId).map((l) => l.itemId),
    action: r.action, createdAt: r.createdAt,
  }));
}
async function persistOutfit(userId: string, context: MvpContext, candidate: ScoredOutfit): Promise<MvpOutfit> {
  const row = await db.transaction(async (tx) => {
    const [outfit] = await tx.insert(mvpOutfits).values({
      userId, context: { ...context }, score: candidate.score,
      breakdown: { ...candidate.breakdown }, explanation: candidate.explanation,
    }).returning();
    await tx.insert(mvpOutfitItems).values(candidate.items.map((i) => ({ outfitId: outfit.id, itemId: i.id })));
    return outfit;
  });
  return outfitApi(row);
}
router.get("/outfits", handler(async (_req, res, userId) => {
  const rows = await db.select().from(mvpOutfits).where(eq(mvpOutfits.userId, userId))
    .orderBy(desc(mvpOutfits.createdAt)).limit(200);
  res.json(api.ListMvpOutfitsResponse.parse(await Promise.all(rows.map(outfitApi))));
}));
router.post("/outfits/recommend", handler(async (req, res, userId) => {
  const data = input(api.RecommendMvpOutfitsBody, req.body);
  if (!data.context.occasion.trim()) throw new MvpError(400, "Confirm the occasion before generating outfits.");
  if (data.threadId) await threadFor(userId, data.threadId);
  const { context, warnings } = await weatherContext(data.context);
  // Precise location is used transiently for weather, not retained in outfit history.
  delete context.latitude;
  delete context.longitude;
  const items = await itemsFor(userId);
  const profile = await profileFor(userId);
  const candidates = generateOutfits(items, context, profile, await historyFor(userId));
  if (!items.length) warnings.push("Your wardrobe is empty. Add and confirm some clothes and footwear first.");
  else if (!candidates.length) warnings.push("There are not enough available, compatible items for these constraints. You need a top and bottom (or one-piece), footwear, and an outer layer for cold outdoor conditions or formal separates. Add suitable items or adjust the dress code, exclusions, or weather.");
  else if (candidates.length < 3) warnings.push(`Found ${candidates.length} distinct valid outfit${candidates.length === 1 ? "" : "s"}. I won’t invent clothes to fill the remaining boards.`);
  const outfits = await Promise.all(candidates.map((candidate) => persistOutfit(userId, context, candidate)));
  if (data.threadId) await addMessage(userId, data.threadId, "assistant",
    outfits.length ? `Here ${outfits.length === 1 ? "is one outfit" : `are ${outfits.length} outfits`} assembled only from your available wardrobe, ranked for ${context.occasion}.`
      : warnings.join(" "),
    [], { intent: "recommend", outfitIds: outfits.map((o) => o.id), suggestedContext: context });
  res.json(api.RecommendMvpOutfitsResponse.parse({ outfits, context, warnings }));
}));
router.post("/outfits/:outfitId/save", handler(async (req, res, userId) => {
  const row = await outfitFor(userId, param(req, "outfitId"));
  const outfit = await outfitApi(row);
  const wardrobe = await itemsFor(userId);
  const selected = outfit.itemIds.map((id) => wardrobe.find((i) => i.id === id)).filter((i) => i !== undefined);
  if (selected.length !== outfit.itemIds.length || !validCombination(selected, outfit.context, await profileFor(userId)))
    throw new MvpError(409, "This outfit no longer meets your current availability or preferences. Generate fresh options.");
  const [updated] = await db.update(mvpOutfits).set({ saved: true })
    .where(and(eq(mvpOutfits.id, row.id), eq(mvpOutfits.userId, userId))).returning();
  res.json(api.SaveMvpOutfitResponse.parse(await outfitApi(updated)));
}));
router.post("/outfits/:outfitId/swap", handler(async (req, res, userId) => {
  const row = await outfitFor(userId, param(req, "outfitId"));
  const outfit = await outfitApi(row);
  const data = input(api.SwapMvpOutfitItemBody, req.body);
  if (!outfit.itemIds.includes(data.itemId) || outfit.itemIds.includes(data.replacementItemId))
    throw new MvpError(400, "Choose an item in this outfit and a different replacement.");
  const wardrobe = await itemsFor(userId);
  const old = wardrobe.find((i) => i.id === data.itemId);
  const replacement = wardrobe.find((i) => i.id === data.replacementItemId);
  if (!old || !replacement) throw new MvpError(404, "The replacement garment was not found in your wardrobe.");
  if (old.attributes.layerRole !== replacement.attributes.layerRole)
    throw new MvpError(400, "Choose a replacement with the same layering role.");
  const ids = outfit.itemIds.map((id) => id === data.itemId ? replacement.id : id);
  const selected = ids.map((id) => wardrobe.find((i) => i.id === id)).filter((i) => i !== undefined);
  if (selected.length !== ids.length) throw new MvpError(400, "A garment is no longer available.");
  const candidate = scoreCombination(selected, outfit.context, await profileFor(userId), await historyFor(userId));
  await db.transaction(async (tx) => {
    await tx.delete(mvpOutfitItems).where(and(eq(mvpOutfitItems.outfitId, row.id), eq(mvpOutfitItems.itemId, data.itemId)));
    await tx.insert(mvpOutfitItems).values({ outfitId: row.id, itemId: replacement.id });
    await tx.update(mvpOutfits).set({
      score: candidate.score, breakdown: { ...candidate.breakdown }, explanation: candidate.explanation,
    }).where(eq(mvpOutfits.id, row.id));
    await tx.insert(mvpFeedback).values({ userId, outfitId: row.id, action: "swap" });
  });
  res.json(api.SwapMvpOutfitItemResponse.parse(await outfitApi(await outfitFor(userId, row.id))));
}));
router.post("/outfits/:outfitId/feedback", handler(async (req, res, userId) => {
  const row = await outfitFor(userId, param(req, "outfitId"));
  const data = input(api.RecordMvpOutfitFeedbackBody, req.body);
  await db.transaction(async (tx) => {
    await tx.insert(mvpFeedback).values({ userId, outfitId: row.id, action: data.action });
    await tx.update(mvpOutfits).set({ feedback: data.action }).where(eq(mvpOutfits.id, row.id));
  });
  res.json(api.RecordMvpOutfitFeedbackResponse.parse(await outfitApi(await outfitFor(userId, row.id))));
}));
export default router;
