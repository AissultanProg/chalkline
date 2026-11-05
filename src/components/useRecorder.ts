"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_SECONDS = 120;
const AUDIO_BITS_PER_SECOND = 64_000; // plenty for speech, and keeps a 2-minute memo around 1 MB

/** Pick a container the current browser can record (Chrome/Firefox: webm/opus, Safari: mp4/aac). */
function pickMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/**
 * Records a voice memo with job-site-friendly mic settings (noise suppression, echo cancel, auto gain),
 * exposes a live input level for the meter, and auto-stops at 2 minutes.
 */
export function useRecorder(onDone: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const unmounted = useRef(false);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Type the memo instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone access was blocked. Allow it in the address bar, or type the memo.");
      return;
    }

    let rec: MediaRecorder;
    try {
      const mimeType = pickMime();
      rec = new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND, ...(mimeType ? { mimeType } : {}) });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("This browser can't record audio. Type the memo instead.");
      return;
    }

    // Live level meter so the contractor can see the mic is hearing them.
    const ctx = new AudioContext();
    ctx.resume().catch(() => {}); // iPhones can start the context suspended
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.round(Math.min(1, peak / 64) * 10) / 10); // coarse steps avoid re-rendering every frame
      raf = requestAnimationFrame(tick);
    };
    tick();

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);

    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    cleanupRef.current = () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setLevel(0);
      cleanupRef.current = () => {}; // runs once, even if the screen closes right after stopping
    };
    rec.onstop = () => {
      cleanupRef.current();
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size > 0 && !unmounted.current) onDone(blob);
    };

    recRef.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
  }, [onDone, stop]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      cleanupRef.current();
    };
  }, []);

  return { recording, seconds, level, error, start, stop };
}
