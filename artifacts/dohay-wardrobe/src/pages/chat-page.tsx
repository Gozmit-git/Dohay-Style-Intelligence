import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { ArrowUp, Camera, Check, LoaderCircle, MapPin, Plus, ShieldCheck, Sparkles, Square, Volume2, X } from "lucide-react";
import type { CreateMvpUploadBodyContentType, MvpContext, MvpMessage, MvpOutfit, MvpProfileInput, MvpStylingContext } from "@workspace/api-client-react";
import {
  getGetMvpProfileQueryKey,
  getListMvpMessagesQueryKey,
  getListMvpOutfitsQueryKey,
  getListMvpThreadsQueryKey,
  getListMvpWardrobeQueryKey,
  listMvpMessages,
  useCreateMvpThread,
  useCreateMvpUpload,
  useGetMvpProfile,
  useListMvpMessages,
  useListMvpOutfits,
  useListMvpThreads,
  useListMvpWardrobe,
  useRecommendMvpOutfits,
  useSaveMvpProfile,
  useSendMvpMessage,
} from "@workspace/api-client-react";
import { OutfitBoard } from "../components/outfit-board";
import { ScanJobCard } from "../components/scan-job-card";
import { imageUrl } from "../lib/mvp-utils";
import { useBrowserVoice } from "../lib/use-browser-voice";
import { VoiceControls } from "../components/voice-controls";
import { ChatPreferences } from "../components/chat-preferences";
import "../components/chat-preferences.css";
import { StylingImageAction } from "../components/styling-image-action";

type PickedPhoto = { id: string; file: File; preview: string };
type ContextDraft = {
  occasion: string;
  dressCode: MvpContext["dressCode"] | "";
  activities: string;
  exclusions: string;
  outdoor: boolean;
  temperature: string;
  precipitation: string;
  weatherLabel: string;
  useWeather: boolean;
  latitude: number | null;
  longitude: number | null;
};

const initialContext: ContextDraft = {
  occasion: "",
  dressCode: "",
  activities: "",
  exclusions: "",
  outdoor: false,
  temperature: "",
  precipitation: "",
  weatherLabel: "",
  useWeather: false,
  latitude: null,
  longitude: null,
};

const starterPrompts = [
  "I have dinner plans tonight. What should I wear?",
  "Show me a fresh way to style my outfit.",
  "Show me new ways to wear something I own.",
];

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maximumBytes = 10 * 1024 * 1024;

function mvpContext(draft: ContextDraft): MvpContext {
  return {
    occasion: draft.occasion.trim(),
    dressCode: draft.dressCode as MvpContext["dressCode"],
    activities: draft.activities.trim() || undefined,
    exclusions: draft.exclusions.split(",").map((entry) => entry.trim()).filter(Boolean),
    outdoor: draft.outdoor,
    temperature: draft.temperature === "" ? null : Number(draft.temperature),
    precipitation: draft.precipitation === "" ? null : Number(draft.precipitation),
    weatherLabel: draft.weatherLabel.trim() || null,
    useWeather: draft.useWeather,
    latitude: draft.latitude,
    longitude: draft.longitude,
  };
}

function suggestedContext(context: MvpContext): ContextDraft {
  return {
    occasion: context.occasion ?? "",
    dressCode: context.dressCode ?? "",
    activities: context.activities ?? "",
    exclusions: context.exclusions?.join(", ") ?? "",
    outdoor: context.outdoor ?? false,
    temperature: context.temperature == null ? "" : String(context.temperature),
    precipitation: context.precipitation == null ? "" : String(context.precipitation),
    weatherLabel: context.weatherLabel ?? "",
    useWeather: context.useWeather ?? false,
    latitude: context.latitude ?? null,
    longitude: context.longitude ?? null,
  };
}

function profileWithConsent(profile: MvpProfileInput | undefined): MvpProfileInput {
  return {
    stylePreferences: profile?.stylePreferences ?? [],
    preferredPalette: profile?.preferredPalette ?? [],
    comfortRestrictions: profile?.comfortRestrictions ?? [],
    defaultDressCode: profile?.defaultDressCode ?? null,
    imageConsent: true,
    selfiePath: profile?.selfiePath ?? null,
  };
}

function getMessagePaths(message: MvpMessage) {
  return Array.isArray(message.attachments) ? message.attachments : [];
}

export function ChatPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const profileQuery = useGetMvpProfile({ query: { queryKey: getGetMvpProfileQueryKey() } });
  const threadsQuery = useListMvpThreads({ query: { queryKey: getListMvpThreadsQueryKey() } });
  const outfitsQuery = useListMvpOutfits({ query: { queryKey: getListMvpOutfitsQueryKey() } });
  const wardrobeQuery = useListMvpWardrobe({ query: { queryKey: getListMvpWardrobeQueryKey() } });
  const createThread = useCreateMvpThread();
  const sendMessage = useSendMvpMessage();
  const createUpload = useCreateMvpUpload();
  const saveProfile = useSaveMvpProfile();
  const recommend = useRecommendMvpOutfits();
  const profile = profileQuery.data;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const voice = useBrowserVoice(setText);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  useEffect(() => { voice.stopAll(); }, [activeThreadId, voice.stopAll]);
  useEffect(() => { voice.stopAll(); voice.setAutoSpeak(false); }, [user?.id, voice.stopAll, voice.setAutoSpeak]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const photoPurpose = "fit_check";
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [context, setContext] = useState<ContextDraft>(initialContext);
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [contextApplied, setContextApplied] = useState(false);
  const locationRequest = useRef(0);
  const contextDock = useRef<HTMLElement>(null);
  useEffect(() => {
    locationRequest.current++;
    setContext(initialContext);
    setContextApplied(false);
    setContextConfirmed(false);
    setWeatherError("");
    setContextError("");
  }, [user?.id]);
  useEffect(() => { if (showContext) contextDock.current?.scrollIntoView({ block: "nearest" }); }, [showContext]);
  useEffect(() => () => { locationRequest.current++; }, []);
  const [contextError, setContextError] = useState("");
  const [recommendation, setRecommendation] = useState<{ outfits: MvpOutfit[]; warnings: string[]; context: MvpContext } | null>(null);
  const [recommendError, setRecommendError] = useState("");
  const [uploadConsentBusy, setUploadConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [weatherError, setWeatherError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const selfiePicker = useRef<HTMLInputElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const previousThread = useRef<string | null>(null);
  const profilePrefilledThread = useRef<string | null>(null);
  const threads = threadsQuery.data ?? [];

  useEffect(() => {
    if (!activeThreadId && threads.length) setActiveThreadId(threads[0].id);
  }, [activeThreadId, threads]);

  const messagesQuery = useListMvpMessages(activeThreadId ?? "", {
    query: { enabled: !!activeThreadId, queryKey: getListMvpMessagesQueryKey(activeThreadId ?? "") },
  });
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    if (previousThread.current !== activeThreadId) {
      const hadPreviousThread = previousThread.current !== null;
      previousThread.current = activeThreadId;
      if (hadPreviousThread && activeThreadId) {
        locationRequest.current++;
        setRecommendation(null);
        setContext(initialContext);
        setContextConfirmed(false);
        setContextApplied(false);
        setShowContext(false);
      }
    }
  }, [activeThreadId]);

  const latestSuggestion = useMemo(
    () => [...messages].reverse().find((message) => message.suggestedContext?.occasion),
    [messages],
  );
  useEffect(() => {
    const defaultDressCode = profile?.defaultDressCode;
    const allowed = ["casual", "smart_casual", "business", "formal"];
    if (!defaultDressCode || !allowed.includes(defaultDressCode) || context.dressCode || latestSuggestion) return;
    if (profilePrefilledThread.current === activeThreadId) return;
    profilePrefilledThread.current = activeThreadId;
    setContext((current) => ({ ...current, dressCode: defaultDressCode as MvpContext["dressCode"] }));
    setContextConfirmed(false);
    setContextApplied(false);
  }, [profile?.defaultDressCode, activeThreadId, context.dressCode, latestSuggestion]);
  const appliedSuggestionId = useRef<string | null>(null);
  useEffect(() => {
    if (!latestSuggestion?.suggestedContext || appliedSuggestionId.current === latestSuggestion.id) return;
    appliedSuggestionId.current = latestSuggestion.id;
    if (contextApplied) return;
    setContext(suggestedContext(latestSuggestion.suggestedContext));
    setContextConfirmed(false);
    setShowContext(true);
  }, [latestSuggestion, contextApplied]);

  useEffect(() => {
    const element = conversationEnd.current;
    if (element) element.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending, recommendation]);

  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), []);

  const hasImageConsent = profile?.imageConsent === true;
  const isBusy = sending || createThread.isPending || sendMessage.isPending;

  const createConversation = async (title?: string) => {
    const created = await createThread.mutateAsync({ data: { title: title?.trim().slice(0, 120) || "A new conversation" } });
    setActiveThreadId(created.id);
    await queryClient.invalidateQueries({ queryKey: getListMvpThreadsQueryKey() });
    return created.id;
  };

  const beginNewConversation = async () => {
    setSendError("");
    try {
      const id = await createConversation();
      locationRequest.current++;
      setContextApplied(false);
      setContext(initialContext);
      setContextConfirmed(false);
      setShowContext(false);
      setWeatherError("");
      setContextError("");
      setActiveThreadId(id);
    } catch {
      setSendError("A new conversation could not be started. Please try again.");
    }
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const selected = Array.from(fileList);
    const limit = 3;
    const remaining = limit - photos.length;
    if (selected.length > remaining) {
      setSendError(`You can attach up to ${limit} photos in this mode.`);
      return;
    }
    const invalidType = selected.find((file) => !acceptedTypes.includes(file.type));
    if (invalidType) {
      setSendError("Choose JPEG, PNG, or WebP photos only.");
      return;
    }
    const oversized = selected.find((file) => file.size > maximumBytes);
    if (oversized) {
      setSendError("Each photo must be 10 MB or smaller.");
      return;
    }
    setSendError("");
    setPhotos((current) => [...current, ...selected.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
    }))]);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.id !== id);
    });
  };

  const authorizePhotoUploads = async () => {
    setConsentError("");
    setUploadConsentBusy(true);
    try {
      const saved = await saveProfile.mutateAsync({ data: profileWithConsent(profile) });
      queryClient.setQueryData(getGetMvpProfileQueryKey(), saved);
    } catch {
      setConsentError("We could not save your image consent. Try again, or update it in your profile.");
    } finally {
      setUploadConsentBusy(false);
    }
  };

  const uploadPhotos = async () => {
    const paths: string[] = [];
    for (const photo of photos) {
      const target = await createUpload.mutateAsync({
        data: { name: photo.file.name, size: photo.file.size, contentType: photo.file.type as CreateMvpUploadBodyContentType },
      });
      const response = await fetch(target.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": photo.file.type },
        body: photo.file,
      });
      if (!response.ok) throw new Error("A photo could not be uploaded. Please try again.");
      paths.push(target.objectPath);
    }
    return paths;
  };

  const handleSend = async (overrideText?: string) => {
    if (sending) return;
    voice.stopListening();
    const content = (overrideText ?? text).trim();
    if (!content && photos.length === 0) return;
    if (photoPurpose === "fit_check" && photos.length > 3) {
      setSendError("Keep up to three photos for a quick fit check. Capture clothing for your closet in Wardrobe.");
      return;
    }
    if (photos.length && !hasImageConsent) {
      setSendError("Please give explicit image consent before uploading photos.");
      return;
    }
    if (content.length > 4000) {
      setSendError("Keep a message under 4,000 characters.");
      return;
    }
    setSendError("");
    setSending(true);
    try {
      let threadId = activeThreadId;
      if (!threadId) threadId = await createConversation(content);
      const objectPaths = photos.length ? await uploadPhotos() : undefined;
      const finalContent = content || "How does my outfit look? Show the suggested styling changes in an image.";
      const stylingContext: MvpStylingContext | undefined = contextApplied ? {
        occasion: context.occasion.trim() || undefined, dressCode: context.dressCode || undefined,
        activities: context.activities.trim() || undefined,
        exclusions: context.exclusions.split(",").map((value) => value.trim()).filter(Boolean),
        outdoor: context.outdoor, temperature: context.temperature === "" ? null : Number(context.temperature),
        precipitation: context.precipitation === "" ? null : Number(context.precipitation),
        weatherLabel: context.weatherLabel.trim() || undefined,
        useWeather: context.useWeather, latitude: context.useWeather ? context.latitude : null,
        longitude: context.useWeather ? context.longitude : null,
      } : undefined;
      const reply = await sendMessage.mutateAsync({ threadId, data: { content: finalContent, objectPaths, photoPurpose, stylingContext } });
      if (voiceRef.current.autoSpeak) voiceRef.current.speak(reply.id, reply.content);
      const messageKey = getListMvpMessagesQueryKey(threadId);
      setActiveThreadId(threadId);
      // Show the confirmed server reply immediately, even if a background
      // invalidation has no active observer during a conversation transition.
      queryClient.setQueryData<MvpMessage[]>(messageKey, (current = []) =>
        [...current.filter((message) => message.id !== reply.id), reply]);
      setText("");
      photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      setPhotos([]);
      try {
        const persisted = await listMvpMessages(threadId);
        queryClient.setQueryData(messageKey, persisted);
      } catch {
        // Sending succeeded. Keep its reply visible rather than reporting a
        // failed send or inviting an accidental duplicate photo submission.
        void queryClient.invalidateQueries({ queryKey: messageKey });
      }
      void queryClient.invalidateQueries({ queryKey: getListMvpThreadsQueryKey() });
    } catch (error) {
      setSendError(error instanceof Error && error.message.includes("upload")
        ? error.message
        : "Your message did not go through. Your words and photos are still here; please try again.");
    } finally {
      setSending(false);
    }
  };

  const updateContext = <K extends keyof ContextDraft>(key: K, value: ContextDraft[K]) => {
    setContext((current) => ({ ...current, [key]: value }));
    setContextConfirmed(false);
    setContextApplied(false);
  };

  const validateDetails = () => {
    const temperature = Number(context.temperature), rain = Number(context.precipitation);
    const exclusions = context.exclusions.split(",").map((value) => value.trim()).filter(Boolean);
    let error = "";
    if (context.temperature !== "" && (!Number.isFinite(temperature) || temperature < -70 || temperature > 65)) error = "Temperature must be between −70 and 65 °C.";
    else if (context.precipitation !== "" && (!Number.isFinite(rain) || rain < 0 || rain > 500)) error = "Precipitation must be between 0 and 500 mm.";
    else if (exclusions.length > 10 || exclusions.some((value) => value.length > 80)) error = "Use up to ten exclusions, each under 80 characters.";
    else if (context.useWeather && (context.latitude == null || context.longitude == null)) error = "Wait for location access, or turn it off and enter weather manually.";
    setContextError(error);
    return !error;
  };

  const confirmContext = () => {
    if (!validateDetails()) return;
    if (!context.occasion.trim() || !context.dressCode) {
      setContextError("Add an occasion and choose a dress code before continuing.");
      setContextConfirmed(false);
      return;
    }
    setContextError("");
    setContextConfirmed(true);
  };

  const locateForWeather = (checked: boolean) => {
    const request = ++locationRequest.current;
    setWeatherError("");
    updateContext("useWeather", checked);
    if (!checked) {
      updateContext("useWeather", false);
      updateContext("latitude", null);
      updateContext("longitude", null);
      return;
    }
    if (!navigator.geolocation) {
      updateContext("useWeather", false);
      setWeatherError("Location is unavailable in this browser. Add weather manually instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (locationRequest.current !== request) return;
        setContext((current) => ({ ...current, latitude: coords.latitude, longitude: coords.longitude, useWeather: true }));
        setContextConfirmed(false);
        setContextApplied(false);
      },
      () => {
        if (locationRequest.current !== request) return;
        setContext((current) => ({ ...current, useWeather: false, latitude: null, longitude: null }));
        setContextApplied(false);
        setWeatherError("Location was not shared. You can continue with the manual weather fields.");
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
    );
  };

  const getOutfits = async () => {
    if (!contextConfirmed) {
      setContextError("Confirm the occasion and dress code first.");
      return;
    }
    setRecommendError("");
    setRecommendation(null);
    try {
      const threadId = activeThreadId ?? await createConversation("Outfit planning");
      const result = await recommend.mutateAsync({ data: { context: mvpContext(context), threadId } });
      setRecommendation({ outfits: result.outfits, warnings: result.warnings, context: result.context });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMvpOutfitsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListMvpMessagesQueryKey(threadId) }),
        queryClient.invalidateQueries({ queryKey: getListMvpThreadsQueryKey() }),
      ]);
    } catch {
      setRecommendError("Outfit ideas could not be made just now. Your confirmed context is still here to try again.");
    }
  };

  const persistedOutfitIds = new Set(messages.flatMap((message) => message.outfitIds ?? []));
  const recommendationsToShow = recommendation?.outfits.filter((outfit) => !persistedOutfitIds.has(outfit.id)) ?? [];
  const outfitsById = new Map((outfitsQuery.data ?? []).map((outfit) => [outfit.id, outfit]));
  const assistantHasOutfits = persistedOutfitIds.size > 0;

  return (
    <section className="chat-page">
      <header className="chat-top">
        <div className="chat-top-copy">
          <span className="eyebrow">Your personal stylist</span>
          <h1>Let’s get dressed.</h1>
          <p>Take an outfit selfie. Get a quick, honest fit check.</p>
        </div>
        <div className="chat-top-actions">
          <button className="button button-small" type="button" disabled={isBusy} onClick={() => {
            setText("How does my outfit look? Give me a quick fit check.");
            if (hasImageConsent) selfiePicker.current?.click();
            else setConsentError("Enable photo uploads below, then take or choose your outfit selfie.");
          }}><Camera size={13} /> Quick fit check</button>
          {threads.length > 0 && <select className="thread-select" aria-label="Choose conversation" value={activeThreadId ?? ""} onChange={(event) => setActiveThreadId(event.target.value || null)}>
            {threads.map((thread) => <option value={thread.id} key={thread.id}>{thread.title || "Styling conversation"}</option>)}
          </select>}
          <button className="button button-quiet button-small" type="button" onClick={beginNewConversation} disabled={createThread.isPending}><Plus size={13} /> New chat</button>
          <button className={`button button-small ${showContext ? "button-soft" : ""}`} type="button" onClick={() => setShowContext((current) => !current)}><Sparkles size={13} /> Styling details</button>
        </div>
      </header>
      <div className="conversation-scroll">
        <div className="conversation-inner">
          {threadsQuery.isError && <div className="chat-query-notice">Your conversation list could not be loaded. <button type="button" className="text-retry" onClick={() => threadsQuery.refetch()}>Retry</button></div>}
          {wardrobeQuery.isError && <div className="chat-query-notice">Your saved wardrobe could not be loaded, so outfit boards may be missing photos. <button type="button" className="text-retry" onClick={() => wardrobeQuery.refetch()}>Retry</button></div>}
          {outfitsQuery.isError && messages.some((message) => message.outfitIds.length > 0) && <div className="chat-query-notice">Saved outfit boards could not be loaded. <button type="button" className="text-retry" onClick={() => outfitsQuery.refetch()}>Retry</button></div>}
          {messagesQuery.isLoading && <div className="loading-block"><div className="loading-pulse" />Opening your conversation…</div>}
          {messagesQuery.isError && <div className="error-state"><h2>This conversation is taking a moment.</h2><p>Your wardrobe is safe. Try reloading this conversation.</p><button className="button button-small" type="button" onClick={() => messagesQuery.refetch()}>Reload conversation</button></div>}
          {!messagesQuery.isLoading && !messagesQuery.isError && messages.length === 0 && (
            <div className="conversation-welcome">
              <div className="welcome-kicker"><Sparkles size={13} /> Good style starts with what you own</div>
              <h2 className="welcome-title">Your outfit. <em>A fresh opinion.</em></h2>
              <p className="welcome-text">Take or upload an outfit selfie to see suggested styling changes in an AI-edited image. Your original stays unchanged, with review notes available if useful. Capture wardrobe items separately in Wardrobe.</p>
              <div className="suggestion-row">
                {starterPrompts.map((prompt) => <button className="suggestion-chip" type="button" key={prompt} onClick={() => { setText(prompt); if (prompt.toLowerCase().includes("dinner")) { setContext({ ...initialContext, occasion: "Dinner" }); setShowContext(true); } }}>{prompt}</button>)}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const canVisualize = message.role === "assistant" && message.canVisualize !== false && !message.jobId &&
              messages.slice(0, index).some((previous) => previous.role === "user" && previous.canVisualize !== false && previous.intent === "chat" && getMessagePaths(previous).length > 0);
            const messageOutfits = (message.outfitIds ?? []).map((id) => outfitsById.get(id)).filter((outfit): outfit is MvpOutfit => !!outfit);
            const paths = getMessagePaths(message);
            return (
              <div key={message.id} className="message-group">
                <article className={`conversation-message ${message.role}`}>
                  {message.role === "assistant" && <span className="message-mark">D</span>}
                  <div className="message-content">
                    <div className="message-meta">{message.role === "assistant" ? "DOHAY" : "You"} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {message.role === "assistant" && voice.canSpeak && <button type="button" className="voice-reply-button"
                        aria-label={voice.speakingId === message.id ? "Stop reading reply" : "Listen to reply"}
                        onClick={() => voice.speakingId === message.id ? voice.stopSpeaking() : voice.speak(message.id, message.content)}>
                        {voice.speakingId === message.id ? <Square size={12} /> : <Volume2 size={12} />}
                        {voice.speakingId === message.id ? "Stop" : "Listen"}
                      </button>}
                    </div>
                    {message.role === "assistant" && message.jobId
                      ? <details className="styling-review-notes"><summary>Review notes</summary><div>{message.content}</div></details>
                      : message.content}
                    {paths.length > 0 && <div className="message-images">{paths.map((path, index) => <img key={`${path}-${index}`} src={imageUrl(path)} alt={`Attached wardrobe photo ${index + 1}`} loading="lazy" />)}</div>}
                  </div>
                </article>
                {message.jobId && <ScanJobCard jobId={message.jobId} threadId={message.threadId} objectPaths={paths} />}
                {canVisualize && <StylingImageAction threadId={message.threadId} messageId={message.id} />}
                {message.role === "assistant" && messageOutfits.length > 0 && <div className="board-grid">{messageOutfits.map((outfit) => <OutfitBoard key={outfit.id} outfit={outfit} items={wardrobeQuery.data ?? []} />)}</div>}
              </div>
            );
          })}
          {messages.length > 0 && !assistantHasOutfits && !recommendation && (
            <div className="suggestion-row conversation-followup">
              {["I have a plan tonight", "Help me decide what to wear"].map((prompt) =>
                <button className="suggestion-chip" key={prompt} type="button" onClick={() => setText(prompt)}>{prompt}</button>
              )}
            </div>
          )}
          {sending && <div className="conversation-message"><span className="message-mark">D</span><div className="message-content"><span className="message-meta">DOHAY</span><span className="loading-dots">{photos.length && photoPurpose === "fit_check" ? "Reviewing your outfit…" : "Thinking through your wardrobe…"}</span></div></div>}
          {recommendation && recommendationsToShow.length > 0 && (
            <section className="recommendation-result">
              <div className="recommendation-heading"><div><span className="eyebrow">Made from your available pieces</span><h2>Three ways to wear it</h2></div><button type="button" className="icon-button" aria-label="Dismiss outfit suggestions" onClick={() => setRecommendation(null)}><X size={15} /></button></div>
              {recommendation.warnings.length > 0 && <div className="scan-warnings">{recommendation.warnings.join(" ")}</div>}
              {recommendation.outfits.length > 0
                ? <div className="board-grid">{recommendationsToShow.map((outfit) => <OutfitBoard key={outfit.id} outfit={outfit} items={wardrobeQuery.data ?? []} />)}</div>
                : <div className="empty-state"><h2>Not quite enough in the closet yet</h2><p>Add a few more saved pieces, then we can put together options from what is really yours.</p><Link className="button button-small" href="/wardrobe">Visit your wardrobe</Link></div>}
            </section>
          )}
          {recommendError && <div className="chat-error">{recommendError}<button type="button" className="text-retry" onClick={getOutfits}>Try again</button></div>}
          <div ref={conversationEnd} />
        </div>
      </div>
      <div className="composer-shell">
        {showContext && <section className="context-dock" ref={contextDock}>
          <div className="context-dock-header"><div><span className="eyebrow">Optional for chat and selfie reviews</span><h2>What are we dressing for?</h2></div><button type="button" className="icon-button" aria-label="Close styling details" onClick={() => setShowContext(false)}><X size={15} /></button></div>
          <p className="context-intro">Share only what helps, then use these details in chat. For wardrobe outfit boards, occasion and dress code must still be confirmed.</p>
          <ChatPreferences key={user?.id} profile={profile} disabled={sending || uploadConsentBusy} />
          <div className="context-grid">
            <div className="field"><label htmlFor="context-occasion">Occasion</label><input id="context-occasion" maxLength={180} value={context.occasion} onChange={(event) => updateContext("occasion", event.target.value)} placeholder="Dinner with friends" /></div>
            <div className="field"><label htmlFor="context-dresscode">Dress code</label><select id="context-dresscode" value={context.dressCode} onChange={(event) => updateContext("dressCode", event.target.value as ContextDraft["dressCode"])}><option value="">Choose one…</option><option value="casual">Casual</option><option value="smart_casual">Smart casual</option><option value="business">Business</option><option value="formal">Formal</option></select></div>
            <div className="field"><label htmlFor="context-activities">What will you be doing?</label><input id="context-activities" maxLength={300} value={context.activities} onChange={(event) => updateContext("activities", event.target.value)} placeholder="Walking, sitting outside…" /></div>
            <div className="field"><label htmlFor="context-exclusions">Anything to leave out?</label><input id="context-exclusions" value={context.exclusions} onChange={(event) => updateContext("exclusions", event.target.value)} placeholder="Heels, wool, a color…" /></div>
            <label className="weather-row context-wide"><input type="checkbox" checked={context.outdoor} onChange={(event) => updateContext("outdoor", event.target.checked)} /><span>Some of this will be outdoors</span></label>
            <div className="field"><label htmlFor="context-temperature">Temperature °C</label><input id="context-temperature" type="number" min="-70" max="65" value={context.temperature} onChange={(event) => updateContext("temperature", event.target.value)} placeholder="Optional" /></div>
            <div className="field"><label htmlFor="context-precip">Precipitation mm</label><input id="context-precip" type="number" min="0" max="500" value={context.precipitation} onChange={(event) => updateContext("precipitation", event.target.value)} placeholder="Optional" /></div>
            <div className="field context-wide"><label htmlFor="context-weather-label">Weather note</label><input id="context-weather-label" maxLength={120} value={context.weatherLabel} onChange={(event) => updateContext("weatherLabel", event.target.value)} placeholder="Light rain, breezy, clear…" /></div>
            <label className="weather-row context-wide"><input type="checkbox" checked={context.useWeather} onChange={(event) => locateForWeather(event.target.checked)} /><span><strong><MapPin size={12} /> Use my location for weather</strong><br />Your location is only used when you opt in. You can also enter weather yourself above.</span></label>
          </div>
          {weatherError && <div className="context-inline-error">{weatherError}</div>}
          {contextError && <div className="context-inline-error">{contextError}</div>}
          <div className="context-confirm-row">
            <button type="button" className="button button-small" disabled={sending} onClick={() => { if (validateDetails()) { setContextApplied(true); setShowContext(false); } }}>Use details in chat</button>
            <button type="button" className="text-button" onClick={() => { locationRequest.current++; setContext(initialContext); setContextApplied(false); setContextConfirmed(false); setContextError(""); setWeatherError(""); }}>Clear request details</button>
          </div>
          <div className="context-confirm-row">
            {contextConfirmed && <span className="context-confirmed"><Check size={13} /> Occasion and dress code confirmed</span>}
            {!contextConfirmed
              ? <button type="button" className="button button-small button-soft" onClick={confirmContext}>Confirm occasion &amp; dress code</button>
              : <button type="button" className="button button-small" disabled={recommend.isPending} onClick={getOutfits}>{recommend.isPending ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} Make outfit ideas</button>}
          </div>
        </section>}
        {contextApplied && <div className="chat-context-applied" role="status">
          <Check size={13} /><span>Styling details on{context.occasion ? ` · ${context.occasion}` : ""}{context.temperature !== "" ? ` · ${context.temperature} °C` : ""}. Used in chat and fit checks, not wardrobe scans.</span>
          <button type="button" className="text-button" onClick={() => setShowContext(true)}>Edit</button>
          <button type="button" className="text-button" onClick={() => { locationRequest.current++; setContextApplied(false); setContext(initialContext); setContextConfirmed(false); }}>Remove details</button>
        </div>}
        {!hasImageConsent && <div className="privacy-gate">
          <div className="privacy-gate-copy"><strong><ShieldCheck size={14} /> Photos need your permission first.</strong>Text chat is ready now. Before any photo is uploaded, choose to allow DOHAY to process wardrobe images. You can change this in Profile.</div>
          {consentError && <div className="context-inline-error">{consentError}</div>}
          <button type="button" className="button button-small" disabled={profileQuery.isLoading || uploadConsentBusy} onClick={authorizePhotoUploads}>{uploadConsentBusy ? "Saving…" : "I agree; enable photo uploads"}</button>
          <Link href="/profile" className="consent-profile-link">Review profile</Link>
        </div>}
        {sendError && <div className="chat-error">{sendError}<button type="button" className="text-retry" onClick={() => setSendError("")}>Dismiss</button></div>}
        <div className="composer">
          <h2 className="composer-heading">Styling changes in image</h2>
          <p className="composer-description">AI preview · your original stays unchanged · not a fit guarantee.</p>
          {photos.length > 0 && <div className="attachment-tray">{photos.map((photo) => <div className="attachment-thumb" key={photo.id}><img src={photo.preview} alt={photo.file.name} /><button type="button" className="attachment-remove" aria-label={`Remove ${photo.file.name}`} onClick={() => removePhoto(photo.id)}><X size={12} /></button></div>)}</div>}
          <textarea value={text} maxLength={4000} onChange={(event) => { if (voice.listening) voice.stopListening(); setText(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Type or dictate what you’re deciding…" aria-label="Message DOHAY" />
          <div className="composer-toolbar">
            <div className="composer-tools">
              <VoiceControls voice={voice} draft={text} disabled={isBusy} />
              <button type="button" className="composer-tool" disabled={!hasImageConsent || photos.length >= 3 || isBusy} onClick={() => selfiePicker.current?.click()}><Camera size={15} /><span>Take outfit selfie</span></button>
              <button type="button" className="composer-tool" disabled={!hasImageConsent || photos.length >= 3 || isBusy} onClick={() => picker.current?.click()} title={!hasImageConsent ? "Give photo consent first" : "Choose photos"}><Plus size={15} /><span>Choose photos</span></button>
              <input ref={selfiePicker} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="user" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
              <input ref={picker} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
              <span className="file-hint">{hasImageConsent ? "JPEG, PNG or WebP · 10 MB each · up to 3" : "Text chat works without photo access"}</span>
            </div>
            <button type="button" className="composer-send" disabled={isBusy || (!text.trim() && photos.length === 0)} aria-label="Send message" onClick={() => void handleSend()}>{isBusy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}</button>
          </div>
        </div>
        <p className="private-note"><ShieldCheck size={12} /> Photos stay private; styling images never add wardrobe items.</p>
      </div>
    </section>
  );
}
