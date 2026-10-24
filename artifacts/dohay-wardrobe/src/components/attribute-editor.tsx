import type { MvpAttributes } from "@workspace/api-client-react";
import { setUserAttribute, CATEGORIES, FORMALITIES, LAYER_ROLES, splitList } from "../lib/mvp-utils";

type Props = {
  value: MvpAttributes;
  onChange: (next: MvpAttributes) => void;
  disabled?: boolean;
  includeAvailability?: boolean;
};

function SourceNote({ attributes, attribute }: { attributes: MvpAttributes; attribute: string }) {
  const source = attributes.attributeSources?.find((entry) => entry.attribute === attribute)?.source;
  if (!source) return null;
  const label = source === "visually_observed" ? "Visually observed"
    : source === "AI_estimate" ? "Estimate · check if important"
      : source === "user_provided" ? "Provided by you"
        : source === "label_verified" ? "Label verified"
          : "Externally verified";
  return <span className={`source-note ${source === "user_provided" ? "user" : ""}`}>{label}</span>;
}

export function AttributeEditor({ value, onChange, disabled = false, includeAvailability = true }: Props) {
  const update = <K extends keyof MvpAttributes>(key: K, next: MvpAttributes[K]) =>
    onChange(setUserAttribute(value, key, next));

  return (
    <div className="draft-fields">
      <div className="field">
        <label htmlFor="garment-category">Category</label>
        <select id="garment-category" disabled={disabled} value={value.category} onChange={(e) => update("category", e.target.value as MvpAttributes["category"])}>
          {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <SourceNote attributes={value} attribute="category" />
      </div>
      <div className="field">
        <label htmlFor="garment-subcategory">Garment name</label>
        <input id="garment-subcategory" disabled={disabled} value={value.subcategory} onChange={(e) => update("subcategory", e.target.value)} placeholder="e.g. linen shirt" />
        <SourceNote attributes={value} attribute="subcategory" />
      </div>
      <div className="field">
        <label htmlFor="garment-colors">Colors</label>
        <input id="garment-colors" disabled={disabled} value={value.colors.join(", ")} onChange={(e) => update("colors", splitList(e.target.value))} placeholder="olive, cream" />
        <SourceNote attributes={value} attribute="colors" />
      </div>
      <div className="field">
        <label htmlFor="garment-pattern">Pattern</label>
        <input id="garment-pattern" disabled={disabled} value={value.pattern ?? ""} onChange={(e) => update("pattern", e.target.value || null)} placeholder="solid, stripe, floral…" />
        <SourceNote attributes={value} attribute="pattern" />
      </div>
      <div className="field">
        <label htmlFor="garment-formality">Formality</label>
        <select id="garment-formality" disabled={disabled} value={value.formality} onChange={(e) => update("formality", e.target.value as MvpAttributes["formality"])}>
          {FORMALITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <SourceNote attributes={value} attribute="formality" />
      </div>
      <div className="field">
        <label htmlFor="garment-layer">Layer role</label>
        <select id="garment-layer" disabled={disabled} value={value.layerRole} onChange={(e) => update("layerRole", e.target.value as MvpAttributes["layerRole"])}>
          {LAYER_ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <SourceNote attributes={value} attribute="layerRole" />
      </div>
      <div className="field">
        <label htmlFor="garment-occasions">Occasions</label>
        <input id="garment-occasions" disabled={disabled} value={value.occasionTags.join(", ")} onChange={(e) => update("occasionTags", splitList(e.target.value))} placeholder="work, weekend" />
        <SourceNote attributes={value} attribute="occasionTags" />
      </div>
      <div className="field">
        <label htmlFor="garment-seasons">Seasons</label>
        <input id="garment-seasons" disabled={disabled} value={value.seasonTags.join(", ")} onChange={(e) => update("seasonTags", splitList(e.target.value))} placeholder="spring, autumn" />
        <SourceNote attributes={value} attribute="seasonTags" />
      </div>
      <div className="field">
        <label htmlFor="garment-style">Style notes</label>
        <input id="garment-style" disabled={disabled} value={value.styleTags.join(", ")} onChange={(e) => update("styleTags", splitList(e.target.value))} placeholder="minimal, relaxed" />
        <SourceNote attributes={value} attribute="styleTags" />
      </div>
      <div className="field">
        <label htmlFor="garment-fabric">Fabric estimate</label>
        <input id="garment-fabric" disabled={disabled} value={value.fabricEstimate ?? ""} onChange={(e) => update("fabricEstimate", e.target.value || null)} placeholder="AI estimate — please check" />
        <SourceNote attributes={value} attribute="fabricEstimate" />
      </div>
      <div className="field">
        <label htmlFor="garment-brand">Brand</label>
        <input id="garment-brand" disabled={disabled} value={value.brand ?? ""} onChange={(e) => update("brand", e.target.value || null)} placeholder="Optional" />
        <SourceNote attributes={value} attribute="brand" />
      </div>
      <div className="field">
        <label htmlFor="garment-size">Size</label>
        <input id="garment-size" disabled={disabled} value={value.size ?? ""} onChange={(e) => update("size", e.target.value || null)} placeholder="Optional" />
        <SourceNote attributes={value} attribute="size" />
      </div>
      <div className="field wide">
        <label htmlFor="garment-notes">Your notes</label>
        <textarea id="garment-notes" disabled={disabled} value={value.notes ?? ""} onChange={(e) => update("notes", e.target.value || null)} placeholder="Fit, care, or anything worth remembering" />
        <SourceNote attributes={value} attribute="notes" />
      </div>
      {includeAvailability && <label className="availability-toggle field wide">
        <span>Available to wear</span>
        <input type="checkbox" disabled={disabled} checked={value.isAvailable} onChange={(e) => update("isAvailable", e.target.checked)} />
      </label>}
    </div>
  );
}
