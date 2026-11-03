"use client";
import { useCallback, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in TS's DOM lib everywhere). */
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech-to-text (free, on-device/OS service). Works in Chrome, Edge and Safari (incl. iOS).
 * Calls onFinal with each finalized phrase; exposes the in-progress phrase as `interim`.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);

  const start = useCallback(
    (lang: string) => {
      const Ctor = getCtor();
      if (!Ctor) {
        setError("Voice isn't supported in this browser — type the memo instead (Chrome or Safari support voice).");
        return;
      }
      setError(null);
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) onFinal(r[0].transcript.trim());
          else live += r[0].transcript;
        }
        setInterim(live);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed") setError("Microphone permission was blocked. Allow it in the address bar, or type instead.");
        else if (e.error !== "no-speech" && e.error !== "aborted") setError(`Voice error: ${e.error}`);
      };
      rec.onend = () => {
        setListening(false);
        setInterim("");
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    },
    [onFinal],
  );

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { listening, interim, error, start, stop };
}
