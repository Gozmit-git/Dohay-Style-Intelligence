// These tests use deterministic SpeechRecognition/speechSynthesis stubs. They
// verify browser API integration without accessing a physical microphone or speaker.
// Use VOICE_TESTING.md for the separate manual real-device smoke check.
// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceControls } from "../components/voice-controls";
import { useBrowserVoice, useBrowserVoiceScope } from "./use-browser-voice";

type RecognitionStub = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
};

const recognitions: RecognitionStub[] = [];
const utterances: SpeechSynthesisUtterance[] = [];
const cancelPlayback = vi.fn();
const voiceList: SpeechSynthesisVoice[] = [];

class FakeRecognition implements RecognitionStub {
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: RecognitionStub["onstart"] = null;
  onend: RecognitionStub["onend"] = null;
  onresult: RecognitionStub["onresult"] = null;
  onerror: RecognitionStub["onerror"] = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() { recognitions.push(this); }
}

class FakeUtterance {
  lang = "";
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

function setWindowProperty(name: string, value: unknown) {
  Object.defineProperty(window, name, { configurable: true, writable: true, value });
}

function recognitionResults(...transcripts: string[]) {
  return { results: transcripts.map((transcript) => ({ isFinal: true, 0: { transcript } })) };
}

beforeEach(() => {
  recognitions.length = 0;
  utterances.length = 0;
  voiceList.length = 0;
  cancelPlayback.mockClear();
  vi.useFakeTimers();
  setWindowProperty("SpeechRecognition", FakeRecognition);
  setWindowProperty("webkitSpeechRecognition", undefined);
  setWindowProperty("isSecureContext", true);
  setWindowProperty("SpeechSynthesisUtterance", FakeUtterance);
  setWindowProperty("speechSynthesis", {
    getVoices: () => voiceList,
    speak: (utterance: SpeechSynthesisUtterance) => utterances.push(utterance),
    cancel: cancelPlayback,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useBrowserVoice recognition", () => {
  it("uses the webkit fallback and preserves the draft prefix while respecting the 4,000-character limit", () => {
    setWindowProperty("SpeechRecognition", undefined);
    setWindowProperty("webkitSpeechRecognition", FakeRecognition);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useBrowserVoice(onTranscript));
    act(() => result.current.startListening("For dinner"));
    expect(recognitions).toHaveLength(1);
    act(() => recognitions[0].onresult?.(recognitionResults("what should I wear?")));
    expect(onTranscript).toHaveBeenCalledWith("For dinner what should I wear?");

    act(() => result.current.startListening("a".repeat(3990)));
    act(() => recognitions[1].onresult?.(recognitionResults("b".repeat(50))));
    expect(onTranscript).toHaveBeenLastCalledWith("a".repeat(3990) + " " + "b".repeat(9));
    expect(onTranscript.mock.lastCall?.[0]).toHaveLength(4000);
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toContain("4,000-character limit");
  });

  it.each([
    ["not-allowed", "Microphone access was blocked"],
    ["network", "speech service could not connect"],
    ["no-speech", "No speech was detected"],
  ])("shows a useful message for the %s recognition error", (code, message) => {
    const { result } = renderHook(() => useBrowserVoice(vi.fn()));
    act(() => result.current.startListening(""));
    act(() => recognitions[0].onerror?.({ error: code }));
    expect(result.current.error).toContain(message);
    expect(result.current.listening).toBe(false);
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
  });

  it("stops after the recognition timeout", () => {
    const { result } = renderHook(() => useBrowserVoice(vi.fn()));
    act(() => result.current.startListening(""));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.listening).toBe(false);
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
  });

  it("replaces a repeated start and ignores callbacks retained after stopping", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useBrowserVoice(onTranscript));
    act(() => result.current.startListening("first"));
    const staleResult = recognitions[0].onresult;
    act(() => result.current.startListening("second"));
    expect(recognitions).toHaveLength(2);
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
    act(() => result.current.stopListening());
    act(() => staleResult?.(recognitionResults("too late")));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("only updates the draft and never submits dictated text", () => {
    const onTranscript = vi.fn();
    const onSend = vi.fn();
    function Harness() {
      const [draft, setDraft] = useState("");
      const voice = useBrowserVoice((value) => { onTranscript(value); setDraft(value); });
      return <>
        <VoiceControls voice={voice} draft={draft} disabled={false} />
        <textarea aria-label="Draft" value={draft} readOnly />
        <button type="button" onClick={onSend}>Send</button>
      </>;
    }
    const { getByRole } = render(<Harness />);
    act(() => getByRole("button", { name: "Dictate message" }).click());
    act(() => recognitions[0].onresult?.(recognitionResults("keep this as a draft")));
    expect((getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement).value).toBe("keep this as a draft");
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("useBrowserVoice synthesis and lifecycle", () => {
  it("plays Listen replies in chunks and stops queued playback", () => {
    const { result } = renderHook(() => useBrowserVoice(vi.fn()));
    const longReply = "A complete style suggestion. ".repeat(15);
    act(() => result.current.speak("reply-2", longReply));
    expect(utterances).toHaveLength(1);
    expect(result.current.speakingId).toBe("reply-2");
    expect(utterances[0].text.length).toBeLessThanOrEqual(160);
    const firstChunk = utterances[0].text;
    const finishFirstChunk = utterances[0].onend as unknown as (() => void) | null;
    act(() => finishFirstChunk?.());
    expect(utterances).toHaveLength(2);
    expect(utterances[1].text).not.toBe(firstChunk);
    act(() => result.current.stopSpeaking());
    expect(cancelPlayback).toHaveBeenCalled();
    expect(result.current.speakingId).toBeNull();
    const countAfterStop = utterances.length;
    const finishSecondChunk = utterances[1].onend as unknown as (() => void) | null;
    act(() => finishSecondChunk?.());
    expect(utterances).toHaveLength(countAfterStop);
  });

  it("cancels recognition and speech when the tab is hidden", () => {
    const { result } = renderHook(() => useBrowserVoice(vi.fn()));
    act(() => {
      result.current.startListening("");
      result.current.speak("reply", "Spoken reply");
    });
    expect(result.current.speakingId).toBe("reply");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.listening).toBe(false);
    expect(result.current.speakingId).toBeNull();
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
    expect(cancelPlayback).toHaveBeenCalled();
  });

  it("cancels both APIs on unmount (including navigation away)", () => {
    const { result, unmount } = renderHook(() => useBrowserVoice(vi.fn()));
    act(() => {
      result.current.startListening("");
      result.current.speak("reply", "Spoken reply");
    });
    unmount();
    expect(recognitions[0].abort).toHaveBeenCalledOnce();
    expect(cancelPlayback).toHaveBeenCalled();
  });

  it("stops voice on thread/account changes and resets automatic reading for a new account", () => {
    const { result, rerender } = renderHook(
      ({ threadId, userId }: { threadId: string | null; userId: string | undefined }) => {
        const voice = useBrowserVoice(vi.fn());
        useBrowserVoiceScope(voice, threadId, userId);
        return voice;
      },
      { initialProps: { threadId: "thread-1", userId: "user-1" } },
    );
    act(() => result.current.setAutoSpeak(true));
    act(() => result.current.startListening(""));
    const firstRecognition = recognitions[0];
    act(() => rerender({ threadId: "thread-2", userId: "user-1" }));
    expect(firstRecognition.abort).toHaveBeenCalledOnce();
    act(() => result.current.startListening(""));
    const secondRecognition = recognitions[1];
    act(() => rerender({ threadId: "thread-2", userId: "user-2" }));
    expect(secondRecognition.abort).toHaveBeenCalledOnce();
    expect(result.current.autoSpeak).toBe(false);
  });

  it("renders typed-chat fallbacks when speech APIs are unsupported", () => {
    setWindowProperty("SpeechRecognition", undefined);
    setWindowProperty("webkitSpeechRecognition", undefined);
    Reflect.deleteProperty(window, "speechSynthesis");
    Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
    const { result } = renderHook(() => useBrowserVoice(vi.fn()));
    const { getByText, getByRole } = render(<VoiceControls voice={result.current} draft="" disabled={false} />);
    expect(getByText(/Voice input isn’t supported/)).toBeTruthy();
    expect(getByText(/Spoken replies aren’t supported/)).toBeTruthy();
    expect((getByRole("button", { name: "Dictate message" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
