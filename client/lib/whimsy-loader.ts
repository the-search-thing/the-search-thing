/** pixloader — lattice pattern from https://www.whimsically.app/ */

function parseHex(hex: string): [number, number, number] {
  const e = hex.replace("#", "");
  if (e.length === 3) {
    return [
      parseInt(e[0] + e[0], 16),
      parseInt(e[1] + e[1], 16),
      parseInt(e[2] + e[2], 16),
    ];
  }
  return [
    parseInt(e.slice(0, 2), 16),
    parseInt(e.slice(2, 4), 16),
    parseInt(e.slice(4, 6), 16),
  ];
}

function whimsyColor(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function drawLattice(
  ctx: CanvasRenderingContext2D,
  size: number,
  elapsedMs: number,
  color: string,
): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const spacing = size > 30 ? 4 : 2.4;
  const block = size > 30 ? 3 : 2;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = (row - 1) * spacing;
      const y = (col - 1) * spacing;
      const alpha =
        0.06 +
        0.84 * Math.pow(Math.max(0, Math.sin(0.003 * elapsedMs - 0.7 * row - 0.35 * col)), 1.6);
      ctx.fillStyle = whimsyColor(color, alpha);
      ctx.fillRect(
        Math.round(cx + x) - Math.floor(block / 2),
        Math.round(cy + y) - Math.floor(block / 2),
        block,
        block,
      );
    }
  }
}
