import type { HandLandmarker } from "@mediapipe/tasks-vision";

export type HandStatus = "off" | "requesting" | "loading" | "tracking" | "lost" | "denied" | "unsupported" | "error";

export interface HandSample {
  /** Index fingertip in mirrored, normalised camera space (0..1, x already flipped). */
  x: number;
  y: number;
  t: number;
}

type Listener = (status: HandStatus, detail?: string) => void;

/**
 * Hand tracking with MediaPipe Hand Landmarker, entirely in the browser. Camera frames go from the
 * <video> element straight into the on-device model; nothing is recorded, stored or uploaded. The
 * model and WASM runtime are served from this app's own origin (public/mediapipe).
 */
export class HandTracker {
  status: HandStatus = "off";
  latest: HandSample | null = null;
  video: HTMLVideoElement;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private stopGrant: (() => void) | null = null;
  private raf = 0;
  private lastSeen = 0;
  private lastVideoTime = -1;
  private listeners = new Set<Listener>();
  private sampleListeners = new Set<(s: HandSample) => void>();

  constructor() {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
  }

  onStatus(fn: Listener) {
    this.listeners.add(fn);
    fn(this.status);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onSample(fn: (s: HandSample) => void) {
    this.sampleListeners.add(fn);
    return () => {
      this.sampleListeners.delete(fn);
    };
  }

  private set(status: HandStatus, detail?: string) {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((f) => f(status, detail));
  }

  static supported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebAssembly !== "undefined";
  }

  /**
   * Must be called from a user gesture. `hostCamera` lets a Little host broker the camera; in a
   * plain browser we ask getUserMedia directly.
   */
  async start(hostCamera?: () => Promise<{ ok: boolean; stream?: MediaStream; stop(): void; error?: { code: string } }>) {
    if (this.status === "tracking" || this.status === "lost" || this.status === "loading" || this.status === "requesting") return;
    if (!HandTracker.supported()) {
      this.set("unsupported");
      return;
    }
    this.set("requesting");
    try {
      let stream: MediaStream | undefined;
      if (hostCamera) {
        const grant = await hostCamera();
        if (grant.ok && grant.stream) {
          stream = grant.stream;
          this.stopGrant = () => grant.stop();
        } else if (grant.error?.code === "denied") {
          this.set("denied");
          return;
        }
      }
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play().catch(() => undefined);
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.set(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unsupported" : "error", String(e));
      this.stopStream();
      return;
    }
    this.set("loading");
    try {
      if (!this.landmarker) {
        const vision = await import("@mediapipe/tasks-vision");
        const base = new URL("./mediapipe/", document.baseURI).href;
        const fileset = await vision.FilesetResolver.forVisionTasks(base + "wasm");
        const opts = (delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath: base + "hand_landmarker.task", delegate },
          runningMode: "VIDEO" as const,
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        try {
          this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts("GPU"));
        } catch {
          this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts("CPU"));
        }
      }
    } catch (e) {
      this.set("error", String(e));
      this.stopStream();
      return;
    }
    if (!this.stream) return;
    this.set("lost");
    this.lastSeen = 0;
    this.loop();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    let res;
    try {
      res = this.landmarker.detectForVideo(v, now);
    } catch {
      return;
    }
    const hand = res.landmarks?.[0];
    if (hand && hand[8]) {
      // Index fingertip (landmark 8), mirrored so moving your hand right moves the lens right.
      const tip = hand[8];
      const sample = { x: 1 - tip.x, y: tip.y, t: now };
      this.latest = sample;
      this.lastSeen = now;
      this.set("tracking");
      this.sampleListeners.forEach((f) => f(sample));
    } else if (now - this.lastSeen > 350) {
      this.set("lost");
    }
  };

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.stopGrant?.();
    this.stopGrant = null;
    this.video.srcObject = null;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stopStream();
    this.latest = null;
    this.set("off");
  }
}

export const hands = new HandTracker();
