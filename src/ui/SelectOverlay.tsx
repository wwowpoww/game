import { useEffect, useRef } from "react";
import { LEVELS } from "../levels";
import type { GameState, Store } from "../game/store";
import { CAROUSEL, world } from "../game/world";
import { carousel } from "./StageCanvas";
import { BackIcon, ChevronIcon } from "./icons";
import { clientToStage } from "./stageCoords";

export function SelectOverlay({ store, state }: { store: Store; state: GameState }) {
  const active = state.screen === "select";
  const drag = useRef<{ id: number; x0: number; moved: boolean } | null>(null);
  const level = LEVELS[state.selected];

  // Nothing in the carousel holds focus, so Select on the remote enters the highlighted window.
  useEffect(() => {
    if (active) (document.activeElement as HTMLElement | null)?.blur?.();
  }, [active]);

  const go = (d: number) => store.dispatch({ type: "select", index: state.selected + d });

  const onDown = (e: React.PointerEvent) => {
    if (!active) return;
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = e.currentTarget as HTMLElement;
    const dx = clientToStage(el, e.clientX, 0, world.width, world.height).x - clientToStage(el, d.x0, 0, world.width, world.height).x;
    if (Math.abs(dx) > 8) d.moved = true;
    carousel.drag = -dx / CAROUSEL.spacing;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const shift = carousel.drag;
    carousel.drag = 0;
    if (d.moved) {
      if (shift > 0.12) go(1);
      else if (shift < -0.12) go(-1);
      return;
    }
    // A tap on the centred window enters it; taps on the side windows bring them forward.
    // Tapping the selected window enters it; tapping another window selects it.
    const { x, y } = clientToStage(e.currentTarget as HTMLElement, e.clientX, e.clientY, world.width, world.height);
    const hit = LEVELS.findIndex((_, i) => {
      const p = world.windowAt(i, state.selected);
      return Math.abs(x - p.x) < 260 && Math.abs(y - p.y) < 320;
    });
    if (hit === state.selected) store.dispatch({ type: "enter" });
    else if (hit >= 0) store.dispatch({ type: "select", index: hit });
  };

  return (
    <div
      className={`select-overlay${active ? "" : " inert"}${state.screen === "toSelect" || state.screen === "toHome" || active ? "" : " hidden"}`}
      data-little="region"
      data-little-label="Window selection"
      aria-hidden={!active}
    >
      <div className="swipe-surface" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {LEVELS.map((l, i) => (
          <div
            key={l.id}
            className="window-hit"
            data-little="item"
            data-little-id={l.littleId}
            data-little-action="enter_window"
            data-little-label={`${l.name} window`}
            data-little-state={i === state.selected ? "selected" : undefined}
            data-little-data={JSON.stringify({ world: l.place, centred: i === state.selected })}
            data-little-caption={l.windowCaption}
            style={{ left: `${(world.windowAt(i, state.selected).x / world.width) * 100}%` }}
            onClick={() => (i === state.selected ? store.dispatch({ type: "enter" }) : store.dispatch({ type: "select", index: i }))}
          />
        ))}
      </div>
      <button className="corner-btn top-left" onClick={() => store.dispatch({ type: "backHome" })} disabled={!active} data-little="control" data-little-action="back_to_corridor">
        <BackIcon /> <span>Corridor</span>
      </button>
      <button className="arrow-btn left" aria-label="Previous window" onClick={() => go(-1)} disabled={!active} data-little="control" data-little-action="previous_window">
        <ChevronIcon dir="left" size={52} />
      </button>
      <button className="arrow-btn right" aria-label="Next window" onClick={() => go(1)} disabled={!active} data-little="control" data-little-action="next_window">
        <ChevronIcon dir="right" size={52} />
      </button>
      <div className="window-caption" aria-live="polite">
        <div className="window-name">{level.name}</div>
        <div className="window-place">{level.place}</div>
        <div className="window-dots" aria-hidden="true">
          {LEVELS.map((l, i) => (
            <span key={l.id} className={i === state.selected ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
