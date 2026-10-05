/**
 * Cutting a chat pet sheet into frames: shared by the studio, which does it in
 * the browser when someone uploads a sprite, and scripts/chatpets-sprites.mjs,
 * which does it for the sprites built into the app. Same rules either way, so
 * an upload comes out as the script would have made it.
 *
 * A sheet is a 2×2 grid: the top row walks right (two frames), the bottom row
 * walks left (two frames) — or, `mirror`ed, every frame faces right and the
 * left-facing pair is the top row flipped. The result is a strip of four equal
 * cells in the order right-1, right-2, left-1, left-2.
 *
 * Each frame is cut out by its own bounding box, then placed so the feet sit
 * on the bottom edge and the nose stays put between frames (right-aligned for
 * the right-facing pair, left-aligned for the other) — otherwise the head
 * jumps back and forth as the frames alternate, which reads as jitter rather
 * than walking.
 *
 * Everything here works on plain RGBA pixel arrays, and imports nothing, so
 * Node can load it straight from TypeScript (--experimental-strip-types).
 */

type Pixels = Uint8Array | Uint8ClampedArray;

export type Box = { left: number; top: number; width: number; height: number };

/** A plain cat's height in the stored strips; the page scales so this is the pet size. */
export const CAT_H = 150;
/**
 * The built-in sprites are all stored at this one scale rather than each at
 * the same height: otherwise a cat in a tall hat is drawn smaller than one
 * without. Their sheets are ~420px-tall cats on a 1536×1024 canvas, which this
 * brings to about CAT_H.
 */
export const BUILT_IN_SCALE = 1 / 2.8;
/**
 * Clear space either side of each frame. Neighbouring frames in the strip
 * would otherwise touch nose to nose, and a browser scaling the strip down
 * blends a sliver of the next frame into this one's edge.
 */
export const PAD = 4;
/** Faint edge pixels below this alpha don't count towards a frame's box. */
const SOLID = 64;

export type Background = "transparent" | "black" | "white";

/**
 * Clear a solid background: the colour connected to the sheet's edge, not
 * every pixel of that colour, so the character's own blacks or whites (an
 * outline, dark clothes, white fur) survive.
 *
 * For black: the background is 0–3 on every channel, give or take compression,
 * and a character's darkest is above that. Measured on a real black sheet,
 * flooding up to 8 takes the background and stops at the outline; by 16 it has
 * started eating into the outline. White is the same from the other end.
 */
export function clearBackground(data: Pixels, W: number, H: number, bg: Background): void {
  if (bg === "transparent") return;
  const isBg =
    bg === "black"
      ? (i: number) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= 8
      : (i: number) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 247;
  const done = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (done[i] || !isBg(i)) continue;
    done[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
}

/** A guess at the background, from the four corners: what to offer first. */
export function guessBackground(data: Pixels, W: number, H: number): Background {
  const corners = [0, W - 1, (H - 1) * W, H * W - 1];
  const all = (f: (i: number) => boolean) => corners.every(f);
  if (all((i) => data[i * 4 + 3] < 128)) return "transparent";
  if (all((i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) <= 8)) return "black";
  if (all((i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 247)) return "white";
  return "transparent";
}

/**
 * The four frames, in strip order, and anything that looks wrong. With
 * `mirror`, the last two are the first two again (to be drawn flipped).
 */
export function findFrames(
  data: Pixels,
  W: number,
  H: number,
  mirror: boolean,
): { frames: Box[]; warnings: string[] } {
  const warnings: string[] = [];
  const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3];

  /** Bounding box of the solid pixels inside one quadrant. */
  function box(x0: number, y0: number, x1: number, y1: number): Box {
    let l = x1, t = y1, r = -1, b = -1;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (alpha(x, y) >= SOLID) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
    if (r < 0) throw new Error(`no character found in the quarter at ${x0},${y0}`);
    // A frame that reaches the dividing line has probably been cut in half.
    if (l === x0 || t === y0 || r === x1 - 1 || b === y1 - 1) {
      warnings.push(`the frame at ${x0},${y0} touches the edge of its quarter; check the output`);
    }
    return { left: l, top: t, width: r - l + 1, height: b - t + 1 };
  }

  /**
   * Where to cut between frames: the middle of the longest stretch of emptiest
   * lines in the middle fifth of the span, rather than the exact centre.
   * Frames aren't always centred in their quarter of the sheet, and a tail or
   * a ribbon reaching past the halfway mark would otherwise be cut off one
   * frame and left as a stray sliver on the next.
   */
  function gap(lo: number, hi: number, count: (i: number) => number): number {
    const from = Math.floor(lo + (hi - lo) * 0.4), to = Math.ceil(lo + (hi - lo) * 0.6);
    const counts: number[] = [];
    for (let i = from; i <= to; i++) counts.push(count(i));
    const fewest = Math.min(...counts);
    let best = Math.floor((lo + hi) / 2), longest = 0;
    for (let i = 0; i < counts.length; ) {
      if (counts[i] !== fewest) { i++; continue; }
      let j = i;
      while (j + 1 < counts.length && counts[j + 1] === fewest) j++;
      if (j - i + 1 > longest) { longest = j - i + 1; best = from + Math.floor((i + j) / 2); }
      i = j + 1;
    }
    return best;
  }
  const solidInRow = (y: number, x0: number, x1: number) => { let n = 0; for (let x = x0; x < x1; x++) if (alpha(x, y) >= SOLID) n++; return n; };
  const solidInCol = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) if (alpha(x, y) >= SOLID) n++; return n; };

  const my = gap(0, H, (y) => solidInRow(y, 0, W));
  const mxTop = gap(0, W, (x) => solidInCol(x, 0, my));
  const right = [box(0, 0, mxTop, my), box(mxTop, 0, W, my)];
  if (mirror) return { frames: [...right, ...right], warnings };
  const mxBottom = gap(0, W, (x) => solidInCol(x, my, H));
  return { frames: [...right, box(0, my, mxBottom, H), box(mxBottom, my, W, H)], warnings };
}

export type Cell = {
  /** Where to cut from the sheet. */
  from: Box;
  /** Where it goes in the strip, at what size. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Drawn mirrored (the left-facing pair of a mirrored sheet). */
  flip: boolean;
};

/** The strip's layout: cell size, and where each frame lands in it. */
export function layoutStrip(
  frames: Box[],
  scale: number,
  mirror: boolean,
): { cellW: number; cellH: number; width: number; height: number; cells: Cell[] } {
  const srcW = Math.max(...frames.map((f) => f.width));
  const srcH = Math.max(...frames.map((f) => f.height));
  const cellW = Math.round(srcW * scale) + PAD * 2;
  const cellH = Math.round(srcH * scale);
  const cells = frames.map((f, i) => {
    const width = Math.max(1, Math.round(f.width * scale));
    const height = Math.max(1, Math.round(f.height * scale));
    const facingRight = i < 2;
    return {
      from: f,
      left: i * cellW + (facingRight ? cellW - PAD - width : PAD),
      top: cellH - height,
      width,
      height,
      flip: mirror && !facingRight,
    };
  });
  return { cellW, cellH, width: cellW * 4, height: cellH, cells };
}

/**
 * The scale for an upload. Sheets come at any size, so rather than the
 * built-ins' fixed scale, the tallest frame is brought to CAT_H × `size`
 * (1 = as tall as an ordinary cat).
 */
export function uploadScale(frames: Box[], size: number): number {
  const srcH = Math.max(...frames.map((f) => f.height));
  return (CAT_H * size) / srcH;
}
