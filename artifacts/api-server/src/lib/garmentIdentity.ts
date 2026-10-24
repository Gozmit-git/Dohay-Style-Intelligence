import { createHash } from "node:crypto";

export function garmentIdentity(sourceHash: string, category: string, subcategory: string, occurrence: number) {
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  return {
    // Label wording can vary between scans; a repeat must not erase edits or add duplicates.
    digest: hash(`auto:${sourceHash}:${category}:${occurrence}`),
    legacyDigest: hash(sourceHash + category + subcategory.toLowerCase() + (occurrence ? `:${occurrence}` : "")),
  };
}
