"use client";

/**
 * Playback buffer for scene motion.
 *
 * The overlay used to ease each new position in with a fixed-duration CSS
 * transition. That cannot be made smooth, because it assumes updates arrive on
 * a regular beat and they never do: a transition interrupted halfway restarts
 * toward the new target over its full duration, so every update that lands
 * early is a velocity step, and every update that lands late lets the element
 * finish, sit still, and then lurch off again. Stop-go-stop is exactly what a
 * drag looked like in OBS.
 *
 * This is the approach games use for the same problem. Incoming positions are
 * timestamped and buffered, and rendering runs on a clock held deliberately a
 * little in the past — far enough back that the next sample has normally
 * arrived before it is needed. Each frame interpolates between the two samples
 * bracketing that clock, so motion is continuous and evenly paced no matter how
 * raggedly the packets themselves turned up. Network jitter is absorbed by the
 * buffer instead of being rendered.
 *
 * Timestamps are taken on arrival rather than from the server: OBS's clock and
 * the server's can differ by seconds, and only the spacing matters here.
 */

export type Motion = { x: number; y: number; w: number; h: number; rot: number; op: number };

type Frame = { t: number; m: Map<number, Motion> };

/** Floor on how far behind live we render. */
const MIN_DELAY = 45;
/** Ceiling, so a genuinely bad connection lags rather than stalls. */
const MAX_DELAY = 400;
const START_DELAY = 140;
/**
 * How long to keep coasting past the newest sample. A late packet then reads
 * as a slight overshoot instead of a dead stop followed by a jump.
 */
const EXTRAPOLATE_MS = 120;
/**
 * How long to spend easing that guess back out again once it is clear nothing
 * more is coming. Without this the coast is permanent: every drag would settle
 * a coast's worth past where it was dropped and stay there until the element
 * next moved.
 */
const SETTLE_MS = 350;
/**
 * A gap longer than this means the scene was sitting still, not that the
 * connection is slow. Feeding those into the estimate would inflate the delay
 * and leave the next drag rendering half a second behind the cursor.
 */
const IDLE_GAP_MS = 400;
const GAP_WINDOW = 12;
/** Below this, two arrivals are treated as one sample. */
const MIN_FRAME_GAP = 8;
const MAX_FRAMES = 40;
/** Frames older than this are behind the clock and can never be sampled. */
const KEEP_MS = 2000;
/** Observations kept for the transit-time and spacing estimates. */
const CLOCK_WINDOW = 60;

function mix(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Shortest way round the circle: 350° to 10° is +20°, not −340°. */
function mixAngle(a: number, b: number, u: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * u;
}

// Reused every frame — `sample` hands it straight to its callback, which is
// done with it before the next element is computed.
const scratch: Motion = { x: 0, y: 0, w: 0, h: 0, rot: 0, op: 1 };

function blend(a: Motion, b: Motion, u: number): Motion {
  scratch.x = mix(a.x, b.x, u);
  scratch.y = mix(a.y, b.y, u);
  // Extrapolation runs u past 1, so these need floors that interpolation alone
  // would never require.
  scratch.w = Math.max(1, mix(a.w, b.w, u));
  scratch.h = Math.max(1, mix(a.h, b.h, u));
  scratch.rot = mixAngle(a.rot, b.rot, u);
  scratch.op = Math.min(1, Math.max(0, mix(a.op, b.op, u)));
  return scratch;
}

export class MotionBuffer {
  private frames: Frame[] = [];
  /** The most recent value for every element, so each frame is complete even
   *  when an update only mentions the one element that moved. */
  private latest = new Map<number, Motion>();
  private gaps: number[] = [];
  /**
   * Estimated difference between the sender's clock and ours, taken as the
   * smallest transit seen recently. Only the *relative* spacing of the samples
   * matters, so a constant skew between two machines' clocks cancels out; the
   * minimum is used because the quickest delivery is the one that carries the
   * least queueing, which makes it the best available reading of the offset.
   */
  private offset = 0;
  private transits: number[] = [];
  /** How much longer than the best case each sample took. */
  private excess: number[] = [];
  private lastArrival = 0;
  private target = START_DELAY;
  private clock = 0;
  private started = false;

  /** The newest known value for one element, before any interpolation. */
  latestOf(id: number): Motion | undefined {
    return this.latest.get(id);
  }

  /**
   * Merge an update covering only the elements it mentions.
   *
   * `sentAt` is the editor's own clock reading for when the pointer was at
   * this position, and it is what makes the result actually smooth rather than
   * merely unfrozen. Timestamping on arrival bakes the transit jitter into the
   * timeline — samples taken 50ms apart but delivered 30ms and 70ms apart get
   * played back at those speeds, so the element speeds up and slows down even
   * though the cursor never did. Spacing them by when they were *sent* removes
   * that entirely; all the arrival time is then needed for is noticing how far
   * ahead of the clock the data is running.
   */
  merge(entries: Iterable<[number, Motion]>, now = performance.now(), sentAt?: number): void {
    for (const [id, m] of entries) this.latest.set(id, m);
    this.commit(this.timeline(now, sentAt));
  }

  /** Replace the whole scene, dropping elements that are no longer in it. */
  replace(entries: Iterable<[number, Motion]>, now = performance.now()): void {
    this.latest = new Map(entries);
    // No sender timestamp on a whole-scene reload, and no need for one: those
    // are structural, not part of a gesture.
    this.commit(now);
  }

  /** Map a sender timestamp onto our own clock. */
  private timeline(now: number, sentAt?: number): number {
    if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return now;

    const transit = now - sentAt;
    this.transits.push(transit);
    if (this.transits.length > CLOCK_WINDOW) this.transits.shift();
    this.offset = Math.min(...this.transits);

    this.excess.push(transit - this.offset);
    if (this.excess.length > CLOCK_WINDOW) this.excess.shift();

    return sentAt + this.offset;
  }

  private commit(at: number): void {
    const last = this.frames[this.frames.length - 1];

    // Two updates delivered together are one sample, not two a millisecond
    // apart. Recording them as separate frames would leave a near-zero span
    // between them, and a span is a divisor — both the velocity read off it
    // and anything extrapolated from it come out enormous.
    if (last && at - last.t < MIN_FRAME_GAP) {
      last.m = new Map(this.latest);
      return;
    }

    const t = last && at <= last.t ? last.t + 1 : at;

    if (this.lastArrival) {
      const gap = t - this.lastArrival;
      if (gap <= IDLE_GAP_MS) {
        this.gaps.push(gap);
        if (this.gaps.length > GAP_WINDOW) this.gaps.shift();
        // Size the delay to the worst case, not the average: the delay exists
        // to cover the late arrivals, since those are the ones that would
        // otherwise starve the clock. Two things have to fit inside it — the
        // spacing between samples, and however much longer than the best case
        // a sample can take to turn up.
        const worst = Math.max(...this.gaps);
        const late = this.excess.length ? Math.max(...this.excess) : 0;
        this.target = Math.min(MAX_DELAY, Math.max(MIN_DELAY, worst * 1.1 + late + 16));
      }
    }
    this.lastArrival = t;

    this.frames.push({ t, m: new Map(this.latest) });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  /**
   * Advance the playback clock by one frame and return the time to sample at,
   * or null while nothing has arrived yet.
   */
  advance(dt: number): number | null {
    const last = this.frames[this.frames.length - 1];
    if (!last) return null;

    if (!this.started) {
      this.started = true;
      this.clock = last.t - this.target;
      return this.clock;
    }

    const lead = last.t - this.clock;
    if (lead > this.target * 2 + 500) {
      // Far behind the data: OBS stopped rendering this source for a while, or
      // a reconnection replayed the scene. Skip ahead rather than playing out
      // a backlog nobody is waiting to see.
      this.clock = last.t - this.target;
    } else {
      // Running past the newest sample is *not* handled here. Letting the
      // clock keep going and re-seating it once it gets too far ahead would
      // teleport every element backwards by the whole delay — worse than the
      // stutter this is meant to fix. `sample` clamps how far it will coast,
      // so a starved clock simply holds the last position, and the steering
      // below reels it back in once updates resume.
      // Steer with playback speed, never with a step: moving the clock itself
      // teleports every element on screen. A few percent either way closes the
      // error over a second or so and is invisible.
      const rate = Math.min(1.15, Math.max(0.85, 1 + (lead - this.target) * 0.002));
      this.clock += dt * rate;
    }

    const cutoff = this.clock - KEEP_MS;
    while (this.frames.length > 2 && this.frames[1].t < cutoff) this.frames.shift();

    return this.clock;
  }

  /** Interpolate every element at `t` and hand each to `write`. */
  sample(t: number, write: (id: number, m: Motion) => void): void {
    const f = this.frames;
    if (f.length === 0) return;

    if (f.length === 1 || t <= f[0].t) {
      for (const [id, m] of f[0].m) write(id, m);
      return;
    }

    const newest = f[f.length - 1];
    if (t >= newest.t) {
      const prev = f[f.length - 2];
      const span = newest.t - prev.t;
      const over = t - newest.t;

      // Coast at the last known velocity, capped at one span as well as at
      // EXTRAPOLATE_MS — it is only ever a guess, and doubling the last step is
      // as far as that guess is worth trusting.
      const reach = span > 0 ? Math.min(Math.min(over, EXTRAPOLATE_MS) / span, 1) : 0;
      // Then withdraw it. Past the coasting window nothing more is coming, and
      // the newest sample is not a stale guess about where the element is
      // going — it is where the element actually ended up.
      const trust = Math.max(0, 1 - Math.max(0, over - EXTRAPOLATE_MS) / SETTLE_MS);
      const u = 1 + reach * trust;

      for (const [id, m] of newest.m) {
        const p = trust > 0 ? prev.m.get(id) : undefined;
        write(id, p ? blend(p, m, u) : m);
      }
      return;
    }

    let i = f.length - 2;
    while (i > 0 && f[i].t > t) i--;
    const a = f[i];
    const b = f[i + 1];
    const u = (t - a.t) / (b.t - a.t);
    for (const [id, m] of b.m) {
      const p = a.m.get(id);
      write(id, p ? blend(p, m, u) : m);
    }
  }
}

/**
 * Write one element's motion straight to the DOM.
 *
 * Deliberately not React state: at 60fps a re-render per frame would rebuild
 * every element's props and style object, and in OBS's off-screen renderer
 * that main-thread work lands exactly where the next frame needed to be
 * composited. React still owns everything else about the element; it simply
 * never sets these four properties, so what is written here survives its
 * re-renders untouched.
 *
 * `written` holds what was last actually written, so unchanged properties are
 * skipped — width and height especially, since those force a layout pass.
 */
export function applyMotion(
  node: HTMLElement,
  id: number,
  m: Motion,
  written: Map<number, Motion>,
): void {
  const p = written.get(id);
  const s = node.style;

  if (!p || p.x !== m.x || p.y !== m.y || p.rot !== m.rot) {
    s.transform =
      `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0) rotate(${m.rot.toFixed(3)}deg)`;
    if (p) {
      p.x = m.x;
      p.y = m.y;
      p.rot = m.rot;
    }
  }
  if (!p || Math.abs(p.w - m.w) > 0.05) {
    s.width = `${m.w.toFixed(2)}px`;
    if (p) p.w = m.w;
  }
  if (!p || Math.abs(p.h - m.h) > 0.05) {
    s.height = `${m.h.toFixed(2)}px`;
    if (p) p.h = m.h;
  }
  if (!p || Math.abs(p.op - m.op) > 0.002) {
    s.opacity = m.op.toFixed(3);
    if (p) p.op = m.op;
  }

  if (!p) written.set(id, { ...m });
}

/** Pull the animated fields out of a scene element. */
export function motionOf(el: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
}): Motion {
  return { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rotation, op: el.opacity };
}
