/**
 * The dev stage (and some hosts) scale the 1920×1080 canvas with CSS `zoom`. Browsers disagree on
 * whether getBoundingClientRect() reports zoomed or unzoomed units, while pointer events always
 * report viewport pixels. These helpers give a viewport-space rect either way.
 */
export function cssZoom(el: Element): number {
  let z = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).zoom || "1");
    if (v && Number.isFinite(v)) z *= v;
  }
  return z;
}

export function viewportRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const z = cssZoom(el);
  const visual = el.offsetWidth ? r.width / el.offsetWidth : 1;
  // Legacy zoom reports rects in unzoomed units; standardised zoom already includes it.
  const k = Math.abs(visual - z) < 0.01 ? 1 : z;
  return { left: r.left * k, top: r.top * k, width: r.width * k, height: r.height * k };
}

/** Viewport (client) coordinates → stage coordinates for an element spanning the stage. */
export function clientToStage(el: HTMLElement, clientX: number, clientY: number, stageW: number, stageH: number) {
  const r = viewportRect(el);
  return { x: ((clientX - r.left) / r.width) * stageW, y: ((clientY - r.top) / r.height) * stageH };
}

/** Device pixels per stage pixel, for crisp canvas backing stores. */
export function devicePxPerStagePx(el: HTMLElement) {
  return (window.devicePixelRatio || 1) * cssZoom(el);
}
