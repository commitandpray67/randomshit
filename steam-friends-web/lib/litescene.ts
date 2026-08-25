import { videoEmbed, videoPaused, videoVolume } from "./embed";
import { imageCandidates } from "./imagesrc";

/**
 * Media resolution for the framework-free browser source.
 *
 * The React renderer resolves URLs as it renders — a YouTube link becomes a
 * player iframe, an Imgur page link becomes the image file. The lite page has
 * no room to carry those rules, so they are applied server-side and the result
 * travels with the element.
 *
 * Both the initial page and the polling feed go through here, or a scene would
 * render correctly and then break on its first update — which is exactly what
 * happened when only the page did it.
 */

/** Fields added for the lite renderer, all prefixed so they can't clash. */
export type LiteProps = {
  /** Player URL, when this video is an embed rather than a media file. */
  _e?: string;
  /** Which player, so the right postMessage dialect is used. */
  _p?: "youtube" | "vimeo";
  /** Audio/transport state to reach once the player is actually running. */
  _a?: { muted: boolean; volume: number; paused: boolean };
  /** Image URLs to try in order; a wrong guess costs one request. */
  _c?: string[];
};

export function resolveForLite<T extends { kind: string; props?: Record<string, any> }>(
  elements: T[],
): T[] {
  return elements.map((el) => {
    const p: Record<string, any> = { ...(el.props ?? {}) };

    if (el.kind === "image") {
      p._c = imageCandidates(p.url).candidates;
    }

    if (el.kind === "video") {
      const muted = p.muted !== false;
      const e = videoEmbed(String(p.url ?? ""), {
        autoplay: p.autoplay !== false,
        loop: p.loop !== false,
        muted,
      });
      if (e) {
        p._e = e.src;
        p._p = e.provider;
        // Where the player should end up once it reports playing. It always
        // *starts* muted — see videoEmbed — because a player asked to autoplay
        // with sound is simply refused and never starts.
        p._a = { muted, volume: videoVolume(p), paused: videoPaused(p) };
      }
    }

    return { ...el, props: p };
  });
}
