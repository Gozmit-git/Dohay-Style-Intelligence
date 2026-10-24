import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMvpProfileQueryKey, useSaveMvpProfile } from "@workspace/api-client-react";
import type { MvpProfile } from "@workspace/api-client-react";

const values = (text: string) => [...new Set(text.split(",").map((part) => part.trim()).filter(Boolean))];

export function ChatPreferences({ profile, disabled }: { profile?: MvpProfile; disabled: boolean }) {
  const queryClient = useQueryClient();
  const save = useSaveMvpProfile();
  const [styles, setStyles] = useState("");
  const [palette, setPalette] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!profile || dirty) return;
    setStyles(profile.stylePreferences.join(", "));
    setPalette(profile.preferredPalette.join(", "));
    setRestrictions(profile.comfortRestrictions.join(", "));
    setDressCode(profile.defaultDressCode ?? "");
  }, [profile, dirty]);
  const edit = (setter: (value: string) => void, value: string) => {
    setter(value); setDirty(true); setNotice("");
  };
  return <details className="chat-preferences">
    <summary>Your saved style preferences</summary>
    <p>Optional. Separate entries with commas. Saved preferences apply to chats and selfie reviews; colours are hints, not rules.</p>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (!profile || save.isPending) return;
      const stylePreferences = values(styles), preferredPalette = values(palette), comfortRestrictions = values(restrictions);
      if ([stylePreferences, preferredPalette, comfortRestrictions].some((list) => list.length > 20)) {
        setNotice("Keep each preference list to 20 entries or fewer."); return;
      }
      try {
        const saved = await save.mutateAsync({ data: {
          stylePreferences, preferredPalette, comfortRestrictions, defaultDressCode: dressCode || null,
          imageConsent: profile.imageConsent, selfiePath: profile.selfiePath,
        } });
        if (!mounted.current) return;
        queryClient.setQueryData(getGetMvpProfileQueryKey(), saved);
        setDirty(false); setNotice("Preferences saved. They’ll be used in your next reply.");
      } catch { setNotice("Preferences weren’t saved. Your edits are still here; please retry."); }
    }}>
      <fieldset disabled={disabled || save.isPending || !profile} className="context-grid">
        <div className="field"><label htmlFor="chat-style">Style preferences</label><input id="chat-style" maxLength={1000} value={styles} onChange={(e) => edit(setStyles, e.target.value)} placeholder="Minimal, relaxed tailoring" /></div>
        <div className="field"><label htmlFor="chat-palette">Preferred colours</label><input id="chat-palette" maxLength={1000} value={palette} onChange={(e) => edit(setPalette, e.target.value)} placeholder="Navy, cream, rust" /></div>
        <div className="field"><label htmlFor="chat-comfort">Comfort restrictions</label><input id="chat-comfort" maxLength={1000} value={restrictions} onChange={(e) => edit(setRestrictions, e.target.value)} placeholder="No wool, no tight collars" /></div>
        <div className="field"><label htmlFor="chat-default-dress">Default workplace dress code</label><select id="chat-default-dress" value={dressCode} onChange={(e) => edit(setDressCode, e.target.value)}><option value="">No default</option><option value="casual">Casual</option><option value="smart_casual">Smart casual</option><option value="business">Business</option><option value="formal">Formal</option></select></div>
        <button className="button button-small button-soft" type="submit" disabled={!dirty}>{save.isPending ? "Saving…" : "Save style preferences"}</button>
      </fieldset>
    </form>
    {notice && <p role="status">{notice}</p>}
    {dirty && <p role="status">Unsaved preferences. Chat will use your last saved preferences until you save.</p>}
    {!profile && <p role="status">Preferences are unavailable until your profile loads. You can still chat.</p>}
  </details>;
}
