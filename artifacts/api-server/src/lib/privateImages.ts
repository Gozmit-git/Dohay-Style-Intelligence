import { eq } from "drizzle-orm";
import { db, wardrobeUploads } from "@workspace/db";
import { storage } from "./mvpData";
import { logger } from "./logger";

export async function storePrivateImage(userId: string, image: { dataBase64: string; contentType: string }, name: string) {
  const bytes = Buffer.from(image.dataBase64, "base64");
  if (image.contentType !== "image/png" || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.length > 10 * 1024 * 1024)
    throw new Error("The generated item image was invalid.");
  const url = await storage.getObjectEntityUploadURL();
  const path = storage.normalizeObjectEntityPath(url);
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: bytes });
  if (!response.ok) throw new Error("The private image could not be saved. Please retry.");
  try {
    await db.insert(wardrobeUploads).values({ userId, objectPath: path, contentType: "image/png", size: bytes.length, originalName: name });
  } catch (error) {
    await discardPrivateImage(path);
    throw error;
  }
  return path;
}

export async function discardPrivateImage(path: string) {
  try {
    await (await storage.getObjectEntityFile(path)).delete({ ignoreNotFound: true });
    await db.delete(wardrobeUploads).where(eq(wardrobeUploads.objectPath, path));
  } catch (error) { logger.warn({ err: error }, "Unused private image cleanup failed"); }
}
