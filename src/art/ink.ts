import type { Ctx } from "../world/types";
import { mulberry32, type Rng } from "./rng";

/** The warm dark-brown line used for every outline (the reference never uses black). */
export const INK = "#36261c";
export const LW = 1.1;
export const LW_FINE = 0.7;

export type Tone = readonly [light: string, mid: string, dark: string];

const mixCache = new Map<string, string>();
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const key = a + b + t.toFixed(3);
  const hit = mixCache.get(key);
  if (hit) return hit;
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bb = Math.round(b1 + (b2 - b1) * t);
  const out = `#${((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1)}`;
  mixCache.set(key, out);
  return out;
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function poly(ctx: Ctx, pts: readonly number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function line(ctx: Ctx, pts: readonly number[], color = INK, lw = LW_FINE) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Fill the current path, then outline it in ink. */
export function fs(ctx: Ctx, fill: string | CanvasGradient, lw = LW, stroke = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
}

export function circle(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0.01, r), 0, Math.PI * 2);
}

/** A scalloped, cloud-like outline: the reference's bush and canopy silhouette. */
export function blobPath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, bumps = 9, bulge = 0.32) {
  const r = mulberry32(seed);
  const n = Math.max(5, bumps);
  const pts: [number, number][] = [];
  const off = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const k = 0.86 + r() * 0.16;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const len = Math.hypot(dx, dy) || 1;
    const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const b = seg * bulge * (0.8 + r() * 0.5);
    ctx.quadraticCurveTo(mx + (dx / len) * b, my + (dy / len) * b, q[0], q[1]);
  }
  ctx.closePath();
}

export interface FoliageOpts {
  bumps?: number;
  dots?: number;
  dotColor?: string;
  marks?: number;
  lw?: number;
  flowers?: { color: string; count: number; size?: number };
}

/** A three-tone canopy: dark base, mid body, light crown, stippled with tiny dots and leaf ticks. */
export function foliage(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, tone: Tone, seed: number, o: FoliageOpts = {}) {
  const bumps = o.bumps ?? Math.round(7 + (rx + ry) / 6);
  blobPath(ctx, cx, cy, rx, ry, seed, bumps);
  ctx.fillStyle = tone[2];
  ctx.fill();
  ctx.save();
  ctx.clip();
  blobPath(ctx, cx - rx * 0.1, cy - ry * 0.14, rx * 0.88, ry * 0.8, seed + 1, bumps);
  ctx.fillStyle = tone[1];
  ctx.fill();
  blobPath(ctx, cx - rx * 0.28, cy - ry * 0.34, rx * 0.5, ry * 0.42, seed + 2, Math.max(5, bumps - 3));
  ctx.fillStyle = tone[0];
  ctx.fill();
  const r = mulberry32(seed + 7);
  const dots = o.dots ?? Math.round((rx * ry) / 18);
  if (dots > 0) {
    ctx.fillStyle = o.dotColor ?? mix(tone[0], "#fffbe8", 0.45);
    ctx.beginPath();
    for (let i = 0; i < dots; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.85;
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      const s = 0.35 + r() * 0.35;
      ctx.moveTo(x + s, y);
      ctx.arc(x, y, s, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  const marks = o.marks ?? Math.round((rx * ry) / 40);
  if (marks > 0) {
    ctx.strokeStyle = mix(tone[2], INK, 0.35);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let i = 0; i < marks; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.25 + Math.sqrt(r()) * 0.65;
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      const s = 1 + r() * 1.2;
      ctx.moveTo(x - s, y - s * 0.4);
      ctx.quadraticCurveTo(x, y + s * 0.5, x + s, y - s * 0.4);
    }
    ctx.stroke();
  }
  if (o.flowers) {
    const f = o.flowers;
    for (let i = 0; i < f.count; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.82;
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      const s = (f.size ?? 1.1) * (0.8 + r() * 0.4);
      circle(ctx, x, y, s);
      fs(ctx, f.color, 0.45);
    }
  }
  ctx.restore();
  blobPath(ctx, cx, cy, rx, ry, seed, bumps);
  ctx.lineWidth = o.lw ?? LW;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Soft ground shadow (multiplied), cast down-right as the light comes from the upper left. */
export function castShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.22) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#2b2140";
  ellipse(ctx, cx + rx * 0.25, cy + ry * 0.15, rx, ry);
  ctx.fill();
  ctx.restore();
}

export function stipple(ctx: Ctx, rng: Rng, x: number, y: number, w: number, h: number, count: number, color: string, size = 0.5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    ctx.moveTo(px + size, py);
    ctx.arc(px, py, size * (0.6 + rng() * 0.6), 0, Math.PI * 2);
  }
  ctx.fill();
}

/** Tiny flower heads on stalks, like the bell flowers scattered through the reference. */
export function flowerTuft(ctx: Ctx, x: number, y: number, seed: number, color: string, stem = "#5d7d3a", n = 3, h = 6) {
  const r = mulberry32(seed);
  ctx.strokeStyle = stem;
  ctx.lineWidth = 0.6;
  const heads: [number, number][] = [];
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const dx = (r() - 0.5) * 5;
    const hh = h * (0.6 + r() * 0.5);
    ctx.moveTo(x + dx * 0.3, y);
    ctx.quadraticCurveTo(x + dx * 0.5, y - hh * 0.5, x + dx, y - hh);
    heads.push([x + dx, y - hh]);
  }
  ctx.stroke();
  for (const [hx, hy] of heads) {
    circle(ctx, hx, hy, 1.05);
    fs(ctx, color, 0.45);
  }
}

export function grassTuft(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.8, x - s * 1.1, y - s * 1.6);
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + s * 0.1, y - s, x + s * 0.2, y - s * 2);
  ctx.moveTo(x + s * 0.8, y);
  ctx.quadraticCurveTo(x + s, y - s * 0.7, x + s * 1.5, y - s * 1.3);
  ctx.stroke();
}
