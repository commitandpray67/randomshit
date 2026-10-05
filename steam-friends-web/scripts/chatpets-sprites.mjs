// Turn a walking-pet sheet into a chat pets sprite strip.
//
//   npm run sprites -- path/to/sheet.png <set>/<name>
//
// e.g. `cats/bell` adds a cat to the set the cats' streamers use, and
// `special/whale` makes a sprite that only a chatter named in
// app/chatpets/pets.ts gets. Which streamer gets which set is decided there.
//
// The sheet is a 2×2 grid on a transparent background: the top row walks
// right (two frames), the bottom row walks left (two frames). The output is
// app/chatpets/sprites/walk/<set>/<name>.png, one row of four equal cells in
// the order right-1, right-2, left-1, left-2, and app/chatpets/sprites/walk/
// index.ts is rewritten to list every strip in every set, so the new one is
// picked up on the next build. Running it again with the same name replaces it.
//
// Two options, for sheets that don't come out that way:
//
//   --mirror     every frame faces right: walk right with the top row, and
//                left with the same two frames flipped. The bottom row is
//                ignored.
//   --bg black   the background is solid black rather than transparent. Black
//                connected to the sheet's edge is cleared, so the character's
//                own blacks (which are never quite as dark) survive — clearing
//                every black pixel would take the outline and dark clothes too.
//
// Each frame is cut out by its own bounding box, then placed so the feet sit on
// the bottom edge and the nose stays put between frames (right-aligned for the
// right-facing pair, left-aligned for the other) — otherwise the cat's head
// jumps back and forth as the frames alternate, which reads as jitter rather
// than walking.

import sharp from "sharp";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "chatpets", "sprites", "walk");
// Every sheet is stored at the same scale, rather than every cat at the same
// height: otherwise a cat in a tall hat is drawn smaller than one without.
// The sheets are ~420px-tall cats on a 1536×1024 canvas, so this keeps a cat
// about 150px tall — twice the biggest size anyone is likely to use on a
// 1080p canvas, so they stay sharp when the browser scales them down.
const SCALE = 1 / 2.8;
// A plain cat's height at that scale. The page sizes pets by this, so the
// "pet size" setting is how tall an ordinary cat is, hat or no hat.
const CAT_H = 150;
// Clear space either side of each frame. Neighbouring frames in the strip
// would otherwise touch nose to nose, and a browser scaling the strip down
// blends a sliver of the next frame into this one's edge.
const PAD = 4;
// Faint edge pixels below this alpha don't count towards a frame's box.
const SOLID = 64;

// A set is named like a Twitch login (a streamer's own set is usually named
// after them), a sprite like a file.
const SET = /^[a-z0-9_]{1,25}$/;
const NAME = /^[a-z0-9-]{1,30}$/;

const args = process.argv.slice(2);
const MIRROR = args.includes("--mirror");
const bgAt = args.indexOf("--bg");
const BG = bgAt >= 0 ? args[bgAt + 1] : null;
const [sheet, rawId] = args.filter((a, i) => !a.startsWith("--") && !(bgAt >= 0 && i === bgAt + 1));
const [set, name] = String(rawId ?? "").toLowerCase().split("/");
if (!sheet || !SET.test(set ?? "") || !NAME.test(name ?? "") || (BG !== null && BG !== "black")) {
  console.error(
    "usage: npm run sprites -- <sheet.png|webp> <set>/<name> [--mirror] [--bg black]   e.g. cats/bell, special/whale",
  );
  process.exit(1);
}

const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const alpha = (x, y) => data[(y * W + x) * 4 + 3];

if (BG === "black") {
  // The background is 0–3 on every channel, give or take compression; the
  // darkest a character gets is above that. Measured on the first black sheet:
  // flooding up to 8 takes the background and stops at the outline, and by 16
  // it has started eating into the outline.
  const DARK = 8;
  const darkest = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const clear = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (clear[i] || darkest(i) > DARK) continue;
    clear[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
}

/** The sheet as it now stands (background cleared, if it was asked for). */
const source = () => sharp(data, { raw: { width: W, height: H, channels: 4 } });

/** Bounding box of the solid pixels inside one quadrant. */
function box(x0, y0, x1, y1) {
  let l = x1, t = y1, r = -1, b = -1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (alpha(x, y) >= SOLID) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
  if (r < 0) throw new Error(`no cat found in the quadrant at ${x0},${y0}`);
  // A frame that reaches the dividing line has probably been cut in half.
  if (l === x0 || t === y0 || r === x1 - 1 || b === y1 - 1) {
    console.warn(`warning: the frame at ${x0},${y0} touches the quadrant edge; check the output`);
  }
  return { left: l, top: t, width: r - l + 1, height: b - t + 1 };
}

/**
 * Where to cut between frames: the emptiest line in the middle fifth of the
 * span, rather than the exact centre. Frames aren't always centred in their
 * quarter of the sheet, and a tail or a ribbon reaching past the halfway mark
 * would otherwise be cut off one frame and left as a stray sliver on the next.
 */
function gap(lo, hi, count) {
  const from = Math.floor(lo + (hi - lo) * 0.4), to = Math.ceil(lo + (hi - lo) * 0.6);
  const counts = [];
  for (let i = from; i <= to; i++) counts.push(count(i));
  const fewest = Math.min(...counts);
  // The middle of the longest stretch of emptiest lines, so the cut keeps
  // clear of both frames instead of grazing the edge of one.
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
const solidInRow = (y, x0, x1) => { let n = 0; for (let x = x0; x < x1; x++) if (alpha(x, y) >= SOLID) n++; return n; };
const solidInCol = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) if (alpha(x, y) >= SOLID) n++; return n; };

const my = gap(0, H, (y) => solidInRow(y, 0, W));
const mxTop = gap(0, W, (x) => solidInCol(x, 0, my));
const mxBottom = gap(0, W, (x) => solidInCol(x, my, H));
const right = [box(0, 0, mxTop, my), box(mxTop, 0, W, my)];
// Left-facing frames: the bottom row, or with --mirror the top row flipped.
const frames = MIRROR
  ? [...right, ...right]
  : [...right, box(0, my, mxBottom, H), box(mxBottom, my, W, H)];

const srcW = Math.max(...frames.map((f) => f.width));
const srcH = Math.max(...frames.map((f) => f.height));
const scale = SCALE;
const cellW = Math.round(srcW * scale) + PAD * 2;
const CELL_H = Math.round(srcH * scale);

const cells = await Promise.all(
  frames.map(async (f, i) => {
    const w = Math.max(1, Math.round(f.width * scale));
    const h = Math.max(1, Math.round(f.height * scale));
    const facingRight = i < 2;
    // Extracted to a buffer first: sharp applies flop before extract within
    // one pipeline, which would flip the whole sheet and cut the wrong frame.
    const cut = await source().extract(f).png().toBuffer();
    let img = sharp(cut).resize(w, h, { kernel: "lanczos3" });
    if (MIRROR && !facingRight) img = img.flop();
    const input = await img.png().toBuffer();
    return { input, left: i * cellW + (facingRight ? cellW - PAD - w : PAD), top: CELL_H - h };
  }),
);

mkdirSync(join(OUT, set), { recursive: true });
const file = `${set}/${name}.png`;
await sharp({ create: { width: cellW * 4, height: CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(cells)
  .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
  .toFile(join(OUT, file));
console.log(`wrote app/chatpets/sprites/walk/${file} (${cellW}×${CELL_H} per frame)`);

// ---- the list the page imports ---------------------------------------------

const sets = readdirSync(OUT).filter((d) => SET.test(d) && statSync(join(OUT, d)).isDirectory()).sort();
const entries = [];
for (const d of sets) {
  for (const f of readdirSync(join(OUT, d)).filter((f) => /^[a-z0-9-]+\.png$/.test(f)).sort()) {
    const m = await sharp(join(OUT, d, f)).metadata();
    const n = f.slice(0, -4);
    entries.push({ set: d, id: `${d}/${n}`, file: `./${d}/${f}`, ident: `${d}_${n}`.replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()), w: m.width / 4, h: m.height });
  }
}
const ts = `// Generated by scripts/chatpets-sprites.mjs from the strips in the folders here.
// Don't edit by hand: add or replace one with \`npm run sprites -- <sheet> <set>/<name>\`.
// Which streamer gets which set, and who gets a sprite of their own, is in
// app/chatpets/pets.ts.
//
// Each strip is four cells of w×h in a row: right-1, right-2, left-1, left-2.

${entries.map((e) => `import ${e.ident} from "${e.file}";`).join("\n")}

export type Walker = { id: string; src: string; w: number; h: number };

/** An ordinary cat's height in these cells; the page scales so this is the pet size. */
export const CAT_H = ${CAT_H};

export const WALK_SETS: Record<string, Walker[]> = {
${sets
  .map((d) => `  ${d}: [\n${entries.filter((e) => e.set === d).map((e) => `    { id: "${e.id}", src: ${e.ident}.src, w: ${e.w}, h: ${e.h} },`).join("\n")}\n  ],`)
  .join("\n")}
};
`;
writeFileSync(join(OUT, "index.ts"), ts);
console.log(`index.ts: ${sets.map((d) => `${d} (${entries.filter((e) => e.set === d).length})`).join(", ")}`);
