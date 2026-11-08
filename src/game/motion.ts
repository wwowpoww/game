import type { ScreenKind } from "./store";

const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Live reduced-motion preference (read every frame by the canvases). */
export const motion = {
  reduced: mq?.matches ?? false,
};
mq?.addEventListener("change", (e) => {
  motion.reduced = e.matches;
});

/** Transition durations in ms: [full motion, reduced motion]. */
const DURATIONS: Partial<Record<ScreenKind, [number, number]>> = {
  toSelect: [2300, 380],
  toHome: [1900, 380],
  entering: [2000, 450],
  leaving: [1600, 420],
};

/** The single clock every transitional screen reads its progress from. */
export const transition = {
  kind: null as ScreenKind | null,
  start: 0,
  duration: 1,
  begin(kind: ScreenKind) {
    const d = DURATIONS[kind];
    this.kind = d ? kind : null;
    this.start = performance.now();
    this.duration = d ? d[motion.reduced ? 1 : 0] : 1;
  },
  progress(now = performance.now()) {
    if (!this.kind) return 1;
    return Math.min(1, Math.max(0, (now - this.start) / this.duration));
  },
};
