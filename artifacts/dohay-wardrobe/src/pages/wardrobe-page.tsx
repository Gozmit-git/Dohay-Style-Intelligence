import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Clock3, Edit3, Layers3, MessageCircle, RefreshCw, Shirt, Sparkles, Trash2, X } from "lucide-react";
import type { GarmentAnalysis, GarmentChatMessage, MvpAttributes, MvpItem, OutfitResponse } from "@workspace/api-client-react";
import {
  useChatAboutGarment,
  getListMvpWardrobeQueryKey,
  getListMvpOutfitsQueryKey,
  useDeleteMvpItem,
  useListMvpWardrobe,
  useRecommendOutfits,
  useUpdateMvpItem,
} from "@workspace/api-client-react";
import { AttributeEditor } from "../components/attribute-editor";
import { GarmentPhoto } from "../components/garment-photo";
import { displayName, setUserAttribute } from "../lib/mvp-utils";
import { WardrobeCapture } from "../components/wardrobe-capture";

export function WardrobePage() {
  const query = useListMvpWardrobe({ query: { queryKey: getListMvpWardrobeQueryKey() } });
  const items = query.data ?? [];
  const availableCount = items.filter((item) => item.attributes.isAvailable).length;

  return (
    <div className="page-content">
      <header className="page-topline">
        <div><span className="eyebrow">The clothes you really own</span><h1 className="page-title">Your wardrobe.</h1><p className="page-subtitle">Upload or take a photo. Each visible garment and accessory saves separately, with AI-estimated details you can override anytime.</p></div>
      </header>
      <WardrobeCapture />
      <div className="wardrobe-toolbar">
        <div className="wardrobe-stats">
          <span className="stat-pill"><Layers3 size={13} /> {items.length} {items.length === 1 ? "piece" : "pieces"} saved</span>
          <span className="stat-pill"><Check size={13} /> {availableCount} ready to wear</span>
        </div>
        {query.isError && <button className="button button-quiet button-small" type="button" onClick={() => query.refetch()}><RefreshCw size={13} /> Retry</button>}
      </div>
      {query.isLoading && <div className="wardrobe-grid">{[1, 2, 3, 4, 5, 6].map((item) => <div className="skeleton garment-skeleton" key={item} />)}</div>}
      {query.isError && <div className="error-state"><div className="empty-mark"><AlertCircle size={19} /></div><h2>Your wardrobe is safe.</h2><p>We could not load it just now. Please try again.</p><button className="button" type="button" onClick={() => query.refetch()}>Load wardrobe</button></div>}
      {!query.isLoading && !query.isError && items.length === 0 && <div className="empty-state">
        <div className="empty-mark"><Shirt size={21} /></div><h2>A little space for what you own.</h2>
        <p>Upload photos or take a photo above. Items save automatically—no attribute review is required.</p>
      </div>}
      {!query.isLoading && !query.isError && items.length > 0 && <div className="wardrobe-grid">{items.map((item) => <WardrobeItemCard key={item.id} item={item} />)}</div>}
    </div>
  );
}

function WardrobeItemCard({ item }: { item: MvpItem }) {
  const queryClient = useQueryClient();
  const update = useUpdateMvpItem();
  const remove = useDeleteMvpItem();
  const [attributes, setAttributes] = useState<MvpAttributes>(item.attributes);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!editing) setAttributes(item.attributes);
  }, [item.attributes, editing]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListMvpWardrobeQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListMvpOutfitsQueryKey() }),
  ]);
  const save = () => update.mutate(
    { itemId: item.id, data: attributes },
    { onSuccess: () => { setEditing(false); setNotice("Changes saved."); void refresh(); }, onError: () => setNotice("Could not save these changes. Try again.") },
  );
  const toggleAvailability = () => update.mutate(
    { itemId: item.id, data: setUserAttribute(item.attributes, "isAvailable", !item.attributes.isAvailable) },
    { onSuccess: () => { setNotice(item.attributes.isAvailable ? "Marked as unavailable." : "Ready to wear."); void refresh(); }, onError: () => setNotice("Availability could not be changed.") },
  );
  const confirmRemove = () => remove.mutate(
    { itemId: item.id },
    { onSuccess: () => { setConfirmDelete(false); setNotice("Piece removed."); void refresh(); }, onError: () => setNotice("This piece could not be removed. Try again.") },
  );
  const sourceSummary = item.attributes.attributeSources?.some((source) => source.source === "user_provided")
    ? "Some details provided by you"
    : item.attributes.confidence < 0.65 ? "Low-confidence estimates; edit if needed" : "AI estimates from your photo";

  return (
    <article className="garment-card">
      <GarmentPhoto className="garment-photo" path={item.imagePaths[0]} alt={displayName(item.attributes)} />
      <div className="garment-card-body">
        <div className="garment-category">{item.attributes.category.replace("_", " ")} · {item.attributes.layerRole.replace("_", " ")}</div>
        <h2 className="garment-name">{displayName(item.attributes)}</h2>
        <div className="garment-tags">
          {item.attributes.colors.slice(0, 3).map((color) => <span className="tag" key={color}>{color}</span>)}
          {item.attributes.formality && <span className="tag">{item.attributes.formality.replace("_", " ")}</span>}
        </div>
        <div className="garment-source"><Clock3 size={11} /> {sourceSummary}</div>
        <div className="availability">
          <label className="availability-toggle"><span>{item.attributes.isAvailable ? "Ready to wear" : "Not available"}</span><input type="checkbox" checked={item.attributes.isAvailable} disabled={update.isPending} onChange={toggleAvailability} /></label>
          <span className="confidence-mini">{Math.round(item.attributes.confidence * 100)}% noted</span>
        </div>
        {notice && <p className="card-notice">{notice}</p>}
        {!editing && !confirmDelete && <div className="card-toolbar">
          <button className="button button-small button-quiet" type="button" onClick={() => { setNotice(""); setEditing(true); }}><Edit3 size={12} /> Edit details</button>
          <button className="button button-small button-danger" type="button" onClick={() => { setNotice(""); setConfirmDelete(true); }}><Trash2 size={12} /> Remove</button>
        </div>}
      </div>
      {editing && <div className="inline-editor">
        <AttributeEditor value={attributes} onChange={setAttributes} />
        <div className="form-actions">
          <button className="button button-small button-quiet" type="button" onClick={() => { setAttributes(item.attributes); setEditing(false); }}>Cancel</button>
          <button className="button button-small" type="button" disabled={update.isPending} onClick={save}>{update.isPending ? "Saving…" : "Save details"}</button>
        </div>
      </div>}
      {confirmDelete && <div className="inline-editor">
        <div className="confirm-delete">
          <p><strong>Remove this piece?</strong><br />Any saved outfit boards that use it will also be removed.</p>
          <div className="form-actions">
            <button type="button" className="button button-small button-quiet" onClick={() => setConfirmDelete(false)}>Keep piece</button>
            <button type="button" className="button button-small button-danger" disabled={remove.isPending} onClick={confirmRemove}>{remove.isPending ? "Removing…" : "Remove piece"}</button>
          </div>
        </div>
      </div>}
    </article>
  );
}

const savedAnalysis = (item: MvpItem): GarmentAnalysis => ({
  category: item.attributes.category,
  subtype: item.attributes.subcategory,
  primaryColor: item.attributes.colors[0] ?? "",
  secondaryColors: item.attributes.colors.slice(1),
  pattern: item.attributes.pattern ?? "",
  designDetails: item.attributes.styleTags,
  silhouette: "",
  fitEstimate: "",
  style: item.attributes.styleTags.join(", "),
  fabricEstimate: item.attributes.fabricEstimate ?? "",
  constructionFeatures: [],
  occasions: item.attributes.occasionTags,
  seasons: item.attributes.seasonTags,
  confidenceNote: "",
  labelPhotoSuggestion: false,
  attributeSources: item.attributes.attributeSources,
});

function SavedItemAssistant({ item, onClose }: { item: MvpItem; onClose: () => void }) {
  const chat = useChatAboutGarment();
  const recommend = useRecommendOutfits();
  const analysis = useMemo(() => savedAnalysis(item), [item]);
  const [messages, setMessages] = useState<GarmentChatMessage[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<OutfitResponse | null>(null);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<{ kind: "chat" | "outfit"; prompt: string } | null>(null);
  const busy = chat.isPending || recommend.isPending;

  const ask = async (content: string) => {
    const clean = content.trim();
    if (!clean || busy) return;
    setError("");
    setResult(null);
    setRetryAction({ kind: "chat", prompt: clean });
    const nextMessages: GarmentChatMessage[] = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setText("");
    try {
      const response = await chat.mutateAsync({ data: { analysis, messages: nextMessages, savedItemId: item.id } });
      setMessages([...nextMessages, { role: "assistant", content: response.reply }]);
      setRetryAction(null);
    } catch {
      setError("DOHAY could not answer that just now. Your message is still here to retry.");
      setMessages(messages);
      setText(clean);
    }
  };

  const getOutfits = async (prompt: string) => {
    setError("");
    setResult(null);
    setRetryAction({ kind: "outfit", prompt });
    try {
      const response = await recommend.mutateAsync({ data: { itemId: item.id, prompt } });
      setResult(response);
      setRetryAction(null);
    } catch {
      setError("Outfit ideas could not be made just now. Try again in a moment.");
    }
  };

  const actions = [
    { label: "What can I wear with this?", kind: "outfit", prompt: "What can I wear with this item?" },
    { label: "Which occasions is this suitable for?", kind: "chat", prompt: "Which occasions is this suitable for?" },
    { label: "Show me outfits using this item", kind: "outfit", prompt: "Show me outfits using this item." },
    { label: "How can I style this differently?", kind: "outfit", prompt: "How can I style this differently?" },
    { label: "Does this fill a gap in my wardrobe?", kind: "chat", prompt: "Does this fill a gap in my wardrobe?" },
  ] as const;

  return <section className="saved-item-assistant" aria-label={`Continue conversation about ${displayName(item.attributes)}`}>
    <div className="saved-item-assistant-head">
      <div className="saved-item-identity"><GarmentPhoto className="saved-item-thumb" path={item.imagePaths[0]} alt={displayName(item.attributes)} /><div><span className="eyebrow">A piece from your wardrobe</span><h2>Let’s talk about your {displayName(item.attributes)}.</h2><p>Answers and outfit ideas use this saved piece as their starting point.</p></div></div>
      <button type="button" className="icon-button" aria-label="Close saved item conversation" onClick={onClose}><X size={15} /></button>
    </div>
    <div className="saved-item-action-list">{actions.map((action) => <button type="button" className="suggestion-chip" key={action.label} disabled={busy} onClick={() => action.kind === "outfit" ? void getOutfits(action.prompt) : void ask(action.prompt)}>{action.label}</button>)}</div>
    {messages.length > 0 && <div className="saved-item-chat-history">{messages.map((message, index) => <div className={`saved-chat-line ${message.role}`} key={`${index}-${message.role}`}><span>{message.role === "assistant" ? "DOHAY" : "You"}</span><p>{message.content}</p></div>)}</div>}
    {result && <div className="saved-outfit-result">{result.introduction && <p>{result.introduction}</p>}{result.outfits.map((outfit, index) => <article className="saved-outfit-option" key={`${outfit.name}-${index}`}><span className="eyebrow">Outfit {index + 1}</span><h3>{outfit.name}</h3><p>{outfit.pieces.join(" · ")}</p><span>{outfit.rationale}</span></article>)}</div>}
    {error && <div className="alert">{error}<button className="text-retry" type="button" onClick={() => retryAction?.kind === "chat" ? void ask(retryAction.prompt) : void getOutfits(retryAction?.prompt ?? "Show me outfits using this item.")}>Try again</button></div>}
    <form className="saved-item-text-form" onSubmit={(event) => { event.preventDefault(); void ask(text); }}>
      <input aria-label="Ask DOHAY about this saved item" value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask anything about this saved piece…" />
      <button className="button button-small" type="submit" disabled={!text.trim() || busy}><Sparkles size={13} /> Ask</button>
    </form>
  </section>;
}
