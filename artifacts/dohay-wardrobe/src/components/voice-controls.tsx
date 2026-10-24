import { Mic, Square } from "lucide-react";
import type { BrowserVoice } from "../lib/use-browser-voice";
import "./voice-controls.css";

export function VoiceControls({ voice, draft, disabled }: { voice: BrowserVoice; draft: string; disabled: boolean }) {
  return <>
    <button
      type="button"
      className={`composer-tool voice-dictate ${voice.listening ? "listening" : ""}`}
      disabled={!voice.canDictate || (disabled && !voice.listening)}
      aria-label={voice.listening ? "Stop dictation" : "Dictate message"}
      aria-pressed={voice.listening}
      title={!voice.canDictate ? "Dictation is not supported in this browser" : undefined}
      onClick={() => voice.listening ? voice.stopListening() : voice.startListening(draft)}
    >
      {voice.listening ? <Square size={15} /> : <Mic size={15} />}
      <span>{voice.listening ? "Stop dictation" : "Dictate"}</span>
    </button>
    {voice.error && <span className="voice-inline-error" role="alert">
      {voice.error} <button type="button" onClick={voice.clearError}>Dismiss</button>
    </span>}
  </>;
}
