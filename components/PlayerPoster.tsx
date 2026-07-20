"use client";

/**
 * PlayerPoster — a player's tournament as generative art.
 *
 * Canvas 2D, 900x1200 internal, displayed responsive. Every random decision
 * derives from `seed` (mulberry32 over a string hash), so the same player
 * always gets the same poster. A curl-noise flow field is warped by
 * "attractors" placed at the player's typical slot and their shot locations —
 * their territory glows with particle density. Shots are drawn as a
 * constellation sized by xG; goals are ringed in gold.
 *
 * No external images touch the canvas, so it stays untainted for toBlob.
 * The intro build-up (batched trail reveal) is skipped under
 * prefers-reduced-motion; the final frame is byte-identical either way
 * because the draw-call sequence is identical.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type PosterShot = { x: number; y: number; xg: number; goal: boolean };

export type PlayerPosterProps = {
  name: string;
  team: string;
  color: string; // team hex
  overall: number;
  tier: "gold" | "silver" | "bronze";
  pos: string;
  /** pitch % coords: x = 0-100 toward opponent goal, y = 0-100 across */
  shots: PosterShot[];
  /** typical position, same frame as shots (line = depth toward goal, side = across) */
  slot: { line: number; side: number } | null;
  /** player id — all randomness derives from this */
  seed: string;
};

/* ---------------- geometry ---------------- */

const W = 900;
const H = 1200;
// art region (portrait pitch, opponent goal at top)
const PX = 70;
const PY = 64;
const PW = 760;
const PH = 776;
const TAU = Math.PI * 2;

const mapX = (acrossPct: number) => PX + (acrossPct / 100) * PW;
const mapY = (depthPct: number) => PY + (1 - depthPct / 100) * PH;

/* ---------------- deterministic randomness ---------------- */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seeded 2D value noise in [-1, 1] */
function makeNoise2D(rng: () => number): (x: number, y: number) => number {
  const vals = new Float32Array(256);
  const p: number[] = [];
  for (let i = 0; i < 256; i++) {
    vals[i] = rng() * 2 - 1;
    p.push(i);
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const at = (xi: number, yi: number) => vals[perm[perm[xi & 255] + (yi & 255)]];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/* ---------------- color ---------------- */

type RGB = [number, number, number];

const CHALK: RGB = [237, 242, 232];
const GOLD: RGB = [227, 190, 86];
const DIM = "rgba(148,167,150,1)";
const FAINT = "rgba(90,107,92,1)";
const TIER_RGB: Record<"gold" | "silver" | "bronze", RGB> = {
  gold: GOLD,
  silver: [201, 212, 204],
  bronze: [201, 138, 94],
};

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return GOLD;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/* ---------------- typography helpers ---------------- */

type Fonts = { display: string; mono: string };

/** manual letter tracking — ctx.letterSpacing is not supported everywhere */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "right" = "left"
): void {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + tracking;
  total -= tracking;
  let cx = align === "right" ? x - total : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/* ---------------- poster build (all deterministic) ---------------- */

type Trail = { pts: Float32Array; n: number; style: string; width: number };
type Attractor = { px: number; py: number; w: number; goal: boolean };

type Ops = {
  base: (ctx: CanvasRenderingContext2D) => void;
  trails: Trail[];
  stroke: (ctx: CanvasRenderingContext2D, t: Trail) => void;
  finish: (ctx: CanvasRenderingContext2D) => void;
};

function buildPoster(p: PlayerPosterProps, fonts: Fonts): Ops {
  const rng = mulberry32(hashSeed(p.seed));
  const noise = makeNoise2D(rng);
  const TEAM = hexToRgb(p.color);
  const tierRgb = TIER_RGB[p.tier];

  const fbm = (x: number, y: number): number => {
    let v = 0;
    let amp = 1;
    let freq = 1;
    let max = 0;
    for (let o = 0; o < 4; o++) {
      v += amp * noise(x * freq, y * freq);
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / max;
  };

  // -- attractors: slot + shots; their territory drives spawn density + field swirl
  // clamp the slot a touch inboard so touchline players don't sit on the chalk
  const clampPct = (v: number) => Math.min(Math.max(v, 5), 95);
  const slotXY = p.slot
    ? { x: mapX(clampPct(p.slot.side)), y: mapY(clampPct(p.slot.line)) }
    : null;
  const attractors: Attractor[] = [];
  if (slotXY) {
    attractors.push({ px: slotXY.x, py: slotXY.y, w: 1.5, goal: false });
  }
  for (const s of p.shots) {
    attractors.push({
      px: mapX(s.y),
      py: mapY(s.x),
      w: 0.35 + Math.min(Math.max(s.xg, 0), 1) * 1.6 + (s.goal ? 0.5 : 0),
      goal: s.goal,
    });
  }
  if (attractors.length === 0) {
    attractors.push({ px: mapX(50), py: mapY(55), w: 1.2, goal: false });
  }
  const totalW = attractors.reduce((s, a) => s + a.w, 0);
  const pickAttractor = (): Attractor => {
    let r = rng() * totalW;
    for (const a of attractors) {
      r -= a.w;
      if (r <= 0) return a;
    }
    return attractors[attractors.length - 1];
  };

  const gauss = (): number => {
    const u = Math.max(rng(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
  };

  // -- curl-noise field warped by attractor swirl
  const NS = 0.0042; // noise scale: features ~240px
  const SIG = 140; // attractor influence radius
  const vec = { x: 0, y: 0 };
  const field = (x: number, y: number): void => {
    const e = 2.5;
    let vx = fbm(x * NS, (y + e) * NS) - fbm(x * NS, (y - e) * NS);
    let vy = -(fbm((x + e) * NS, y * NS) - fbm((x - e) * NS, y * NS));
    const l = Math.hypot(vx, vy) || 1;
    vx /= l;
    vy /= l;
    for (const a of attractors) {
      const dx = x - a.px;
      const dy = y - a.py;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 0.001;
      const inf = a.w * Math.exp(-d2 / (2 * SIG * SIG));
      vx += (-dy / d) * inf * 0.9 - (dx / d) * inf * 0.35; // orbit + gentle pull
      vy += (dx / d) * inf * 0.9 - (dy / d) * inf * 0.35;
    }
    const l2 = Math.hypot(vx, vy) || 1;
    vec.x = vx / l2;
    vec.y = vy / l2;
  };

  // -- trace trails once at build time (render is just replaying strokes)
  const COUNT = matchMedia("(max-width: 640px)").matches ? 650 : 1500; // mobile CPUs trace fewer trails
  const STEP = 3.4;
  const trails: Trail[] = [];
  for (let i = 0; i < COUNT; i++) {
    let sx: number;
    let sy: number;
    let born: Attractor | null = null;
    if (rng() < 0.7) {
      born = pickAttractor();
      const sig = 34 + born.w * 26;
      sx = born.px + gauss() * sig;
      sy = born.py + gauss() * sig;
    } else {
      sx = PX + rng() * PW;
      sy = PY + rng() * PH;
    }

    const roll = rng();
    let col: RGB;
    if (roll < (born?.goal ? 0.22 : 0.05)) col = GOLD;
    else if (roll < (born?.goal ? 0.32 : 0.24)) col = mix(TEAM, CHALK, 0.35 + rng() * 0.3);
    else col = mix(TEAM, CHALK, rng() * 0.15);
    const alpha = 0.045 + rng() * 0.075 + (born ? 0.015 : 0);
    const width = (0.6 + rng() * 1.1) * (col === GOLD ? 0.8 : 1);

    const steps = 60 + Math.floor(rng() * 90);
    const pts = new Float32Array((steps + 1) * 2);
    let n = 0;
    let x = sx;
    let y = sy;
    for (let s = 0; s <= steps; s++) {
      if (x < PX - 10 || x > PX + PW + 10 || y < PY - 10 || y > PY + PH + 10) break;
      pts[n * 2] = x;
      pts[n * 2 + 1] = y;
      n++;
      field(x, y);
      x += vec.x * STEP;
      y += vec.y * STEP;
    }
    if (n > 4) trails.push({ pts, n, style: rgba(col, alpha), width });
  }

  /* ---- layer 0: night turf, chalk pitch, watermark, territory glow ---- */
  const base = (ctx: CanvasRenderingContext2D): void => {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#050d08";
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.36, 60, W * 0.5, H * 0.36, 900);
    bg.addColorStop(0, "#0a1710");
    bg.addColorStop(1, "#040b07");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // mowing stripes
    const bands = 14;
    const bh = PH / bands;
    ctx.fillStyle = "rgba(210,235,215,0.016)";
    for (let k = 0; k < bands; k += 2) ctx.fillRect(PX, PY + k * bh, PW, bh);

    // seeded grain
    for (let i = 0; i < 750; i++) {
      const gx = rng() * W;
      const gy = rng() * H;
      ctx.fillStyle = rgba(CHALK, 0.015 + rng() * 0.025);
      ctx.fillRect(gx, gy, 1 + rng() * 1.2, 1 + rng() * 1.2);
    }

    // giant overall watermark, tier-tinted, behind everything
    ctx.font = `700 210px ${fonts.display}`;
    ctx.textAlign = "right";
    ctx.fillStyle = rgba(tierRgb, 0.07);
    ctx.fillText(String(p.overall), W - 54, 262);
    ctx.textAlign = "left";

    // chalk pitch lines (opponent goal at top)
    const cx = PX + PW / 2;
    const midY = PY + PH / 2;
    const line = (a: number) => rgba(CHALK, a);
    ctx.lineWidth = 2;
    ctx.strokeStyle = line(0.1);
    ctx.strokeRect(PX, PY, PW, PH);
    ctx.beginPath();
    ctx.moveTo(PX, midY);
    ctx.lineTo(PX + PW, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, midY, 76, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, midY, 3, 0, TAU);
    ctx.fillStyle = line(0.12);
    ctx.fill();
    // penalty + six-yard boxes, spots, arcs — top (their goal) and bottom
    const boxW = 450;
    const boxD = 122;
    const sixW = 205;
    const sixD = 41;
    const spotD = 81;
    ctx.strokeRect(cx - boxW / 2, PY, boxW, boxD);
    ctx.strokeRect(cx - sixW / 2, PY, sixW, sixD);
    ctx.strokeRect(cx - boxW / 2, PY + PH - boxD, boxW, boxD);
    ctx.strokeRect(cx - sixW / 2, PY + PH - sixD, sixW, sixD);
    ctx.beginPath();
    ctx.arc(cx, PY + spotD, 2.4, 0, TAU);
    ctx.arc(cx, PY + PH - spotD, 2.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, PY + spotD, 76, 0.569, Math.PI - 0.569);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, PY + PH - spotD, 76, Math.PI + 0.569, TAU - 0.569);
    ctx.stroke();
    // corner arcs
    ctx.beginPath();
    ctx.arc(PX, PY, 14, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PX + PW, PY, 14, Math.PI / 2, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PX + PW, PY + PH, 14, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PX, PY + PH, 14, Math.PI * 1.5, TAU);
    ctx.stroke();
    // the goal they attack: a brighter chalk mouth at the top
    ctx.fillStyle = line(0.35);
    ctx.fillRect(cx - 41, PY - 8, 82, 3);

    // territory glow under the particles
    ctx.globalCompositeOperation = "lighter";
    for (const a of attractors) {
      const r = 120 + a.w * 55;
      const g = ctx.createRadialGradient(a.px, a.py, 0, a.px, a.py, r);
      g.addColorStop(0, rgba(a.goal ? GOLD : TEAM, 0.08 * Math.min(a.w, 1.6)));
      g.addColorStop(1, rgba(a.goal ? GOLD : TEAM, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(a.px, a.py, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // slot marker: faint chalk crosshair at their typical position
    if (slotXY) {
      const sx = slotXY.x;
      const sy = slotXY.y;
      ctx.strokeStyle = line(0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 20, sy);
      ctx.lineTo(sx - 8, sy);
      ctx.moveTo(sx + 8, sy);
      ctx.lineTo(sx + 20, sy);
      ctx.moveTo(sx, sy - 20);
      ctx.lineTo(sx, sy - 8);
      ctx.moveTo(sx, sy + 8);
      ctx.lineTo(sx, sy + 20);
      ctx.stroke();
    }
  };

  /* ---- layer 1: one flow-field trail (drawn in batches by the caller) ---- */
  const stroke = (ctx: CanvasRenderingContext2D, t: Trail): void => {
    ctx.strokeStyle = t.style;
    ctx.lineWidth = t.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(t.pts[0], t.pts[1]);
    for (let i = 1; i < t.n; i++) ctx.lineTo(t.pts[i * 2], t.pts[i * 2 + 1]);
    ctx.stroke();
  };

  /* ---- layer 2: vignette, shot constellation, typography ---- */
  const finish = (ctx: CanvasRenderingContext2D): void => {
    ctx.globalCompositeOperation = "source-over";
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.4, 260, W * 0.5, H * 0.4, 1000);
    vg.addColorStop(0, "rgba(2,7,4,0)");
    vg.addColorStop(1, "rgba(2,7,4,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    // settle the type block
    const tb = ctx.createLinearGradient(0, PY + PH - 20, 0, PY + PH + 60);
    tb.addColorStop(0, "rgba(5,13,8,0)");
    tb.addColorStop(1, "rgba(5,13,8,0.75)");
    ctx.fillStyle = tb;
    ctx.fillRect(0, PY + PH - 20, W, H - (PY + PH) + 20);

    // constellation links, chronological
    if (p.shots.length > 1) {
      ctx.strokeStyle = rgba(CHALK, 0.12);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      p.shots.forEach((s, i) => {
        const x = mapX(s.y);
        const y = mapY(s.x);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // shot stars sized by xG; goals ringed in gold
    for (const s of p.shots) {
      const x = mapX(s.y);
      const y = mapY(s.x);
      const r = 4 + Math.min(Math.max(s.xg, 0), 0.9) * 15;
      const c = s.goal ? GOLD : TEAM;
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, rgba(c, 0.45));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba(c, 0.95);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r * 0.38, 2.2), 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(CHALK, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r * 0.16, 1.1), 0, TAU);
      ctx.fill();
      if (s.goal) {
        ctx.strokeStyle = rgba(GOLD, 0.9);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba(GOLD, 0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, TAU);
        ctx.stroke();
      }
    }

    // ---- typography block ----
    const totXg = p.shots.reduce((s, x) => s + x.xg, 0);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(GOLD, 1);
    ctx.fillRect(PX, 900, 46, 3);

    ctx.font = `500 14px ${fonts.mono}`;
    ctx.fillStyle = DIM;
    drawTracked(
      ctx,
      `WORLD CUP 2026 · ${p.shots.length} SHOTS · ${totXg.toFixed(2)} XG`,
      PX,
      938,
      4
    );

    let size = 64;
    const nm = p.name.toUpperCase();
    ctx.font = `700 ${size}px ${fonts.display}`;
    while (ctx.measureText(nm).width > PW && size > 30) {
      size -= 2;
      ctx.font = `700 ${size}px ${fonts.display}`;
    }
    ctx.fillStyle = rgba(CHALK, 1);
    ctx.fillText(nm, PX, 1018);

    ctx.font = `500 22px ${fonts.mono}`;
    let mx = PX;
    const seg = (txt: string, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillText(txt, mx, 1060);
      mx += ctx.measureText(txt).width;
    };
    seg(p.team.toUpperCase(), DIM);
    seg("  ·  ", FAINT);
    seg(p.pos.toUpperCase(), DIM);
    seg("  ·  ", FAINT);
    seg("OVR ", FAINT);
    seg(String(p.overall), rgba(tierRgb, 1));

    ctx.fillStyle = rgba(CHALK, 0.08);
    ctx.fillRect(PX, 1096, PW, 1);

    ctx.font = `700 26px ${fonts.display}`;
    ctx.fillStyle = rgba(CHALK, 0.92);
    ctx.fillText("MUNDIAL", PX, 1150);
    const mw = ctx.measureText("MUNDIAL").width;
    ctx.fillStyle = rgba(GOLD, 1);
    ctx.fillText("·26", PX + mw + 2, 1150);

    ctx.font = `400 13px ${fonts.mono}`;
    ctx.fillStyle = FAINT;
    drawTracked(ctx, `SEED ${p.seed}`, PX + PW, 1148, 2, "right");
  };

  return { base, trails, stroke, finish };
}

/* ---------------- component ---------------- */

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";

/** next/font registers hashed family names; resolve them from the CSS vars */
function resolveFonts(el: HTMLElement): Fonts {
  const read = (name: string, fallback: string): string => {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v ? `${v}, ${fallback}` : fallback;
  };
  return {
    display: read("--font-barlow", '"Barlow Condensed", sans-serif'),
    mono: read("--font-plex-mono", '"IBM Plex Mono", monospace'),
  };
}

export default function PlayerPoster(props: PlayerPosterProps) {
  const { name, team, color, overall, tier, pos, seed } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const masterRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  const shotsKey = useMemo(() => JSON.stringify(props.shots), [props.shots]);
  const slotKey = useMemo(() => JSON.stringify(props.slot), [props.slot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let raf = 0;
    let watchdog = 0;
    setReady(false);

    const run = async (): Promise<void> => {
      const fonts = resolveFonts(canvas);
      // wait for the app fonts (bounded — fall back to system metrics after 1.5s)
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load(`700 64px ${fonts.display}`),
            document.fonts.load(`500 22px ${fonts.mono}`),
            document.fonts.ready,
          ]),
          new Promise<void>((res) => window.setTimeout(res, 1500)),
        ]);
      } catch {
        /* render with fallback fonts */
      }
      if (cancelled) return;

      const master = document.createElement("canvas");
      master.width = W;
      master.height = H;
      const mctx = master.getContext("2d");
      const vctx = canvas.getContext("2d");
      if (!mctx || !vctx) return;

      const shots: PosterShot[] = JSON.parse(shotsKey);
      const slot: PlayerPosterProps["slot"] = JSON.parse(slotKey);
      const ops = buildPoster(
        { name, team, color, overall, tier, pos, seed, shots, slot },
        fonts
      );

      // the master is always rendered completely and synchronously — it is the
      // download source and the final frame, identical regardless of motion
      ops.base(mctx);
      mctx.globalCompositeOperation = "lighter";
      for (const t of ops.trails) ops.stroke(mctx, t);
      ops.finish(mctx);
      masterRef.current = master;
      setReady(true);

      const blit = (): void => {
        vctx.clearRect(0, 0, W, H);
        vctx.drawImage(master, 0, 0);
      };

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        blit();
        return;
      }

      // cosmetic intro: replay the trail strokes on the visible canvas, then
      // settle onto the finished master; a watchdog guarantees completion even
      // if rAF is throttled
      ops.base(vctx);
      let i = 0;
      let done = false;
      const settle = (): void => {
        if (done) return;
        done = true;
        blit();
      };
      const perFrame = Math.max(24, Math.ceil(ops.trails.length / 52));
      const step = (): void => {
        if (cancelled || done) return;
        vctx.globalCompositeOperation = "lighter";
        const end = Math.min(i + perFrame, ops.trails.length);
        for (; i < end; i++) ops.stroke(vctx, ops.trails[i]);
        vctx.globalCompositeOperation = "source-over";
        if (i < ops.trails.length) raf = requestAnimationFrame(step);
        else settle();
      };
      raf = requestAnimationFrame(step);
      watchdog = window.setTimeout(() => {
        if (!cancelled) settle();
      }, 4000);
    };

    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(watchdog);
    };
  }, [name, team, color, overall, tier, pos, seed, shotsKey, slotKey]);

  const download = (): void => {
    const master = masterRef.current;
    if (!master) return;
    master.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(name)}-mundial26.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        role="img"
        aria-label={`Generative poster of ${name}'s tournament — flow-field particles in team colors with shots as gold-ringed constellation points`}
        className="block h-auto w-full rounded border border-pitchline bg-bg"
      />
      <button
        type="button"
        onClick={download}
        disabled={!ready}
        className="data mt-3 w-full rounded border border-pitchline bg-raised px-4 py-2 text-sm text-chalk transition-colors hover:border-gold hover:text-gold disabled:cursor-default disabled:opacity-40"
      >
        {ready ? "Download poster" : "Rendering…"}
      </button>
    </div>
  );
}
