/**
 * Checks for the video-link parser.
 *
 * These URLs are the ones people actually paste — a watch link copied from the
 * address bar, a share link, a Short. Run with:
 *   node --experimental-strip-types scripts/test-embed.ts
 */
import { videoEmbed, isEmbeddable } from "../lib/embed.ts";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
  }
}

/** Just the provider and video id, so the assertions stay readable. */
function id(url: string): string | null {
  const e = videoEmbed(url);
  if (!e) return null;
  return `${e.provider}:${new URL(e.src).pathname.split("/").pop()}`;
}

function param(url: string, key: string, opts?: Parameters<typeof videoEmbed>[1]): string | null {
  const e = videoEmbed(url, opts);
  return e ? new URL(e.src).searchParams.get(key) : null;
}

console.log("recognising links");
// The exact URL from the screenshot that rendered an empty box.
check("watch?v=", id("https://www.youtube.com/watch?v=3vq-m0juK3d"), "youtube:3vq-m0juK3d");
check("watch?v= with extra params", id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD&index=2"), "youtube:dQw4w9WgXcQ");
check("youtu.be share link", id("https://youtu.be/dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("youtu.be with query", id("https://youtu.be/dQw4w9WgXcQ?si=abc123"), "youtube:dQw4w9WgXcQ");
check("shorts", id("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("live", id("https://www.youtube.com/live/dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("an embed link pasted back in", id("https://www.youtube.com/embed/dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("no www", id("https://youtube.com/watch?v=dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("mobile", id("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
check("vimeo", id("https://vimeo.com/123456789"), "vimeo:123456789");
check("vimeo player", id("https://player.vimeo.com/video/123456789"), "vimeo:123456789");

console.log("\nleaving direct media alone");
check("mp4", videoEmbed("https://cdn.example.com/clip.mp4"), null);
check("webm", videoEmbed("https://cdn.example.com/clip.webm"), null);
check("7TV emote", videoEmbed("https://cdn.7tv.app/emote/E1/4x.webp"), null);
check("not a URL", videoEmbed("nonsense"), null);
check("empty", videoEmbed(""), null);
check("youtube homepage, no video", videoEmbed("https://www.youtube.com/"), null);
check("a channel page", videoEmbed("https://www.youtube.com/@juntella"), null);

console.log("\nrefusing anything that isn't an http(s) link");
// The parsed id is interpolated into an iframe src, so a scheme that can carry
// code must never reach it.
check("javascript:", videoEmbed("javascript:alert(1)//youtube.com/watch?v=aaaaaaaaaaa"), null);
check("data:", videoEmbed("data:text/html,<script>alert(1)</script>"), null);
check("a lookalike host", videoEmbed("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);
check("an id with a quote in it", videoEmbed('https://www.youtube.com/watch?v=abc"onload="x'), null);
check("an id with a slash in it", videoEmbed("https://www.youtube.com/watch?v=abc/../../evil"), null);

console.log("\nplayer options");
check("autoplay by default", param("https://youtu.be/dQw4w9WgXcQ", "autoplay"), "1");
check("loop needs the playlist param too", param("https://youtu.be/dQw4w9WgXcQ", "playlist"), "dQw4w9WgXcQ");
check("loop off drops the playlist", param("https://youtu.be/dQw4w9WgXcQ", "playlist", { loop: false }), null);
check("controls hidden", param("https://youtu.be/dQw4w9WgXcQ", "controls"), "0");
check(
  "autoplay forces mute, whatever was asked for",
  param("https://youtu.be/dQw4w9WgXcQ", "mute", { autoplay: true, muted: false }),
  "1",
);
check(
  "unmuted is honoured once autoplay is off",
  param("https://youtu.be/dQw4w9WgXcQ", "mute", { autoplay: false, muted: false }),
  "0",
);

console.log("\nstart offsets");
check("t in seconds", param("https://youtu.be/dQw4w9WgXcQ?t=90", "start"), "90");
check("t with a unit", param("https://youtu.be/dQw4w9WgXcQ?t=90s", "start"), "90");
check("t as m+s", param("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", "start"), "90");
check("t as h+m+s", param("https://youtu.be/dQw4w9WgXcQ?t=1h2m3s", "start"), "3723");
check("start= instead of t=", param("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45", "start"), "45");
check("no offset, no param", param("https://youtu.be/dQw4w9WgXcQ", "start"), null);
check("junk offset ignored", param("https://youtu.be/dQw4w9WgXcQ?t=banana", "start"), null);

console.log("\nisEmbeddable");
check("a watch link", isEmbeddable("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
check("an mp4", isEmbeddable("https://cdn.example.com/clip.mp4"), false);
check("undefined", isEmbeddable(undefined), false);
check("blank", isEmbeddable("   "), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
