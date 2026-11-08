import { makeAtmosphere } from "../art/atmosphere";
import { mulberry32 } from "../art/rng";
import type { Ctx, DrawItem, Glow, Scene, TargetDef, TargetKind } from "../world/types";
import { buildMotions, type MotionSpec } from "./motion";

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
  /** Regions of the painting re-rendered with motion (people, plants, lanterns, cloth, water). */
  motion: MotionSpec[];
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
      { id: "jp-cat", name: "Rooftop cat", kind: "animal", clue: "Napping on a mossy rooftop, high up.", at: [128, 77], r: 14, crop: 64 },
      { id: "jp-wheel", name: "Water wheel", kind: "object", clue: "Turning beside the falls, behind red camellias.", at: [92, 446], r: 30, crop: 110 },
      { id: "jp-painter", name: "Street painter", kind: "person", clue: "Sketching a cherry branch under an awning.", at: [612, 445], r: 22, crop: 90 },
      { id: "jp-bird", name: "Yellow songbird", kind: "animal", clue: "Perched high in the bamboo grove.", at: [701, 38], r: 10, crop: 56 },
      { id: "jp-willow", name: "Weeping willow", kind: "plant", clue: "Trailing golden fronds over a lantern.", at: [260, 190], r: 34, crop: 110 },
    ],
    lanterns: [[186, 62], [110, 148], [212, 228], [80, 272], [338, 130], [320, 26], [840, 272], [1012, 312], [812, 418], [838, 418], [150, 265]],
    motion: [
      // People
      ["person", 205, 40, 62, 42], ["person", 125, 132, 48, 34], ["person", 330, 192, 112, 58], ["person", 468, 66, 32, 50],
      ["person", 524, 36, 26, 52], ["person", 598, 232, 44, 58], ["person", 568, 292, 44, 64], ["person", 706, 438, 34, 74],
      ["person", 736, 452, 28, 64], ["person", 672, 466, 28, 46], ["person", 590, 412, 48, 58], ["person", 846, 466, 34, 74],
      ["person", 288, 372, 54, 74], ["person", 198, 406, 40, 44], ["person", 372, 472, 50, 54], ["person", 830, 106, 26, 60],
      ["person", 722, 112, 38, 60], ["person", 906, 106, 44, 50], ["person", 892, 276, 94, 64], ["person", 108, 272, 44, 54],
      ["person", 158, 262, 34, 64], ["person", 222, 252, 28, 64],
      // Trees and plants
      ["tree", 330, 0, 150, 104], ["tree", 656, 186, 136, 74], ["tree", 728, 0, 140, 58], ["tree", 214, 138, 98, 124],
      ["tree", 630, 0, 92, 124], ["tree", 608, 338, 94, 94], ["tree", 948, 366, 76, 84], ["tree", 448, 226, 64, 44],
      ["tree", 0, 252, 70, 90], ["tree", 940, 0, 84, 70],
      ["hang", 0, 84, 74, 94], ["hang", 178, 94, 54, 74],
      // Lanterns, cloth
      ["lantern", 176, 44, 22, 34], ["lantern", 100, 130, 22, 34], ["lantern", 202, 210, 22, 34], ["lantern", 70, 254, 22, 34],
      ["lantern", 328, 112, 22, 34], ["lantern", 830, 254, 22, 34], ["lantern", 1002, 294, 22, 34], ["lantern", 802, 402, 22, 32],
      ["lantern", 828, 402, 22, 32],
      ["cloth", 778, 442, 40, 58], ["cloth", 872, 436, 46, 28], ["cloth", 365, 152, 80, 34],
      // Water and the wheel
      ["water", 498, 168, 114, 72], ["water", 488, 278, 84, 62], ["water", 368, 378, 74, 42], ["water", 188, 518, 144, 52],
      ["water", 558, 86, 64, 28], ["wheel", 50, 400, 86, 92],
      // More life: flower beds, hydrangeas, irises, bamboo, vines, water and people
      ["tree", 228, 448, 92, 52], ["tree", 668, 278, 72, 42], ["tree", 0, 448, 124, 128], ["tree", 698, 498, 74, 78],
      ["tree", 758, 348, 64, 42], ["tree", 978, 198, 46, 92], ["tree", 286, 316, 60, 40], ["tree", 430, 380, 60, 40],
      ["hang", 238, 92, 44, 64], ["hang", 38, 166, 64, 64],
      ["water", 518, 248, 64, 32], ["water", 602, 120, 30, 40], ["water", 140, 466, 30, 50],
      ["person", 618, 478, 32, 52], ["person", 258, 298, 32, 52], ["person", 520, 70, 30, 40],
    ],
    water: [[570, 185, 30, 12], [535, 214, 24, 10], [522, 300, 36, 12], [472, 330, 28, 9], [396, 402, 30, 11], [240, 546, 42, 10], [592, 96, 20, 7], [540, 292, 20, 8]],
    falls: [[607, 124, 150, 14], [548, 247, 272, 16], [410, 344, 372, 18], [386, 449, 470, 14], [150, 470, 512, 16]],
    particles: { kind: "petal", colors: ["#f9d3da", "#f4b6c3", "#fde8ea", "#ffffff"], count: 190 },
    birds: { count: 14, color: "#3a2d2a" },
    light: { x: 300, y: -200, color: "#ffd59a" },
  },
  greece: {
    id: "greece",
    src: "art/map-greece.jpg",
    edge: "#2a2f22",
    targets: [
      { id: "gr-painter", name: "Painter at the easel", kind: "person", clue: "At an easel beneath the olive tree.", at: [147, 165], r: 20, crop: 90 },
      { id: "gr-bone", name: "Golden bone", kind: "object", clue: "Left on the rim of the fountain.", at: [755, 270], r: 11, crop: 60 },
      { id: "gr-hoop", name: "Child with a hoop", kind: "person", clue: "Racing across the plaza with a stick.", at: [534, 260], r: 16, crop: 70 },
      { id: "gr-mosaic", name: "Heron mosaic", kind: "object", clue: "Set into the plaza paving, ringed in laurel.", at: [480, 310], r: 24, crop: 90 },
      { id: "gr-cat", name: "Balcony cat", kind: "animal", clue: "Stretched out on a sunny balcony ledge.", at: [506, 154], r: 10, crop: 60 },
    ],
    lanterns: [],
    motion: [
      // People
      ["person", 118, 136, 54, 60], ["person", 194, 138, 64, 38], ["person", 172, 182, 64, 28], ["person", 398, 86, 48, 54],
      ["person", 488, 76, 94, 60], ["person", 538, 56, 44, 44], ["person", 598, 72, 44, 44], ["person", 362, 266, 38, 64],
      ["person", 393, 262, 38, 68], ["person", 512, 226, 48, 58], ["person", 492, 248, 28, 38], ["person", 588, 226, 38, 44],
      ["person", 806, 236, 44, 50], ["person", 766, 282, 30, 54], ["person", 902, 240, 50, 66], ["person", 976, 262, 34, 54],
      ["person", 646, 336, 44, 54], ["person", 598, 366, 34, 64], ["person", 692, 376, 34, 60], ["person", 738, 312, 44, 60],
      ["person", 56, 382, 92, 70], ["person", 276, 352, 40, 54], ["person", 362, 386, 34, 70], ["person", 256, 416, 34, 70],
      ["person", 512, 412, 34, 74], ["person", 572, 436, 34, 64], ["person", 466, 496, 46, 64], ["person", 852, 432, 44, 60],
      ["person", 902, 140, 28, 54],
      // Trees and plants
      ["tree", 138, 52, 144, 116], ["tree", 520, 428, 254, 148], ["tree", 932, 138, 92, 94], ["tree", 312, 140, 46, 124],
      ["tree", 150, 196, 42, 94], ["tree", 452, 158, 38, 94], ["tree", 640, 100, 40, 100], ["tree", 800, 0, 44, 110],
      ["tree", 328, 58, 84, 74], ["tree", 538, 128, 64, 54], ["tree", 830, 330, 90, 60], ["tree", 0, 300, 50, 120],
      ["hang", 0, 0, 204, 84], ["hang", 148, 278, 64, 84], ["hang", 438, 0, 64, 44], ["hang", 232, 490, 60, 70],
      // Cloth and water
      ["cloth", 478, 362, 94, 54], ["cloth", 518, 322, 84, 48], ["cloth", 588, 298, 104, 48], ["cloth", 440, 400, 46, 44],
      ["water", 638, 212, 166, 50], ["water", 688, 138, 54, 84], ["water", 698, 66, 114, 54], ["water", 178, 442, 74, 44],
      ["water", 278, 518, 114, 58], ["water", 38, 118, 84, 184],
      // More life: lavender, lilies, flowers, vines, water and people
      ["tree", 398, 178, 64, 52], ["tree", 568, 278, 64, 42], ["tree", 738, 338, 64, 52], ["tree", 858, 238, 54, 52],
      ["tree", 0, 458, 124, 118], ["tree", 868, 88, 64, 62], ["tree", 838, 328, 92, 62], ["tree", 268, 130, 60, 50],
      ["hang", 300, 0, 80, 60], ["hang", 960, 300, 64, 80],
      ["water", 128, 518, 44, 44], ["water", 60, 300, 60, 40], ["water", 750, 230, 40, 20],
      ["person", 302, 92, 32, 44], ["person", 760, 450, 34, 54], ["person", 620, 370, 30, 50],
    ],
    water: [[715, 238, 66, 16], [745, 96, 36, 12], [210, 462, 38, 12], [332, 548, 48, 12], [690, 248, 30, 8]],
    falls: [[76, 136, 200, 18], [66, 228, 292, 22], [150, 498, 532, 14], [712, 146, 214, 8]],
    particles: { kind: "mote", colors: ["#fff6d6", "#ffffff", "#ffe9a8"], count: 170 },
    birds: { count: 16, color: "#f6f2e8" },
    light: { x: 200, y: -260, color: "#fff0c8" },
  },
  morocco: {
    id: "morocco",
    src: "art/map-morocco.jpg",
    edge: "#2b1d16",
    targets: [
      { id: "ma-oud", name: "Oud player", kind: "person", clue: "Playing music by the courtyard fountain.", at: [464, 307], r: 16, crop: 80 },
      { id: "ma-cat", name: "Calico cat", kind: "animal", clue: "Asleep on a red rug, up on a rooftop.", at: [133, 444], r: 16, crop: 80 },
      { id: "ma-orchid", name: "Orchid in a cracked urn", kind: "plant", clue: "Among the jasmine on the lower terrace.", at: [900, 455], r: 22, crop: 100 },
      { id: "ma-donkey", name: "Saddled donkey", kind: "animal", clue: "Waiting patiently by the market stairs.", at: [743, 197], r: 18, crop: 80 },
      { id: "ma-tea", name: "Mint tea for two", kind: "object", clue: "Between two friends at a little table.", at: [584, 447], r: 12, crop: 80 },
    ],
    lanterns: [[512, 66], [440, 96], [485, 212], [562, 203], [410, 238], [133, 312], [793, 38], [814, 161], [850, 166], [917, 163], [815, 470], [698, 120], [590, 102]],
    motion: [
      // People
      ["person", 118, 42, 34, 64], ["person", 148, 106, 44, 44], ["person", 164, 162, 114, 74], ["person", 478, 76, 64, 54],
      ["person", 538, 86, 34, 40], ["person", 98, 326, 64, 54], ["person", 393, 292, 38, 74], ["person", 438, 282, 54, 54],
      ["person", 473, 232, 28, 60], ["person", 568, 272, 34, 44], ["person", 586, 306, 28, 44], ["person", 638, 272, 64, 60],
      ["person", 418, 352, 38, 64], ["person", 293, 342, 34, 64], ["person", 258, 362, 34, 64], ["person", 393, 406, 38, 64],
      ["person", 353, 462, 44, 64], ["person", 533, 416, 104, 70], ["person", 768, 176, 34, 60], ["person", 833, 176, 34, 64],
      ["person", 868, 182, 34, 64], ["person", 848, 212, 34, 54], ["person", 898, 246, 44, 64], ["person", 783, 136, 28, 44],
      ["person", 718, 166, 60, 64], ["person", 930, 40, 30, 40],
      // Trees and plants
      ["tree", 188, 238, 124, 186], ["tree", 608, 0, 164, 184], ["tree", 343, 248, 64, 84], ["tree", 518, 228, 54, 64],
      ["tree", 588, 238, 64, 74], ["tree", 293, 142, 94, 94], ["tree", 28, 168, 174, 154], ["tree", 148, 428, 164, 148],
      ["tree", 598, 58, 64, 64], ["tree", 928, 328, 96, 124], ["tree", 948, 38, 76, 94], ["tree", 0, 0, 120, 120],
      ["tree", 538, 372, 60, 50], ["tree", 870, 390, 70, 70],
      // Lanterns
      ["lantern", 503, 50, 18, 30], ["lantern", 431, 80, 18, 30], ["lantern", 476, 196, 18, 30], ["lantern", 553, 187, 18, 30],
      ["lantern", 401, 222, 18, 30], ["lantern", 124, 294, 18, 32], ["lantern", 784, 22, 18, 32], ["lantern", 805, 144, 18, 32],
      ["lantern", 841, 150, 18, 32], ["lantern", 908, 146, 18, 32], ["lantern", 800, 438, 30, 62],
      // Cloth and water
      ["cloth", 763, 92, 104, 58], ["cloth", 878, 108, 98, 48], ["cloth", 963, 178, 61, 62], ["cloth", 288, 398, 84, 64],
      ["cloth", 188, 170, 80, 60],
      ["water", 468, 298, 104, 78], ["water", 688, 252, 94, 38], ["water", 688, 408, 114, 48], ["water", 428, 532, 144, 44],
      ["water", 643, 203, 34, 54], ["water", 758, 338, 34, 64], ["water", 538, 518, 34, 54],
      // More life: flower beds, jasmine, vines, water and people
      ["tree", 428, 388, 84, 62], ["tree", 678, 318, 74, 52], ["tree", 928, 448, 74, 64], ["tree", 378, 518, 84, 58],
      ["tree", 0, 348, 84, 92], ["tree", 690, 470, 80, 60], ["tree", 240, 60, 70, 60], ["tree", 860, 0, 90, 60],
      ["hang", 558, 88, 74, 84], ["hang", 408, 148, 74, 64],
      ["water", 698, 278, 64, 22], ["water", 500, 330, 40, 20], ["water", 740, 360, 40, 40],
      ["person", 960, 260, 34, 60], ["person", 300, 400, 34, 60], ["person", 700, 120, 30, 44],
    ],
    water: [[520, 340, 44, 13], [726, 270, 50, 9], [736, 432, 46, 13], [482, 556, 40, 9]],
    falls: [[660, 214, 252, 14], [772, 344, 396, 16], [553, 528, 570, 16], [522, 298, 318, 6]],
    particles: { kind: "ember", colors: ["#ffd29a", "#ffb870", "#fff0c8"], count: 150 },
    birds: { count: 14, color: "#3a2a2a" },
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

/** Each target is also cut out of its painting onto its own transparent layer (art/targets). */
const cutouts = new Map<string, HTMLImageElement>();

export const paintingsReady: Promise<void> = Promise.all([
  ...Object.values(PAINTED).map(async (s) => {
    images.set(s.id, await load(s.src));
  }),
  ...Object.values(PAINTED).flatMap((s) =>
    s.targets.map(async (t) => {
      cutouts.set(t.id, await load(`art/targets/${t.id}.png`));
    }),
  ),
]).then(() => undefined);

const CORE = { x: 0, y: 0, w: 1920, h: 1080 };

export function buildPainted(spec: PaintedSpec): Scene {
  const img = images.get(spec.id);
  if (!img) throw new Error(`Painting for ${spec.id} is not loaded yet`);
  const S = CORE.w / img.naturalWidth;
  const r = mulberry32(spec.id.length * 977);

  const ground: DrawItem[] = [{ bbox: CORE, draw: (ctx) => ctx.drawImage(img, 0, 0, CORE.w, CORE.h) }];

  const groundAnims: DrawItem[] = buildMotions(img, S, spec.motion, spec.id.length * 7919 + 1);
  for (const [px, py, prx, pry] of spec.water) {
    const x = px * S, y = py * S, rx = prx * S, ry = pry * S;
    const marks = Array.from({ length: Math.max(8, Math.round((rx * ry) / 120)) }, () => {
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
    const lanes = Math.max(4, Math.round(w / 4));
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
    x: px * S, y: py * S, r: 40, color: "rgba(255,196,110,1)", strength: 0.42, flicker: 0.3, phase: r() * 10,
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
      // The reference shows only the isolated subject, so its surroundings give nothing away.
      draw: (ctx: Ctx) => ctx.drawImage(cutouts.get(t.id)!, -cw / 2, -cw / 2, cw, cw),
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
      mist: { color: "#fff6e6", alpha: 0.13, count: 18, yMin: 80, yMax: 1000 },
      sparkles: { count: 100, color: spec.id === "greece" ? "#fff6d0" : "#ffd27a" },
      butterflies: { count: 14, colors: spec.id === "japan" ? ["#f6f0f4", "#f2c94c", "#f08aa6"] : spec.id === "greece" ? ["#f2c94c", "#ffffff", "#7fb3e8"] : ["#f29a2e", "#f6f0e0", "#e2453a"] },
      leaves: spec.id === "japan" ? { count: 40, colors: ["#e8743a", "#d24f2b", "#f2a250"] } : undefined,
      sweep: true,
      particles: spec.particles,
      birds: { count: spec.birds.count, color: spec.birds.color, y0: 40, y1: 500 },
      seed: spec.id.length * 31,
    }),
  };
}
