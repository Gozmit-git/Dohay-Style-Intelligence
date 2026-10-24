import type { MvpContext, MvpItem, MvpProfile, MvpScoreBreakdown } from "@workspace/api-zod";
import { MvpError } from "./mvpError";

const rank = { casual: 0, smart_casual: 1, business: 2, formal: 3 } as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const key = (items: MvpItem[]) => items.map((i) => i.id).sort().join(":");
export type OutfitHistory = { itemIds: string[]; action: string; createdAt: Date }[];
export type ScoredOutfit = { items: MvpItem[]; score: number; breakdown: MvpScoreBreakdown; explanation: string };

function words(item: MvpItem): string {
  const a = item.attributes;
  return [a.category, a.subcategory, a.pattern, a.fabricEstimate, ...a.colors, ...a.styleTags,
    ...a.occasionTags, ...a.seasonTags].join(" ").toLowerCase().replace(/_/g, " ");
}
function excludes(item: MvpItem, context: MvpContext, profile: MvpProfile): boolean {
  const text = words(item);
  return [...(context.exclusions || []), ...profile.comfortRestrictions].some((value) => {
    const tokens = value.toLowerCase().replace(/\b(no|avoid|without|please)\b/g, "").trim().split(/[,\s]+/);
    return tokens.filter((t) => t.length > 2).some((token) => text.includes(token.replace(/s$/, "")));
  });
}
function minimumRank(context: MvpContext): number {
  return Math.max(rank[context.dressCode], /client|interview|office|workplace|meeting/i.test(context.occasion) ? 1 : 0);
}
export function eligible(item: MvpItem, context: MvpContext, profile: MvpProfile): boolean {
  const a = item.attributes;
  if (!a.isAvailable || excludes(item, context, profile)) return false;
  if (a.layerRole !== "accessory") {
    const min = minimumRank(context);
    if (rank[a.formality] < min || (min <= 1 && rank[a.formality] > min + 1)) return false;
  }
  if (/gym|workout|jogging|running|sport/i.test(context.occasion) &&
      ["base", "bottom", "footwear"].includes(a.layerRole) &&
      !/sport|athlet|active|gym|sneaker|trainer|running|workout|jogger|legging|t.shirt|shorts/i.test(words(item))) return false;
  if (context.outdoor && (context.precipitation ?? 0) > 1 && a.layerRole === "footwear" &&
      /suede|sandal|flip.flop|slipper/.test(words(item))) return false;
  if ((context.temperature ?? 20) > 27 && a.layerRole === "outer" &&
      /heavy|winter|puffer|wool|fleece/.test(words(item))) return false;
  return true;
}
export function validCombination(items: MvpItem[], context: MvpContext, profile: MvpProfile): boolean {
  if (context.includeItemId && !items.some((i) => i.id === context.includeItemId)) return false;
  if (new Set(items.map((i) => i.id)).size !== items.length || !items.every((i) => eligible(i, context, profile))) return false;
  const count = (role: string) => items.filter((i) => i.attributes.layerRole === role).length;
  const core = (count("one_piece") === 1 && count("base") === 0 && count("bottom") === 0)
    || (count("one_piece") === 0 && count("base") === 1 && count("bottom") === 1);
  if (!core || count("footwear") !== 1 || count("outer") > 1 || count("accessory") > 1) return false;
  const cold = context.outdoor && context.temperature !== null && context.temperature !== undefined && context.temperature < 15;
  const formalSeparates = context.dressCode === "formal" && count("one_piece") === 0;
  if ((cold || formalSeparates) && count("outer") !== 1) return false;
  return true;
}
function colorFamily(color: string): string {
  const c = color.toLowerCase();
  if (/black|white|cream|ivory|beige|grey|gray|navy|brown|tan|neutral|khaki|denim/.test(c)) return "neutral";
  if (/red|pink|burgundy|maroon/.test(c)) return "red";
  if (/orange|coral|rust/.test(c)) return "orange";
  if (/yellow|gold|mustard/.test(c)) return "yellow";
  if (/green|olive|sage|mint/.test(c)) return "green";
  if (/blue|teal|cyan/.test(c)) return "blue";
  if (/purple|violet|lavender/.test(c)) return "purple";
  return "unknown";
}
export function scoreCombination(items: MvpItem[], context: MvpContext, profile: MvpProfile, history: OutfitHistory): ScoredOutfit {
  if (!validCombination(items, context, profile)) throw new MvpError(400, "That combination does not satisfy availability, occasion, dress-code, weather, or layering constraints.");
  const families = items.flatMap((i) => i.attributes.colors.slice(0, 1)).map(colorFamily);
  let pairs = 0, harmony = 0;
  for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) {
    pairs++;
    harmony += families[i] === "neutral" || families[j] === "neutral" ? 1
      : families[i] === families[j] ? 0.9 : families[i] === "unknown" || families[j] === "unknown" ? 0.5 : 0.65;
  }
  const occasionMatches = items.filter((i) => i.attributes.occasionTags.some((tag) =>
    context.occasion.toLowerCase().includes(tag.toLowerCase()) || tag.toLowerCase().includes(context.occasion.toLowerCase()))).length;
  const dressFit = items.filter((i) => i.attributes.layerRole !== "accessory")
    .map((i) => 1 - Math.abs(rank[i.attributes.formality] - minimumRank(context)) * 0.2);
  const occasionFit = clamp((dressFit.reduce((a, b) => a + b, 0) / Math.max(1, dressFit.length)) * 0.85
    + Math.min(1, occasionMatches / items.length) * 0.15);
  const knownWeather = context.temperature !== null && context.temperature !== undefined;
  const temp = context.temperature ?? 20;
  const seasonMatch = items.filter((i) => i.attributes.seasonTags.some((tag) =>
    temp < 15 ? /winter|cold|autumn|fall/i.test(tag) : temp > 25 ? /summer|warm|spring/i.test(tag) : /spring|autumn|fall|all|year/i.test(tag))).length;
  const weather = knownWeather ? clamp(0.65 + 0.35 * seasonMatch / items.length) : 0.5;
  const styleMatches = profile.stylePreferences.length
    ? items.filter((i) => profile.stylePreferences.some((style) => words(i).includes(style.toLowerCase()))).length / items.length : 0.5;
  const disliked = history.some((h) => h.action === "dislike" && [...h.itemIds].sort().join(":") === key(items));
  const repeated = history.filter((h) => h.action === "worn" && [...h.itemIds].sort().join(":") === key(items)).length;
  const liked = history.some((h) => h.action === "like" && [...h.itemIds].sort().join(":") === key(items));
  const layeringVariety = clamp(1 - Math.min(0.8, repeated * 0.3) - (disliked ? 0.5 : 0) + (liked ? 0.05 : 0));
  const paletteFit = profile.preferredPalette.length ? items.filter((i) => i.attributes.colors.some((c) =>
    profile.preferredPalette.some((p) => c.toLowerCase().includes(p.toLowerCase())))).length / items.length : 0.5;
  const breakdown = {
    occasionFit, compatibility: clamp(pairs ? harmony / pairs : 0.5), weather,
    style: clamp(styleMatches * 0.8 + paletteFit * 0.2), layeringVariety,
  };
  const score = clamp(occasionFit * .30 + breakdown.compatibility * .25 + weather * .20
    + breakdown.style * .15 + layeringVariety * .10);
  const names = items.map((i) => `${i.attributes.colors[0]} ${i.attributes.subcategory}`).join(", ");
  return {
    items, score, breakdown,
    explanation: `${names}. Meets your ${context.dressCode.replace(/_/g, " ")} dress code for ${context.occasion}. `
      + (knownWeather ? `Ranked for ${temp}°C${context.outdoor ? " outdoors" : " with indoor exposure"}. ` : "Weather was not supplied; use manual conditions to refine the ranking. ")
      + "Colour compatibility, your preferences, and recent wear contribute to the score. Scores are initial rules-based estimates, not trained fashion ratings.",
  };
}
export function generateOutfits(items: MvpItem[], context: MvpContext, profile: MvpProfile, history: OutfitHistory): ScoredOutfit[] {
  const filtered = items.filter((i) => eligible(i, context, profile));
  const byRole = (role: string) => filtered.filter((i) => i.attributes.layerRole === role).slice(0, 40);
  const cores: MvpItem[][] = byRole("one_piece").map((i) => [i]);
  for (const top of byRole("base")) for (const bottom of byRole("bottom")) cores.push([top, bottom]);
  const candidates: ScoredOutfit[] = [];
  const seen = new Set<string>();
  outer: for (const core of cores) for (const shoe of byRole("footwear")) {
    for (const coat of [null, ...byRole("outer")]) for (const accessory of [null, ...byRole("accessory").slice(0, 3)]) {
      const combination = [...core, shoe, ...(coat ? [coat] : []), ...(accessory ? [accessory] : [])];
      if (!validCombination(combination, context, profile)) continue;
      const k = key(combination);
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push(scoreCombination(combination, context, profile, history));
      if (candidates.length >= 4000) break outer;
    }
  }
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const selected: ScoredOutfit[] = [];
  for (const candidate of sorted) {
    const coreIds = candidate.items.filter((i) => ["base", "bottom", "one_piece", "footwear"].includes(i.attributes.layerRole)).map((i) => i.id).sort().join(":");
    if (selected.some((s) => s.items.filter((i) => ["base", "bottom", "one_piece", "footwear"].includes(i.attributes.layerRole)).map((i) => i.id).sort().join(":") === coreIds)) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected;
}
export async function weatherContext(input: MvpContext): Promise<{ context: MvpContext; warnings: string[] }> {
  const context: MvpContext = { exclusions: [], activities: "", outdoor: false, temperature: null, precipitation: null, weatherLabel: null, useWeather: false, ...input };
  const warnings: string[] = [];
  if (context.useWeather && context.latitude != null && context.longitude != null) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(context.latitude), longitude: String(context.longitude),
        current: "temperature_2m", daily: "precipitation_sum", forecast_days: "1", timezone: "auto",
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("Weather unavailable");
      const data = await response.json() as { current?: { temperature_2m?: number }; daily?: { precipitation_sum?: number[] } };
      if (typeof data.current?.temperature_2m !== "number") throw new Error("Incomplete forecast");
      context.temperature = data.current.temperature_2m;
      context.precipitation = data.daily?.precipitation_sum?.[0] ?? null;
      context.weatherLabel = "Today's local forecast · Open-Meteo";
    } catch {
      warnings.push("Weather could not be retrieved. Your manual conditions are used; you can change them and try again.");
      context.weatherLabel = context.temperature == null ? "Weather unavailable" : "Manual weather";
    }
  } else if (context.useWeather) {
    warnings.push("Location was not provided. Enter temperature and rain manually instead.");
  }
  if (context.temperature == null) warnings.push("No temperature was supplied. Weather ranking is neutral, not a forecast.");
  return { context, warnings };
}
