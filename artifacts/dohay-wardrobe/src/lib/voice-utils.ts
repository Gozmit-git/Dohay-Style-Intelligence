export function appendDictation(draft: string, transcript: string): string {
  return [draft.trimEnd(), transcript.trim()].filter(Boolean).join(" ").slice(0, 4000);
}

export function speechChunks(text: string, maxLength = 160): string[] {
  const clean = text.replace(/https?:\/\/\S+/g, "link").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > maxLength) {
    const space = remaining.lastIndexOf(" ", maxLength);
    const cut = space > 0 ? space : maxLength;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
