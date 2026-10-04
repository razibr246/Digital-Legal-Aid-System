"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface Stroke {
  points: Point[];
}

interface SignaturePadProps {
  onChange: (dataUrl: string | null, size: { width: number; height: number } | null) => void;
  disabled?: boolean;
  className?: string;
  /** Text rendered under the signature line, e.g. the signer's name. */
  caption?: string;
}

/**
 * Freehand signature canvas, in the spirit of Excalidraw: pressure-aware
 * pointer input, quadratic-curve smoothing between midpoints, variable stroke
 * width, and undo/clear. Strokes are kept in memory so undo can repaint the
 * canvas from scratch rather than trying to reverse pixels.
 */
export function SignaturePad({ onChange, disabled, className, caption }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";

    for (const stroke of strokesRef.current) {
      const points = stroke.points;
      if (points.length === 0) continue;
      if (points.length === 1) {
        context.beginPath();
        context.arc(points[0].x, points[0].y, 1.4, 0, Math.PI * 2);
        context.fillStyle = "#0f172a";
        context.fill();
        continue;
      }
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const current = points[i];
        const midX = (previous.x + current.x) / 2;
        const midY = (previous.y + current.y) / 2;
        // Width follows the pointer so a stylus feels natural.
        context.lineWidth = 1.6 + current.pressure * 2.2;
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.quadraticCurveTo(previous.x, previous.y, midX, midY);
        context.lineTo(current.x, current.y);
        context.stroke();
      }
    }
  }, []);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (strokesRef.current.length === 0) {
      onChange(null, null);
      setHasInk(false);
      setCanUndo(false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    onChange(canvas.toDataURL("image/png"), {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    setHasInk(true);
    setCanUndo(strokesRef.current.length > 0);
  }, [onChange]);

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // Mouse reports 0.5 when down; a stylus reports real pressure.
      pressure: event.pressure > 0 && event.pressure !== 0.5 ? event.pressure : 0.5,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokesRef.current.push({ points: [pointFrom(event)] });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    strokesRef.current[strokesRef.current.length - 1]?.points.push(pointFrom(event));
    paint();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }
    paint();
    emit();
  };

  const undo = () => {
    strokesRef.current.pop();
    paint();
    emit();
  };

  const clear = () => {
    strokesRef.current = [];
    paint();
    emit();
  };

  useEffect(() => {
    paint();
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvasRef}
          className={cn("h-48 w-full touch-none", disabled ? "opacity-50" : "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          role="img"
          aria-label="ই-স্বাক্ষর আঁকার ক্ষেত্র"
        />
        {!hasInk ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">এখানে আঙুল বা মাউস দিয়ে স্বাক্ষর করুন</p>
          </div>
        ) : null}
        {/* Signature guide line, like a paper form. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-border" />
        {caption ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={disabled || !canUndo}>
          <Undo2 aria-hidden="true" />
          ফিরিয়ে আনুন
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !hasInk}>
          <Eraser aria-hidden="true" />
          মুছে ফেলুন
        </Button>
      </div>
    </div>
  );
}
