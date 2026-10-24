import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, LoaderCircle, LockKeyhole, Plus, ShieldCheck, X } from "lucide-react";
import type { CreateMvpUploadBodyContentType, MvpProfileInput } from "@workspace/api-client-react";
import {
  getGetMvpProfileQueryKey,
  useCreateMvpUpload,
  useGetMvpProfile,
  useSaveMvpProfile,
} from "@workspace/api-client-react";
import { imageUrl } from "../lib/mvp-utils";

const emptyProfile: MvpProfileInput = {
  stylePreferences: [],
  preferredPalette: [],
  comfortRestrictions: [],
  defaultDressCode: null,
  imageConsent: false,
  selfiePath: null,
};

const paletteOptions = [
  { name: "Ink", color: "#263c34" },
  { name: "Moss", color: "#758879" },
  { name: "Sage", color: "#a8b8a6" },
  { name: "Clay", color: "#c4866b" },
  { name: "Oat", color: "#dfcbb0" },
  { name: "Cream", color: "#f0e8d7" },
  { name: "Navy", color: "#424e64" },
  { name: "Rose", color: "#cf9e9e" },
];

export function ProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useGetMvpProfile({ query: { queryKey: getGetMvpProfileQueryKey() } });
  const saveProfile = useSaveMvpProfile();
  const createUpload = useCreateMvpUpload();
  const [form, setForm] = useState<MvpProfileInput>(emptyProfile);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [draftStyle, setDraftStyle] = useState("");
  const [draftRestriction, setDraftRestriction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const selfieInput = useRef<HTMLInputElement>(null);
  const profile = profileQuery.data;

  useEffect(() => {
    if (profile && initializedFor !== profile.id) {
      setForm({
        stylePreferences: [...profile.stylePreferences],
        preferredPalette: [...profile.preferredPalette],
        comfortRestrictions: [...profile.comfortRestrictions],
        defaultDressCode: profile.defaultDressCode,
        imageConsent: profile.imageConsent,
        selfiePath: profile.selfiePath,
      });
      setInitializedFor(profile.id);
    }
  }, [profile, initializedFor]);

  const save = () => {
    setError("");
    setNotice("");
    const payload = {
      ...form,
      selfiePath: form.imageConsent ? form.selfiePath : null,
    };
    saveProfile.mutate(
      { data: payload },
      {
        onSuccess: (saved) => {
          setForm({ ...saved, stylePreferences: [...saved.stylePreferences], preferredPalette: [...saved.preferredPalette], comfortRestrictions: [...saved.comfortRestrictions] });
          queryClient.setQueryData(getGetMvpProfileQueryKey(), saved);
          setNotice("Your preferences are saved.");
        },
        onError: () => setError("Your profile could not be saved. Please try again."),
      },
    );
  };

  const addValue = (key: "stylePreferences" | "comfortRestrictions", value: string, clear: (value: string) => void) => {
    const cleanValue = value.trim();
    if (!cleanValue) return;
    setForm((current) => current[key].some((entry) => entry.toLowerCase() === cleanValue.toLowerCase())
      ? current
      : { ...current, [key]: [...current[key], cleanValue] });
    clear("");
  };

  const uploadSelfie = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!form.imageConsent || !profile?.imageConsent) {
      setError("Save explicit image consent before uploading a personal photo.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The photo must be 10 MB or smaller.");
      return;
    }
    setUploadingSelfie(true);
    try {
      const target = await createUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as CreateMvpUploadBodyContentType } });
      const response = await fetch(target.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("upload");
      setForm((current) => ({ ...current, selfiePath: target.objectPath }));
      setNotice("Optional reference photo uploaded. Save your profile to keep it.");
    } catch {
      setError("The photo could not be uploaded. Try again.");
    } finally {
      setUploadingSelfie(false);
      if (selfieInput.current) selfieInput.current.value = "";
    }
  };

  return (
    <div className="page-content profile-page">
      <header className="page-topline">
        <div><span className="eyebrow">A few things worth remembering</span><h1 className="page-title">Your style notes.</h1><p className="page-subtitle">Keep only the preferences that help. Everything here is optional, editable, and yours to change.</p></div>
      </header>
      <div className="profile-layout">
        <section className="profile-form">
          <div className="profile-form-heading"><span className="profile-symbol"><LockKeyhole size={17} /></span><div><h2>Small preferences, better suggestions.</h2><p>DOHAY does not infer body measurements, gender, or sensitive traits. Tell it what you choose to share.</p></div></div>
          {profileQuery.isError && <div className="profile-query-error">Your last saved preferences could not be loaded. You can try again or enter a fresh profile below. <button type="button" onClick={() => profileQuery.refetch()}>Retry</button></div>}
          <div className="profile-section">
            <h3>How do you like to dress?</h3>
            <div className="chip-input-row"><input aria-label="Add a style preference" value={draftStyle} onChange={(event) => setDraftStyle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addValue("stylePreferences", draftStyle, setDraftStyle); } }} placeholder="Relaxed tailoring, vintage…" /><button type="button" className="icon-button" aria-label="Add style preference" onClick={() => addValue("stylePreferences", draftStyle, setDraftStyle)}><Plus size={15} /></button></div>
            <div className="preference-chips">{form.stylePreferences.map((style) => <span className="preference-chip" key={style}>{style}<button type="button" aria-label={`Remove ${style}`} onClick={() => setForm((current) => ({ ...current, stylePreferences: current.stylePreferences.filter((entry) => entry !== style) }))}><X size={12} /></button></span>)}</div>
          </div>
          <div className="profile-section">
            <h3>Colors you reach for</h3><p className="section-copy">A palette is a hint, not a rule.</p>
            <div className="palette-grid">{paletteOptions.map((option) => {
              const selected = form.preferredPalette.includes(option.name);
              return <button type="button" key={option.name} className={`palette-swatch ${selected ? "selected" : ""}`} style={{ backgroundColor: option.color }} title={option.name} aria-label={`${selected ? "Remove" : "Add"} ${option.name} to preferred palette`} aria-pressed={selected} onClick={() => setForm((current) => ({ ...current, preferredPalette: selected ? current.preferredPalette.filter((color) => color !== option.name) : [...current.preferredPalette, option.name] }))} />;
            })}</div>
            <div className="preference-chips">{form.preferredPalette.map((color) => <span className="tag" key={color}>{color}</span>)}</div>
          </div>
          <div className="profile-section">
            <h3>What would you rather avoid?</h3>
            <div className="chip-input-row"><input aria-label="Add a comfort restriction" value={draftRestriction} onChange={(event) => setDraftRestriction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addValue("comfortRestrictions", draftRestriction, setDraftRestriction); } }} placeholder="Scratchy fabrics, tight collars…" /><button type="button" className="icon-button" aria-label="Add comfort restriction" onClick={() => addValue("comfortRestrictions", draftRestriction, setDraftRestriction)}><Plus size={15} /></button></div>
            <div className="preference-chips">{form.comfortRestrictions.map((restriction) => <span className="preference-chip" key={restriction}>{restriction}<button type="button" aria-label={`Remove ${restriction}`} onClick={() => setForm((current) => ({ ...current, comfortRestrictions: current.comfortRestrictions.filter((entry) => entry !== restriction) }))}><X size={12} /></button></span>)}</div>
          </div>
          <div className="profile-section">
            <h3>Default dress code</h3>
            <div className="field"><label htmlFor="default-dress-code">Use this as a starting point only</label><select id="default-dress-code" value={form.defaultDressCode ?? ""} onChange={(event) => setForm((current) => ({ ...current, defaultDressCode: (event.target.value || null) as MvpProfileInput["defaultDressCode"] }))}><option value="">No default</option><option value="casual">Casual</option><option value="smart_casual">Smart casual</option><option value="business">Business</option><option value="formal">Formal</option></select></div>
          </div>
          <div className="profile-section">
            <h3>Optional personal reference photo</h3>
            <p>Not required for styling. This is not a virtual try-on, and no body measurements are inferred.</p>
            <div className="selfie-drop">
              {form.selfiePath ? <img className="selfie-thumb" src={imageUrl(form.selfiePath)} alt="Your optional private style reference" /> : <div className="selfie-thumb selfie-placeholder"><ImagePlus size={20} /></div>}
              <div><strong>{form.selfiePath ? "Reference photo added" : "No reference photo"}</strong><p>JPEG, PNG, or WebP · 10 MB max</p>
                <div className="profile-photo-actions">{form.imageConsent && profile?.imageConsent && <button type="button" className="button button-small button-quiet" onClick={() => selfieInput.current?.click()} disabled={uploadingSelfie}>{uploadingSelfie ? "Uploading…" : form.selfiePath ? "Replace photo" : "Choose photo"}</button>}{form.selfiePath && <button type="button" className="text-button" onClick={() => setForm((current) => ({ ...current, selfiePath: null }))}>Remove</button>}</div>
                <input ref={selfieInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void uploadSelfie(event.target.files?.[0])} />
              </div>
            </div>
          </div>
          <div className="profile-section">
            <h3>Your image permission</h3>
            <label className="consent-box"><input type="checkbox" checked={form.imageConsent} onChange={(event) => setForm((current) => ({ ...current, imageConsent: event.target.checked, selfiePath: event.target.checked ? current.selfiePath : null }))} /><span><strong>I allow DOHAY to process clothing and optional reference photos I choose to upload.</strong><br />Photo uploads are disabled until this is on and saved. Text chat remains available either way. You can withdraw this permission at any time.</span></label>
          </div>
          {(error || notice) && <div className={error ? "alert" : "profile-notice"}>{error || notice}</div>}
          <div className="form-actions profile-save-actions"><span className="profile-save-note"><ShieldCheck size={13} /> Private to your account</span><button type="button" className="button" disabled={saveProfile.isPending || uploadingSelfie} onClick={save}>{saveProfile.isPending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{saveProfile.isPending ? "Saving…" : "Save preferences"}</button></div>
        </section>
        <aside className="profile-aside">
          <div className="aside-orbit"><span /><span /><span /><strong>D</strong></div>
          <span className="eyebrow">Your closet, not a template</span>
          <h2>More you.<br />Less guessing.</h2>
          <p>Style preferences help DOHAY remember the details you want it to know. Your actual wardrobe remains the source of truth.</p>
          <div className="aside-rule" />
          <div className="aside-note"><ShieldCheck size={14} /><span>Photos are only processed after your permission. Wardrobe items save automatically with AI-estimated details you can edit afterward.</span></div>
        </aside>
      </div>
    </div>
  );
}
