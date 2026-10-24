import type { MvpStylingContext } from "@workspace/api-zod";

/** Human-readable context persists with the request; precise location never does. */
export function formatStylingContext(context: MvpStylingContext, warnings: string[] = []): string {
  const lines = [
    context.occasion?.trim() ? `Occasion: ${context.occasion.trim()}` : "",
    context.dressCode ? `Dress code: ${context.dressCode.replaceAll("_", " ")}` : "",
    context.activities?.trim() ? `Activities: ${context.activities.trim()}` : "",
    context.exclusions?.length ? `Avoid: ${context.exclusions.join(", ")}` : "",
    context.outdoor === undefined ? "" : `Outdoor exposure: ${context.outdoor ? "yes" : "no"}`,
    context.temperature == null ? "" : `Temperature: ${context.temperature} °C`,
    context.precipitation == null ? "" : `Precipitation: ${context.precipitation} mm`,
    context.weatherLabel ? `Weather: ${context.weatherLabel}` : "",
    ...warnings.map((warning) => `Weather note: ${warning}`),
  ].filter(Boolean);
  return lines.length ? `Styling details for this request:\n${lines.join("\n")}` : "";
}
