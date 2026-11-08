import { useEffect, useRef } from "react";
import type { TargetDef } from "../world/types";
import { motion } from "../game/motion";
import { devicePxPerStagePx } from "./stageCoords";

/**
 * Renders a target's reference illustration with the exact draw function the scene uses, on a
 * paper-coloured vignette, gently animated.
 */
export function TargetArt({ target, size, animate = true, found = false }: { target: TargetDef; size: number; animate?: boolean; found?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(3, devicePxPerStagePx(c));
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d")!;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 50 && last) return;
      last = now;
      const t = animate && !motion.reduced ? now / 1000 : 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.62);
      g.addColorStop(0, "#fbf3dc");
      g.addColorStop(1, "#e3d2ac");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(120,90,60,0.12)";
      ctx.lineWidth = 1;
      for (let i = -size; i < size * 2; i += 9) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - size * 0.5, size);
        ctx.stroke();
      }
      const k = (size / 120) * target.refScale;
      ctx.translate(size / 2, size / 2);
      ctx.scale(k, k);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      target.draw(ctx, t);
      if (!animate) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [target, size, animate]);
  return <canvas ref={ref} className={`target-art${found ? " found" : ""}`} style={{ width: size, height: size }} aria-hidden="true" />;
}
