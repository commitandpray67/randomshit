/**
 * Sound elements: a widget in "sound" mode, playing a file from the studio's
 * media library (lib/media.ts) in the browser source. Shared by the React
 * renderer, the lite source and the editor, so it holds nothing server-only.
 *
 * Props:
 *   media     the library file's id
 *   name      its name, for the editor
 *   duration  seconds, if the uploader's browser could tell
 *   volume    0–1
 *   loop      play round and round until stopped
 *   playAt    when ▶ was last pressed (ms since epoch)
 *   stopAt    when ■ was last pressed
 *
 * ▶ and ■ are timestamps rather than a playing flag because pressing ▶ on a
 * sound that's already playing has to start it again, and a flag that's
 * already true can't change. A player acts when either stamp moves past the
 * one it last saw; a page that loads afterwards takes the stamps as history
 * and stays quiet, except for a looping sound that's still meant to be
 * playing — background music should come back when OBS reloads the source,
 * a sound effect from ten minutes ago shouldn't.
 */

export function soundSrc(p: Record<string, any>): string | null {
  return typeof p.media === "string" && /^[0-9a-f]{32}$/.test(p.media) ? `/api/media/${p.media}` : null;
}

export function soundVolume(p: Record<string, any>): number {
  const v = Number(p.volume);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/** Whether, as far as anyone can tell from the stamps, it's playing right now. */
export function soundPlaying(p: Record<string, any>, now = Date.now()): boolean {
  const play = Number(p.playAt) || 0;
  const stop = Number(p.stopAt) || 0;
  if (play <= stop) return false;
  if (p.loop) return true;
  const d = Number(p.duration);
  // Unknown length: call it playing for a few seconds, the usual sound effect.
  return now - play < (Number.isFinite(d) && d > 0 ? d * 1000 : 5000);
}
