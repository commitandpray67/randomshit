/**
 * Checks for the image-link resolver.
 *
 * Run with:  node --experimental-strip-types scripts/test-imagesrc.ts
 */
import { imageCandidates } from "../lib/imagesrc.ts";

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

const first = (url: string) => imageCandidates(url).candidates[0] ?? null;
const all = (url: string) => imageCandidates(url).candidates;
const note = (url: string) => Boolean(imageCandidates(url).note);

console.log("imgur page links");
check("bare page link", first("https://imgur.com/aBc123X"), "https://i.imgur.com/aBc123X.png");
check("with www", first("https://www.imgur.com/aBc123X"), "https://i.imgur.com/aBc123X.png");
check("mobile", first("https://m.imgur.com/aBc123X"), "https://i.imgur.com/aBc123X.png");
check(
  "falls back through the other formats",
  all("https://imgur.com/aBc123X"),
  [
    "https://i.imgur.com/aBc123X.png",
    "https://i.imgur.com/aBc123X.jpeg",
    "https://i.imgur.com/aBc123X.gif",
    "https://i.imgur.com/aBc123X",
  ],
);
check(
  "an extension on the link is tried first",
  all("https://imgur.com/aBc123X.gif"),
  [
    "https://i.imgur.com/aBc123X.gif",
    "https://i.imgur.com/aBc123X.png",
    "https://i.imgur.com/aBc123X.jpeg",
    "https://i.imgur.com/aBc123X",
  ],
);
check("says what it did", note("https://imgur.com/aBc123X"), true);

console.log("\nimgur direct links");
check("already direct", first("https://i.imgur.com/aBc123X.png"), "https://i.imgur.com/aBc123X.png");
check("direct needs no explaining", note("https://i.imgur.com/aBc123X.png"), false);
check(
  "direct still gets fallbacks, in case the extension is wrong",
  all("https://i.imgur.com/aBc123X.png").length,
  4,
);

console.log("\nimgur albums can't resolve to one file");
check("album", all("https://imgur.com/a/AbCdEfG"), []);
check("gallery", all("https://imgur.com/gallery/AbCdEfG"), []);
check("tag page", all("https://imgur.com/t/cats/AbCdEfG"), []);
check("and says why", note("https://imgur.com/a/AbCdEfG"), true);

console.log("\nother hosts with a page-vs-file split");
check(
  "dropbox share link",
  first("https://www.dropbox.com/s/abc/pic.png?dl=0"),
  "https://www.dropbox.com/s/abc/pic.png?raw=1",
);
check("dropbox already raw", first("https://www.dropbox.com/s/abc/pic.png?raw=1"), "https://www.dropbox.com/s/abc/pic.png?raw=1");
check(
  "giphy page link",
  first("https://giphy.com/gifs/funny-cat-l0HlvtIPzPdt2usKs"),
  "https://i.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif",
);

console.log("\neverything else is left alone");
check("a plain png", all("https://example.com/pic.png"), ["https://example.com/pic.png"]);
check("a 7TV emote", all("https://cdn.7tv.app/emote/E1/4x.webp"), ["https://cdn.7tv.app/emote/E1/4x.webp"]);
check("discord cdn", all("https://cdn.discordapp.com/attachments/1/2/pic.png"), ["https://cdn.discordapp.com/attachments/1/2/pic.png"]);
check("a data URL", all("data:image/png;base64,iVBORw0KGgo="), ["data:image/png;base64,iVBORw0KGgo="]);
check("query strings survive", first("https://example.com/pic.png?w=100"), "https://example.com/pic.png?w=100");

console.log("\nrubbish in, an explanation out");
check("empty", all(""), []);
check("whitespace", all("   "), []);
check("not a url", all("just some words"), []);
check("not a url, explained", note("just some words"), true);
check("javascript:", all("javascript:alert(1)"), []);
check("javascript:, explained", note("javascript:alert(1)"), true);
check("undefined", all(undefined as any), []);
check("a number", all(42 as any), []);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
