import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVELS } from "../levels";
import { screenToWorld } from "../render/camera";
import { ambient } from "../audio/ambient";
import { controls } from "../game/controls";
import { motion } from "../game/motion";
import { currentTargetId, type GameState, type Store } from "../game/store";
import { LENS, evaluateHit, world } from "../game/world";
import { hands, type HandStatus } from "../input/handTracker";
import { OneEuro } from "../input/oneEuro";
import type { VoiceStatus } from "../input/speech";
import { BackIcon, HandIcon, MagnifierIcon, MicIcon, PointerIcon, RestartIcon, SoundIcon } from "./icons";
import { TargetArt } from "./TargetArt";
import { clientToStage } from "./stageCoords";

interface Props {
  store: Store;
  state: GameState;
  voiceStatus: VoiceStatus;
  voiceSupported: boolean;
  onToggleVoice: () => void;
  onChooseHand: () => void;
  onChoosePointer: () => void;
  handStatus: HandStatus;
}

const R = LENS.radius;

export function Gameplay({ store, state, voiceStatus, voiceSupported, onToggleVoice, onChooseHand, onChoosePointer, handStatus }: Props) {
  const play = state.play!;
  const level = LEVELS.find((l) => l.id === play.level)!;
  const scene = world.scene(play.level);
  const targets = scene.targets;
  const target = targets.find((t) => t.id === currentTargetId(play))!;
  const visible = state.screen === "play";

  const surfaceRef = useRef<HTMLDivElement>(null);
  const lensWrapRef = useRef<HTMLDivElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const snapWrapRef = useRef<HTMLDivElement>(null);
  const snapCanvasRef = useRef<HTMLCanvasElement>(null);
  const camHolderRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const lens = useRef({ x: 960, y: 540, tx: 960, ty: 540, has: false, origin: { x: 960, y: 540 } });
  const filters = useMemo(() => ({ x: new OneEuro(1.1, 0.015), y: new OneEuro(1.1, 0.015) }), []);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const [showCam, setShowCam] = useState(true);

  const stateRef = useRef(state);
  stateRef.current = state;

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Reset the lens when a level (re)starts.
  useEffect(() => {
    lens.current.has = false;
    filters.x.reset();
    filters.y.reset();
  }, [play.run, filters]);

  const toStage = useCallback((clientX: number, clientY: number) => clientToStage(surfaceRef.current!, clientX, clientY, world.width, world.height), []);

  /* ── Hand tracking drives the lens target ── */
  useEffect(() => {
    return hands.onSample((s) => {
      if (stateRef.current.inputMode !== "hand") return;
      // Map the comfortable central part of the camera frame onto the whole stage.
      const nx = Math.min(1, Math.max(0, (s.x - 0.14) / 0.72));
      const ny = Math.min(1, Math.max(0, (s.y - 0.12) / 0.66));
      const x = filters.x.filter(nx * world.width, s.t);
      const y = filters.y.filter(ny * world.height, s.t);
      lens.current.tx = x;
      lens.current.ty = y;
      if (!lens.current.has) {
        lens.current.x = x;
        lens.current.y = y;
      }
      lens.current.has = true;
      if (tipRef.current) tipRef.current.style.transform = `translate(${s.x * 160 - 4}px, ${s.y * 120 - 4}px)`;
    });
  }, [filters]);

  useEffect(() => {
    if (state.inputMode === "hand" && camHolderRef.current && hands.video.parentElement !== camHolderRef.current) {
      camHolderRef.current.prepend(hands.video);
    }
  }, [state.inputMode, showCam, handStatus]);

  const lensValid = useCallback(() => {
    const s = stateRef.current;
    if (s.inputMode === "hand") return hands.status === "tracking" && lens.current.has;
    return lens.current.has;
  }, []);

  /* ── Lock in: capture the lens, judge it in scene coordinates, animate the reveal ── */
  const lockIn = useCallback(() => {
    const s = stateRef.current;
    const p = s.play;
    if (s.screen !== "play" || !p) return { ok: false, reason: "Not in a scene right now." };
    if (p.phase !== "exploring") return { ok: false, reason: "Already checking a discovery." };
    if (!p.lensActive) {
      say("Raise the magnifying glass first.");
      return { ok: false, reason: "The magnifying glass is not active. Say “use magnifying glass” first." };
    }
    if (!lensValid()) {
      say(s.inputMode === "hand" ? "I can't see your hand — hold it up to aim the lens." : "Move the lens over the scene first.");
      return { ok: false, reason: s.inputMode === "hand" ? "Hand tracking has lost the player's hand, so the lens has no valid position." : "The lens has not been positioned yet." };
    }
    const L = lens.current;
    const cam = world.playCam(p.level);
    const w = screenToWorld(cam, L.x, L.y);
    const tid = currentTargetId(p);
    const hit = evaluateHit(p.level, tid, w);
    // Freeze exactly what the lens shows this frame (scene pixels only, never the camera).
    const src = lensCanvasRef.current!;
    const snap = snapCanvasRef.current!;
    snap.width = src.width;
    snap.height = src.height;
    snap.getContext("2d")!.drawImage(src, 0, 0);
    if (!store.dispatch({ type: "submit", correct: hit.correct })) return { ok: false, reason: "Submission ignored." };
    L.origin = { x: L.x, y: L.y };
    const wrap = snapWrapRef.current!;
    const cx = world.width / 2, cy = world.height * 0.42;
    const from = `translate(${L.x - R}px, ${L.y - R}px) scale(1)`;
    const to = `translate(${cx - R}px, ${cy - R}px) scale(1.45)`;
    wrap.style.transform = to;
    const dur = motion.reduced ? 180 : 820;
    const anim = wrap.animate(
      motion.reduced ? [{ transform: to, opacity: 0 }, { transform: to, opacity: 1 }] : [{ transform: from }, { transform: to }],
      { duration: dur, easing: "cubic-bezier(.22,.8,.2,1)" },
    );
    const reveal = () => {
      if (!store.dispatch({ type: "revealReady" })) return;
      if (hit.correct) ambient.discover();
      else ambient.miss();
    };
    anim.onfinish = reveal;
    // Animations pause in background tabs; never leave the game stuck mid-capture.
    window.setTimeout(reveal, dur + 400);
    return { ok: true, reason: hit.correct ? "correct" : "incorrect" };
  }, [lensValid, say, store]);

  const activateLens = useCallback(() => {
    const s = stateRef.current;
    if (s.screen !== "play" || !s.play || s.play.phase !== "exploring") return false;
    if (s.inputMode === "pointer" && !lens.current.has) {
      lens.current = { ...lens.current, x: world.width / 2, y: world.height / 2, tx: world.width / 2, ty: world.height / 2, has: true };
    }
    return store.dispatch({ type: "lens", on: true }) || s.play.lensActive;
  }, [store]);

  useEffect(() => {
    controls.lockIn = lockIn;
    controls.activateLens = activateLens;
    controls.moveLens = (dx, dy) => {
      const L = lens.current;
      if (!L.has) {
        L.x = L.tx = world.width / 2;
        L.y = L.ty = world.height / 2;
        L.has = true;
      }
      L.tx = Math.min(world.width - 20, Math.max(20, L.tx + dx));
      L.ty = Math.min(world.height - 20, Math.max(20, L.ty + dy));
    };
    return () => {
      controls.lockIn = () => ({ ok: false, reason: "Not in a scene." });
      controls.activateLens = () => false;
      controls.moveLens = () => undefined;
    };
  }, [lockIn, activateLens]);

  /* ── Return the snapshot to the lens after a miss ── */
  useEffect(() => {
    if (play.phase !== "returning") return;
    const wrap = snapWrapRef.current!;
    const L = lens.current;
    const cx = world.width / 2, cy = world.height * 0.42;
    const from = `translate(${cx - R}px, ${cy - R}px) scale(1.45)`;
    const to = `translate(${L.origin.x - R}px, ${L.origin.y - R}px) scale(1)`;
    wrap.style.transform = to;
    const anim = wrap.animate(motion.reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: from }, { transform: to }], { duration: motion.reduced ? 160 : 520, easing: "cubic-bezier(.4,0,.2,1)" });
    anim.onfinish = () => store.dispatch({ type: "returned" });
    const fallback = window.setTimeout(() => store.dispatch({ type: "returned" }), (motion.reduced ? 160 : 520) + 400);
    return () => clearTimeout(fallback);
  }, [play.phase, store]);

  /* ── Lens render loop ── */
  useEffect(() => {
    const canvas = lensCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let px = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const p = s.play;
      const wrap = lensWrapRef.current!;
      const on = s.screen === "play" && p && p.lensActive && p.phase === "exploring";
      if (!on || !p) {
        wrap.style.opacity = "0";
        return;
      }
      if (px !== world.pxScale) {
        px = world.pxScale;
        canvas.width = Math.round(R * 2 * px);
        canvas.height = Math.round(R * 2 * px);
      }
      const L = lens.current;
      const k = s.inputMode === "hand" ? 0.45 : 0.6;
      L.x += (L.tx - L.x) * k;
      L.y += (L.ty - L.y) * k;
      L.x = Math.min(world.width - R * 0.25, Math.max(R * 0.25, L.x));
      L.y = Math.min(world.height - R * 0.25, Math.max(R * 0.25, L.y));
      const lost = s.inputMode === "hand" && hands.status !== "tracking";
      wrap.style.opacity = "1";
      wrap.style.transform = `translate(${L.x - R}px, ${L.y - R}px)`;
      wrap.classList.toggle("lost", lost);
      const cam = world.playCam(p.level);
      const c = screenToWorld(cam, L.x, L.y);
      const lensCam = { cx: c.x, cy: c.y, zoom: cam.zoom * LENS.magnification, sx: R, sy: R };
      world.renderer(p.level).draw(ctx, lensCam, R * 2, R * 2, { dpr: px, t: now / 1000, reduced: motion.reduced, direct: true, found: new Set(p.found) });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── Pointer & touch ── */
  const touchDrag = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (state.inputMode !== "pointer") return;
    const p = toStage(e.clientX, e.clientY);
    if (e.pointerType === "mouse") {
      lens.current.tx = p.x;
      lens.current.ty = p.y;
      if (!lens.current.has) {
        lens.current.x = p.x;
        lens.current.y = p.y;
      }
      lens.current.has = true;
    } else if (touchDrag.current && touchDrag.current.id === e.pointerId) {
      // Keep the lens just above the fingertip so the finger never hides the find.
      lens.current.tx = p.x;
      lens.current.ty = p.y - 110;
      lens.current.has = true;
      if (Math.hypot(e.clientX - touchDrag.current.sx, e.clientY - touchDrag.current.sy) > 6) touchDrag.current.moved = true;
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (state.inputMode !== "pointer" || e.pointerType === "mouse") return;
    touchDrag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (!play.lensActive) activateLens();
    const p = toStage(e.clientX, e.clientY);
    lens.current.tx = p.x;
    lens.current.ty = p.y - 110;
    if (!lens.current.has) {
      lens.current.x = lens.current.tx;
      lens.current.y = lens.current.ty;
    }
    lens.current.has = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (touchDrag.current?.id === e.pointerId) touchDrag.current = null;
  };
  const onClick = (e: React.MouseEvent) => {
    // A deliberate mouse click on the map submits, so the lens never has to leave the find.
    if (state.inputMode !== "pointer" || (e.nativeEvent as PointerEvent).pointerType === "touch") return;
    if (play.lensActive && play.phase === "exploring") lockIn();
  };

  const resultCorrect = play.lastResult?.correct ?? false;
  const showSnap = play.phase === "capturing" || play.phase === "result" || play.phase === "returning";
  const dimmed = play.phase === "capturing" || play.phase === "result" || play.phase === "complete";
  const handHint =
    handStatus === "tracking" ? "Hand tracked" : handStatus === "lost" ? "Show your hand" : handStatus === "loading" ? "Loading hand model…" : handStatus === "requesting" ? "Waiting for camera…" : handStatus === "denied" ? "Camera declined" : handStatus === "unsupported" ? "Camera unavailable" : handStatus === "error" ? "Hand tracking failed" : "Hand tracking off";
  const voiceHint =
    voiceStatus === "listening" ? "Listening" : voiceStatus === "host" ? "Little is listening" : voiceStatus === "denied" ? "Microphone declined" : voiceStatus === "unsupported" ? "Voice unsupported here" : voiceStatus === "error" ? "Voice unavailable" : "Voice off";

  return (
    <div className={`gameplay${visible ? " visible" : ""}${dimmed ? " dimmed" : ""}`} data-little="region" data-little-label={`${level.name} scene`}>
      <div
        ref={surfaceRef}
        className={`play-surface${play.lensActive && state.inputMode === "pointer" && play.phase === "exploring" ? " lens-cursor" : ""}`}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        data-little="region"
        data-little-label="Illustrated scene"
        data-little-caption={`${level.place}, drawn in isometric detail. The agent cannot see where targets are.`}
      />

      <div ref={lensWrapRef} className="lens" aria-hidden="true">
        <canvas ref={lensCanvasRef} className="lens-canvas" />
        <div className="lens-rim" />
        <div className="lens-aim" />
        <div className="lens-lost">Show your hand</div>
      </div>

      <div className={`dim${dimmed ? " on" : ""}`} />

      <div ref={snapWrapRef} className={`snapshot${showSnap ? " on" : ""}${play.phase === "result" ? (resultCorrect ? " correct" : " wrong") : ""}`} aria-hidden="true">
        <canvas ref={snapCanvasRef} className="lens-canvas" />
        <div className="lens-rim" />
      </div>

      {play.phase === "result" && (
        <div className={`result-card ${resultCorrect ? "correct" : "wrong"}`} role="status" data-little="region" data-little-label="Discovery result">
          <div className="result-text" data-little="readout" data-little-label="Result" data-little-data={JSON.stringify({ correct: resultCorrect, found: play.found.length, total: targets.length })}>
            {resultCorrect ? "You found it." : "Not quite. Look closer."}
          </div>
          {resultCorrect && <div className="result-sub">{target.name}</div>}
          {resultCorrect ? (
            <button className="btn btn-primary" autoFocus onClick={() => store.dispatch({ type: "continue" })} data-little="control" data-little-action="continue">
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" autoFocus onClick={() => store.dispatch({ type: "retry" })} data-little="control" data-little-action="try_again">
              Try again
            </button>
          )}
        </div>
      )}

      {/* Discreet controls */}
      <div className="hud top-left">
        <button className="corner-btn" onClick={() => store.dispatch({ type: "leave" })} data-little="control" data-little-action="back_to_windows">
          <BackIcon /> <span>Windows</span>
        </button>
        <button className="corner-btn icon-only" aria-label="Restart level" title="Restart" onClick={() => store.dispatch({ type: "restart" })} data-little="control" data-little-action="restart_level">
          <RestartIcon />
        </button>
        <button className="corner-btn icon-only" aria-label={state.soundOn ? "Mute sound" : "Turn sound on"} aria-pressed={state.soundOn} title="Sound" onClick={() => store.dispatch({ type: "sound", on: !state.soundOn })} data-little="control" data-little-action="toggle_sound">
          <SoundIcon on={state.soundOn} />
        </button>
      </div>

      {/* Right-edge tabs */}
      <div className="tabs">
        <div className={`target-tab-wrap${play.cardOpen ? " open" : ""}`}>
          <div className="target-card" aria-hidden={!play.cardOpen} data-little="region" data-little-label="Current target">
            <div className="card-kicker">Find</div>
            <TargetArt target={target} size={210} />
            <div className="card-name" data-little="readout" data-little-label="Target" data-little-data={JSON.stringify({ name: target.name, kind: target.kind, clue: target.clue })}>
              {target.name}
            </div>
            <p className="card-clue">{target.clue}</p>
            <div className="card-progress" data-little="readout" data-little-label="Progress" data-little-data={JSON.stringify({ found: play.found.length, total: targets.length })}>
              {targets.map((t, i) => (
                <span key={t.id} className={`pip${play.found.includes(t.id) ? " found" : ""}${i === play.targetIndex ? " current" : ""}`} title={play.found.includes(t.id) ? t.name : undefined} />
              ))}
              <span className="pip-label">
                {play.found.length} of {targets.length} found
              </span>
            </div>
          </div>
          <button className="tab target-tab" aria-expanded={play.cardOpen} aria-label={`Current target: ${target.name}. ${play.cardOpen ? "Hide" : "Show"} reference`} onClick={() => store.dispatch({ type: "card", open: !play.cardOpen })} data-little="control" data-little-action="show_target">
            <TargetArt target={target} size={76} animate={false} />
            <span className="tab-label">
              {play.found.length}/{targets.length}
            </span>
          </button>
        </div>
        <button
          className={`tab magnifier-tab${play.lensActive ? " active" : ""}`}
          aria-pressed={play.lensActive}
          aria-label={play.lensActive ? "Put away magnifying glass" : "Use magnifying glass"}
          onClick={() => (play.lensActive ? store.dispatch({ type: "lens", on: false }) : activateLens())}
          data-little="control"
          data-little-action={play.lensActive ? "put_away_magnifying_glass" : "use_magnifying_glass"}
          data-little-state={play.lensActive ? "active" : undefined}
        >
          <MagnifierIcon size={46} active={play.lensActive} />
          <span className="tab-label">
            <span className={`lamp${play.lensActive ? " on" : ""}`} />
            {play.lensActive ? "On" : "Off"}
          </span>
        </button>
      </div>

      {/* Lock in */}
      <div className={`lockin${play.lensActive && play.phase === "exploring" ? " on" : ""}`}>
        <button className="btn btn-lock" onClick={() => lockIn()} disabled={!(play.lensActive && play.phase === "exploring")} data-little="control" data-little-action="lock_in">
          Lock in
        </button>
        <div className="lockin-hint">{state.inputMode === "pointer" ? "Click the map, press Enter, or say “lock in”" : "Point with your index finger, then say “lock in”"}</div>
      </div>

      {/* Input + status */}
      <div className="hud bottom-left">
        <div className="seg" role="group" aria-label="Aiming controls">
          <button className={state.inputMode === "pointer" ? "on" : ""} aria-pressed={state.inputMode === "pointer"} onClick={onChoosePointer} data-little="control" data-little-action="set_controls" data-little-id="ctl_pointer" data-little-label="Pointer controls">
            <PointerIcon /> Pointer
          </button>
          <button className={state.inputMode === "hand" ? "on" : ""} aria-pressed={state.inputMode === "hand"} onClick={onChooseHand} data-little="control" data-little-action="set_controls" data-little-id="ctl_hand" data-little-label="Hand tracking controls">
            <HandIcon /> Hand
          </button>
        </div>
        <button className={`chip-btn${voiceStatus === "listening" || voiceStatus === "host" ? " on" : ""}`} onClick={onToggleVoice} disabled={!voiceSupported && voiceStatus !== "host"} aria-pressed={voiceStatus === "listening"} title={voiceSupported ? "Voice commands" : "Speech recognition isn't available in this browser"}>
          <MicIcon off={!(voiceStatus === "listening" || voiceStatus === "host")} /> {voiceHint}
          {(voiceStatus === "listening" || voiceStatus === "host") && <span className="pulse" />}
        </button>
        {state.inputMode === "hand" && (
          <div className={`status-chip ${handStatus}`} data-little="readout" data-little-label="Hand tracking" data-little-data={JSON.stringify({ status: handStatus })}>
            <span className="dot" /> {handHint}
            <button className="link-btn" onClick={() => setShowCam((v) => !v)}>
              {showCam ? "Hide camera" : "Show camera"}
            </button>
          </div>
        )}
        {state.inputMode === "hand" && showCam && (
          <div className="cam-preview" ref={camHolderRef}>
            <div ref={tipRef} className="cam-tip" />
            <span className="cam-note">On-device only</span>
          </div>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {play.phase === "complete" && (
        <div className="complete" role="dialog" aria-modal="true" aria-labelledby="complete-title" data-little="region" data-little-label="Level complete">
          <div className="complete-card">
            <div className="card-kicker">{level.name}</div>
            <h2 id="complete-title">The veil lifts.</h2>
            <p>You found all five secrets hidden in the {level.name}.</p>
            <div className="complete-grid">
              {targets.map((t) => (
                <figure key={t.id}>
                  <TargetArt target={t} size={110} />
                  <figcaption>{t.name}</figcaption>
                </figure>
              ))}
            </div>
            <div className="complete-buttons">
              <button className="btn btn-primary" autoFocus onClick={() => store.dispatch({ type: "restart" })} data-little="control" data-little-action="replay_level">
                Play again
              </button>
              <button className="btn btn-ghost" onClick={() => store.dispatch({ type: "leave" })} data-little="control" data-little-action="back_to_windows">
                Choose another window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
