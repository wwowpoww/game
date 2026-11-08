import { framesReady, type FrameKind } from "../art/frames";
import type { Scene } from "../world/types";
import { PAINTED, buildPainted, paintingsReady } from "./painted";

export type LevelId = "japan" | "greece" | "morocco";

export interface LevelMeta {
  id: LevelId;
  /** Opaque id exposed to the Little agent. */
  littleId: string;
  name: string;
  place: string;
  frame: FrameKind;
  /** What the window looks like, for the agent's perception. */
  windowCaption: string;
}

export const LEVELS: LevelMeta[] = [
  { id: "japan", littleId: "win_a1", name: "Garden of Lanterns", place: "A Japanese-inspired garden town", frame: "japan", windowCaption: "A timber window under a green-tiled roof, hung with wisteria, looking into a Japanese-inspired garden town" },
  { id: "greece", littleId: "win_b2", name: "Hill of Olives", place: "A Greek-inspired hillside town", frame: "greece", windowCaption: "A stone arch with fluted columns, olives and bougainvillea, looking into a Greek-inspired hillside town" },
  { id: "morocco", littleId: "win_c3", name: "Courtyard of Fountains", place: "A Moroccan-inspired courtyard city", frame: "morocco", windowCaption: "A scalloped arch with green zellige and jasmine, looking into a Moroccan-inspired courtyard city" },
];

/** Resolves once every painting and window frame has loaded and been analysed. */
export const assetsReady: Promise<void> = Promise.all([paintingsReady, framesReady]).then(() => {
  assets.loaded = true;
});
export const assets = { loaded: false };

const sceneCache = new Map<LevelId, Scene>();
export function sceneFor(id: LevelId): Scene {
  let s = sceneCache.get(id);
  if (!s) {
    s = buildPainted(PAINTED[id]);
    sceneCache.set(id, s);
  }
  return s;
}
