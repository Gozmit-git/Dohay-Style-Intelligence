import type {
  GarmentChatInput,
  OutfitRequest,
  WardrobeItem,
} from "@workspace/api-zod";

const aiServiceUrl = (
  process.env.DOHAY_AI_INTERNAL_URL ?? "http://127.0.0.1:8765"
).replace(/\/+$/, "");

async function postToAiService<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${aiServiceUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`DOHAY AI service returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export function analyzeGarmentPhotos(
  images: Array<{ contentType: string; bytes: Buffer }>,
  userNote?: string,
): Promise<unknown> {
  return postToAiService("/analyze", {
    images: images.map(({ contentType, bytes }) => ({
      contentType,
      dataBase64: bytes.toString("base64"),
    })),
    userNote,
  });
}

export function replyAboutGarment(
  input: GarmentChatInput,
  savedItem?: WardrobeItem,
): Promise<unknown> {
  return postToAiService("/chat", {
    analysis: input.analysis,
    messages: input.messages,
    savedItem: savedItem ?? null,
  });
}

export function recommendOutfitsForItem(
  item: WardrobeItem,
  wardrobe: WardrobeItem[],
  request: OutfitRequest,
): Promise<unknown> {
  return postToAiService("/recommendations", {
    selectedItem: item,
    wardrobe,
    prompt: request.prompt ?? null,
  });
}
