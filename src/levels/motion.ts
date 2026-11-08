import type { DrawItem } from "../world/types";

/**
 * Painted-layer motion. Each entry cuts a region out of the painting and re-renders it every
 * frame with a small deformation, feathered back into the still painting so no seams show.
 */
export type MotionKind =
  | "person" // breathing and a gentle weight shift, pivoting at the feet
  | "tree" // wind sway, strongest at the crown
  | "hang" // vines and wisteria swaying from where they hang
  | "lantern" // pendulum swing from the hook
  | "cloth" // awnings, rugs and banners rippling
  | "water" // horizontal wave distortion
  | "wheel"; // slow rotation about the centre

/** [kind, x, y, w, h] in painting pixels. */
export type MotionSpec = readonly [MotionKind, number, number, number, number];

const PARAMS: Record<MotionKind, { amp: number; speed: number; strips: number }> = {
  person: { amp: 1.4, speed: 1.5, strips: 6 },
  tree: { amp: 3.4, speed: 0.95, strips: 8 },
  hang: { amp: 3.0, speed: 1.1, strips: 7 },
  lantern: { amp: 0.13, speed: 1.6, strips: 1 },
  cloth: { amp: 2.4, speed: 2.3, strips: 7 },
  water: { amp: 2.1, speed: 1.9, strips: 0 },
  wheel: { amp: 0.35, speed: 1, strips: 1 },
};

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number) {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  return scratch;
}

function featherMask(w: number, h: number, inner: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.translate(w / 2, h / 2);
  g.scale(w / 2, h / 2);
  const grad = g.createRadialGradient(0, 0, inner, 0, 0, 1);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(-1, -1, 2, 2);
  return c;
}

export function buildMotions(img: HTMLImageElement, scale: number, specs: readonly MotionSpec[], seed: number): DrawItem[] {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return specs.map(([kind, x, y, w, h]) => {
    const p = PARAMS[kind];
    const pad = Math.ceil(kind === "wheel" ? 2 : p.amp * 2 + 3);
    const cw = Math.ceil(w + pad * 2), ch = Math.ceil(h + pad * 2);
    const mask = featherMask(cw, ch, kind === "water" ? 0.55 : kind === "lantern" ? 0.6 : 0.68);
    const ph = rand() * 20;
    const speed = p.speed * (0.85 + rand() * 0.3);
    const strips = kind === "water" ? Math.max(6, Math.round(h / 4)) : p.strips;
    const bbox = { x: (x - pad) * scale, y: (y - pad) * scale, w: cw * scale, h: ch * scale };
    return {
      bbox,
      draw: (ctx, t) => {
        const c = scratchCanvas(cw, ch);
        const g = c.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, cw, ch);
        const a = t * speed + ph;
        if (kind === "lantern") {
          g.drawImage(img, x - pad, y - pad, cw, ch, 0, 0, cw, ch);
          g.translate(pad + w / 2, pad);
          g.rotate(Math.sin(a) * p.amp);
          g.drawImage(img, x - pad, y - pad, cw, ch, -w / 2 - pad, -pad, cw, ch);
        } else if (kind === "wheel") {
          g.translate(cw / 2, ch / 2);
          g.rotate(t * p.amp);
          g.drawImage(img, x - pad, y - pad, cw, ch, -cw / 2, -ch / 2, cw, ch);
        } else {
          // Fill first so displaced strips never reveal transparent gaps.
          g.drawImage(img, x - pad, y - pad, cw, ch, 0, 0, cw, ch);
          const sh = ch / strips;
          const breathe = kind === "person" ? Math.sin(a * 1.6) * 0.012 : 0;
          for (let i = 0; i < strips; i++) {
            const sy = i * sh;
            // 0 at the pivot, 1 at the free end.
            const fromBottom = 1 - (sy + sh / 2) / ch;
            const fromTop = (sy + sh / 2) / ch;
            let dx = 0;
            let dy = 0;
            if (kind === "person") {
              dx = Math.sin(a) * p.amp * fromBottom;
              dy = -breathe * (ch - sy);
            } else if (kind === "tree") dx = (Math.sin(a) + Math.sin(a * 2.3 + 1) * 0.35) * p.amp * Math.pow(fromBottom, 1.6);
            else if (kind === "hang") dx = Math.sin(a - fromTop * 1.2) * p.amp * fromTop;
            else if (kind === "cloth") dx = Math.sin(a * 1.4 - i * 0.7) * p.amp * (0.3 + fromTop * 0.7);
            else if (kind === "water") dx = Math.sin(a + (y + sy) * 0.33) * p.amp + Math.sin(a * 1.7 + (y + sy) * 0.11) * p.amp * 0.4;
            g.drawImage(img, x - pad, y - pad + sy, cw, sh + 0.6, dx, sy + dy, cw, sh + 0.6);
          }
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = "destination-in";
        g.drawImage(mask, 0, 0);
        ctx.drawImage(c, 0, 0, cw, ch, bbox.x, bbox.y, bbox.w, bbox.h);
      },
    };
  });
}
