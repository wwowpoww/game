export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export const chance = (r: Rng, p: number) => r() < p;

/** Stable 0..1 hash for a pair of numbers (used for per-object phases). */
export function hash2(x: number, y: number): number {
  let h = Math.imul(Math.floor(x * 73856093) ^ Math.floor(y * 19349663), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}
