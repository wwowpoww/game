import type { Ctx } from "../world/types";
import { blobPath, ellipse, poly } from "./ink";
import { WALL } from "./frames";
import { mulberry32 } from "./rng";

/**
 * The home screen: a shadowed loggia looking out over a painted city that blends the three
 * worlds. The painting drifts slowly behind the arches; clouds, a balloon, birds and dust motes
 * move at their own depths, and the whole view travels downward into the window wall on Play.
 */

const W = 1920;
const H = 1080;
export const PARALLAX = { sky: 0.12, city: 0.38, fore: 1 };

const city = (() => {
  const img = new Image();
  img.decoding = "async";
  img.src = new URL("art/corridor-city.jpg", document.baseURI).href;
  const state = { img, ready: false, top: "#f6c98a" };
  img.onload = () => {
    state.ready = true;
    // Sample the sky colour along the top edge so the sky can continue above the painting.
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 2;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, img.naturalWidth, 4, 0, 0, 32, 2);
    const d = g.getImageData(0, 0, 32, 1).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < 32; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; }
    state.top = `rgb(${Math.round(r / 32)},${Math.round(gg / 32)},${Math.round(b / 32)})`;
  };
  return state;
})();

interface Layers {
  px: number;
  fore: HTMLCanvasElement;
}

let cached: Layers | null = null;

function mk(w: number, h: number, px: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * px);
  c.height = Math.ceil(h * px);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { c, ctx };
}

function buildLayers(px: number): Layers {
  /* Foreground loggia: dark arches with rim light, extending into solid wall below. */
  const fore = mk(W, H * 2, px);
  {
    const c = fore.ctx;
    const dark = "#1a1310";
    const darker = "#120d0b";
    c.fillStyle = dark;
    c.beginPath();
    c.rect(0, 0, W, H * 2);
    // Openings
    const arch = (x0: number, x1: number, spring: number, bottom: number) => {
      const r2 = (x1 - x0) / 2;
      c.moveTo(x0, bottom);
      c.lineTo(x0, spring);
      c.arc(x0 + r2, spring, r2, Math.PI, 0);
      c.lineTo(x1, bottom);
      c.closePath();
    };
    arch(560, 1360, 430, 800);
    arch(-180, 390, 520, 800);
    arch(1530, 2100, 520, 800);
    c.fill("evenodd");
    // Vault shading and carved courses on the piers.
    c.save();
    c.fill("evenodd");
    c.clip("evenodd");
    const vg = c.createLinearGradient(0, 0, 0, 260);
    vg.addColorStop(0, darker);
    vg.addColorStop(1, "rgba(18,13,11,0)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, 260);
    c.strokeStyle = "rgba(255,210,160,0.05)";
    c.lineWidth = 1.5;
    c.beginPath();
    for (let y = 40; y < 800; y += 46) {
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    c.restore();
    // Rim light along the arch edges (the landscape's light catching the stone).
    const rim = (x0: number, x1: number, spring: number, bottom: number) => {
      const r2 = (x1 - x0) / 2;
      c.beginPath();
      c.moveTo(x0, bottom);
      c.lineTo(x0, spring);
      c.arc(x0 + r2, spring, r2, Math.PI, 0);
      c.lineTo(x1, bottom);
      c.lineWidth = 3;
      c.strokeStyle = "rgba(255,196,130,0.5)";
      c.stroke();
      c.beginPath();
      c.arc(x0 + r2, spring, r2 + 26, Math.PI * 1.05, Math.PI * 1.95);
      c.lineWidth = 1.5;
      c.strokeStyle = "rgba(255,196,130,0.12)";
      c.stroke();
      // Voussoir joints
      c.strokeStyle = "rgba(255,200,150,0.08)";
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 1; i < 15; i++) {
        const a = Math.PI + (i / 15) * Math.PI;
        c.moveTo(x0 + r2 + Math.cos(a) * r2, spring + Math.sin(a) * r2);
        c.lineTo(x0 + r2 + Math.cos(a) * (r2 + 26), spring + Math.sin(a) * (r2 + 26));
      }
      c.stroke();
    };
    rim(560, 1360, 430, 800);
    rim(-180, 390, 520, 800);
    rim(1530, 2100, 520, 800);
    // Pilaster capitals on the piers
    for (const px0 of [390, 1360]) {
      c.fillStyle = "#211814";
      c.fillRect(px0 + 20, 400, 130, 28);
      c.fillStyle = "rgba(255,196,130,0.16)";
      c.fillRect(px0 + 20, 400, 130, 3);
      c.fillStyle = "#1d1512";
      c.fillRect(px0 + 40, 428, 90, 372);
      c.fillStyle = "rgba(255,196,130,0.07)";
      c.fillRect(px0 + 40, 428, 4, 372);
    }
    // Parapet under the openings with balusters
    c.fillStyle = "#1c1411";
    c.fillRect(0, 780, W, 60);
    c.fillStyle = "rgba(255,196,130,0.22)";
    c.fillRect(0, 780, W, 2.5);
    for (let x = 580; x < 1350; x += 38) {
      c.fillStyle = "#0f0b09";
      c.beginPath();
      c.ellipse(x + 10, 808, 6, 12, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Floor in perspective
    const fg = c.createLinearGradient(0, 840, 0, H);
    fg.addColorStop(0, "#21180f");
    fg.addColorStop(1, darker);
    c.fillStyle = fg;
    c.fillRect(0, 840, W, H - 840);
    c.strokeStyle = "rgba(255,200,150,0.06)";
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = -12; i <= 12; i++) {
      c.moveTo(960 + i * 40, 840);
      c.lineTo(960 + i * 260, H);
    }
    for (let y = 860, g = 14; y < H; y += g, g *= 1.35) {
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();
    // Light cast through the arches onto the floor.
    const pool = (x0: number, x1: number, alpha: number) => {
      const lg = c.createLinearGradient(0, 840, 0, H);
      lg.addColorStop(0, `rgba(255,190,120,${alpha})`);
      lg.addColorStop(1, "rgba(255,170,110,0)");
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(x0, 840);
      c.lineTo(x1, 840);
      c.lineTo(x1 + (x1 - 960) * 0.9, H);
      c.lineTo(x0 + (x0 - 960) * 0.9, H);
      c.closePath();
      c.fill();
    };
    pool(600, 1320, 0.2);
    pool(-120, 360, 0.12);
    pool(1560, 2040, 0.12);
    // Below the floor the corridor turns to solid wall (the select screen's background).
    const wg = c.createLinearGradient(0, H, 0, H + 320);
    wg.addColorStop(0, darker);
    wg.addColorStop(1, WALL);
    c.fillStyle = wg;
    c.fillRect(0, H, W, 320);
    c.fillStyle = WALL;
    c.fillRect(0, H + 320, W, H - 320);
    // Potted plant silhouettes at the pier bases, rim lit.
    for (const [x, flip] of [[470, 1], [1450, -1]] as const) {
      c.fillStyle = "#0e0a08";
      c.beginPath();
      c.moveTo(x - 30, 780);
      c.lineTo(x + 30, 780);
      c.lineTo(x + 22, 840);
      c.lineTo(x - 22, 840);
      c.closePath();
      c.fill();
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.33 * flip;
        c.beginPath();
        c.moveTo(x, 780);
        c.quadraticCurveTo(x + Math.cos(a) * 50, 780 + Math.sin(a) * 70, x + Math.cos(a) * 80, 780 + Math.sin(a) * 90 + 30);
        c.lineWidth = 9;
        c.strokeStyle = "#0e0a08";
        c.stroke();
        c.lineWidth = 1.2;
        c.strokeStyle = "rgba(255,190,120,0.18)";
        c.stroke();
      }
    }
    // Nearest columns at the screen edges
    for (const x of [0, W - 70]) {
      c.fillStyle = "#0d0907";
      c.fillRect(x, 0, 70, H);
      c.fillStyle = "rgba(255,190,120,0.06)";
      c.fillRect(x === 0 ? 66 : W - 70, 0, 4, H);
    }
  }

  return { px, fore: fore.c };
}

export function corridorLayers(px: number) {
  if (!cached || Math.abs(cached.px - px) > 0.01) cached = buildLayers(px);
  return cached;
}

const dustSeeds = Array.from({ length: 40 }, (_, i) => mulberry32(i * 17 + 3)());

/** Draw the corridor at time t. `descent` (0–1) travels the camera down toward the windows. */
export function drawCorridor(ctx: Ctx, px: number, t: number, descent: number, reduced: boolean, sway: number) {
  const L = corridorLayers(px);
  const dy = descent * H;
  const tt = reduced ? 0 : t;
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const swayX = reduced ? 0 : sway;

  // The painted city, slightly oversized so it can drift (ping-pong) like a slow pan.
  const PW = 2200;
  const PH = city.ready ? (PW * city.img.naturalHeight) / city.img.naturalWidth : 1238;
  const top = -60 - dy * PARALLAX.city;
  const drift = -140 + Math.sin(tt * 0.022) * 130 + swayX * PARALLAX.city;
  ctx.fillStyle = city.top;
  ctx.fillRect(0, 0, W, H);
  if (city.ready) ctx.drawImage(city.img, drift, top, PW, PH);

  // Soft painterly clouds drifting across the sky
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 560 + tt * (5 + i * 1.5)) % (W + 700)) - 350;
    const cy = 90 + (i % 3) * 80 - dy * PARALLAX.sky;
    for (let k = 0; k < 4; k++) {
      blobPath(ctx, cx + k * 46, cy + Math.sin(k + i) * 8, 58, 20, 900 + i * 7 + k, 8, 0.4);
      ctx.fillStyle = k % 2 ? "rgba(255,214,190,0.55)" : "rgba(255,226,204,0.6)";
      ctx.fill();
    }
  }

  // Hot-air balloon drifting above the city
  balloon(ctx, ((t * 9) % (W + 400)) - 200, 260 + Math.sin(t * 0.3) * 14 - dy * PARALLAX.city, t);

  // Birds
  for (let i = 0; i < 7; i++) {
    const bx = ((i * 300 + t * (16 + i * 2)) % (W + 200)) - 100;
    const by = 170 + (i % 4) * 55 + Math.sin(t * 0.4 + i) * 20 - dy * PARALLAX.city;
    const f = (Math.sin(t * 5 + i) + 1) / 2;
    ctx.beginPath();
    ctx.moveTo(bx - 6, by - 2 - f * 3);
    ctx.quadraticCurveTo(bx - 2, by - 2 - f, bx, by);
    ctx.quadraticCurveTo(bx + 2, by - 2 - f, bx + 6, by - 2 - f * 3);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(70,44,40,0.8)";
    ctx.stroke();
  }

  // Warm haze between the city and the loggia
  const haze = ctx.createLinearGradient(0, 380 - dy * PARALLAX.city, 0, 820 - dy * 0.6);
  haze.addColorStop(0, "rgba(255,210,160,0)");
  haze.addColorStop(1, "rgba(255,196,140,0.16)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, W, H);

  // Foreground architecture
  ctx.drawImage(L.fore, 0, -dy, W, H * 2);
  // Hanging lantern in the central arch
  {
    const ly = 40 - dy;
    const sw = reduced ? 0 : Math.sin(t * 0.9) * 0.03;
    ctx.save();
    ctx.translate(960, ly);
    ctx.rotate(sw);
    ctx.strokeStyle = "#0d0907";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, 70);
    ctx.stroke();
    poly(ctx, [-16, 70, 16, 70, 22, 84, 14, 120, -14, 120, -22, 84]);
    ctx.fillStyle = "#120d0b";
    ctx.fill();
    ctx.fillStyle = `rgba(255,190,110,${0.75 + Math.sin(t * 7) * 0.05})`;
    ctx.fillRect(-9, 86, 18, 28);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(960, ly + 100, 0, 960, ly + 100, 140);
    g.addColorStop(0, "rgba(255,170,90,0.35)");
    g.addColorStop(1, "rgba(255,150,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(820, ly - 40, 280, 280);
    ctx.restore();
  }
  // Dust motes in the light from the arches
  if (!reduced) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < dustSeeds.length; i++) {
      const s = dustSeeds[i];
      const x = 600 + ((s * 7000 + t * (6 + s * 8)) % 720);
      const y = 480 + ((s * 9000 + t * (4 + s * 5)) % 520) - dy;
      ctx.fillStyle = `rgba(255,220,170,${0.25 + 0.25 * Math.sin(t * 2 + i)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function balloon(ctx: Ctx, x: number, y: number, t: number) {
  const sway = Math.sin(t * 0.7) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.bezierCurveTo(30, -38, 34, -6, 10, 14);
  ctx.lineTo(-10, 14);
  ctx.bezierCurveTo(-34, -6, -30, -38, 0, -38);
  ctx.closePath();
  ctx.fillStyle = "#f6e6cc";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#e0743a";
  for (let k = -3; k <= 3; k += 2) {
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.quadraticCurveTo(k * 11, -10, k * 3.5, 16);
    ctx.quadraticCurveTo((k + 1) * 11, -10, 0, -40);
    ctx.fill();
  }
  // Soft shading on the side away from the sun
  const g = ctx.createLinearGradient(-30, 0, 30, 0);
  g.addColorStop(0, "rgba(255,240,210,0.25)");
  g.addColorStop(1, "rgba(90,40,40,0.3)");
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, 80, 60);
  ctx.restore();
  ctx.strokeStyle = "rgba(90,60,40,0.6)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-9, 14);
  ctx.lineTo(-6 + sway, 28);
  ctx.moveTo(9, 14);
  ctx.lineTo(6 + sway, 28);
  ctx.stroke();
  ellipse(ctx, sway, 30, 9, 3.4);
  ctx.fillStyle = "#8a5a3c";
  ctx.fill();
  ctx.restore();
}
