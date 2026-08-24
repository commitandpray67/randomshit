/**
 * Parser checks for the 7TV v3 response shapes.
 *
 * The live API isn't reachable from every build environment, so these fixtures
 * are built from the published v3 OpenAPI schemas instead. Run with:
 *   node --experimental-strip-types scripts/test-seventv.ts
 */
import { emoteUrl, emotesFromSet, findEmoteSet, pickSearchedUserId } from "../lib/seventv.ts";

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

const host = (id: string, files: any[]) => ({ url: `//cdn.7tv.app/emote/${id}`, files });

const WEBP_FILES = [
  { name: "1x.avif", format: "AVIF", width: 32, height: 32 },
  { name: "1x.webp", format: "WEBP", width: 32, height: 32 },
  { name: "2x.webp", format: "WEBP", width: 64, height: 64 },
  { name: "4x.webp", format: "WEBP", width: 128, height: 128 },
];

console.log("emoteUrl");
check(
  "picks the largest WEBP from host.files",
  emoteUrl({ id: "E1", name: "a", data: { host: host("E1", WEBP_FILES) } }),
  "https://cdn.7tv.app/emote/E1/4x.webp",
);
check(
  "an emote with no 3x still resolves (the old hardcoded guess would 404)",
  emoteUrl({
    id: "E2",
    name: "b",
    data: { host: host("E2", [{ name: "2x.webp", format: "WEBP", width: 64, height: 64 }]) },
  }),
  "https://cdn.7tv.app/emote/E2/2x.webp",
);
check(
  "falls back to GIF when there is no WEBP",
  emoteUrl({
    id: "E3",
    name: "c",
    data: { host: host("E3", [{ name: "4x.gif", format: "GIF", width: 128, height: 128 }]) },
  }),
  "https://cdn.7tv.app/emote/E3/4x.gif",
);
check(
  "prefers PNG over AVIF (OBS 30's CEF cannot decode AVIF)",
  emoteUrl({
    id: "E4",
    name: "d",
    data: {
      host: host("E4", [
        { name: "4x.avif", format: "AVIF", width: 128, height: 128 },
        { name: "1x.png", format: "PNG", width: 32, height: 32 },
      ]),
    },
  }),
  "https://cdn.7tv.app/emote/E4/1x.png",
);
check(
  "falls back to the conventional path when data/host is absent",
  emoteUrl({ id: "E5", name: "e", data: null }),
  "https://cdn.7tv.app/emote/E5/3x.webp",
);
check("returns null with no id at all", emoteUrl({ name: "x" } as any), null);

console.log("\nemotesFromSet");
check(
  "maps ActiveEmoteModel entries, using the set alias as the name",
  emotesFromSet({
    id: "S1",
    emotes: [{ id: "E1", name: "AliasInThisSet", data: { name: "OriginalName", host: host("E1", WEBP_FILES) } }],
  }),
  [{ id: "E1", name: "AliasInThisSet", url: "https://cdn.7tv.app/emote/E1/4x.webp" }],
);
check("tolerates a set with no emotes key (it is optional in the spec)", emotesFromSet({ id: "S2" }), []);
check("tolerates a null payload", emotesFromSet(null), []);

console.log("\nfindEmoteSet");
check(
  "UserConnectionModel: inline emote_set (the /users/twitch/{id} shape)",
  findEmoteSet({ platform: "TWITCH", emote_set: { id: "S1", emotes: [] } }).set?.id,
  "S1",
);
check(
  "UserConnectionModel: emote_set_id only",
  findEmoteSet({ platform: "TWITCH", emote_set_id: "S9" }).setId,
  "S9",
);
check(
  "UserModel: reads connections[], not a top-level emote_set",
  findEmoteSet({
    id: "U1",
    connections: [{ platform: "TWITCH", emote_set_id: "S-TWITCH" }],
  }).setId,
  "S-TWITCH",
);
check(
  "UserModel: prefers TWITCH even when another platform is listed first",
  findEmoteSet({
    id: "U2",
    connections: [
      { platform: "YOUTUBE", emote_set_id: "S-YT" },
      { platform: "KICK", emote_set_id: "S-KICK" },
      { platform: "TWITCH", emote_set_id: "S-TWITCH" },
    ],
  }).setId,
  "S-TWITCH",
);
check(
  "UserModel: falls back to emote_sets[] (EmoteSetPartialModel, id only)",
  findEmoteSet({ id: "U3", connections: [], emote_sets: [{ id: "S-PARTIAL" }] }).setId,
  "S-PARTIAL",
);
check(
  "unwraps a nested UserModel under `user`",
  findEmoteSet({ user: { connections: [{ platform: "TWITCH", emote_set_id: "S-NESTED" }] } }).setId,
  "S-NESTED",
);
check("returns nothing for an empty user", findEmoteSet({ id: "U4", connections: [] }), {});
check("tolerates null", findEmoteSet(null), {});

console.log("\npickSearchedUserId");
check(
  "prefers the exact username match over the first result",
  pickSearchedUserId({ data: { users: [{ id: "1", username: "juntellafan" }, { id: "2", username: "juntella" }] } }, "juntella"),
  "2",
);
check(
  "match is case-insensitive",
  pickSearchedUserId({ data: { users: [{ id: "7", username: "JunTella" }] } }, "juntella"),
  "7",
);
check("null when there are no results", pickSearchedUserId({ data: { users: [] } }, "nobody"), null);
check("null on a GQL error payload", pickSearchedUserId({ errors: [{ message: "boom" }] }, "x"), null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
