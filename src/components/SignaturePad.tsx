"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

export type SignaturePadHandle = { toPng: () => string | null; clear: () => void };

/** Finger/mouse signature canvas. Exports a transparent PNG; null if nothing was drawn. */
export default function SignaturePad({ ref, onChange }: { ref: Ref<SignaturePadHandle>; onChange?: (hasInk: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  // Match the canvas bitmap to its CSS size × device pixel ratio for crisp lines.
  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#1c2a6b"; // pen-ink blue
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    strokes.current++;
    if (!hasInk && strokes.current > 8) {
      setHasInk(true);
      onChange?.(true);
    }
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }

  useImperativeHandle(ref, () => ({
    toPng: () => (hasInk ? canvas.current!.toDataURL("image/png") : null),
    clear: () => {
      const c = canvas.current!;
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      strokes.current = 0;
      setHasInk(false);
      onChange?.(false);
    },
  }));

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="h-40 w-full touch-none rounded-2xl border border-dashed border-brass/50 bg-white"
        aria-label="Signature area — sign with your finger or mouse"
      />
      <div className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-ink/30" />
      <span className="pointer-events-none absolute bottom-2 left-6 text-xs text-muted">Sign above the line</span>
    </div>
  );
}
