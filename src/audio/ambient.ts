/**
 * Generative ambient music played by synthesised ancient instruments (no audio assets):
 * plucked strings (koto, lyre, oud) via Karplus–Strong, breathy end-blown flutes (shakuhachi, ney),
 * a reed drone (aulos) and a soft frame drum (bendir), all in a generated stone-hall reverb.
 * Each world has its own ensemble and mode. On by default; resumes on the first gesture if autoplay is blocked.
 */
type Ensemble = {
  root: number;
  scale: number[];
  tempo: number;
  pluck: { brightness: number; decay: number; octave: number };
  flute: { breath: number; vibrato: number } | null;
  drone: "reed" | "soft";
  drum: boolean;
};

const ENSEMBLES: Record<string, Ensemble> = {
  // Lyre and flute in a gentle pentatonic for the corridor
  home: { root: 57, scale: [0, 2, 4, 7, 9, 12, 14], tempo: 60, pluck: { brightness: 0.55, decay: 0.996, octave: 12 }, flute: { breath: 0.22, vibrato: 4.6 }, drone: "soft", drum: false },
  // Koto and shakuhachi, in-scale (miyako-bushi)
  japan: { root: 62, scale: [0, 1, 5, 7, 8, 12, 13], tempo: 54, pluck: { brightness: 0.75, decay: 0.994, octave: 12 }, flute: { breath: 0.42, vibrato: 5.2 }, drone: "soft", drum: false },
  // Lyre over an aulos drone, Dorian-like
  greece: { root: 57, scale: [0, 2, 3, 5, 7, 9, 10, 12], tempo: 64, pluck: { brightness: 0.5, decay: 0.997, octave: 12 }, flute: null, drone: "reed", drum: false },
  // Oud, ney and bendir, Hijaz-like
  morocco: { root: 55, scale: [0, 1, 4, 5, 7, 8, 10, 12], tempo: 70, pluck: { brightness: 0.4, decay: 0.995, octave: 0 }, flute: { breath: 0.32, vibrato: 5.6 }, drone: "reed", drum: true },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private droneNodes: { stop: (t: number) => void }[] = [];
  private ens: Ensemble = ENSEMBLES.home;
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private phraseCooldown = 0;
  private plucks = new Map<string, AudioBuffer>();
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
    // Stone-hall reverb from a generated impulse response.
    const len = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const verb = ctx.createGain();
    verb.connect(conv);
    conv.connect(wet);
    wet.connect(master);
    const music = ctx.createGain();
    music.gain.value = 0.9;
    music.connect(master);
    music.connect(verb);
    this.music = music;
    this.startDrone();
  }

  /* ── instruments ── */

  /** Karplus–Strong plucked string, rendered once per pitch and cached. */
  private pluckBuffer(midi: number) {
    const ctx = this.ctx!;
    const e = this.ens.pluck;
    const key = `${midi}:${e.brightness}:${e.decay}`;
    const hit = this.plucks.get(key);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 3);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / hz(midi)));
    const line = new Float32Array(period);
    // A softened noise burst: lower brightness = warmer, gut-string tone (oud, lyre).
    let prev = 0;
    for (let i = 0; i < period; i++) {
      const n = Math.random() * 2 - 1;
      prev = prev + (n - prev) * e.brightness;
      line[i] = prev;
    }
    let idx = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % period];
      const v = ((cur + next) / 2) * e.decay;
      line[idx] = v;
      out[i] = cur * 0.6 + last * 0.4;
      last = cur;
      idx = (idx + 1) % period;
    }
    this.plucks.set(key, buf);
    return buf;
  }

  private pluck(midi: number, when: number, vol = 0.32, pan = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi);
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g);
    g.connect(p);
    p.connect(this.music!);
    src.start(when);
  }

  /** End-blown flute: sine + soft triangle with vibrato and band-passed breath. */
  private flute(midi: number, when: number, dur: number, vol = 0.07) {
    const ctx = this.ctx!;
    const f = this.ens.flute!;
    const freq = hz(midi + 12);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2;
    const vib = ctx.createOscillator();
    vib.frequency.value = f.vibrato;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, when);
    vibG.gain.linearRampToValueAtTime(freq * 0.008, when + dur * 0.5);
    vib.connect(vibG);
    vibG.connect(o1.frequency);
    vibG.connect(o2.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + Math.min(0.35, dur * 0.3));
    g.gain.setValueAtTime(vol, when + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, when + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    // Breath
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 1.5;
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(vol * f.breath, when + 0.12);
    ng.gain.linearRampToValueAtTime(vol * f.breath * 0.4, when + dur);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.music!);
    g.connect(this.music!);
    for (const n of [o1, o2, vib]) {
      n.start(when);
      n.stop(when + dur + 0.05);
    }
    noise.start(when);
  }

  /** Frame drum: a pitched thump with a little skin noise. */
  private drum(when: number, low: boolean, vol = 0.22) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(low ? 110 : 190, when);
    o.frequency.exponentialRampToValueAtTime(low ? 55 : 120, when + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (low ? 0.5 : 0.22));
    o.connect(g);
    g.connect(this.music!);
    o.start(when);
    o.stop(when + 0.6);
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = ctx.createBufferSource();
    n.buffer = nb;
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = low ? 600 : 1800;
    const ng = ctx.createGain();
    ng.gain.value = vol * (low ? 0.15 : 0.35);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.music!);
    n.start(when);
  }

  /** A sustained drone: soft fifths, or a nasal reed (aulos/ney) through a resonant filter. */
  private startDrone() {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const now = ctx.currentTime;
    for (const d of this.droneNodes) d.stop(now + 2);
    this.droneNodes = [];
    const voices: [number, OscillatorType, number][] = this.ens.drone === "reed"
      ? [[this.ens.root - 12, "sawtooth", 0.018], [this.ens.root - 5, "sawtooth", 0.01], [this.ens.root - 24, "sine", 0.03]]
      : [[this.ens.root - 24, "sine", 0.035], [this.ens.root - 17, "sine", 0.02]];
    for (const [m, type, vol] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz(m);
      o.detune.value = (Math.random() - 0.5) * 6;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = type === "sawtooth" ? 900 : 2000;
      lp.Q.value = type === "sawtooth" ? 3 : 0.7;
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.05 + Math.random() * 0.04;
      const swellG = ctx.createGain();
      swellG.gain.value = vol * 0.35;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 4);
      swell.connect(swellG);
      swellG.connect(g.gain);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.music);
      o.start(now);
      swell.start(now);
      this.droneNodes.push({
        stop: (t) => {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.linearRampToValueAtTime(0, t);
          o.stop(t + 0.1);
          swell.stop(t + 0.1);
        },
      });
    }
  }

  /* ── composition: a slow generative scheduler ── */

  private note(degree: number) {
    const s = this.ens.scale;
    const oct = Math.floor(degree / s.length);
    return this.ens.root + this.ens.pluck.octave + s[((degree % s.length) + s.length) % s.length] + oct * 12;
  }

  private melodyDeg = 2;

  private schedule = () => {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const spb = 60 / this.ens.tempo;
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const t = this.nextBeat;
      const b = this.beat++;
      // Plucked string: a wandering melody with occasional rolled chords.
      if (Math.random() < 0.55) {
        this.melodyDeg = Math.max(0, Math.min(this.ens.scale.length * 2 - 1, this.melodyDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        this.pluck(this.note(this.melodyDeg), t + (Math.random() - 0.5) * 0.03, 0.28, (Math.random() - 0.5) * 0.6);
        if (Math.random() < 0.18) {
          this.pluck(this.note(this.melodyDeg - 2), t + spb * 0.5, 0.18, -0.3);
        }
      }
      if (b % 8 === 0 && Math.random() < 0.6) {
        [0, 2, 4].forEach((d, i) => this.pluck(this.note(d), t + i * 0.09, 0.16, -0.4 + i * 0.4));
      }
      // Flute phrase now and then.
      if (this.ens.flute && this.phraseCooldown <= 0 && Math.random() < 0.12) {
        let deg = 3 + Math.floor(Math.random() * 3);
        let at = t;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const dur = spb * (1.5 + Math.random() * 2.5);
          this.flute(this.note(deg) - this.ens.pluck.octave, at, dur);
          at += dur * 0.92;
          deg += [-1, 1, -2, 2][Math.floor(Math.random() * 4)];
        }
        this.phraseCooldown = 10 + Math.floor(Math.random() * 10);
      }
      this.phraseCooldown--;
      // Bendir: low on 1, light taps after.
      if (this.ens.drum) {
        const pos = b % 4;
        if (pos === 0) this.drum(t, true, 0.2);
        else if (pos === 2 && Math.random() < 0.7) this.drum(t, false, 0.08);
        else if (Math.random() < 0.18) this.drum(t + spb * 0.5, false, 0.05);
      }
      this.nextBeat += spb;
    }
    this.timer = window.setTimeout(this.schedule, 120);
  };

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.init();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (on && ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(on ? 0.75 : 0, now + 1.2);
    clearTimeout(this.timer);
    if (on) {
      this.nextBeat = Math.max(this.nextBeat, now + 0.2);
      this.schedule();
    }
  }

  /** Resume audio after a user gesture when the browser started the context suspended. */
  resume() {
    if (this.ctx && this.ctx.state === "suspended" && this.enabled) void this.ctx.resume();
  }

  setMood(key: string) {
    const e = ENSEMBLES[key] ?? ENSEMBLES.home;
    if (e === this.ens) return;
    this.ens = e;
    this.melodyDeg = 2;
    if (this.ctx) this.startDrone();
  }

  /** Discovery: a bright rolled chord on the world's string instrument. */
  discover() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    [0, 2, 4, 7, 9].forEach((d, i) => this.pluck(this.note(d + 3), t + i * 0.08, 0.32, -0.5 + i * 0.25));
  }

  miss() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    this.pluck(this.note(1), t, 0.26);
    this.pluck(this.note(0), t + 0.28, 0.22);
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
    g.gain.value = 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
  }
}

export const ambient = new Ambient();
