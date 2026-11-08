export type VoiceCommand = "magnifier" | "lockIn" | "continue" | "retry";
export type VoiceStatus = "off" | "listening" | "denied" | "unsupported" | "error" | "host";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const PATTERNS: [VoiceCommand, RegExp][] = [
  // "lock in", plus common mishearings ("log in", "lock it in", "locking").
  ["lockIn", /\b(lock|log|lok|locked)[\s-]*(it[\s-]*)?in\b|\block(in|ing)\b/i],
  ["magnifier", /\b(use|open|activate|get|grab|take|start|show)\b.*\b(magnif\w*|glass|lens|loupe)\b|\bmagnifying glass\b/i],
  ["continue", /\b(continue|next target|keep going)\b/i],
  ["retry", /\b(try again|retry|one more time)\b/i],
];

export function parseCommand(text: string): VoiceCommand | null {
  const t = text.toLowerCase();
  for (const [cmd, re] of PATTERNS) if (re.test(t)) return cmd;
  return null;
}

/**
 * Browser speech recognition (Web Speech API). Where it exists, recognition is performed by the
 * browser vendor's service — in Chrome that means audio is sent to Google's servers — so this is
 * opt-in and the game never depends on it. Each utterance fires a command at most once, and a
 * short cooldown absorbs the interim/final duplicates the API produces.
 */
export class SpeechCommands {
  status: VoiceStatus = "off";
  private rec: SpeechRecognitionLike | null = null;
  private wanted = false;
  private fired = new Map<number, Set<VoiceCommand>>();
  private lastFire = new Map<VoiceCommand, number>();
  private listeners = new Set<(s: VoiceStatus) => void>();
  private handlers = new Set<(c: VoiceCommand, heard: string) => void>();
  heard = "";

  static supported() {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  onStatus(fn: (s: VoiceStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onCommand(fn: (c: VoiceCommand, heard: string) => void) {
    this.handlers.add(fn);
    return () => {
      this.handlers.delete(fn);
    };
  }
  private set(s: VoiceStatus) {
    this.status = s;
    this.listeners.forEach((f) => f(s));
  }

  /** Feed text from any recogniser (the browser's, or the Little host's transcript tap). */
  hear(text: string, utteranceKey: number) {
    this.heard = text;
    const cmd = parseCommand(text);
    if (!cmd) return;
    const done = this.fired.get(utteranceKey) ?? new Set();
    if (done.has(cmd)) return;
    const now = performance.now();
    if (now - (this.lastFire.get(cmd) ?? 0) < 1200) return;
    done.add(cmd);
    this.fired.set(utteranceKey, done);
    if (this.fired.size > 40) this.fired.delete(this.fired.keys().next().value!);
    this.lastFire.set(cmd, now);
    this.handlers.forEach((f) => f(cmd, text));
  }

  /** Start listening; call from a user gesture so the browser can show its permission prompt. */
  start() {
    if (!SpeechCommands.supported()) {
      this.set("unsupported");
      return;
    }
    this.wanted = true;
    if (this.rec) return;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    let session = Date.now();
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        this.hear(r[0].transcript, session * 1000 + i);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wanted = false;
        this.set("denied");
      } else if (e.error === "audio-capture") {
        this.wanted = false;
        this.set("error");
      }
    };
    rec.onend = () => {
      // Chrome ends continuous sessions after silence; keep listening while the player wants it.
      if (this.wanted) {
        session = Date.now();
        try {
          rec.start();
        } catch {
          this.rec = null;
          this.set("error");
        }
      } else {
        this.rec = null;
        if (this.status === "listening") this.set("off");
      }
    };
    try {
      rec.start();
      this.rec = rec;
      this.set("listening");
    } catch {
      this.set("error");
    }
  }

  stop() {
    this.wanted = false;
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
    this.set("off");
  }

  /** Mark that the Little host is supplying the transcript instead of the browser. */
  useHost() {
    this.set("host");
  }
}

export const speech = new SpeechCommands();
