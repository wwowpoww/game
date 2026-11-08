export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Ctx = CanvasRenderingContext2D;
export type DrawFn = (ctx: Ctx, t: number) => void;

/** Anything drawn in world coordinates with a conservative bounding box for culling. */
export interface DrawItem {
  bbox: Rect;
  draw: DrawFn;
}

/** A depth-sorted element. Static ones are baked into caches; animated ones draw every frame. */
export interface SceneObject extends DrawItem {
  depth: number;
  animated: boolean;
  targetId?: string;
}

/** A warm point light, composited additively above the scene. */
export interface Glow {
  x: number;
  y: number;
  r: number;
  color: string;
  strength: number;
  flicker: number;
  phase: number;
}

export type TargetKind = "person" | "animal" | "plant" | "object";

export interface TargetDef {
  id: string;
  name: string;
  kind: TargetKind;
  clue: string;
  /** Scene (world) coordinates of the target's visual centre. */
  x: number;
  y: number;
  /** Radius of the target's visual extent in world units. */
  r: number;
  /** Draws the target centred on (0, 0) in local units. Shared by the scene and the reference card. */
  draw: DrawFn;
  /** Scale used when the reference card renders the target alone. */
  refScale: number;
}

export interface Atmosphere {
  /** Drawn over the finished scene each frame in world coordinates: mist, light grade, vignette. */
  draw: (ctx: Ctx, t: number, view: Rect, reduced: boolean) => void;
}

export interface Scene {
  id: string;
  /** The playable region the gameplay camera frames (1920×1080 world units). */
  core: Rect;
  /** Everything that has artwork, including sky and margins seen from the window previews. */
  bounds: Rect;
  ground: DrawItem[];
  groundAnims: DrawItem[];
  objects: SceneObject[];
  glows: Glow[];
  atmosphere: Atmosphere;
  targets: TargetDef[];
  /** Flat colour used beyond `bounds`. */
  edgeColor: string;
}

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const padRect = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
