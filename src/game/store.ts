import { useSyncExternalStore } from "react";
import { LEVELS, type LevelId } from "../levels";

export type ScreenKind = "home" | "toSelect" | "select" | "toHome" | "entering" | "play" | "leaving";

/**
 * Gameplay phases. Commands are only honoured in the phase that owns them, so duplicate or
 * late recognition events during capture, reveal and transitions fall through harmlessly.
 */
export type Phase = "exploring" | "capturing" | "result" | "returning" | "complete";

export type InputMode = "pointer" | "hand";

export interface PlayState {
  level: LevelId;
  targetIndex: number;
  found: string[];
  phase: Phase;
  lensActive: boolean;
  cardOpen: boolean;
  lastResult: { correct: boolean; targetId: string } | null;
  /** Bumps every time the level restarts so views can reset local state. */
  run: number;
}

export interface GameState {
  screen: ScreenKind;
  selected: number;
  rulesOpen: boolean;
  play: PlayState | null;
  inputMode: InputMode;
  soundOn: boolean;
}

export type Action =
  | { type: "play" }
  | { type: "descentDone" }
  | { type: "backHome" }
  | { type: "ascentDone" }
  | { type: "rules"; open: boolean }
  | { type: "select"; index: number }
  | { type: "enter"; index?: number }
  | { type: "enterDone" }
  | { type: "leave" }
  | { type: "leaveDone" }
  | { type: "lens"; on: boolean }
  | { type: "card"; open: boolean }
  | { type: "submit"; correct: boolean }
  | { type: "revealReady" }
  | { type: "continue" }
  | { type: "retry" }
  | { type: "returned" }
  | { type: "restart" }
  | { type: "inputMode"; mode: InputMode }
  | { type: "sound"; on: boolean };

const freshPlay = (level: LevelId, run: number): PlayState => ({
  level, targetIndex: 0, found: [], phase: "exploring", lensActive: false, cardOpen: true, lastResult: null, run,
});

export function reduce(s: GameState, a: Action): GameState {
  switch (a.type) {
    case "play":
      return s.screen === "home" ? { ...s, screen: "toSelect", rulesOpen: false } : s;
    case "descentDone":
      return s.screen === "toSelect" ? { ...s, screen: "select" } : s;
    case "backHome":
      return s.screen === "select" ? { ...s, screen: "toHome" } : s;
    case "ascentDone":
      return s.screen === "toHome" ? { ...s, screen: "home" } : s;
    case "rules":
      return s.screen === "home" && s.rulesOpen !== a.open ? { ...s, rulesOpen: a.open } : s;
    case "select": {
      if (s.screen !== "select") return s;
      const index = ((a.index % LEVELS.length) + LEVELS.length) % LEVELS.length;
      return index === s.selected ? s : { ...s, selected: index };
    }
    case "enter": {
      if (s.screen !== "select") return s;
      const selected = a.index ?? s.selected;
      return { ...s, selected, screen: "entering", play: freshPlay(LEVELS[selected].id, (s.play?.run ?? 0) + 1) };
    }
    case "enterDone":
      return s.screen === "entering" ? { ...s, screen: "play" } : s;
    case "leave":
      return s.screen === "play" && s.play && s.play.phase !== "capturing" && s.play.phase !== "returning"
        ? { ...s, screen: "leaving", play: { ...s.play, lensActive: false, cardOpen: false } }
        : s;
    case "leaveDone":
      return s.screen === "leaving" ? { ...s, screen: "select" } : s;
    case "lens": {
      const p = s.play;
      if (s.screen !== "play" || !p || p.phase !== "exploring" || p.lensActive === a.on) return s;
      return { ...s, play: { ...p, lensActive: a.on, cardOpen: a.on ? false : p.cardOpen } };
    }
    case "card": {
      const p = s.play;
      if (s.screen !== "play" || !p || p.phase !== "exploring" || p.cardOpen === a.open) return s;
      return { ...s, play: { ...p, cardOpen: a.open } };
    }
    case "submit": {
      const p = s.play;
      if (s.screen !== "play" || !p || p.phase !== "exploring" || !p.lensActive) return s;
      const targetId = currentTargetId(p);
      return { ...s, play: { ...p, phase: "capturing", cardOpen: false, lastResult: { correct: a.correct, targetId } } };
    }
    case "revealReady": {
      const p = s.play;
      if (!p || p.phase !== "capturing") return s;
      const found = p.lastResult?.correct && !p.found.includes(p.lastResult.targetId) ? [...p.found, p.lastResult.targetId] : p.found;
      return { ...s, play: { ...p, phase: "result", found } };
    }
    case "continue": {
      const p = s.play;
      if (!p || p.phase !== "result" || !p.lastResult?.correct) return s;
      const total = targetCount(p.level);
      if (p.found.length >= total) return { ...s, play: { ...p, phase: "complete", lensActive: false } };
      return { ...s, play: { ...p, phase: "exploring", targetIndex: p.targetIndex + 1, lastResult: null, cardOpen: true } };
    }
    case "retry": {
      const p = s.play;
      if (!p || p.phase !== "result" || p.lastResult?.correct !== false) return s;
      return { ...s, play: { ...p, phase: "returning" } };
    }
    case "returned": {
      const p = s.play;
      if (!p || p.phase !== "returning") return s;
      return { ...s, play: { ...p, phase: "exploring", lastResult: null } };
    }
    case "restart": {
      const p = s.play;
      if (s.screen !== "play" || !p || p.phase === "capturing" || p.phase === "returning") return s;
      return { ...s, play: freshPlay(p.level, p.run + 1) };
    }
    case "inputMode":
      return s.inputMode === a.mode ? s : { ...s, inputMode: a.mode };
    case "sound":
      return s.soundOn === a.on ? s : { ...s, soundOn: a.on };
  }
}

const targetCounts: Partial<Record<LevelId, number>> = {};
let targetIdsFor: (level: LevelId) => string[] = () => [];
/** The scene registry injects target order so the store stays free of rendering code. */
export function registerTargets(fn: (level: LevelId) => string[]) {
  targetIdsFor = fn;
}
export function targetCount(level: LevelId) {
  return targetCounts[level] ?? (targetCounts[level] = targetIdsFor(level).length);
}
export function currentTargetId(p: PlayState) {
  return targetIdsFor(p.level)[Math.min(p.targetIndex, targetCount(p.level) - 1)];
}

export interface Store {
  get(): GameState;
  /** Applies an action synchronously; returns true when it changed the state. */
  dispatch(a: Action): boolean;
  subscribe(fn: () => void): () => void;
}

export function createStore(initial: GameState): Store {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    dispatch(a) {
      const next = reduce(state, a);
      if (next === state) return false;
      state = next;
      subs.forEach((f) => f());
      return true;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

export function useGame(store: Store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
