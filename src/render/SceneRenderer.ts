import type { Ctx, Rect, Scene, SceneObject } from "../world/types";
import { rectsOverlap } from "../world/types";
import { viewRect, type Camera } from "./camera";

interface LayerCache {
  scale: number;
  region: Rect;
  ground: HTMLCanvasElement;
  objects: HTMLCanvasElement;
}

export interface DrawOptions {
  dpr: number;
  t: number;
  reduced: boolean;
  /** Ids of targets already found; they get a faint gilded ring. */
  found?: ReadonlySet<string>;
  /** Force full vector rendering (used by the lens so magnification stays crisp). */
  direct?: boolean;
  grain?: boolean;
}

const MAX_SIDE = 8192;
const MAX_PIXELS = 18_000_000;

let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 192;
  const g = c.getContext("2d")!;
  const img = g.createImageData(192, 192);
  let s = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = 128 + ((s % 1000) / 1000 - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * Renders one scene. The same draw functions feed the window previews, the gameplay view,
 * the magnifier and the snapshot, so all of them show identical artwork.
 */
export class SceneRenderer {
  readonly scene: Scene;
  private animated: SceneObject[];
  private statics: SceneObject[];
  private occluders = new Map<SceneObject, SceneObject[]>();
  private caches: { preview?: LayerCache; play?: LayerCache } = {};

  constructor(scene: Scene) {
    this.scene = scene;
    this.animated = scene.objects.filter((o) => o.animated);
    this.statics = scene.objects.filter((o) => !o.animated);
    for (const a of this.animated) {
      const occ = this.statics.filter((s) => s.depth > a.depth && rectsOverlap(s.bbox, a.bbox));
      if (occ.length) this.occluders.set(a, occ);
    }
  }

  hasCache(kind: "preview" | "play") {
    return !!this.caches[kind];
  }

  cacheMatches(kind: "preview" | "play", region: Rect, scale: number) {
    const c = this.caches[kind];
    if (!c) return false;
    return Math.abs(c.scale - scale) < 0.01 && c.region.x <= region.x + 1 && c.region.y <= region.y + 1 &&
      c.region.x + c.region.w >= region.x + region.w - 1 && c.region.y + c.region.h >= region.y + region.h - 1;
  }

  dropCache(kind: "preview" | "play") {
    delete this.caches[kind];
  }

  /**
   * Bake a cache a slice at a time. `step(budgetMs)` draws items until the budget is spent and
   * returns true once the cache is complete and installed.
   */
  startCacheJob(kind: "preview" | "play", regionIn: Rect, scaleIn: number) {
    const b = this.scene.bounds;
    const x0 = Math.max(regionIn.x, b.x), y0 = Math.max(regionIn.y, b.y);
    const x1 = Math.min(regionIn.x + regionIn.w, b.x + b.w), y1 = Math.min(regionIn.y + regionIn.h, b.y + b.h);
    const region = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    const scale = Math.min(scaleIn, MAX_SIDE / region.w, MAX_SIDE / region.h, Math.sqrt(MAX_PIXELS / (region.w * region.h)));
    const w = Math.ceil(region.w * scale), h = Math.ceil(region.h * scale);
    const ground = document.createElement("canvas");
    ground.width = w;
    ground.height = h;
    const objects = document.createElement("canvas");
    objects.width = w;
    objects.height = h;
    const g = ground.getContext("2d")!;
    const o = objects.getContext("2d")!;
    for (const c of [g, o]) {
      c.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
      c.lineCap = "round";
      c.lineJoin = "round";
    }
    g.fillStyle = this.scene.edgeColor;
    g.fillRect(region.x, region.y, region.w, region.h);
    const groundItems = this.scene.ground.filter((i) => rectsOverlap(i.bbox, region));
    const staticItems = this.statics.filter((s) => rectsOverlap(s.bbox, region));
    let gi = 0, si = 0;
    let done = false;
    return {
      kind,
      scale,
      region,
      step: (budgetMs: number) => {
        if (done) return true;
        const end = performance.now() + budgetMs;
        while (performance.now() < end) {
          if (gi < groundItems.length) groundItems[gi++].draw(g, 0);
          else if (si < staticItems.length) staticItems[si++].draw(o, 0);
          else {
            this.caches[kind] = { scale, region, ground, objects };
            done = true;
            return true;
          }
        }
        return false;
      },
    };
  }

  /** Bake static ground and static objects for a region at a given device scale. */
  buildCache(kind: "preview" | "play", regionIn: Rect, scaleIn: number) {
    const b = this.scene.bounds;
    const x0 = Math.max(regionIn.x, b.x), y0 = Math.max(regionIn.y, b.y);
    const x1 = Math.min(regionIn.x + regionIn.w, b.x + b.w), y1 = Math.min(regionIn.y + regionIn.h, b.y + b.h);
    const region = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    let scale = scaleIn;
    scale = Math.min(scale, MAX_SIDE / region.w, MAX_SIDE / region.h, Math.sqrt(MAX_PIXELS / (region.w * region.h)));
    const w = Math.ceil(region.w * scale), h = Math.ceil(region.h * scale);
    const ground = document.createElement("canvas");
    ground.width = w;
    ground.height = h;
    const objects = document.createElement("canvas");
    objects.width = w;
    objects.height = h;
    const g = ground.getContext("2d")!;
    g.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.fillStyle = this.scene.edgeColor;
    g.fillRect(region.x, region.y, region.w, region.h);
    for (const item of this.scene.ground) if (rectsOverlap(item.bbox, region)) item.draw(g, 0);
    const o = objects.getContext("2d")!;
    o.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
    for (const s of this.statics) if (rectsOverlap(s.bbox, region)) s.draw(o, 0);
    this.caches[kind] = { scale, region, ground, objects };
  }

  private worldTransform(ctx: Ctx, cam: Camera, dpr: number) {
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.sx - cam.cx * cam.zoom), dpr * (cam.sy - cam.cy * cam.zoom));
  }

  private drawLayers(ctx: Ctx, c: LayerCache, view: Rect, t: number) {
    const r = c.region;
    ctx.drawImage(c.ground, r.x, r.y, r.w, r.h);
    for (const a of this.scene.groundAnims) if (rectsOverlap(a.bbox, view)) a.draw(ctx, t);
    ctx.drawImage(c.objects, r.x, r.y, r.w, r.h);
  }

  private drawAnimated(ctx: Ctx, view: Rect, t: number) {
    for (const a of this.animated) {
      if (!rectsOverlap(a.bbox, view)) continue;
      a.draw(ctx, t);
      const occ = this.occluders.get(a);
      if (!occ) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.bbox.x, a.bbox.y, a.bbox.w, a.bbox.h);
      ctx.clip();
      for (const s of occ) s.draw(ctx, 0);
      ctx.restore();
    }
  }

  /** Draw the scene through `cam` into a canvas of CSS size width × height. */
  draw(ctx: Ctx, cam: Camera, width: number, height: number, o: DrawOptions) {
    const { dpr, t } = o;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = this.scene.edgeColor;
    ctx.fillRect(0, 0, width, height);
    const view = viewRect(cam, width, height);
    this.worldTransform(ctx, cam, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const need = cam.zoom * dpr;
    const play = this.caches.play;
    const prev = this.caches.preview;
    if (o.direct || (!play && !prev)) {
      for (const g of this.scene.ground) if (rectsOverlap(g.bbox, view)) g.draw(ctx, 0);
      for (const a of this.scene.groundAnims) if (rectsOverlap(a.bbox, view)) a.draw(ctx, t);
      for (const s of this.scene.objects) {
        if (!rectsOverlap(s.bbox, view)) continue;
        s.draw(ctx, s.animated ? t : 0);
      }
    } else {
      const playCovers = play && play.region.x <= view.x + 2 && play.region.y <= view.y + 2 &&
        play.region.x + play.region.w >= view.x + view.w - 2 && play.region.y + play.region.h >= view.y + view.h - 2;
      const usePlay = play && (need > (prev?.scale ?? 0) * 1.15 || !prev);
      if (play && usePlay && (playCovers || !prev)) {
        this.drawLayers(ctx, play, view, t);
      } else if (play && usePlay && prev && rectsOverlap(play.region, view)) {
        const pr = play.region;
        ctx.save();
        ctx.beginPath();
        ctx.rect(view.x - 10, view.y - 10, view.w + 20, view.h + 20);
        ctx.rect(pr.x, pr.y, pr.w, pr.h);
        ctx.clip("evenodd");
        this.drawLayers(ctx, prev, view, t);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(pr.x, pr.y, pr.w, pr.h);
        ctx.clip();
        this.drawLayers(ctx, play, view, t);
        ctx.restore();
      } else if (prev) {
        this.drawLayers(ctx, prev, view, t);
      } else if (play) {
        this.drawLayers(ctx, play, view, t);
      }
      this.drawAnimated(ctx, view, t);
    }

    this.drawGlows(ctx, view, t, o.reduced);
    this.scene.atmosphere.draw(ctx, t, view, o.reduced);
    if (o.found && o.found.size) this.drawFound(ctx, o.found, t);

    if (o.grain !== false) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.16;
      const pat = ctx.createPattern(grain(), "repeat");
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, width * dpr, height * dpr);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawGlows(ctx: Ctx, view: Rect, t: number, reduced: boolean) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of this.scene.glows) {
      if (g.x + g.r < view.x || g.x - g.r > view.x + view.w || g.y + g.r < view.y || g.y - g.r > view.y + view.h) continue;
      const fl = reduced ? 1 : 1 + g.flicker * (Math.sin(t * 7.3 + g.phase) * 0.5 + Math.sin(t * 13.1 + g.phase * 2) * 0.3);
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = Math.max(0, Math.min(1, g.strength * fl));
      ctx.fillStyle = grad;
      ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    ctx.restore();
  }

  private drawFound(ctx: Ctx, found: ReadonlySet<string>, t: number) {
    ctx.save();
    for (const tg of this.scene.targets) {
      if (!found.has(tg.id)) continue;
      const r = tg.r + 7 + Math.sin(t * 2 + tg.x) * 1.2;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,226,140,0.85)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3.5]);
      ctx.lineDashOffset = -t * 4;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}
