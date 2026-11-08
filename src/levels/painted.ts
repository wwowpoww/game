import { makeAtmosphere } from "../art/atmosphere";
import { mulberry32 } from "../art/rng";
import type { Ctx, DrawItem, Glow, Scene, TargetDef, TargetKind } from "../world/types";

/**
 * Each world is a finished painting. The painting fills the 1920×1080 scene; gentle animation
 * (lantern light, water shimmer, falling water, petals or motes, birds, mist) is layered on top,
 * and targets are defined by where they are painted, with reference cards cropped from the painting.
 */
type XY = readonly [number, number];

interface TargetSpec {
  id: string;
  name: string;
  kind: TargetKind;
  clue: string;
  /** Centre in painting pixels. */
  at: XY;
  /** Visual radius in painting pixels. */
  r: number;
  /** Side of the square crop used for the reference card, in painting pixels. */
  crop: number;
}

export interface PaintedSpec {
  id: "japan" | "greece" | "morocco";
  src: string;
  edge: string;
  targets: TargetSpec[];
  lanterns: XY[];
  /** Rippling water: [x, y, rx, ry] in painting pixels. */
  water: readonly [number, number, number, number][];
  /** Falling water: [x, yTop, yBottom, width] in painting pixels. */
  falls: readonly [number, number, number, number][];
  particles: { kind: "petal" | "mote" | "ember"; colors: string[]; count: number };
  birds: { count: number; color: string };
  light: { x: number; y: number; color: string };
}

export const PAINTED: Record<PaintedSpec["id"], PaintedSpec> = {
  japan: {
    id: "japan",
    src: "art/map-japan.jpg",
    edge: "#1d2a1c",
    targets: [
      { id: "jp-cat", name: "Rooftop cat", kind: "animal", clue: "A ginger-and-white cat naps on the mossy green tiles of a rooftop, high above the tea house.", at: [128, 77], r: 14, crop: 64 },
      { id: "jp-wheel", name: "Water wheel", kind: "object", clue: "An old wooden water wheel turns beside the falls, half hidden behind a bank of red camellias.", at: [92, 446], r: 30, crop: 110 },
      { id: "jp-painter", name: "Street painter", kind: "person", clue: "Under a little wooden awning, a painter in a white cap sketches a cherry branch at an easel.", at: [612, 445], r: 22, crop: 90 },
      { id: "jp-bird", name: "Yellow songbird", kind: "animal", clue: "A small yellow songbird perches on a bamboo leaf at the top of the grove.", at: [701, 38], r: 10, crop: 56 },
      { id: "jp-willow", name: "Weeping willow", kind: "plant", clue: "A single weeping willow trails its golden-green fronds over a glowing lantern beside the tea house.", at: [260, 190], r: 34, crop: 110 },
    ],
    lanterns: [[186, 62], [110, 148], [212, 228], [80, 272], [338, 130], [320, 26], [840, 272], [1012, 312], [812, 418], [838, 418], [150, 265]],
    water: [[570, 185, 30, 12], [535, 214, 24, 10], [522, 300, 36, 12], [472, 330, 28, 9], [396, 402, 30, 11], [240, 546, 42, 10], [592, 96, 20, 7], [540, 292, 20, 8]],
    falls: [[607, 124, 150, 14], [548, 247, 272, 16], [410, 344, 372, 18], [386, 449, 470, 14], [150, 470, 512, 16]],
    particles: { kind: "petal", colors: ["#f9d3da", "#f4b6c3", "#fde8ea"], count: 34 },
    birds: { count: 4, color: "#3a2d2a" },
    light: { x: 300, y: -200, color: "#ffd59a" },
  },
  greece: {
    id: "greece",
    src: "art/map-greece.jpg",
    edge: "#2a2f22",
    targets: [
      { id: "gr-painter", name: "Painter at the easel", kind: "person", clue: "In the shade of the old olive tree, a painter in a straw hat works at a small easel.", at: [147, 165], r: 20, crop: 90 },
      { id: "gr-bone", name: "Golden bone", kind: "object", clue: "Someone's dog has left a golden bone on the rim of the great fountain.", at: [755, 270], r: 11, crop: 60 },
      { id: "gr-hoop", name: "Child with a hoop", kind: "person", clue: "A child in red runs across the plaza, rolling a wooden hoop with a stick.", at: [534, 260], r: 16, crop: 70 },
      { id: "gr-mosaic", name: "Heron mosaic", kind: "object", clue: "A pale heron inside a ring of golden laurel is set into the paving of the plaza.", at: [480, 310], r: 24, crop: 90 },
      { id: "gr-cat", name: "Balcony cat", kind: "animal", clue: "A black-and-white cat stretches out on a sunny balcony ledge beneath the scribes' arcade.", at: [506, 154], r: 10, crop: 60 },
    ],
    lanterns: [],
    water: [[715, 238, 66, 16], [745, 96, 36, 12], [210, 462, 38, 12], [332, 548, 48, 12], [690, 248, 30, 8]],
    falls: [[76, 136, 200, 18], [66, 228, 292, 22], [150, 498, 532, 14], [712, 146, 214, 8]],
    particles: { kind: "mote", colors: ["#fff6d6", "#ffffff"], count: 30 },
    birds: { count: 5, color: "#f6f2e8" },
    light: { x: 200, y: -260, color: "#fff0c8" },
  },
  morocco: {
    id: "morocco",
    src: "art/map-morocco.jpg",
    edge: "#2b1d16",
    targets: [
      { id: "ma-oud", name: "Oud player", kind: "person", clue: "A musician in a yellow cap plays the oud on the steps beside the courtyard fountain.", at: [464, 307], r: 16, crop: 80 },
      { id: "ma-cat", name: "Calico cat", kind: "animal", clue: "A calico cat sleeps curled up on a red patterned rug on a quiet rooftop.", at: [133, 444], r: 16, crop: 80 },
      { id: "ma-orchid", name: "Orchid in a cracked urn", kind: "plant", clue: "Purple orchids grow from a cracked clay urn among the jasmine on the lower terrace.", at: [900, 455], r: 22, crop: 100 },
      { id: "ma-donkey", name: "Saddled donkey", kind: "animal", clue: "A patient donkey with a red saddle blanket waits by the market stairs.", at: [743, 197], r: 18, crop: 80 },
      { id: "ma-tea", name: "Mint tea for two", kind: "object", clue: "A silver teapot and glasses sit on a little table between two friends sharing mint tea.", at: [584, 447], r: 12, crop: 80 },
    ],
    lanterns: [[512, 66], [440, 96], [485, 212], [562, 203], [410, 238], [133, 312], [793, 38], [814, 161], [850, 166], [917, 163], [815, 470], [698, 120], [590, 102]],
    water: [[520, 340, 44, 13], [726, 270, 50, 9], [736, 432, 46, 13], [482, 556, 40, 9]],
    falls: [[660, 214, 252, 14], [772, 344, 396, 16], [553, 528, 570, 16], [522, 298, 318, 6]],
    particles: { kind: "ember", colors: ["#ffd29a", "#ffb870"], count: 26 },
    birds: { count: 4, color: "#3a2a2a" },
    light: { x: 1500, y: -260, color: "#ffb878" },
  },
};

const images = new Map<string, HTMLImageElement>();
function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = new URL(src, document.baseURI).href;
  });
}

export const paintingsReady: Promise<void> = Promise.all(
  Object.values(PAINTED).map(async (s) => {
    images.set(s.id, await load(s.src));
  }),
).then(() => undefined);

const CORE = { x: 0, y: 0, w: 1920, h: 1080 };

export function buildPainted(spec: PaintedSpec): Scene {
  const img = images.get(spec.id);
  if (!img) throw new Error(`Painting for ${spec.id} is not loaded yet`);
  const S = CORE.w / img.naturalWidth;
  const r = mulberry32(spec.id.length * 977);

  const ground: DrawItem[] = [{ bbox: CORE, draw: (ctx) => ctx.drawImage(img, 0, 0, CORE.w, CORE.h) }];

  const groundAnims: DrawItem[] = [];
  for (const [px, py, prx, pry] of spec.water) {
    const x = px * S, y = py * S, rx = prx * S, ry = pry * S;
    const marks = Array.from({ length: Math.max(4, Math.round((rx * ry) / 260)) }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
      return { x: x + Math.cos(a) * rx * d, y: y + Math.sin(a) * ry * d, l: 5 + r() * 9, p: r() * 10 };
    });
    groundAnims.push({
      bbox: { x: x - rx - 12, y: y - ry - 8, w: rx * 2 + 24, h: ry * 2 + 16 },
      draw: (ctx, t) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineWidth = 1.6;
        for (const m of marks) {
          const a = Math.max(0, Math.sin(t * 0.7 + m.p));
          if (a < 0.05) continue;
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
          const dx = Math.sin(t * 0.5 + m.p) * 2.5;
          ctx.beginPath();
          ctx.moveTo(m.x + dx - m.l / 2, m.y);
          ctx.quadraticCurveTo(m.x + dx, m.y - 1.6, m.x + dx + m.l / 2, m.y);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }
  for (const [px, y0p, y1p, wp] of spec.falls) {
    const x = px * S, y0 = y0p * S, y1 = y1p * S, w = wp * S;
    const lanes = Math.max(3, Math.round(w / 6));
    groundAnims.push({
      bbox: { x: x - w, y: y0 - 4, w: w * 2, h: y1 - y0 + 16 },
      draw: (ctx, t) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        for (let i = 0; i < lanes; i++) {
          const fx = x - w / 2 + ((i + 0.5) / lanes) * w;
          const len = 8 + (i % 3) * 4;
          for (let k = 0; k < 2; k++) {
            const off = ((t * (46 + (i % 4) * 8) + i * 23 + k * 37) % (y1 - y0 + len)) - len;
            const a = Math.max(y0, y0 + off), b = Math.min(y1, y0 + off + len);
            if (b <= a) continue;
            ctx.moveTo(fx, a);
            ctx.lineTo(fx, b);
          }
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        for (let i = 0; i < 4; i++) {
          const rr = 2.6 + Math.sin(t * 3 + i * 1.7) * 1.1;
          ctx.beginPath();
          ctx.arc(x - w / 2 + (i / 3) * w, y1 + 1, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    });
  }

  const glows: Glow[] = spec.lanterns.map(([px, py]) => ({
    x: px * S, y: py * S, r: 34, color: "rgba(255,196,110,1)", strength: 0.32, flicker: 0.16, phase: r() * 10,
  }));

  const targets: TargetDef[] = spec.targets.map((t) => {
    const cw = t.crop * S;
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      clue: t.clue,
      x: t.at[0] * S,
      y: t.at[1] * S,
      r: t.r * S,
      refScale: 120 / cw,
      draw: (ctx: Ctx) => ctx.drawImage(img, t.at[0] - t.crop / 2, t.at[1] - t.crop / 2, t.crop, t.crop, -cw / 2, -cw / 2, cw, cw),
    };
  });

  return {
    id: spec.id,
    core: CORE,
    bounds: CORE,
    ground,
    groundAnims,
    objects: [],
    glows,
    targets,
    edgeColor: spec.edge,
    atmosphere: makeAtmosphere({
      core: CORE,
      bounds: CORE,
      sun: { x: spec.light.x, y: spec.light.y, r: 2200, color: spec.light.color, alpha: 0.14 },
      shade: { color: "#3a3a6a", alpha: 0.08 },
      vignette: 0.24,
      mist: { color: "#fff6e6", alpha: 0.07, count: 8, yMin: 80, yMax: 1000 },
      particles: spec.particles,
      birds: { count: spec.birds.count, color: spec.birds.color, y0: 40, y1: 500 },
      seed: spec.id.length * 31,
    }),
  };
}
