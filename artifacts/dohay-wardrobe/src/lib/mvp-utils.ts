import type { MvpAttributes, MvpItem, MvpSource } from "@workspace/api-client-react";

export const imageUrl = (path?: string | null) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `/api/storage${path.startsWith("/") ? path : `/${path}`}`;
};

export const splitList = (value: string) =>
  value.split(",").map((part) => part.trim()).filter(Boolean);

export const displayName = (attributes: MvpAttributes) =>
  attributes.subcategory?.trim() || attributes.category.replace("_", " ");

export const sourceFor = (attributes: MvpAttributes, attribute: string) =>
  attributes.attributeSources?.find((entry) => entry.attribute === attribute)?.source;

export function setUserAttribute<K extends keyof MvpAttributes>(
  attributes: MvpAttributes,
  key: K,
  value: MvpAttributes[K],
): MvpAttributes {
  const sourceValue = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const sources = (attributes.attributeSources ?? []).filter((entry) => entry.attribute !== key);
  const userSource: MvpSource = {
    attribute: String(key),
    value: sourceValue,
    source: "user_provided",
  };
  return { ...attributes, [key]: value, attributeSources: [...sources, userSource] };
}

export function garmentsById(items: MvpItem[] = []) {
  return new Map(items.map((item) => [item.id, item]));
}

export const DRESS_CODES = [
  ["casual", "Casual"],
  ["smart_casual", "Smart casual"],
  ["business", "Business"],
  ["formal", "Formal"],
] as const;

export const CATEGORIES = [
  ["top", "Top"],
  ["bottom", "Bottom"],
  ["one_piece", "One piece"],
  ["outerwear", "Outerwear"],
  ["footwear", "Footwear"],
  ["accessory", "Accessory"],
] as const;

export const LAYER_ROLES = [
  ["base", "Base"],
  ["bottom", "Bottom"],
  ["one_piece", "One piece"],
  ["outer", "Outer layer"],
  ["footwear", "Footwear"],
  ["accessory", "Accessory"],
] as const;

export const FORMALITIES = [
  ["casual", "Casual"],
  ["smart_casual", "Smart casual"],
  ["business", "Business"],
  ["formal", "Formal"],
] as const;
