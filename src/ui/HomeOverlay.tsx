import { useEffect, useRef, useState } from "react";
import type { GameState, Store } from "../game/store";
import { Flourish, MagnifierIcon } from "./icons";
import { Logo } from "./Logo";

export function HomeOverlay({ store, state }: { store: Store; state: GameState }) {
  const playRef = useRef<HTMLButtonElement>(null);
  // Which button the remote is on: Play by default, shown highlighted even before any key press.
  const [current, setCurrent] = useState<"play" | "rules" | null>("play");
  useEffect(() => {
    if (state.screen !== "home" || state.rulesOpen) return;
    setCurrent("play");
    const focus = () => playRef.current?.focus({ preventScroll: true });
    focus();
    const t = window.setTimeout(focus, 60);
    return () => clearTimeout(t);
  }, [state.screen, state.rulesOpen]);
  const interactive = state.screen === "home";
  return (
    <div className={`home-overlay${interactive ? "" : " inert"}`} data-little="region" data-little-label="Veil title screen">
      <div className="title-block">
        <h1 className="title">
          <Logo />
        </h1>
        <p className="tagline">Look closely. The world is full of small secrets.</p>
        <div className="home-buttons" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCurrent(null); }}>
          <button ref={playRef} className={`btn btn-primary${current === "play" ? " is-current" : ""}`} onFocus={() => setCurrent("play")} data-little="control" data-little-action="play" onClick={() => store.dispatch({ type: "play" })} disabled={!interactive}>
            Play
          </button>
          <button className={`btn btn-ghost${current === "rules" ? " is-current" : ""}`} onFocus={() => setCurrent("rules")} data-little="control" data-little-action="show_rules" onClick={() => store.dispatch({ type: "rules", open: true })} disabled={!interactive}>
            Rules
          </button>
        </div>
      </div>
    </div>
  );
}

export function RulesModal({ store, open }: { store: Store; open: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={() => store.dispatch({ type: "rules", open: false })}>
      <div className="rules" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(e) => e.stopPropagation()} data-little="region" data-little-label="Rules">
        <h2 id="rules-title">How to play</h2>
        <Flourish width={180} />
        <ol className="rules-list">
          <li>
            <span className="rule-num">1</span>
            <div>
              <strong>Choose a window.</strong> Use the arrows or swipe to browse three worlds, then enter the one that calls to you.
            </div>
          </li>
          <li>
            <span className="rule-num">2</span>
            <div>
              <strong>Study the scene.</strong> Open the target tab on the right to see what you're looking for, with a clue.
            </div>
          </li>
          <li>
            <span className="rule-num">3</span>
            <div>
              <strong>Raise the magnifier.</strong> Press Select on your remote, say <em>“use magnifying glass”</em>, or tap the <MagnifierIcon size={22} /> tab. Aim it with your index finger in front of the camera, or switch to pointer controls to use a mouse or touchscreen.
            </div>
          </li>
          <li>
            <span className="rule-num">4</span>
            <div>
              <strong>Lock it in.</strong> Centre the lens on your find and press Select again, or say <em>“lock in”</em>.
            </div>
          </li>
        </ol>
        <p className="rules-note">There are no timers and no penalties. Find all five to lift the veil.</p>
        <button ref={closeRef} className="btn btn-primary" data-little="control" data-little-action="close_rules" onClick={() => store.dispatch({ type: "rules", open: false })}>
          Got it
        </button>
      </div>
    </div>
  );
}
