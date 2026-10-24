import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  GarmentAnalysis,
  GarmentChatInput,
  OutfitRequest,
  WardrobeItem,
} from "@workspace/api-zod";

const MODEL = "gpt-5.6-terra";

function responseJson(content: string | null): unknown {
  if (!content) {
    throw new Error("The stylist did not return a response.");
  }
  return JSON.parse(content) as unknown;
}

export async function analyzeGarmentPhotos(
  images: Array<{ contentType: string; bytes: Buffer }>,
  userNote?: string,
): Promise<unknown> {
  const imageParts = images.map(({ contentType, bytes }) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${contentType};base64,${bytes.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are DOHAY, a careful personal wardrobe stylist.",
          "Analyze only details that are visible in the supplied garment photos.",
          "Separate visually observed facts from estimates using attributeSources.",
          "Never claim to know exact fiber composition, GSM, brand, price, or manufacturing quality from appearance alone.",
          "Use fabricEstimate only for a cautious visual impression such as 'lightweight woven appearance'; say 'unclear' when uncertain.",
          "Do not infer a brand from logos unless the logo is clearly legible; even then mark it visually_observed, not externally_verified.",
          "If a care/composition label would resolve uncertainty, set labelPhotoSuggestion to true.",
          "Return JSON only, matching the requested garment analysis fields exactly.",
          "For every attributeSources entry, source must be visually_observed or AI_estimate.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Describe this garment. ${userNote ? `User context: ${userNote}` : ""}\nReturn fields: category, subtype, primaryColor, secondaryColors, pattern, designDetails, silhouette, fitEstimate, style, fabricEstimate, constructionFeatures, occasions, seasons, confidenceNote, labelPhotoSuggestion, attributeSources.`,
          },
          ...imageParts,
        ],
      },
    ],
  });

  return responseJson(response.choices[0]?.message.content ?? null);
}

export async function replyAboutGarment(
  input: GarmentChatInput,
  savedItem?: WardrobeItem,
): Promise<unknown> {
  const analysisContext = JSON.stringify(input.analysis);
  const savedItemContext = savedItem
    ? `\nSaved item details (use these over chat history): ${JSON.stringify(savedItem)}`
    : "";
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: [
          "You are DOHAY, a warm, concise wardrobe stylist.",
          "Use the garment analysis and the conversation to help refine useful details.",
          "Ask at most one useful follow-up question at a time; do not interrogate the user about every field.",
          "Unknown values may stay unknown. Record a material or brand as user-reported unless a readable label photo verifies it.",
          "Never present exact fiber composition, GSM, brand, price, or quality as visually certain.",
          `Current analysis: ${analysisContext}${savedItemContext}`,
        ].join(" "),
      },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  });

  const reply = response.choices[0]?.message.content?.trim();
  if (!reply) {
    throw new Error("The stylist did not return a response.");
  }
  return { reply };
}

export async function recommendOutfitsForItem(
  item: WardrobeItem,
  wardrobe: WardrobeItem[],
  request: OutfitRequest,
): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are DOHAY, a practical personal stylist.",
          "Suggest three distinct, wearable outfits centered on the selected saved garment.",
          "Use other pieces from the user's wardrobe when they fit; clearly describe any suggested item not found in the wardrobe as an optional addition.",
          "Do not invent garments as if the user owns them.",
          "Keep recommendations specific to the prompt when one is provided.",
          "Return JSON only with introduction and outfits; each outfit has name, pieces (string array), and rationale.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          selectedItem: item,
          wardrobe,
          request: request.prompt ?? "Suggest versatile ways to wear this item.",
        }),
      },
    ],
  });

  return responseJson(response.choices[0]?.message.content ?? null);
}

export function formatGarmentAnalysis(value: unknown): GarmentAnalysis {
  return value as GarmentAnalysis;
}
