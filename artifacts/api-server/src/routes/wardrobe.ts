import { createHash } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AnalyzeGarmentBody,
  AnalyzeGarmentResponse,
  ChatAboutGarmentBody,
  ChatAboutGarmentResponse,
  GetWardrobeSummaryResponse,
  ListWardrobeItemsResponse,
  RecommendOutfitsBody,
  RecommendOutfitsResponse,
  SaveWardrobeItemBody,
  SaveWardrobeItemResponse,
  type WardrobeItem,
} from "@workspace/api-zod";
import { db, wardrobeItems, wardrobeUploads } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  analyzeGarmentPhotos,
  recommendOutfitsForItem,
  replyAboutGarment,
} from "../lib/wardrobeAi";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

router.use(requireAuth);

function userIdOr401(req: Request, res: Response): string | null {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.userId;
}

function asWardrobeItem(row: typeof wardrobeItems.$inferSelect): WardrobeItem {
  return {
    ...(row.record as WardrobeItem),
    id: row.id,
    createdAt: row.createdAt,
  } as WardrobeItem;
}

async function getOwnedItem(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(wardrobeItems)
    .where(and(eq(wardrobeItems.userId, userId), eq(wardrobeItems.id, id)))
    .limit(1);
  return row;
}

async function getOwnedUpload(userId: string, objectPath: string) {
  if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) {
    return null;
  }
  const [upload] = await db
    .select()
    .from(wardrobeUploads)
    .where(
      and(
        eq(wardrobeUploads.userId, userId),
        eq(wardrobeUploads.objectPath, objectPath),
      ),
    )
    .limit(1);
  return upload;
}

async function getOwnedPhoto(userId: string, objectPath: string) {
  const upload = await getOwnedUpload(userId, objectPath);
  if (!upload) {
    throw new Error("A photo is missing or does not belong to this account.");
  }
  if (!IMAGE_TYPES.has(upload.contentType)) {
    throw new Error(
      "For AI analysis, choose a JPEG, PNG, or WebP photo. HEIC files can’t be analyzed yet.",
    );
  }

  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const [bytes] = await file.download();
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) {
    throw new Error("The photo is empty or larger than 15 MB.");
  }
  if (metadata.contentType && metadata.contentType !== upload.contentType) {
    throw new Error("The uploaded photo type does not match its file details.");
  }
  return { contentType: upload.contentType, bytes };
}

router.post(
  "/wardrobe/analyze",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const parsed = AnalyzeGarmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please provide one to five valid photos." });
      return;
    }

    try {
      const images = await Promise.all(
        parsed.data.objectPaths.map((path) => getOwnedPhoto(userId, path)),
      );
      const analysis = AnalyzeGarmentResponse.parse(
        await analyzeGarmentPhotos(images, parsed.data.userNote),
      );
      res.json(analysis);
    } catch (error) {
      req.log.warn({ err: error }, "Garment analysis failed");
      const message =
        error instanceof Error ? error.message : "Garment analysis failed.";
      const status = message.includes("does not belong") || message.includes("missing")
        ? 400
        : 502;
      res.status(status).json({ error: message });
    }
  },
);

router.post(
  "/wardrobe/chat",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const parsed = ChatAboutGarmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please send a valid garment conversation." });
      return;
    }

    try {
      let savedItem: WardrobeItem | undefined;
      if (parsed.data.savedItemId) {
        const row = await getOwnedItem(userId, parsed.data.savedItemId);
        if (!row) {
          res.status(404).json({ error: "Saved garment not found." });
          return;
        }
        savedItem = asWardrobeItem(row);
      }

      const reply = ChatAboutGarmentResponse.parse(
        await replyAboutGarment(parsed.data, savedItem),
      );
      res.json(reply);
    } catch (error) {
      req.log.error({ err: error }, "Garment conversation failed");
      res.status(502).json({ error: "The stylist could not reply right now." });
    }
  },
);

router.get(
  "/wardrobe/items",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const rows = await db
      .select()
      .from(wardrobeItems)
      .where(eq(wardrobeItems.userId, userId))
      .orderBy(desc(wardrobeItems.createdAt))
      .limit(100);
    res.json(ListWardrobeItemsResponse.parse(rows.map(asWardrobeItem)));
  },
);

router.post(
  "/wardrobe/items",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const parsed = SaveWardrobeItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please review the garment details and try again." });
      return;
    }

    try {
      const photoPaths = [
        parsed.data.imagePath,
        ...parsed.data.additionalImagePaths,
      ];
      const uploads = await Promise.all(
        photoPaths.map((path) => getOwnedUpload(userId, path)),
      );
      if (uploads.some((upload) => !upload)) {
        res.status(400).json({ error: "A photo is missing or does not belong to this account." });
        return;
      }
      const image = await getOwnedPhoto(userId, parsed.data.imagePath);
      const imageDigest = createHash("sha256").update(image.bytes).digest("hex");

      if (!parsed.data.allowDuplicate) {
        const [duplicate] = await db
          .select({ id: wardrobeItems.id })
          .from(wardrobeItems)
          .where(
            and(
              eq(wardrobeItems.userId, userId),
              eq(wardrobeItems.imageDigest, imageDigest),
            ),
          )
          .limit(1);
        if (duplicate) {
          res.status(409).json({
            error: "This photo already appears in your wardrobe. Save another copy anyway?",
          });
          return;
        }
      }

      const [row] = await db
        .insert(wardrobeItems)
        .values({
          userId,
          imagePath: parsed.data.imagePath,
          additionalImagePaths: parsed.data.additionalImagePaths,
          record: parsed.data,
          imageDigest,
        })
        .returning();

      res.status(201).json(SaveWardrobeItemResponse.parse(asWardrobeItem(row)));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "A photo is missing or no longer available." });
        return;
      }
      req.log.error({ err: error }, "Saving wardrobe item failed");
      res.status(500).json({ error: "The garment could not be saved. Please try again." });
    }
  },
);

router.get(
  "/wardrobe/summary",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const rows = await db
      .select()
      .from(wardrobeItems)
      .where(eq(wardrobeItems.userId, userId))
      .orderBy(desc(wardrobeItems.createdAt))
      .limit(100);
    const items = rows.map(asWardrobeItem);
    const categoryCounts = items.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {});
    res.json(
      GetWardrobeSummaryResponse.parse({
        totalItems: items.length,
        categoryCounts,
        recentItems: items.slice(0, 4),
      }),
    );
  },
);

router.post(
  "/wardrobe/recommendations",
  async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOr401(req, res);
    if (!userId) return;

    const parsed = RecommendOutfitsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Please select a saved garment." });
      return;
    }

    const selectedRow = await getOwnedItem(userId, parsed.data.itemId);
    if (!selectedRow) {
      res.status(404).json({ error: "Saved garment not found." });
      return;
    }
    const wardrobeRows = await db
      .select()
      .from(wardrobeItems)
      .where(eq(wardrobeItems.userId, userId))
      .orderBy(desc(wardrobeItems.createdAt))
      .limit(100);
    const selected = asWardrobeItem(selectedRow);
    const wardrobe = wardrobeRows.map(asWardrobeItem);

    try {
      const result = RecommendOutfitsResponse.parse(
        await recommendOutfitsForItem(selected, wardrobe, parsed.data),
      );
      res.json(result);
    } catch (error) {
      req.log.error({ err: error }, "Outfit recommendation failed");
      res.status(502).json({ error: "Outfit ideas are unavailable right now. Please try again." });
    }
  },
);

export default router;
