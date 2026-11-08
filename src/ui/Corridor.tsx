import { useEffect, useRef } from "react";
import { drawCorridor } from "../art/corridor";
import { easeInOutCubic } from "../render/camera";
import { motion, transition } from "../game/motion";
import type { Store } from "../game/store";
import { devicePxPerStagePx, viewportRect } from "./stageCoords";

/** The shadowed corridor. Owns the downward parallax travel toward the windows. */
export function Corridor({ store }: { store: Store }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let px = 1;
    let raf = 0;
    let pointerX = 0;
    let swayCur = 0;
    const resize = () => {
      px = devicePxPerStagePx(canvas) * ((canvas.clientWidth || 1920) / 1920);
      canvas.width = Math.round(1920 * px);
      canvas.height = Math.round(1080 * px);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    const onMove = (e: PointerEvent) => {
      const rect = viewportRect(canvas);
      pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = store.get();
      if (s.screen !== "home" && s.screen !== "toSelect" && s.screen !== "toHome") return;
      let descent = 0;
      if (s.screen === "toSelect") descent = transition.progress(now);
      if (s.screen === "toHome") descent = 1 - transition.progress(now);
      const reduced = motion.reduced;
      swayCur += (pointerX * -30 - swayCur) * 0.04;
      const e = reduced ? 0 : easeInOutCubic(descent);
      drawCorridor(ctx, px, now / 1000, e, reduced, swayCur);
      canvas.style.opacity = reduced ? String(1 - descent) : "1";
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [store]);
  return <canvas ref={ref} className="stage-canvas corridor-canvas" aria-hidden="true" />;
}
