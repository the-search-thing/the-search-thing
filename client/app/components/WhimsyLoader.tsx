import { useEffect, useRef } from "react";

function getCol(_hex: string, a: number) {
  return `rgba(148,148,148,${a})`;
}

function draw(ctx: CanvasRenderingContext2D, size: number, elapsed: number, color: string) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const grid = size > 30 ? 5 : 3;
  const spacing = size > 30 ? 4.5 : 2.6;
  const pixel = size > 30 ? 2 : 1;

  for (let x = 0; x < grid; x++) {
    for (let y = 0; y < grid; y++) {
      const dx = (x - (grid - 1) / 2) * spacing;
      const dy = (y - (grid - 1) / 2) * spacing;
      const wave = 0.5 * Math.sin(0.0018 * elapsed - 0.38 * Math.hypot(dx, dy)) + 0.5;
      ctx.fillStyle = getCol(color, 0.08 + 0.82 * wave);
      ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), pixel, pixel);
    }
  }
}

export default function WhimsyLoader({ size = 48 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const scale = window.devicePixelRatio || 2;
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    const t0 = performance.now();
    let raf = 0;

    const loop = () => {
      draw(ctx, size, performance.now() - t0, "#949494");
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
