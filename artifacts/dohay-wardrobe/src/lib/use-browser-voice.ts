import { useCallback, useEffect, useRef, useState } from "react";
import { appendDictation, speechChunks } from "./voice-utils";

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { results: { length: number; [index: number]: RecognitionResult } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void; abort: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const recognitionConstructor = () => {
  const browser = window as VoiceWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
};

export function useBrowserVoice(onTranscript: (text: string) => void) {
  const [canDictate] = useState(() => Boolean(recognitionConstructor()) && window.isSecureContext);
  const [canSpeak] = useState(() => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [language, setLanguage] = useState(() => navigator.language || "en-US");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playback = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;

  const stopListening = useCallback(() => {
    const current = recognition.current;
    recognition.current = null;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    if (current) {
      current.onresult = null;
      current.onend = null;
      current.onerror = null;
      current.onstart = null;
      try { current.abort(); } catch { /* Already stopped by the browser. */ }
    }
    setListening(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    playback.current++;
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
    }
    utterance.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const stopAll = useCallback(() => {
    stopListening();
    stopSpeaking();
  }, [stopListening, stopSpeaking]);

  useEffect(() => {
    const stopWhenHidden = () => { if (document.visibilityState === "hidden") stopAll(); };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [stopAll]);

  useEffect(() => {
    if (!canSpeak) return;
    const update = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available.filter((voice, index) => available.findIndex((v) => v.voiceURI === voice.voiceURI) === index));
    };
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, [canSpeak]);

  useEffect(() => () => {
    const current = recognition.current;
    recognition.current = null;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (current) {
      current.onresult = current.onend = current.onerror = current.onstart = null;
      try { current.abort(); } catch { /* Browser already released the mic. */ }
    }
    playback.current++;
    if (utterance.current) utterance.current.onend = utterance.current.onerror = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const startListening = useCallback((draft: string) => {
    const Constructor = recognitionConstructor();
    if (!canDictate || !Constructor) {
      setError("Voice input isn’t supported here. Try Chrome or Edge with microphone permission, or keep typing.");
      return;
    }
    stopAll();
    setError("");
    const current = new Constructor();
    current.lang = language;
    current.continuous = false;
    current.interimResults = true;
    recognition.current = current;
    current.onstart = () => { if (recognition.current === current) setListening(true); };
    current.onresult = (event) => {
      if (recognition.current !== current) return;
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript ?? "").join(" ");
      transcriptCallback.current(appendDictation(draft, transcript));
      if (appendDictation(draft, transcript).length >= 4000) {
        setError("Your message reached the 4,000-character limit. Review it before sending.");
        stopListening();
      }
    };
    current.onend = () => { if (recognition.current === current) stopListening(); };
    current.onerror = ({ error: code }) => {
      if (recognition.current !== current) return;
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access was blocked. Allow it for this site in your browser, or type instead.",
        "service-not-allowed": "Your browser’s speech service is blocked. You can still type your message.",
        "audio-capture": "No working microphone was found. Check your microphone or type instead.",
        "network": "Your browser’s speech service could not connect. Check your connection or type instead.",
        "no-speech": "No speech was detected. Tap the microphone to try again.",
        "language-not-supported": "Your browser does not support that dictation language. Choose another language or type instead.",
      };
      if (code !== "aborted") setError(messages[code] ?? "Voice input stopped. Please try again or type your message.");
      stopListening();
    };
    setListening(true);
    try {
      current.start();
      recordingTimer.current = setTimeout(stopListening, 60_000);
    } catch {
      stopListening();
      setError("The microphone could not start. Check browser permissions and try again.");
    }
  }, [canDictate, language, stopAll, stopListening]);

  const speak = useCallback((id: string, text: string) => {
    stopAll();
    if (document.visibilityState === "hidden") return;
    if (!canSpeak) {
      setError("Spoken replies aren’t supported in this browser. You can still read every reply in chat.");
      return;
    }
    const chunks = speechChunks(text);
    if (!chunks.length) return;
    setError("");
    const session = playback.current;
    const chosenVoice = voices.find((voice) => voice.voiceURI === voiceURI);
    setSpeakingId(id);
    const next = (index: number) => {
      if (session !== playback.current) return;
      if (index >= chunks.length) { utterance.current = null; setSpeakingId(null); return; }
      const part = new SpeechSynthesisUtterance(chunks[index]);
      part.lang = chosenVoice?.lang ?? language;
      part.rate = 1;
      if (chosenVoice) part.voice = chosenVoice;
      part.onend = () => next(index + 1);
      part.onerror = (event) => {
        if (session !== playback.current || ["canceled", "interrupted"].includes(event.error)) return;
        setSpeakingId(null);
        setError("Your browser couldn’t play this reply. Try Listen again, choose another voice, or read it in chat.");
      };
      utterance.current = part;
      try { window.speechSynthesis.speak(part); }
      catch { setSpeakingId(null); setError("Audio playback was blocked. Tap Listen to try again."); }
    };
    next(0);
  }, [canSpeak, language, stopAll, voiceURI, voices]);

  return {
    canDictate, canSpeak, listening, speakingId, autoSpeak, setAutoSpeak,
    language, setLanguage, voices, voiceURI, setVoiceURI, error,
    clearError: () => setError(""), startListening, stopListening, speak, stopSpeaking, stopAll,
  };
}

export type BrowserVoice = ReturnType<typeof useBrowserVoice>;

export function useBrowserVoiceScope(
  voice: Pick<BrowserVoice, "stopAll" | "setAutoSpeak">,
  threadId: string | null,
  userId: string | undefined,
) {
  useEffect(() => { voice.stopAll(); }, [threadId, voice.stopAll]);
  useEffect(() => { voice.stopAll(); voice.setAutoSpeak(false); }, [userId, voice.stopAll, voice.setAutoSpeak]);
}
