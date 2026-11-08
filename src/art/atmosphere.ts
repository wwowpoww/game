import type { Atmosphere, Ctx, Rect } from "../world/types";
import { INK, rgba } from "./ink";
import { mulberry32 } from "./rng";

/** Soft radial-gradient sprites, rendered once per colour and stamped with drawImage. */
const sprites = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let c = sprites.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, c);
  return c;
}

export interface AtmosphereSpec {
  core: Rect;
  bounds: Rect;
  sun: { x: number; y: number; r: number; color: string; alpha: number };
  shade: { color: string; alpha: number };
  vignette: number;
  mist: { color: string; alpha: number; count: number; yMin: number; yMax: number };
  particles?: { kind: "petal" | "mote" | "ember" | "leaf"; colors: string[]; count: number };
  birds?: { count: number; color: string; y0: number; y1: number };
  /** Twinkling points of light drifting slowly (fireflies, glints). */
  sparkles?: { count: number; color: string };
  /** A soft beam of light slowly sweeping across the scene. */
  sweep?: boolean;
  /** Butterflies wandering on looping paths, wings beating. */
  butterflies?: { count: number; colors: string[] };
  /** A second fall of tumbling leaves. */
  leaves?: { count: number; colors: string[] };
  seed: number;
}

/** Light, shade, drifting mist, motes and birds, all in world coordinates so the lens matches. */
export function makeAtmosphere(s: AtmosphereSpec): Atmosphere {
  const r = mulberry32(s.seed);
  const mists = Array.from({ length: s.mist.count }, () => ({
    x: s.bounds.x + r() * s.bounds.w,
    y: s.mist.yMin + r() * (s.mist.yMax - s.mist.yMin),
    rx: 120 + r() * 260,
    ry: 18 + r() * 34,
    v: 3 + r() * 6,
    a: 0.5 + r() * 0.5,
  }));
  const parts = s.particles
    ? Array.from({ length: s.particles.count }, () => ({
        x: s.core.x + r() * s.core.w,
        y: s.core.y + r() * s.core.h,
        v: 6 + r() * 10,
        ph: r() * 10,
        c: s.particles!.colors[Math.floor(r() * s.particles!.colors.length)],
        size: 0.8 + r() * 1.2,
      }))
    : [];
  const birds = s.birds
    ? Array.from({ length: s.birds.count }, () => ({
        y: s.birds!.y0 + r() * (s.birds!.y1 - s.birds!.y0),
        v: 14 + r() * 10,
        ph: r() * 1000,
        amp: 10 + r() * 20,
      }))
    : [];

  const sparks = s.sparkles
    ? Array.from({ length: s.sparkles.count }, () => ({ x: s.core.x + r() * s.core.w, y: s.core.y + r() * s.core.h, ph: r() * 10, sp: 0.4 + r() * 0.8, rad: 8 + r() * 10 }))
    : [];

  const flies = s.butterflies
    ? Array.from({ length: s.butterflies.count }, () => ({ x: s.core.x + r() * s.core.w, y: s.core.y + 80 + r() * (s.core.h - 160), ph: r() * 20, sp: 0.5 + r() * 0.6, c: s.butterflies!.colors[Math.floor(r() * s.butterflies!.colors.length)] }))
    : [];
  const leafs = s.leaves
    ? Array.from({ length: s.leaves.count }, () => ({ x: s.core.x + r() * s.core.w, v: 14 + r() * 14, ph: r() * 10, c: s.leaves!.colors[Math.floor(r() * s.leaves!.colors.length)], size: 2.4 + r() * 1.8 }))
    : [];

  const draw = (ctx: Ctx, t: number, view: Rect, reduced: boolean) => {
    const tt = reduced ? t * 0.25 : t;
    // Warm key light from the sun's side.
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const sg = ctx.createRadialGradient(s.sun.x, s.sun.y, 0, s.sun.x, s.sun.y, s.sun.r);
    sg.addColorStop(0, rgba(s.sun.color, s.sun.alpha));
    sg.addColorStop(1, rgba(s.sun.color, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.globalCompositeOperation = "screen";
    const sg2 = ctx.createRadialGradient(s.sun.x, s.sun.y, 0, s.sun.x, s.sun.y, s.sun.r * 0.7);
    sg2.addColorStop(0, rgba(s.sun.color, s.sun.alpha * 0.35));
    sg2.addColorStop(1, rgba(s.sun.color, 0));
    ctx.fillStyle = sg2;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // Cool shade falling away from the light.
    ctx.globalCompositeOperation = "multiply";
    const c = s.core;
    const lg = ctx.createLinearGradient(c.x + c.w * 0.2, c.y, c.x + c.w, c.y + c.h * 1.1);
    lg.addColorStop(0, rgba(s.shade.color, 0));
    lg.addColorStop(1, rgba(s.shade.color, s.shade.alpha));
    ctx.fillStyle = lg;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.restore();

    // Mist banks drifting slowly sideways.
    ctx.save();
    const mistSprite = glowSprite(rgba(s.mist.color, 1));
    for (const m of mists) {
      const span = s.bounds.w + m.rx * 2;
      const x = s.bounds.x - m.rx + ((((m.x - s.bounds.x + tt * m.v) % span) + span) % span);
      if (x + m.rx < view.x || x - m.rx > view.x + view.w || m.y + m.ry < view.y || m.y - m.ry > view.y + view.h) continue;
      ctx.globalAlpha = s.mist.alpha * m.a;
      ctx.drawImage(mistSprite, x - m.rx, m.y - m.ry, m.rx * 2, m.ry * 2);
    }
    ctx.restore();

    if (!reduced) {
      for (const p of parts) {
        const fall = (t * p.v + p.ph * 50) % (s.core.h + 80);
        const y = s.core.y - 40 + fall;
        const x = p.x + Math.sin(t * 0.6 + p.ph) * 22 + (p.v * t * 0.4) % 60;
        if (x < view.x - 5 || x > view.x + view.w + 5 || y < view.y - 5 || y > view.y + view.h + 5) continue;
        const kind = s.particles!.kind;
        if (kind === "petal" || kind === "leaf") {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(t * 1.3 + p.ph) * 1.2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 1.9 * p.size, 1.1 * p.size, 0, 0, Math.PI * 2);
          ctx.fillStyle = p.c;
          ctx.fill();
          ctx.lineWidth = 0.35;
          ctx.strokeStyle = rgba(INK, 0.6);
          ctx.stroke();
          ctx.restore();
        } else {
          const a = 0.35 + 0.35 * Math.sin(t * 1.7 + p.ph);
          ctx.beginPath();
          ctx.arc(x, y, p.size * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = rgba(p.c, a);
          ctx.fill();
        }
      }
    }

    for (const b of birds) {
      const span = s.bounds.w + 200;
      const x = s.bounds.x - 100 + ((b.ph + tt * b.v) % span);
      const y = b.y + Math.sin(tt * 0.3 + b.ph) * b.amp;
      if (x < view.x - 10 || x > view.x + view.w + 10 || y < view.y - 10 || y > view.y + view.h + 10) continue;
      const flap = reduced ? 0.5 : (Math.sin(t * 5 + b.ph) + 1) / 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 1 - flap * 2.5);
      ctx.quadraticCurveTo(x - 2, y - 2 - flap, x, y);
      ctx.quadraticCurveTo(x + 2, y - 2 - flap, x + 5, y - 1 - flap * 2.5);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = s.birds!.color;
      ctx.stroke();
    }

    if (!reduced) {
      for (const l of leafs) {
        const y = s.core.y - 30 + ((t * l.v + l.ph * 80) % (s.core.h + 60));
        const x = l.x + Math.sin(t * 0.8 + l.ph) * 40 + ((t * 6) % 80);
        if (x < view.x - 10 || x > view.x + view.w + 10 || y < view.y - 10 || y > view.y + view.h + 10) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.6 + l.ph);
        ctx.scale(1, 0.4 + Math.abs(Math.sin(t * 2.2 + l.ph)) * 0.6);
        ctx.beginPath();
        ctx.moveTo(0, -l.size);
        ctx.quadraticCurveTo(l.size, 0, 0, l.size);
        ctx.quadraticCurveTo(-l.size, 0, 0, -l.size);
        ctx.fillStyle = l.c;
        ctx.fill();
        ctx.restore();
      }
      for (const f of flies) {
        const x = f.x + Math.sin(t * 0.21 * f.sp + f.ph) * 140 + Math.sin(t * 0.9 * f.sp + f.ph * 2) * 18;
        const y = f.y + Math.cos(t * 0.17 * f.sp + f.ph) * 90 + Math.sin(t * 1.3 + f.ph) * 8;
        if (x < view.x - 10 || x > view.x + view.w + 10 || y < view.y - 10 || y > view.y + view.h + 10) continue;
        const beat = Math.abs(Math.sin(t * 11 + f.ph));
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = f.c;
        ctx.strokeStyle = "rgba(60,40,30,0.6)";
        ctx.lineWidth = 0.4;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(side * 2.4 * (0.25 + beat * 0.75), -0.8, 2.6 * (0.25 + beat * 0.75), 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(60,40,30,0.85)";
        ctx.fillRect(-0.4, -2, 0.8, 4);
        ctx.restore();
      }
    }

    if (s.sweep && !reduced) {
      // A wide, soft beam of warm light drifting across the scene and back.
      const c0 = s.core;
      const bx = c0.x + ((Math.sin(t * 0.045) + 1) / 2) * c0.w;
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.translate(bx, c0.y + c0.h / 2);
      ctx.rotate(-0.5);
      const bg = ctx.createLinearGradient(-260, 0, 260, 0);
      bg.addColorStop(0, "rgba(255,236,190,0)");
      bg.addColorStop(0.5, "rgba(255,236,190,0.38)");
      bg.addColorStop(1, "rgba(255,236,190,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(-260, -c0.h, 520, c0.h * 2);
      ctx.restore();
    }

    if (s.sparkles && !reduced) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const p of sparks) {
        const x = p.x + Math.sin(t * 0.3 * p.sp + p.ph) * 26;
        const y = p.y + Math.cos(t * 0.23 * p.sp + p.ph * 1.3) * 18;
        if (x < view.x - 20 || x > view.x + view.w + 20 || y < view.y - 20 || y > view.y + view.h + 20) continue;
        const a = Math.max(0, Math.sin(t * 1.4 * p.sp + p.ph));
        if (a < 0.05) continue;
        ctx.globalAlpha = a * 0.55;
        ctx.drawImage(glowSprite(s.sparkles.color), x - p.rad, y - p.rad, p.rad * 2, p.rad * 2);
      }
      ctx.restore();
    }

    // Vignette anchored to the playable core.
    if (s.vignette > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const vg = ctx.createRadialGradient(cx, cy, c.h * 0.45, cx, cy, c.w * 0.62);
      vg.addColorStop(0, "rgba(255,255,255,0)");
      vg.addColorStop(1, `rgba(40,26,40,${s.vignette})`);
      ctx.fillStyle = vg;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.restore();
    }
  };
  return { draw };
}
