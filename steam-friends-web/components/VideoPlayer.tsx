"use client";

import { useCallback, useEffect, useRef } from "react";
import { videoEmbed, videoPaused, videoVolume, type Embed } from "@/lib/embed";

/**
 * A video element, whether that's a media file or an embedded player.
 *
 * The important thing here is that **the player is never rebuilt**. Its URL
 * carries the starting state — autoplay, mute, loop — and is read once, when
 * the frame loads. Recomputing that URL when a setting changes swaps the
 * iframe's `src`, which tears the player down and starts the video again from
 * zero; that is what toggling Mute used to do. So the URL is built once per
 * video, and every later change is sent to the running player as a command
 * instead.
 *
 * The same channel gives the element a transport. A browser source has no
 * cursor and the editor canvas puts the drag handler on top of the content, so
 * there is nowhere to click a play button — it lives in the properties panel,
 * and because the paused state is stored on the element it reaches the browser
 * source too. Pausing in the editor pauses what viewers see.
 *
 * It is also how a video gets to make any sound. Autoplay has to start muted
 * or it won't start at all, so the unmute is sent afterwards, once the player
 * reports that it is actually playing. In a normal browser tab that gets
 * refused and it stays silent; in OBS, whose CEF runs with the autoplay policy
 * relaxed, it works.
 */

/** YouTube's player states. Vimeo's events are mapped onto the same numbers. */
const PLAYING = 1;
const PAUSED = 2;

const ORIGINS: Record<Embed["provider"], string> = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
};

/**
 * How often to check that something meant to be playing still is.
 *
 * Chrome suspends silent media in a backgrounded tab, which is every video
 * here — autoplay forces mute. Alt-tabbing away from the editor, or from OBS,
 * therefore stops it, and nothing restarts it on the way back. There is no way
 * to opt out of that from the page, so the fix is to notice and resume.
 */
const WATCHDOG_MS = 1000;
/**
 * Give up after this many consecutive nudges. A video that refuses to play is
 * usually one whose owner disabled embedding, and retrying forever would mean
 * a message every second for the rest of the broadcast.
 */
const MAX_NUDGES = 10;

export default function VideoPlayer({
  props: p,
  editing = false,
}: {
  props: Record<string, any>;
  editing?: boolean;
}) {
  const url = String(p.url ?? "");
  const autoplay = p.autoplay !== false;
  const loop = p.loop !== false;
  // Editor previews stay silent regardless, so arranging a scene doesn't blast
  // audio at whoever is building it.
  const muted = editing ? true : p.muted !== false;
  const volume = videoVolume(p);
  const paused = videoPaused(p);
  const restartAt = Number(p.restartAt ?? 0);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const state = useRef<number>(-1);
  const nudges = useRef(0);
  /** Whether the current audio settings have reached a playing player. */
  const audioApplied = useRef(false);

  // Built once per video. Deliberately not recomputed when an option changes —
  // see the note at the top of this file.
  const built = useRef<{ url: string; embed: Embed | null }>({ url: "", embed: null });
  if (built.current.url !== url) {
    built.current = { url, embed: videoEmbed(url, { autoplay, loop, muted }) };
  }
  const embed = built.current.embed;
  const provider = embed?.provider;

  /** Send one message to the embedded player. */
  const post = useCallback(
    (msg: unknown) => {
      const w = frameRef.current?.contentWindow;
      if (!w || !provider) return;
      try {
        w.postMessage(JSON.stringify(msg), ORIGINS[provider]);
      } catch {
        /* the frame may not be ready, or may have gone away */
      }
    },
    [provider],
  );

  /** One instruction, in whichever dialect the current player speaks. */
  const command = useCallback(
    (yt: { func: string; args?: unknown[] }, vimeo?: { method: string; value?: unknown }) => {
      if (provider === "youtube") post({ event: "command", func: yt.func, args: yt.args ?? [] });
      else if (provider === "vimeo" && vimeo) post(vimeo);
    },
    [provider, post],
  );

  const play = useCallback(() => {
    if (embed) command({ func: "playVideo" }, { method: "play" });
    else videoRef.current?.play().catch(() => {});
  }, [embed, command]);

  const pause = useCallback(() => {
    if (embed) command({ func: "pauseVideo" }, { method: "pause" });
    else videoRef.current?.pause();
  }, [embed, command]);

  /**
   * Push the wanted audio state at the player.
   *
   * Unmuting only sticks once something is actually playing — before that the
   * autoplay policy is still deciding, and an unmute is either ignored or
   * turns into a refusal to start. So this is called again on every transition
   * into PLAYING rather than only when the checkbox changes.
   */
  const applyAudio = useCallback(() => {
    if (embed) {
      if (muted) {
        command({ func: "mute" }, { method: "setVolume", value: 0 });
      } else {
        command({ func: "unMute" }, { method: "setVolume", value: volume / 100 });
        command({ func: "setVolume", args: [volume] });
      }
    } else if (videoRef.current) {
      videoRef.current.muted = muted;
      videoRef.current.volume = volume / 100;
    }
  }, [muted, volume, embed, command]);

  // Held in a ref so the subscription below doesn't have to tear itself down
  // and re-handshake every time the volume changes — and so it never calls a
  // stale copy that still thinks the video is muted.
  const applyAudioRef = useRef(applyAudio);
  applyAudioRef.current = applyAudio;

  // --- subscribe to the player's state ----------------------------------
  useEffect(() => {
    if (!provider) return;

    const onMessage = (ev: MessageEvent) => {
      // Identify the sender by window rather than by origin string: it is the
      // one check that can't be spoofed by another frame on the page.
      if (ev.source !== frameRef.current?.contentWindow) return;
      let d: any;
      try {
        d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (provider === "youtube") {
        const s = typeof d?.info?.playerState === "number" ? d.info.playerState : d?.info;
        if (d?.event === "onStateChange" || d?.event === "infoDelivery") {
          if (typeof s === "number") state.current = s;
        }
      } else {
        if (d?.event === "play" || d?.event === "playProgress") state.current = PLAYING;
        if (d?.event === "pause") state.current = PAUSED;
      }
      if (state.current === PLAYING) {
        nudges.current = 0;
        // The moment it is genuinely playing is the moment an unmute can be
        // accepted, so take it — this is what puts sound on stream.
        if (!audioApplied.current) {
          audioApplied.current = true;
          applyAudioRef.current();
        }
      }
    };
    window.addEventListener("message", onMessage);

    // Neither player reports anything until asked. The handshake has to land
    // after it is ready, and there's no event to wait on before that, so it
    // goes out on load and again a few times over the first couple of seconds.
    const hello = () => {
      if (provider === "youtube") post({ event: "listening" });
      else {
        post({ method: "addEventListener", value: "play" });
        post({ method: "addEventListener", value: "pause" });
      }
    };
    const frame = frameRef.current;
    frame?.addEventListener("load", hello);
    const timers = [0, 300, 900, 2000].map((d) => setTimeout(hello, d));

    return () => {
      window.removeEventListener("message", onMessage);
      frame?.removeEventListener("load", hello);
      timers.forEach(clearTimeout);
    };
  }, [provider, post]);

  // --- settings, applied to the running player, never by reloading it ----
  useEffect(() => {
    // Muting is safe to send whenever. Unmuting is not: arriving before
    // playback has started, it turns the request into "autoplay with sound",
    // which is the thing that gets refused — so it waits until the player says
    // it is genuinely playing, which the message handler above watches for.
    audioApplied.current = false;
    if (!embed || muted || state.current === PLAYING) {
      audioApplied.current = true;
      applyAudio();
    }
  }, [applyAudio, embed, muted]);

  useEffect(() => {
    if (embed) command({ func: "setLoop", args: [loop] }, { method: "setLoop", value: loop });
    else if (videoRef.current) videoRef.current.loop = loop;
  }, [loop, embed, command]);

  useEffect(() => {
    nudges.current = 0;
    if (paused) pause();
    else play();
  }, [paused, play, pause]);

  useEffect(() => {
    if (!restartAt) return;
    if (embed) command({ func: "seekTo", args: [0, true] }, { method: "setCurrentTime", value: 0 });
    else if (videoRef.current) videoRef.current.currentTime = 0;
    if (!paused) play();
    // Only when the restart is actually asked for again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartAt]);

  // --- keep it playing ---------------------------------------------------
  useEffect(() => {
    if (paused) return;

    const nudge = () => {
      if (nudges.current >= MAX_NUDGES) return;
      nudges.current++;
      play();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Coming back from a suspended tab: reset the budget, since whatever
      // stopped it was the browser rather than the video refusing.
      nudges.current = 0;
      nudge();
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      if (embed) {
        if (state.current === PAUSED) nudge();
      } else if (videoRef.current?.paused) {
        nudge();
      }
    }, WATCHDOG_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [paused, embed, play]);

  if (embed) {
    return (
      <iframe
        ref={frameRef}
        // Keyed on the video, not on the options: a key that changed with the
        // settings is what made Mute restart the video.
        key={url}
        src={embed.src}
        // Remote page, so its own origin applies — allow-same-origin here does
        // not hand it anything of ours.
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={url}
      // A browser source has no one to click play, so a video that isn't
      // muted+autoplay simply never starts. Muted is the default for that
      // reason, not an oversight.
      autoPlay={autoplay}
      loop={loop}
      muted={muted}
      playsInline
      style={{ width: "100%", height: "100%", objectFit: p.fit ?? "contain", display: "block" }}
    />
  );
}
