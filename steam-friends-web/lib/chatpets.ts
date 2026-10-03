/**
 * Chat pets: everyone who types in a Twitch chat gets an animal that wanders
 * along the bottom of the overlay with their name over it.
 *
 * It's a widget mode rather than an element kind of its own — scene_elements
 * has a CHECK on kind, and a new one would mean migrating both hosts' tables.
 * The pets themselves are a hand-written page (app/chatpets/route.ts) that the
 * widget frames, so the React renderer and the lite source share one
 * implementation and the only thing that differs is how the URL is built.
 *
 * Each chatter gets one of the walking cats (app/chatpets/sprites), or with
 * `set: "round"` a round kitten badge, or with `set: "emoji"` an emoji animal.
 *
 * The page reads chat itself, anonymously, straight from Twitch: no token, no
 * server state, nothing added to the scene stream.
 */

export const CHATPETS_DEFAULTS = { size: 56, idle: 10, max: 30 } as const;

const CHANNEL = /^[a-z0-9_]{2,25}$/;

export function chatPetsChannel(v: unknown): string {
  const c = String(v ?? "").trim().toLowerCase().replace(/^[@#]/, "");
  return CHANNEL.test(c) ? c : "";
}

function bounded(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(max, Math.max(min, n))) : null;
}

/**
 * The frame's URL for a widget's props. Relative, so it loads from whichever
 * host served the scene. `demo` adds made-up chatters, for the editor, where
 * you need something to look at while placing it.
 */
export function chatPetsSrc(p: Record<string, any>, demo = false): string {
  const q = new URLSearchParams();
  const channel = chatPetsChannel(p.channel);
  if (channel) q.set("channel", channel);
  const size = bounded(p.size, 16, 256);
  const idle = bounded(p.idle, 1, 240);
  const max = bounded(p.max, 1, 200);
  if (size) q.set("size", String(size));
  if (idle) q.set("idle", String(idle));
  if (max) q.set("max", String(max));
  if (p.colors === false) q.set("colors", "0");
  if (p.set === "emoji" || p.set === "round") q.set("set", p.set);
  // A cleared box means the built-in bot list, not "ignore nobody".
  if (typeof p.ignore === "string" && p.ignore.trim()) q.set("ignore", p.ignore.trim());
  if (demo) q.set("demo", "1");
  const s = q.toString();
  return s ? `/chatpets?${s}` : "/chatpets";
}
