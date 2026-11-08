import { useEffect, useRef } from "react";
import { WALL } from "../art/frames";
import { corridorLayers } from "../art/corridor";
import { LEVELS, assets } from "../levels";
import { easeInOutCubic, lerp } from "../render/camera";
import { motion, transition } from "../game/motion";
import type { Store } from "../game/store";
import { world, type WindowPlacement } from "../game/world";
import { devicePxPerStagePx } from "./stageCoords";

/** Shared carousel state: the select overlay writes drag offsets, the canvas eases toward them. */
export const carousel = { pos: 0, drag: 0 };

const posters = new Map<string, HTMLCanvasElement>();

/** The carousel's backdrop is the lower half of the corridor's floor art, so the two read as one. */
function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number, glowX: number, glowY: number, glowR: number, alpha = 1) {
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, w, h);
  const px = ctx.getTransform().a;
  const fore = corridorLayers(px).fore;
  ctx.drawImage(fore, 0, fore.height / 2, fore.width, fore.height / 2, 0, 0, w, h);
  const g = ctx.createRadialGradient(glowX, glowY, glowR * 0.2, glowX, glowY, glowR);
  g.addColorStop(0, `rgba(150,96,52,${0.4 * alpha})`);
  g.addColorStop(0.5, `rgba(80,50,32,${0.24 * alpha})`);
  g.addColorStop(1, "rgba(21,16,13,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function StageCanvas({ store }: { store: Store }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    // Offscreen layer: the map is drawn here, masked to the window opening, then composited.
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let lastPlayDraw = 0;
    carousel.pos = store.get().selected;

    const resize = () => {
      const w = canvas.clientWidth || 1920, h = canvas.clientHeight || 1080;
      const px = devicePxPerStagePx(canvas);
      const changed = Math.abs(world.width - w) > 0.5 || Math.abs(world.height - h) > 0.5 || Math.abs(world.pxScale - px) > 0.01;
      world.width = w;
      world.height = h;
      world.pxScale = px;
      canvas.width = layer.width = Math.round(w * px);
      canvas.height = layer.height = Math.round(h * px);
      if (changed) {
        posters.clear();
        const s = store.get();
        for (const l of LEVELS) world.request(l.id, "preview");
        if (s.play && (s.screen === "play" || s.screen === "entering" || s.screen === "leaving")) world.request(s.play.level, "play");
      }
      lastPlayDraw = 0;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);

    const foundSet = () => new Set(store.get().play?.found ?? []);

    const frameRect = (i: number, p: WindowPlacement) => {
      const f = world.frame(LEVELS[i].frame);
      return { f, x: p.x - f.anchor.x * p.s, y: p.y - f.anchor.y * p.s, w: f.w * p.s, h: f.h * p.s };
    };

    /** A small composite (painting + mask + frame) for windows that are not centred. */
    const poster = (i: number) => {
      const level = LEVELS[i];
      const key = `${level.id}@${world.pxScale.toFixed(3)}@${world.height}`;
      const hit = posters.get(key);
      if (hit) return hit;
      const r = world.renderer(level.id);
      if (!r.hasCache("preview")) return null;
      const f = world.frame(level.frame);
      const { sc } = world.zoomPath(level.frame);
      const px = world.pxScale;
      const lw = f.w * sc, lh = f.h * sc;
      const c = document.createElement("canvas");
      c.width = Math.ceil(lw * px);
      c.height = Math.ceil(lh * px);
      const pctx = c.getContext("2d")!;
      r.draw(pctx, world.previewCam(level.id, { x: f.anchor.x * sc, y: f.anchor.y * sc, s: sc }), lw, lh, { dpr: px, t: 0, reduced: true });
      pctx.setTransform(px, 0, 0, px, 0, 0);
      pctx.globalCompositeOperation = "destination-in";
      pctx.drawImage(f.mask, 0, 0, lw, lh);
      pctx.globalCompositeOperation = "source-over";
      pctx.drawImage(f.shade, 0, 0, lw, lh);
      pctx.drawImage(f.img, 0, 0, lw, lh);
      posters.set(key, c);
      return c;
    };

    const drawWindowLive = (i: number, p: WindowPlacement, t: number, mapGrowth?: number, alpha = 1) => {
      const level = LEVELS[i];
      const px = world.pxScale;
      const fr = frameRect(i, p);
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = "source-over";
      lctx.clearRect(0, 0, layer.width, layer.height);
      world.renderer(level.id).draw(lctx, world.previewCam(level.id, p, mapGrowth), world.width, world.height, { dpr: px, t, reduced: motion.reduced, found: foundSet() });
      lctx.setTransform(px, 0, 0, px, 0, 0);
      lctx.globalCompositeOperation = "destination-in";
      lctx.drawImage(fr.f.mask, fr.x, fr.y, fr.w, fr.h);
      lctx.globalCompositeOperation = "source-over";
      lctx.drawImage(fr.f.shade, fr.x, fr.y, fr.w, fr.h);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.drawImage(fr.f.img, fr.x, fr.y, fr.w, fr.h);
      ctx.restore();
    };

    const drawPoster = (i: number, p: WindowPlacement, alpha: number, dim = 0) => {
      const fr = frameRect(i, p);
      const img = poster(i);
      ctx.save();
      ctx.setTransform(world.pxScale, 0, 0, world.pxScale, 0, 0);
      ctx.globalAlpha = alpha;
      if (dim > 0) ctx.filter = `brightness(${1 - 0.38 * dim}) saturate(${1 - 0.45 * dim})`;
      ctx.drawImage(img ?? fr.f.img, fr.x, fr.y, fr.w, fr.h);
      ctx.restore();
    };

    const drawSelect = (t: number, pos: number) => {
      const px = world.pxScale;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      if (!assets.loaded) {
        drawWall(ctx, world.width, world.height, world.width / 2, world.height * 0.42, 780);
        return;
      }
      const sel = store.get().selected;
      const focus = world.windowAt(sel, pos);
      drawWall(ctx, world.width, world.height, focus.x, focus.y, 700);
      for (let i = 0; i < LEVELS.length; i++) {
        const p = world.windowAt(i, pos);
        // The selected window is alive and in full colour; the others are a darker still.
        if (i === sel) drawWindowLive(i, p, t);
        else drawPoster(i, p, 1, Math.min(1, Math.abs(i - pos)));
      }
    };

    const drawZoom = (t: number, p: number) => {
      const s = store.get();
      const sel = s.selected;
      const level = LEVELS[sel];
      const px = world.pxScale;
      const e = easeInOutCubic(p);
      ctx.setTransform(px, 0, 0, px, 0, 0);
      if (!assets.loaded) return;
      const start = world.windowAt(sel, sel);
      if (motion.reduced) {
        // Minimal camera movement: a short cross-fade between the window and the map.
        drawWall(ctx, world.width, world.height, world.width / 2, start.y, 780);
        drawWindowLive(sel, start, t);
        ctx.save();
        ctx.globalAlpha = e;
        world.renderer(level.id).draw(ctx, world.playCam(level.id), world.width, world.height, { dpr: px, t, reduced: true, found: foundSet() });
        ctx.restore();
        return;
      }
      const z = world.zoomPath(level.frame);
      // The frame grows all the way until its opening covers the stage; the painting grows with it
      // until it reaches gameplay size, then holds still while the frame slides past the edges.
      const K = Math.pow(z.kFinal, e);
      const mapK = Math.min(K, z.k1);
      const f = z.k1 > 1.0001 ? Math.log(mapK) / Math.log(z.k1) : 1;
      const place: WindowPlacement = { x: lerp(start.x, world.width / 2, f), y: lerp(start.y, world.height / 2, f), s: z.sc * K };
      drawWall(ctx, world.width, world.height, place.x, place.y, 780 * K, 1 - e);
      for (const i of [sel - 1, sel + 1]) {
        if (i < 0 || i >= LEVELS.length) continue;
        const n = world.windowAt(i, sel);
        const spread = Math.pow(K, 0.7);
        drawPoster(i, { x: place.x + (n.x - start.x) * spread, y: place.y + (n.y - start.y) * spread, s: n.s * spread }, Math.max(0, (1 - e * 2.2) * 0.45));
      }
      drawWindowLive(sel, place, t, mapK);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const s = store.get();
      world.pump(s.screen === "play" ? 3 : 6);
      const target = s.selected + carousel.drag;
      const k = motion.reduced ? 1 : 1 - Math.exp(-dt * 7);
      carousel.pos += (target - carousel.pos) * k;
      if (Math.abs(target - carousel.pos) < 0.0005) carousel.pos = target;

      switch (s.screen) {
        case "home":
          return;
        case "toSelect":
        case "toHome":
        case "select":
          drawSelect(t, carousel.pos);
          return;
        case "entering":
          if (s.play) world.finish(s.play.level, "play");
          drawZoom(t, transition.progress(now));
          return;
        case "leaving":
          drawZoom(t, 1 - transition.progress(now));
          return;
        case "play": {
          if (!s.play || !assets.loaded) return;
          // The scene animates gently; 30 fps is plenty and leaves room for the magnifier.
          if (now - lastPlayDraw < 32) return;
          lastPlayDraw = now;
          world.finish(s.play.level, "play");
          const px = world.pxScale;
          world.renderer(s.play.level).draw(ctx, world.playCam(s.play.level), world.width, world.height, { dpr: px, t, reduced: motion.reduced, found: foundSet() });
          return;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [store]);

  return <canvas ref={ref} className="stage-canvas" aria-hidden="true" />;
}
