import { Mic, Square, Volume2 } from "lucide-react";
import type { BrowserVoice } from "../lib/use-browser-voice";
import "./voice-controls.css";

export function VoiceControls({ voice, draft, disabled }: { voice: BrowserVoice; draft: string; disabled: boolean }) {
  const languages = [
    ["en-IN", "English (India)"], ["en-US", "English (US)"],
    ["en-GB", "English (UK)"], ["hi-IN", "Hindi"],
  ];
  if (!languages.some(([code]) => code === voice.language)) languages.unshift([voice.language, `Browser language (${voice.language})`]);
  return <section className="voice-panel" aria-label="Browser voice assistant">
    <div className="voice-toolbar">
      <button type="button" className={`button button-small ${voice.listening ? "button-danger" : "button-quiet"}`}
        disabled={!voice.canDictate || (disabled && !voice.listening)}
        aria-pressed={voice.listening}
        onClick={() => voice.listening ? voice.stopListening() : voice.startListening(draft)}>
        {voice.listening ? <Square size={13} /> : <Mic size={13} />}
        {voice.listening ? "Stop microphone" : "Dictate message"}
      </button>
      <label className="voice-auto"><input type="checkbox" checked={voice.autoSpeak} disabled={!voice.canSpeak}
        onChange={(event) => { voice.setAutoSpeak(event.target.checked); if (!event.target.checked) voice.stopSpeaking(); }} />
        Read new replies aloud
      </label>
      {voice.speakingId && <button type="button" className="button button-small button-quiet" onClick={voice.stopSpeaking}><Square size={12} /> Stop reading</button>}
      <details className="voice-settings">
        <summary><Volume2 size={12} /> Voice settings</summary>
        <div className="voice-settings-fields">
          <label>Voice language<select value={voice.language} onChange={(event) => { voice.stopAll(); voice.setLanguage(event.target.value); }}>
            {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select></label>
          <label>Speaking voice<select value={voice.voiceURI} disabled={!voice.canSpeak} onChange={(event) => { voice.stopSpeaking(); voice.setVoiceURI(event.target.value); }}>
            <option value="">Browser default</option>
            {voice.voices.map((item) => <option value={item.voiceURI} key={item.voiceURI}>{item.name} ({item.lang})</option>)}
          </select></label>
        </div>
      </details>
    </div>
    <p className="voice-note" role="status">{voice.listening
      ? "Listening… Your words appear in the message box. Review them, then press Send."
      : "Browser-powered voice · DOHAY is AI. Your browser’s speech service may process microphone audio. Review dictated text before sending."}</p>
    {!voice.canDictate && <p className="voice-note">Voice input isn’t supported in this browser or context. Typed chat is still available.</p>}
    {!voice.canSpeak && <p className="voice-note">Spoken replies aren’t supported here. All advice remains available as text.</p>}
    {voice.error && <div className="chat-error" role="alert">{voice.error}<button type="button" className="text-retry" onClick={voice.clearError}>Dismiss</button></div>}
  </section>;
}
