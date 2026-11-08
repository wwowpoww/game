import { frameAssets, type FrameAsset, type FrameKind } from "../art/frames";
import { LEVELS, assets, sceneFor, type LevelId } from "../levels";
import { PAINTED } from "../levels/painted";
import { SceneRenderer } from "../render/SceneRenderer";
import { playCamera, viewRect, type Camera } from "../render/camera";
import type { Scene } from "../world/types";
import { registerTargets } from "./store";

registerTargets((level) => PAINTED[level].targets.map((t) => t.id));

/** Magnifier geometry in stage pixels. */
export const LENS = {
  radius: 150,
  magnification: 2.2,
  /** Selection circle around the lens centre, as a fraction of the lens radius. */
  selectFraction: 0.4,
};

/** Carousel layout: the centred frame is drawn this tall (in a 1080-high stage). */
export const CAROUSEL = { frameHeight: 600, spacing: 600, centerY: 440 };

export interface WindowPlacement {
  /** Screen position of the frame's zoom anchor (centre of its cover rectangle). */
  x: number;
  y: number;
  /** Stage pixels per frame-image pixel. */
  s: number;
}

export interface ZoomPath {
  /** Frame scale when centred in the carousel. */
  sc: number;
  /** Map zoom that fills the centred window's opening. */
  zp: number;
  /** Frame growth at which the map reaches gameplay zoom. */
  k1: number;
  /** Frame growth at which the opening covers the whole stage. */
  kFinal: number;
}

/** Runtime shared by the stage canvas, the magnifier and the hit test. */
class World {
  width = 1920;
  height = 1080;
  /** Device pixels per stage pixel (devicePixelRatio × any CSS zoom on the stage). */
  pxScale = 1;
  private renderers = new Map<LevelId, SceneRenderer>();

  scene(id: LevelId): Scene {
    return sceneFor(id);
  }

  renderer(id: LevelId): SceneRenderer {
    let r = this.renderers.get(id);
    if (!r) {
      r = new SceneRenderer(sceneFor(id));
      this.renderers.set(id, r);
    }
    return r;
  }

  frame(kind: FrameKind): FrameAsset {
    return frameAssets[kind]!;
  }

  playCam(_id: LevelId): Camera {
    return playCamera(PAINTED_CORE, this.width, this.height);
  }

  zoomPath(kind: FrameKind): ZoomPath {
    const f = this.frame(kind);
    const sc = (CAROUSEL.frameHeight / f.h) * (this.height / 1080);
    const halfW = Math.max(f.anchor.x - f.open.x, f.open.x + f.open.w - f.anchor.x) * sc;
    const halfH = Math.max(f.anchor.y - f.open.y, f.open.y + f.open.h - f.anchor.y) * sc;
    const zp = Math.max((2 * halfW) / PAINTED_CORE.w, (2 * halfH) / PAINTED_CORE.h) * 1.03;
    const play = playCamera(PAINTED_CORE, this.width, this.height).zoom;
    const k1 = play / zp;
    const kCover = Math.max(this.width / (f.cover.w * sc), this.height / (f.cover.h * sc)) * 1.04;
    return { sc, zp, k1, kFinal: Math.max(k1, kCover) };
  }

  /** Placement of window i when the carousel sits at (fractional) position pos. */
  windowAt(i: number, pos: number): WindowPlacement {
    const f = this.frame(LEVELS[i].frame);
    const { sc } = this.zoomPath(LEVELS[i].frame);
    // A fixed, centred row of equal windows; selection moves the focus, not the row.
    void pos;
    const s = sc;
    const xc = this.width / 2 + (i - (LEVELS.length - 1) / 2) * CAROUSEL.spacing * (this.width / 1920);
    const yc = CAROUSEL.centerY * (this.height / 1080);
    return { x: xc + (f.anchor.x - f.w / 2) * s, y: yc + (f.anchor.y - f.h / 2) * s, s };
  }

  /** Camera for the painting seen through a window placed at p, continuous with gameplay. */
  previewCam(id: LevelId, p: WindowPlacement, mapGrowth?: number): Camera {
    const level = LEVELS.find((l) => l.id === id)!;
    const z = this.zoomPath(level.frame);
    const zoom = mapGrowth === undefined ? z.zp * (p.s / z.sc) : z.zp * mapGrowth;
    return { cx: PAINTED_CORE.w / 2, cy: PAINTED_CORE.h / 2, zoom, sx: p.x, sy: p.y };
  }

  previewScale(id: LevelId) {
    const level = LEVELS.find((l) => l.id === id)!;
    return this.zoomPath(level.frame).zp * this.pxScale * 1.6;
  }

  playRegion(id: LevelId) {
    const v = viewRect(this.playCam(id), this.width, this.height);
    return { x: Math.floor(v.x - 4), y: Math.floor(v.y - 4), w: Math.ceil(v.w + 8), h: Math.ceil(v.h + 8) };
  }

  private jobs: { id: LevelId; kind: "preview" | "play"; scale: number; job: ReturnType<SceneRenderer["startCacheJob"]> }[] = [];

  /** Queue a time-sliced cache build (no-op until the art has loaded, or if already current). */
  request(id: LevelId, kind: "preview" | "play") {
    if (!assets.loaded) return;
    const r = this.renderer(id);
    const scene = sceneFor(id);
    const region = kind === "preview" ? scene.bounds : this.playRegion(id);
    const scale = kind === "preview" ? this.previewScale(id) : this.playCam(id).zoom * this.pxScale;
    if (r.cacheMatches(kind, region, scale)) return;
    const existing = this.jobs.find((j) => j.id === id && j.kind === kind);
    if (existing && Math.abs(existing.scale - scale) < 0.01) return;
    if (existing) this.jobs.splice(this.jobs.indexOf(existing), 1);
    const job = r.startCacheJob(kind, region, scale);
    const entry = { id, kind, scale, job };
    if (kind === "play") this.jobs.unshift(entry);
    else this.jobs.push(entry);
  }

  /** Advance queued cache builds within a time budget; called once per animation frame. */
  pump(budgetMs: number) {
    const end = performance.now() + budgetMs;
    while (this.jobs.length && performance.now() < end) {
      const j = this.jobs[0];
      if (j.job.step(Math.max(1, end - performance.now()))) this.jobs.shift();
    }
  }

  /** Make sure a cache is complete right now (finishing a queued build if there is one). */
  finish(id: LevelId, kind: "preview" | "play") {
    this.request(id, kind);
    const j = this.jobs.find((x) => x.id === id && x.kind === kind);
    if (j) {
      j.job.step(Infinity);
      this.jobs.splice(this.jobs.indexOf(j), 1);
    }
  }

  /** Release the gameplay-resolution caches of levels that are not in use. */
  trimPlayCaches(keep: LevelId | null) {
    for (const l of LEVELS) if (l.id !== keep) this.renderers.get(l.id)?.dropCache("play");
  }
}

const PAINTED_CORE = { x: 0, y: 0, w: 1920, h: 1080 };

export const world = new World();

export interface HitResult {
  correct: boolean;
  distance: number;
  tolerance: number;
}

/**
 * Correctness is decided in scene coordinates: the target's painted centre must fall inside the
 * selection circle around the lens centre (plus a little of the target's own radius). A target that
 * only appears near the rim of the lens does not count.
 */
export function evaluateHit(id: LevelId, targetId: string, lensWorld: { x: number; y: number }): HitResult {
  const scene = sceneFor(id);
  const t = scene.targets.find((x) => x.id === targetId)!;
  const zoom = world.playCam(id).zoom;
  const sel = (LENS.radius * LENS.selectFraction) / (zoom * LENS.magnification);
  const tolerance = sel + t.r * 0.4;
  const distance = Math.hypot(t.x - lensWorld.x, t.y - lensWorld.y);
  return { correct: distance <= tolerance, distance, tolerance };
}
