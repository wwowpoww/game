import type { Rect } from "../world/types";

/** World point (cx, cy) appears at screen point (sx, sy) in CSS pixels, scaled by zoom. */
export interface Camera {
  cx: number;
  cy: number;
  zoom: number;
  sx: number;
  sy: number;
}

export const worldToScreen = (c: Camera, x: number, y: number) => ({ x: c.sx + (x - c.cx) * c.zoom, y: c.sy + (y - c.cy) * c.zoom });
export const screenToWorld = (c: Camera, x: number, y: number) => ({ x: c.cx + (x - c.sx) / c.zoom, y: c.cy + (y - c.sy) / c.zoom });

export function viewRect(c: Camera, width: number, height: number): Rect {
  const a = screenToWorld(c, 0, 0);
  return { x: a.x, y: a.y, w: width / c.zoom, h: height / c.zoom };
}

/** Gameplay framing: the 1920×1080 core is contained in the viewport and centred. */
export function playCamera(core: Rect, width: number, height: number): Camera {
  const zoom = Math.min(width / core.w, height / core.h);
  return { cx: core.x + core.w / 2, cy: core.y + core.h / 2, zoom, sx: width / 2, sy: height / 2 };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
