/**
 * Whimsy loaders — patterns from https://www.whimsically.app/
 * Scroll reveal — IntersectionObserver
 */

function parseHex(hex) {
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

function whimsyColor(hex, alpha) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DISSOLVE_PIXELS = [
  [0, -4],
  [0, -3],
  [0, -2],
  [0, 2],
  [0, 3],
  [0, 4],
  [-4, 0],
  [-3, 0],
  [-2, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [-2, -2],
  [-1, -1],
  [1, -1],
  [2, -2],
  [-2, 2],
  [-1, 1],
  [1, 1],
  [2, 2],
];

const CRAB_BODY_PIXELS = [
  [-4, 0],
  [-3, 0],
  [-2, 0],
  [-1, 0],
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [-4, -1],
  [-3, -1],
  [-2, -1],
  [-1, -1],
  [0, -1],
  [1, -1],
  [2, -1],
  [3, -1],
  [4, -1],
  [-4, 1],
  [-3, 1],
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [-3, -2],
  [-2, -2],
  [-1, -2],
  [0, -2],
  [1, -2],
  [2, -2],
  [3, -2],
  [-3, 2],
  [-2, 2],
  [-1, 2],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
];

/** pixloader — crab */
function drawCrab(ctx, size, elapsedMs, color) {
  ctx.clearRect(0, 0, size, size);
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  const px = Math.max(1, Math.round(size * 0.032));

  const dot = (x, y, alpha) => {
    ctx.fillStyle = whimsyColor(color, alpha);
    ctx.fillRect(Math.round(cx + x * px), Math.round(cy + y * px), px, px);
  };

  CRAB_BODY_PIXELS.forEach(([x, y]) => dot(x, y, 0.62));
  dot(-1, -3, 0.72);
  dot(1, -3, 0.72);
  dot(-1, -2, 0.58);
  dot(1, -2, 0.58);

  if (Math.floor(elapsedMs / 2800) % 6 === 0 && elapsedMs % 2800 < 160) {
    ctx.fillStyle = whimsyColor(color, 0.5);
    ctx.fillRect(
      Math.round(cx - 1.5 * px),
      Math.round(cy - 3 * px),
      2 * px,
      Math.max(1, Math.round(0.4 * px)),
    );
  } else {
    dot(-1, -3, 0.92);
    dot(1, -3, 0.92);
  }

  const clawSwing = Math.round(1.5 * Math.sin(0.0018 * elapsedMs));

  [
    [-5, -2],
    [-6, -2],
    [-6, -1],
    [-5, -1],
    [-6, -3],
    [-7, -2],
  ].forEach(([x, y]) => dot(x, y, 0.65));
  dot(-7, -1 + clawSwing, 0.55);
  dot(-7, -3 - clawSwing, 0.45);

  [
    [5, -2],
    [6, -2],
    [6, -1],
    [5, -1],
    [6, -3],
    [7, -2],
  ].forEach(([x, y]) => dot(x, y, 0.65));
  dot(7, -1 + clawSwing, 0.55);
  dot(7, -3 - clawSwing, 0.45);

  [
    [-5, 0],
    [-4, -1],
  ].forEach(([x, y]) => dot(x, y, 0.58));
  [
    [5, 0],
    [4, -1],
  ].forEach(([x, y]) => dot(x, y, 0.58));

  const t = 0.003 * elapsedMs;
  [
    { bx: -4, by: 2, phase: t },
    { bx: -3, by: 2, phase: t + 0.5 * Math.PI },
    { bx: -2, by: 2, phase: t + Math.PI },
    { bx: -1, by: 2, phase: t + 1.5 * Math.PI },
    { bx: 1, by: 2, phase: t },
    { bx: 2, by: 2, phase: t + 0.5 * Math.PI },
    { bx: 3, by: 2, phase: t + Math.PI },
    { bx: 4, by: 2, phase: t + 1.5 * Math.PI },
  ].forEach(({ bx, by, phase }) => {
    const intensity = Math.abs(Math.sin(phase));
    const direction = bx < 0 ? -1 : 1;
    const legX = bx + direction * Math.round(1 + intensity);
    const legY = by + Math.round(1.2 * Math.sin(phase));
    dot(bx, by, 0.52);
    dot(legX, legY, 0.42 + 0.2 * intensity);
    if (intensity > 0.5) dot(legX + direction, legY + 1, 0.28);
  });
}

/** pixloader — lattice */
function drawLattice(ctx, size, elapsedMs, color) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const spacing = Math.max(3, Math.round(size * 0.16));
  const block = Math.max(2, Math.round(size * 0.12));

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

/** pixloader — dissolve */
function drawDissolve(ctx, size, elapsedMs, color) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const px = Math.max(1, Math.round(size * 0.07));

  DISSOLVE_PIXELS.forEach(([x, y], i) => {
    const dist = Math.hypot(x, y);
    const alpha =
      0.12 + 0.78 * Math.abs(Math.sin(0.002 * elapsedMs - 0.55 * dist + 0.33 * i));
    ctx.fillStyle = whimsyColor(color, alpha);
    ctx.fillRect(
      Math.round(cx + x * px - px / 2),
      Math.round(cy + y * px - px / 2),
      px,
      px,
    );
  });

  ctx.fillStyle = whimsyColor(color, 0.9);
  ctx.fillRect(cx - px / 2, cy - px / 2, px, px);

  for (let i = 0; i < 4; i++) {
    const angle = 0.0022 * elapsedMs + (i / 4) * Math.PI * 2;
    const orbit = Math.max(6, Math.round(size * 0.28));
    const sparkle = Math.max(1, Math.round(px * 0.6));
    ctx.fillStyle = whimsyColor(
      color,
      0.1 + 0.28 * Math.abs(Math.sin(0.003 * elapsedMs + 1.4 * i)),
    );
    ctx.fillRect(
      Math.round(cx + Math.cos(angle) * orbit),
      Math.round(cy + Math.sin(angle) * orbit),
      sparkle,
      sparkle,
    );
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initWhimsyLoaders() {
  const reduced = prefersReducedMotion();

  document.querySelectorAll("[data-whimsy-loader]").forEach((wrapper) => {
    const canvas = wrapper.querySelector("canvas");
    if (!canvas) return;

    const size = Number(wrapper.dataset.size) || 48;
    const color = wrapper.dataset.color || "#525252";
    const loader = wrapper.dataset.loader || "dissolve";
    const draw =
      loader === "lattice" ? drawLattice : loader === "crab" ? drawCrab : drawDissolve;
    const sc = window.devicePixelRatio || 2;
    canvas.width = size * sc;
    canvas.height = size * sc;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(sc, sc);

    const t0 = performance.now();
    let raf;

    const loop = () => {
      draw(ctx, size, reduced ? 0 : performance.now() - t0, color);
      if (!reduced) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
  });
}

function revealMotionElement(el, observer) {
  el.classList.add("motion-visible");
  observer.unobserve(el);
}

/** True when any part of the element is in the viewport (works with nowrap / wide layout). */
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function initScrollReveal() {
  const motionSelector =
    ".motion-fade-in, .motion-slide-in-up, .motion-reveal-up, .motion-pop-in";
  const elements = document.querySelectorAll(motionSelector);
  if (!elements.length) return;

  if (prefersReducedMotion()) {
    elements.forEach((el) => el.classList.add("motion-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) revealMotionElement(entry.target, observer);
      }
    },
    /* threshold 0: wide nowrap rows rarely hit 12% visible area */
    { rootMargin: "120px 0px 120px 0px", threshold: 0 },
  );

  elements.forEach((el) => observer.observe(el));

  /* After layout, show anything already on screen (hero + first features). */
  requestAnimationFrame(() => {
    elements.forEach((el) => {
      if (el.classList.contains("motion-visible")) return;
      if (isInViewport(el)) revealMotionElement(el, observer);
    });
  });
}

function initFaqAccordion() {
  const items = document.querySelectorAll(".faq-list .faq__item");
  if (!items.length) return;

  items.forEach((item) => {
    const summary = item.querySelector(".faq__summary");
    if (summary) {
      summary.addEventListener("click", (e) => e.preventDefault());
    }

    const toggleItem = () => {
      const opening = !item.open;
      items.forEach((other) => {
        if (other !== item && other.open) other.open = false;
      });
      item.open = opening;
    };

    item.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      toggleItem();
    });

    if (summary) {
      summary.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggleItem();
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initWhimsyLoaders();
  initScrollReveal();
  initFaqAccordion();
});
