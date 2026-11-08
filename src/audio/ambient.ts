/**
 * Subtle ambient sound synthesised with Web Audio (no audio assets are bundled): soft wind, a low
 * drone and occasional chimes tuned to each world's scale, plus short cues for discoveries.
 * Starts muted; the context is created on the first user-initiated unmute.
 */
type Mood = { root: number; scale: number[] };

const MOODS: Record<string, Mood> = {
  home: { root: 60, scale: [0, 2, 4, 7, 9, 12] },
  japan: { root: 62, scale: [0, 1, 5, 7, 8, 12] },
  greece: { root: 64, scale: [0, 2, 3, 7, 9, 12] },
  morocco: { root: 62, scale: [0, 1, 4, 5, 7, 8, 12] },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private drone: OscillatorNode[] = [];
  private mood: Mood = MOODS.home;
  private chimeTimer = 0;
  enabled = false;

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    // A gentle echo for the chimes
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    bus.connect(master);
    bus.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(master);
    this.bus = bus;
    // Wind: looping noise through a slowly wandering band-pass.
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
      d[i] = last * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    noise.connect(bp);
    bp.connect(windGain);
    windGain.connect(master);
    noise.start();
    lfo.start();
    this.retuneDrone();
  }

  private retuneDrone() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    for (const o of this.drone) {
      try {
        o.stop(now + 1.5);
      } catch {
        /* already stopped */
      }
    }
    this.drone = [];
    for (const [semi, vol] of [[-24, 0.035], [-17, 0.02]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(this.mood.root + semi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 3);
      o.connect(g);
      g.connect(this.master);
      o.start(now);
      this.drone.push(o);
    }
  }

  private note(midi: number, when: number, vol = 0.06, dur = 2.4, type: OscillatorType = "sine") {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz(midi) * 2.76;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.bus);
    o.start(when);
    o2.start(when);
    o.stop(when + dur + 0.1);
    o2.stop(when + dur + 0.1);
  }

  private scheduleChimes() {
    clearTimeout(this.chimeTimer);
    if (!this.enabled) return;
    const next = 3500 + Math.random() * 5000;
    this.chimeTimer = window.setTimeout(() => {
      if (!this.ctx || !this.enabled) return;
      const s = this.mood.scale;
      const n = 1 + Math.floor(Math.random() * 3);
      const t0 = this.ctx.currentTime + 0.05;
      for (let i = 0; i < n; i++) this.note(this.mood.root + 12 + s[Math.floor(Math.random() * s.length)], t0 + i * 0.28, 0.035);
      this.scheduleChimes();
    }, next);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.init();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (on && ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(on ? 0.7 : 0, now + 0.8);
    this.scheduleChimes();
  }

  setMood(key: string) {
    const m = MOODS[key] ?? MOODS.home;
    if (m === this.mood) return;
    this.mood = m;
    if (this.ctx) this.retuneDrone();
  }

  discover() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + 0.02;
    const s = this.mood.scale;
    [0, 2, 3, 5].forEach((k, i) => this.note(this.mood.root + 12 + s[k % s.length] + (k >= s.length ? 12 : 0), t0 + i * 0.12, 0.07, 2.8));
  }

  miss() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + 0.02;
    this.note(this.mood.root - 5, t0, 0.05, 1.4, "triangle");
    this.note(this.mood.root - 7, t0 + 0.22, 0.04, 1.6, "triangle");
  }

  whoosh(up = false) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || !this.master) return;
    const len = ctx.sampleRate * 1.6;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    const now = ctx.currentTime;
    f.frequency.setValueAtTime(up ? 300 : 1400, now);
    f.frequency.exponentialRampToValueAtTime(up ? 1400 : 260, now + 1.6);
    const g = ctx.createGain();
    g.gain.value = 0.07;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
  }
}

export const ambient = new Ambient();
