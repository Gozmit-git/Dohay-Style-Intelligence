import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, mvpJobs } from "@workspace/db";
import { UpdateMvpItemBody, type MvpDraft } from "@workspace/api-zod";
import { consentFor, imageDataFor, jobApi, MvpError, threadFor, uploadsFor } from "./mvpData";
import { postToAiService } from "./wardrobeAi";
import { logger } from "./logger";

const queue: string[] = [];
const active = new Set<string>();
let scheduled = false;

async function run(id: string): Promise<void> {
  const [job] = await db.select().from(mvpJobs).where(eq(mvpJobs.id, id));
  if (!job || job.status === "completed") return;
  try {
    await consentFor(job.userId);
    await db.update(mvpJobs).set({ status: "running", error: null, updatedAt: new Date() }).where(eq(mvpJobs.id, id));
    const images = await imageDataFor(job.userId, job.objectPaths);
    const result = await postToAiService<{
      garments: { imageIndices: number[]; attributes: unknown }[]; warnings: string[];
    }>("/scan", { images });
    if (!Array.isArray(result.garments)) throw new Error("The analysis response was incomplete. Please retry.");
    const drafts: MvpDraft[] = result.garments.slice(0, 30).map((detection) => {
      const imagePaths = [...new Set(detection.imageIndices.map((index) => {
        if (!Number.isInteger(index) || !job.objectPaths[index]) throw new Error("The analysis returned an invalid image reference.");
        return job.objectPaths[index];
      }))];
      if (!imagePaths.length) throw new Error("A detected garment has no photo.");
      return {
        id: randomUUID(), imagePaths,
        attributes: UpdateMvpItemBody.parse(detection.attributes),
        confirmedItemId: null,
      };
    });
    await db.update(mvpJobs).set({
      status: "completed", result: { drafts, warnings: result.warnings || [] },
      error: null, updatedAt: new Date(),
    }).where(eq(mvpJobs.id, id));
  } catch (error) {
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
