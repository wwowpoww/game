/**
 * One Euro filter (Casiez et al.): smooths heavily when the hand is still and lightly when it
 * moves fast, so the lens is steady for aiming yet keeps up with sweeps.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;
  constructor(private minCutoff = 1.2, private beta = 0.012, private dCutoff = 1.0) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, tMs: number): number {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const ad = this.alpha(this.dCutoff, dt);
    const rawDx = (value - this.x) / dt;
    this.dx = ad * rawDx + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }

  reset() {
    this.x = null;
    this.t = null;
    this.dx = 0;
  }
}
