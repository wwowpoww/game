/**
 * The window frames are painted PNGs with a transparent opening. On load we flood-fill the
 * transparent interior from the centre to recover the opening as a mask, then measure the largest
 * 16:9 rectangle inside it. Zooming the frame until that rectangle covers the stage makes the
 * opening swallow the screen, which is how a preview becomes the playable map.
 */
export type FrameKind = "japan" | "greece" | "morocco";

export interface FrameAsset {
  img: HTMLImageElement;
  w: number;
  h: number;
  /** Opening interior (white) on a transparent canvas, slightly dilated to tuck under the frame. */
  mask: HTMLCanvasElement;
  /** Opening bounding box in image pixels. */
  open: { x: number; y: number; w: number; h: number };
  /** Largest centred 16:9 rectangle inside the opening, in image pixels. */
  cover: { x: number; y: number; w: number; h: number };
  /** The zoom anchor: centre of `cover`. */
  anchor: { x: number; y: number };
}

export const WALL = "#15100d";

const SRC: Record<FrameKind, string> = {
  japan: "art/frame-japan.png",
  greece: "art/frame-greece.png",
  morocco: "art/frame-morocco.png",
};

export const frameAssets: Partial<Record<FrameKind, FrameAsset>> = {};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = new URL(src, document.baseURI).href;
  });
}

function analyse(img: HTMLImageElement): FrameAsset {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h).data;
  const fill = (threshold: number) => {
    const inside = new Uint8Array(w * h);
    const stack = [Math.floor(h / 2) * w + Math.floor(w / 2)];
    let leaked = false;
    while (stack.length) {
      const i = stack.pop()!;
      if (inside[i] || data[i * 4 + 3] >= threshold) continue;
      inside[i] = 1;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) leaked = true;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    return { inside, leaked };
  };
  let res = fill(110);
  if (res.leaked) res = fill(20);
  const inside = res.inside;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  // Prefix sums let us test "is this rectangle fully open?" in O(1).
  const sum = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += inside[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const open = (rx: number, ry: number, rw: number, rh: number) => {
    const ax = Math.max(0, Math.floor(rx)), ay = Math.max(0, Math.floor(ry));
    const bx = Math.min(w, Math.ceil(rx + rw)), by = Math.min(h, Math.ceil(ry + rh));
    if (bx <= ax || by <= ay) return false;
    const total = sum[by * (w + 1) + bx] - sum[ay * (w + 1) + bx] - sum[by * (w + 1) + ax] + sum[ay * (w + 1) + ax];
    return total >= (bx - ax) * (by - ay) * 0.995;
  };
  let best = { x: 0, y: 0, w: 1, h: 1 };
  const cx0 = (x0 + x1) / 2;
  for (let cy = y0 + (y1 - y0) * 0.3; cy <= y0 + (y1 - y0) * 0.8; cy += 4) {
    let lo = 1, hi = x1 - x0;
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      const rh = (mid * 9) / 16;
      if (open(cx0 - mid / 2, cy - rh / 2, mid, rh)) lo = mid;
      else hi = mid;
    }
    if (lo > best.w) best = { x: cx0 - lo / 2, y: cy - (lo * 9) / 32, w: lo, h: (lo * 9) / 16 };
  }
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mg = mask.getContext("2d")!;
  const md = mg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!inside[i]) continue;
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = md.data[i * 4 + 3] = 255;
  }
  mg.putImageData(md, 0, 0);
  // Dilate a few pixels so the map tucks under the painted edge without a seam.
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  tmp.getContext("2d")!.drawImage(mask, 0, 0);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) mg.drawImage(tmp, dx, dy);
  return {
    img, w, h, mask,
    open: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    cover: best,
    anchor: { x: best.x + best.w / 2, y: best.y + best.h / 2 },
  };
}

export const framesReady: Promise<void> = Promise.all(
  (Object.keys(SRC) as FrameKind[]).map(async (k) => {
    frameAssets[k] = analyse(await loadImage(SRC[k]));
  }),
).then(() => undefined);
