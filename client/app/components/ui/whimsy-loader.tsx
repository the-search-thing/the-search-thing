import { useEffect, useRef } from "react";
import { drawLattice } from "@/lib/whimsy-loader";
import { cn } from "@/lib/utils";

type WhimsyLoaderProps = {
  size?: number;
  color?: string;
  className?: string;
  "aria-label"?: string;
};

export function WhimsyLoader({
  size = 56,
  color = "#ffb3b3",
  className,
  "aria-label": ariaLabel = "Loading",
}: WhimsyLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sc = window.devicePixelRatio || 2;
    canvas.width = size * sc;
    canvas.height = size * sc;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(sc, sc);

    const t0 = performance.now();
    let raf: number;

    const loop = () => {
      drawLattice(ctx, size, reduced ? 0 : performance.now() - t0, color);
      if (!reduced) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="status"
      aria-label={ariaLabel}
      className={cn("block shrink-0", className)}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
