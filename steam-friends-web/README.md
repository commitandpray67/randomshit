# Steam Friends Tracker (web)

A small Next.js app where a user signs in with Steam and sees their friend
history — including **who unfriended them**. A daily scheduled job snapshots
every signed-up user, so unfriends are caught even when nobody is on the site.

This is the web version of the standalone `steam-friends/` CLI in this repo;
the fetch-and-diff logic is the same, moved server-side and stored per-user in
Postgres.

## The important caveat

Signing in with Steam proves *who* the user is — it does **not** grant access
to private data. Reading a friends list requires **your** Steam API key **and**
the user's friends list being set to **Public**. There is no OAuth scope that
unlocks a private list. The app detects the private case and tells the user how
to fix it.

## How it works

```
Browser ──"Sign in through Steam"──▶ Steam OpenID 2.0 ──▶ /api/auth/steam/return
                                                             │ verify + session cookie
                                                             ▼
                                                        /dashboard  (fetch + diff on visit)
Postgres  ◀── friends + events ──  lib/tracker.ts  ◀──  /api/cron/poll  (daily, all users)
```

- **Auth** — Steam OpenID 2.0, implemented in `lib/steam.ts`. No auth library.
- **Session** — a signed, httpOnly cookie (`lib/session.ts`). Stateless, HMAC-signed.
- **Diff** — `lib/tracker.ts` (`syncUser`) is the ported CLI logic.
- **Daily poll** — `app/api/cron/poll/route.ts`, triggered by Vercel Cron
  (`vercel.json`). Protected by a bearer `CRON_SECRET`.

## Tech

- Next.js 15 (App Router) — one codebase for UI + API
- Postgres (Supabase / Neon / local) via `postgres` (postgres.js)
- Deploys on Vercel; the cron is a Vercel Cron job. The overlay studio can
  optionally run on its own server instead — see
  [DEPLOY-VPS.md](DEPLOY-VPS.md)

## Local setup

```sh
cd steam-friends-web
npm install
cp .env.example .env.local     # then fill in the values

# create tables
psql "$DATABASE_URL" -f db/schema.sql
# ...or: node --env-file=.env.local --experimental-strip-types scripts/init-db.ts

npm run dev                    # http://localhost:3000
```

Fill `.env.local`:

| Var | What |
|---|---|
| `STEAM_API_KEY` | from <https://steamcommunity.com/dev/apikey> |
| `DATABASE_URL` | your Postgres connection string |
| `APP_URL` | `http://localhost:3000` locally; your domain in prod |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `DATABASE_URL_UNPOOLED` | optional; the direct (non-pooled) Postgres endpoint, for the scene stream's `LISTEN` |
| `STUDIO_ORIGIN` | optional; where the studio lives when it isn't here, e.g. `https://studio.steamfriends.xyz`. See below |
| `STUDIO_ADMIN_STEAM_IDS` | SteamID64s who can open every studio, create studios and manage who edits them |
| `STUDIO_DATABASE_URL` | optional; a separate database for the studio's own tables (scenes, elements). Set on the studio server by `scripts/move-studio-db.sh` |

> Steam's API key registration asks for a domain. For local testing you can
> register with any domain you control (or `localhost`); the key itself works
> from anywhere — the domain is just metadata.

## Wedding seating planner (`/toy`)

A password-protected page for arranging guests on the hall plan: click a
table to see who sits there, drag names between tables (or pick a table from
the menu next to each name), add/remove guests, undo, search, print table
lists and download an Excel copy.

- Page: `public/toy/index.html` (static, like `/jayc`); API: `app/api/toy/*`;
  helpers: `lib/toy.ts`.
- Set `TOY_PASSWORD` in Vercel. Unset, the planner stays locked for everyone.
  Changing it signs everyone out.
- Nothing about the guests is in this repo. The list is imported on the page
  from the spreadsheet's “Planner import” sheet and stored in Postgres
  (`toy_plans`, one JSON row). The tables are created on first use;
  `db/neon-toy.sql` has the same statements.
- Every save is kept in `toy_plan_history` (latest 200), and **More → History**
  restores any of them. Two people editing at once don't overwrite each other:
  a stale save gets a 409, and the page replays its own changes on top.

## Deploy (Vercel)

1. Push this folder to a repo and import it in Vercel.
2. Add the same env vars in the Vercel project settings. Set `APP_URL` to your
   production URL.
3. Vercel reads `vercel.json` and schedules the daily cron. When `CRON_SECRET`
   is set, Vercel automatically sends it as the `Authorization: Bearer` header,
   which the endpoint checks.
4. Create the tables against your production database (run the schema once).

### The studio on its own server

The overlay studio (`/studio` and the OBS source at `/scene/<key>`) holds
long-lived connections, which serverless handles badly, so it can run on a VPS
while everything else stays on Vercel against the same database.
[DEPLOY-VPS.md](DEPLOY-VPS.md) walks through it; the pieces are the
`Dockerfile`, `docker-compose.yml`, `Caddyfile` and `.env.vps.example` in this
folder.

The switch is `STUDIO_ORIGIN` on the Vercel side: set it and redeploy, and
`/studio` and `/scene/*` redirect there (temporary redirects, which OBS
follows, so existing browser sources keep working). Delete it and redeploy to
take the studio back. It's ignored on the studio host itself, so copying every
variable across doesn't make that host redirect to itself.

Signing in on the studio host sends you back to the studio rather than the
dashboard: `/api/auth/steam?to=` takes a name — `studio`, `jayc` or `overlay`,
nothing else — and remembers it in a short-lived cookie, so it can't be turned
into an open redirect and Steam's signed return URL never changes.

`/lite/<key>` is served by both hosts and deliberately isn't redirected: it
polls rather than streams, so it runs fine on Vercel, and on a throttled
connection an extra redirect hop is one more request to lose. The studio shows
it on whichever host you're using.

## Ads (Google AdSense)

Ads are **off by default** — no ad code and no cookie banner load unless you
configure them. To turn ads on after your AdSense account is approved:

1. Get approved at <https://adsense.google.com> for `your-domain`.
2. Create a display ad unit → note the **slot id**, and your **publisher id**
   (`ca-pub-...`).
3. Set two env vars (in Vercel → Settings → Environment Variables, then redeploy):
   ```
   NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
   NEXT_PUBLIC_ADSENSE_SLOT=XXXXXXXXXX
   ```

What this wires up:

- `components/AdSlot.tsx` — a responsive ad unit, placed on the landing page and
  the dashboard. Renders nothing until both env vars are set.
- The AdSense script is loaded site-wide (in `app/layout.tsx`) only when
  `NEXT_PUBLIC_ADSENSE_CLIENT` is set. Consent for EEA/UK/Switzerland visitors
  is handled by **Google's Consent Management Platform (CMP)**, configured in
  the AdSense dashboard (Privacy & messaging → GDPR message) — no separate
  cookie banner is needed.
- `/privacy` documents the AdSense cookie use, as AdSense requires.

To place more ad units, drop `<AdSlot slot="ANOTHER_SLOT_ID" />` wherever you
like (or reuse the default slot with just `<AdSlot />`).

## Stream overlay (OBS browser source)

A Pogly-style alert overlay: friend added / unfriended / re-added events pop up
on stream as they're detected. Restricted to specific SteamIDs — it's not linked
from anywhere on the site.

### Why it isn't actually Pogly

[Pogly](https://github.com/poglyapp) is a real-time collaborative overlay
(*"Figma, but for your OBS overlay sources"*). It ships as a Docker image —
React + a **C# module on SpacetimeDB** — so it can't be vendored into a
serverless Next.js app; there's nowhere for SpacetimeDB to run on Vercel. This
is the same idea rebuilt on what the app already has: the `events` table, plus
polling. Pogly is Apache-2.0, and none of its code is used here.

### Enabling it

```
POGLY_ALLOWED_STEAM_IDS=76561198XXXXXXXXX     # comma-separated SteamID64s
OVERLAY_SYNC_THROTTLE_SEC=60                  # optional, default 60
SEVENTV_DEFAULT_CHANNEL=juntella              # optional, the studio picker's default
STUDIO_PREVIEW_CHANNEL=juntella               # optional, the canvas's stream preview
```

Then create the table. In the **Neon SQL editor**, paste and run
[`db/neon-overlay.sql`](./db/neon-overlay.sql) — idempotent, and it prints a
report where every row should read `OK`. With `psql` to hand:

```sh
psql "$DATABASE_URL" -f db/migrations/003_overlay.sql
```

`POGLY_ALLOWED_STEAM_IDS` **fails closed**: blank allows nobody, not everybody.

To find a SteamID64, have the person sign in to the site once, then:

```sql
SELECT steam_id, display_name FROM users ORDER BY created_at DESC LIMIT 10;
```

### Using it

1. Sign in and go to `/overlay`.
2. Copy the browser source URL.
3. In OBS: **Sources → + → Browser**, paste the URL, size it to your canvas, and
   leave *Shutdown source when not visible* unchecked.

Settings (corner, accent, which event types alert, avatars, name hiding, how
many show at once, how long they last, poll interval) are on the same page, with
a live preview.

### Two separate gates

| Surface | Who gets in |
|---|---|
| `/overlay` (control panel) | logged-in **and** in `POGLY_ALLOWED_STEAM_IDS`; anyone else gets a 404 |
| `/overlay/<key>` (the source) | anyone with the key |

The overlay page has no login gate because **an OBS browser source can't carry a
session cookie** — the unguessable key is its only credential. So the URL is a
secret: don't show it on stream, and use **Rotate overlay URL** if it leaks.
Rotating invalidates the old URL immediately.

Turning on *Hide names* strips names and avatars **server-side**, so an
anonymised overlay's feed doesn't carry them at all.

### What makes it live

The daily cron would surface an unfriend up to 24h late, which is useless on
stream. Each overlay poll asks `syncUser` to refresh, so Steam is re-checked
while the source is open. `syncUser`'s DB-backed throttle
(`OVERLAY_SYNC_THROTTLE_SEC`) means only one poll per minute actually reaches
Steam, however fast OBS polls — so the poll interval controls how quickly a
*detected* change reaches the screen, not how hard the Steam API gets hit.

## Connection check (`/diag`)

A self-test for the streamer's own connection, at `/diag`. Ungated — the people
who need it are usually the ones who can't load anything else.

It exists because throttled connections in Russia have been cutting responses
off partway rather than failing outright, which looks like a broken site rather
than a broken link. `/diag` asks for known payload sizes (8, 16, 32, 64, 128 KB
from `/api/diag/payload`) and compares what actually arrives, so the cliff shows
up as a byte count — and says plainly that it's throttling rather than a bug
here. It also checks streaming, which the overlay's live updates ride on, and
whether the outside hosts the overlay pulls from are reachable. Results copy to
the clipboard as text to send on.

It also times this server's round trip to the database (`/api/diag/db`, five
`select 1`s, rate-limited, reports timings only). On Vercel that's next door;
with the studio on its own server it crosses the internet on every save, and
running `/diag` on both hosts compares the two. The top line says which host
answered (`edge:` is the Vercel region, or `SERVER_NAME` on the VPS).

Two things about it are deliberate:

- **It's a route handler, not a page.** A page ships the React runtime, and a
  diagnostic too big to load under the conditions it's diagnosing is useless.
  This is hand-written HTML with inline vanilla JS, about 7KB, and it's excluded
  from the middleware so nothing gets added to it.
- **The payload is random hex, not filler.** Repeated bytes would compress to
  nothing and hide the very limit being measured.

The streaming check points at `/api/diag/stream`, which really sends — six
spaced frames carrying a running byte count. Aimed at the scene stream with a
made-up key instead, it would prove nothing: that 404s, and `EventSource`
reports a 404 and a connection that never arrived as the same `onerror`, so a
blocked stream would come back looking fine. Sending for real separates
streaming works / something is buffering / never connected, and the byte count
catches a stream cut off partway.

## Overlay studio (the canvas editor)

A Pogly-style overlay editor: place text, images, videos and browser widgets on
a canvas, arrange them, and render the result in an OBS browser source. Nothing
to do with the Steam friends tracker — it just lives in the same app.

- **Editor** — `/studio/<streamer>`, one studio per streamer, open to that
  studio's members and to admins; anyone else gets a 404. `/studio` alone goes
  to the first studio you can open.
- **Browser source** — `/scene/<key>`, reachable only via its unguessable key.

### Studios: one canvas per streamer

Each studio (`lib/studios.ts`) has its own canvas, so its own browser-source
URL, a Twitch channel (the stream preview behind the canvas, and whose 7TV
emotes the picker opens on), and members who may edit it. Everyone in a studio
edits the same canvas.

- **Admins** (`STUDIO_ADMIN_STEAM_IDS`) can open every studio. In the studio's
  side panel they switch between them, create new ones (a Twitch channel and a
  display name), and add or remove members by SteamID or Steam profile link.
- **Members** see only their own studios, with a switcher if they have more
  than one. Any other studio address is a 404, so which streamers have a
  studio isn't advertised.

The tables (`studios`, `studio_members`, `scenes.studio_id`) live with the
scenes and create themselves on first use. That first use also turns the
original single studio into the first of these: the canvas owned by the first
SteamID in `POGLY_ALLOWED_STEAM_IDS`, named after `STUDIO_PREVIEW_CHANNEL`,
with that list as its members, so nobody's OBS link or access changed. From
then on studio access is managed in the panel; `POGLY_ALLOWED_STEAM_IDS` still
gates the alert overlay.

The editor holds the same SSE stream the browser source does, so an add, a
drag or a keystroke shows up in everybody's canvas as it happens. Adopting
those updates blindly would be worse than not having them — it would yank an
element out from under someone's pointer, or reset a text box to the version
that was on the server two keystrokes ago. Two rules decide who wins:

- Whoever is actively changing something keeps it: an element under the
  pointer, with a write in flight, or with an edit still queued is left alone.
- Otherwise the newer write wins, decided by scene version. Every write returns
  the version it landed at, and a snapshot older than this editor's own last
  write for that element is history rather than news. Without this second rule
  a letter goes missing every so often — there is a gap between one write
  completing and the next keystroke queueing, and a snapshot built before that
  write lands inside it.

Two people dragging the *same* element still fight over it, last write wins.
There are no cursors or presence indicators.

### The canvas and the space around it

The frame is drawn at a zoom that leaves parking space around it, and elements
can be dragged off the frame into that space — somewhere to leave an emote or
a label that isn't in the shot without deleting it. Anything wholly outside is
marked `off-frame` in the layer list and outlined in amber on the canvas.

The browser source clips to the frame, which is what makes the parking area
safe. An absolutely positioned child outside its parent still paints, so
without that clip an element dropped just off the edge would go out on stream
anyway.

Zoom is bottom-left of the canvas; **Fit** returns to tracking the window.

### Stream preview

The canvas can show the live Twitch stream behind the elements, so you place
things against what viewers will actually see rather than against an empty
rectangle. Editor only — OBS is already capturing the stream this previews, so
it is never part of the browser source.

The channel defaults to `STUDIO_PREVIEW_CHANNEL`, then `SEVENTV_DEFAULT_CHANNEL`,
then `juntella`, and is remembered per browser rather than shared: it's a
working aid, not part of the scene. Twitch only embeds when `parent` matches
the page's own hostname, which is read from the browser so it works on
localhost and on the deployed domain without configuring either.

**Clickable** (on by default) decides whether the preview takes the pointer. It
has to: a stream the browser declines to autoplay shows a play button, and a
backdrop deaf to the pointer leaves no way to press it — as useful as no
preview at all. Live, Twitch's own controls work, so it can be played, paused,
unmuted and re-qualitied like any embed. Elements on top keep taking their own
drags either way, since they come later in the DOM; only a click on *bare*
canvas changes hands, which is why <kbd>Esc</kbd> also clears the selection.

Controls stay in the player URL permanently and interactivity is toggled with
`pointer-events` instead. Putting `controls` in the URL would mean rebuilding
it to change your mind, and rebuilding the URL reloads the player — the same
trap the video element had. Locked, the controls simply never appear, because
nothing can hover them.

Create the tables with `db/neon-studio.sql` (Neon SQL editor) or
`db/migrations/004_scenes.sql` (psql).

### Elements

| Kind | What it does |
|---|---|
| **Text** | content, colour, size, weight, alignment, font, drop shadow |
| **Image** | any URL (incl. `data:`), object-fit; page links resolved to the file |
| **Video** | a media file, or a YouTube / Vimeo link; play/pause, loop, autoplay, mute + volume, object-fit |
| **Widget** | custom HTML+CSS+JS, or an embedded URL, or chat pets |

Every element carries position, size, rotation, z-order, opacity, lock, hide and
a CSS `clip-path` — the same properties Pogly's `Elements` table stores.

**7TV emotes**: the toolbar's *+ 7TV emote* button looks up any Twitch channel's
emote set and drops one on the canvas as an image. The lookup is proxied through
`/api/emotes`, so the browser never talks to 7TV directly.

The picker opens straight onto a default channel's emotes — asking `/api/emotes`
for no channel in particular returns that one — so the usual case needs no
typing. Set it with `SEVENTV_DEFAULT_CHANNEL` (default `juntella`). Resolved
sets are cached in-process for five minutes, since the picker now runs a lookup
every time it opens.

The lookup follows 7TV's v3 API: a numeric Twitch id hits
`/users/twitch/{id}` directly; a login name goes through GQL `SearchUsers` →
`/users/{id}` → `/emote-sets/{id}`. Two details that are easy to get wrong and
are covered by `npm run test:7tv`:

- A 7TV account can link Twitch, YouTube and Kick. The Twitch connection is
  picked explicitly — taking the first connection in the array can return a
  different platform's emote set.
- Image URLs come from `host.files`, choosing the largest WEBP (then GIF, then
  PNG, AVIF last — OBS 30's CEF build can't decode AVIF). Hardcoding
  `3x.webp` breaks on emotes never encoded at that size.

Set `SEVENTV_API_BASE` to point the lookup at a stub for testing.

### Chat pets

The toolbar's *+ Chat pets* button adds a strip along the bottom of the frame
where everyone who types in the studio's Twitch chat gets a pixel-art cat with
their name over it. It walks left and right, hops when they chat again, and
leaves after they've been quiet for a while (10 minutes by default). The most pets on
screen at once is capped (30 by default); past that the quietest one leaves.
A ban or timeout takes the pet with it, and the usual bots (Nightbot,
StreamElements and so on) never get one.

- **Same pet every time.** The pet is picked from a hash of the login, so a
  regular keeps theirs from stream to stream.
- **Walking cats, round kittens or emoji.** The walking cats are the default:
  each has two frames facing right and two facing left, and steps through them
  as it walks, a step per distance covered so slow cats take slow steps. The
  round kitten badges and emoji animals are the other two choices. Emoji look
  like whatever emoji font OBS has (Segoe UI Emoji on Windows).
- **Sets per streamer, and sprites per chatter.** `app/chatpets/pets.ts`
  says which set each streamer's chat gets (Nayomy_cs and Qiyarah: `cats`;
  Juntella: `juntella`, three tabbies; anyone not listed gets `DEFAULT_SET`,
  also `cats`), and which chatters always
  get one particular sprite in every chat (`skipperbtw` gets the whale,
  `unemployedvera` the red car).
  Sprites in the `special` set only ever go to a chatter named there. A name in
  that file that doesn't match a sprite fails the build, so a typo can't give
  someone the wrong pet on stream.
- **Adding a sprite.** Draw (or generate) a 2×2 sheet on a transparent
  background: top row walking right, bottom row walking left, two frames each.
  Then:

  ```sh
  npm run sprites -- path/to/sheet.png cats/bell          # one more cat
  npm run sprites -- path/to/sheet.png juntella/fox       # a set of Juntella's own
  npm run sprites -- path/to/sheet.png special/whale      # a sprite for one chatter
  ```

  That cuts the four frames out, lines them up so the feet sit on the ground and
  the nose doesn't jump between frames, and writes
  `app/chatpets/sprites/walk/<set>/<name>.png` and the `index.ts` list beside
  the sets. A new set is used once `pets.ts` maps a streamer to it. Every sheet
  is stored at the same scale, so a cat in a tall hat is taller rather than
  smaller; the *pet size* setting is how tall an ordinary cat is. Adding a
  sprite to a set reshuffles who in that chat gets which, once.
- **Served from the build.** Sprites are imported by the route rather than put
  in `public/` (which the studio host's image doesn't ship), so they're served
  from `.next/static` under hashed names, from whichever host serves the scene.
- **Spread out.** A new pet appears in the emptiest part of the strip, so a
  burst of chatters doesn't land in one pile. They can still cross paths.
- **No server side.** The pets are a few KB of plain JS at `/chatpets`
  (`app/chatpets/route.ts`), which the widget frames. That page reads chat
  itself, logged in anonymously to Twitch's IRC websocket (a `justinfan` user,
  which can read any public channel without a token), so it adds nothing to
  the database or the scene stream. Both the browser source and `/lite` frame
  the same page.
- **It's a widget mode, not a new element kind.** `scene_elements.kind` has a
  CHECK constraint, and a new kind would mean migrating both hosts. Switching an
  existing widget's *Mode* to *Chat pets* does the same thing.
- **The editor draws the box.** The frame is transparent and empty until
  someone chats, so on the canvas it gets a pink dashed outline, a
  "🐾 Chat pets · #channel" tag and a line along the bottom where the pets walk.
  It also shows made-up chatters as well as real ones, so there's something to
  look at while you size and place it, plus a corner label saying whether chat
  is connected. None of this is ever drawn in OBS.

Settings in the side panel: channel (defaults to the studio's), walking cats,
round kittens or emoji, pet size, how long a pet stays, how many at once, names in each chatter's Twitch colour or
white, and extra logins that never get a pet. Typing in that last box replaces
the built-in bot list rather than adding to it.

### Sounds

The toolbar's *+ 🔊 Sound* button opens the studio's sound library: upload
mp3, ogg, wav, m4a, flac or webm files, listen to them (in your own browser
only), and *Use* one to add a sound element. Select the element and press
**▶ Play** to play it in OBS, **■ Stop** to stop it; volume and *Loop until
stopped* are next to them. ▶ on a sound that's already playing starts it again.
Nothing shows on stream. The box is only in the editor, where it turns green
while the sound is playing. Hiding the layer silences it.

- **It plays in OBS, not in the editor.** The editor is somebody's browser tab,
  maybe one of several open on the studio, so it never makes the sound itself.
  Whoever presses ▶ can be anywhere; the sound comes out of the streamer's OBS.
  For OBS's audio mixer to show it as its own channel, tick *Control audio via
  OBS* on the browser source.
- **▶ and ■ are timestamps.** The element stores when each was last pressed
  (`playAt`, `stopAt`, see `lib/sound.ts`), and a player acts when one moves
  past what it last saw. A browser source that loads afterwards treats them as
  history, so a sound effect from ten minutes ago doesn't go off when OBS
  reloads. A looping sound that hasn't been stopped does come back.
- **The library lives in the studio's database** (`studio_media`, created on
  first use by `lib/media.ts`), per studio. On the studio's own server that's
  the local Postgres, so the nightly backups include the sounds. Up to 20 MB a
  file and 300 MB a studio. The type is read from the file's first bytes, so
  only real audio gets in.
- **Files are served at `/api/media/<id>`** to anyone with the id, like scene
  keys, since OBS can't sign in. Ids are random, and files are cached for good
  because one never changes under its id. Listing, uploading and deleting are
  for the studio's editors only.
- **Uploads belong on the studio's own server.** On Vercel a request body is
  capped at 4.5 MB, and every sound would sit in Neon's storage.

The sound is a widget in *Sound* mode, like chat pets, so it needed no change
to the element table.

### Page links vs. files

The commonest way to get a blank element is to paste a link to a *page about*
the thing rather than the thing itself. `imgur.com/abc123` is an HTML gallery
page; the file lives on `i.imgur.com`. An `<img>` pointed at the page fetches
it, finds no decodable bitmap, and shows nothing — no error, no console noise,
just an empty box indistinguishable from an element you haven't positioned yet.

Image links are therefore resolved at render time rather than rewritten, and
produce a *list* of URLs to try in order. Imgur serves one hash under several
extensions and the link doesn't say which is real, so guessing once would be a
coin flip; `.png`, then `.jpeg`, then `.gif` costs a failed request at worst and
always lands on the file. Dropbox share links (`?dl=0` → `?raw=1`) and Giphy
page links get the same treatment. Anything unrecognised is passed through
untouched — most pasted links already point at a file, and second-guessing them
would break more than it fixed. `npm run test:image` covers the mappings.

An Imgur *album* can't resolve to one file without their API, so it says so
instead of failing silently, as does a link that simply doesn't load. Those
messages appear in the editor only: a broken image on stream should be nothing
at all, not a box explaining itself to viewers.

### Video links vs. video files

`<video>` wants a media file. A YouTube watch link is an HTML page, so the
element fetches it, finds nothing it can decode, and renders an empty box —
no error, just nothing. Pasting a YouTube URL used to do exactly that.

Links to sites that offer their own player (YouTube, Vimeo) are therefore
turned into an embedded player instead; anything else still goes to `<video>`.
The player URL is rebuilt from a validated video id rather than passing the
pasted string through, so nothing user-supplied reaches an iframe's `src`
intact. `npm run test:embed` covers the link shapes and the rejections.

YouTube ignores `loop=1` for a single video unless the video is *also* named in
`playlist=`, which is handled.

### Controlling a video

The player's URL is its *starting* state, read once when the frame loads.
Everything after that is sent to the running player over `postMessage`, because
rebuilding the URL swaps the iframe's `src` — which tears the player down and
starts the video again from the top. Toggling Mute used to do exactly that.

That command channel is also the only way to control playback at all. A browser
source has no cursor, and on the editor canvas the drag handler sits on top of
the content, so there is nowhere to click a player's own controls. Play, pause
and restart live in the properties panel instead, and because the paused state
is stored on the element it reaches the browser source: pausing in the editor
pauses what viewers see.

*Autoplay on load* is deliberately only about what happens when the browser
source starts. Toggling it pins whatever is playing right now, so it can't
interrupt a video mid-play.

**Sound works in OBS, but not in the editor preview.** A normal browser tab
refuses to start audio nobody asked for, so a video that begins unmuted simply
never begins. It therefore always starts muted and is unmuted once the player
reports that it is genuinely playing — at which point the policy has already
been satisfied. OBS's CEF runs with the autoplay policy relaxed (the same
reason alert overlays can play their sounds unprompted), so there the unmute
sticks. Tick **Control audio via OBS** on the browser source to get it into the
mixer.

**Keeping it playing.** Chrome suspends silent media in a backgrounded tab, and
every video here starts silent, so alt-tabbing away from the editor or from OBS
stops it and nothing restarts it on the way back. There's no way to opt out
from the page, so the player's state is watched and playback re-issued when it
stops without being asked — on a one-second check and on regaining visibility,
with a cap so a video that genuinely can't play isn't nudged forever. If OBS
has *Shutdown source when not visible* ticked it will stop the video whenever
the scene is off screen; nothing in the page can override that.

### Saving an edit

Element edits are serialised: one request in flight at a time, with the newest
patch per element coalesced behind it, and the reply deliberately discarded.

Both halves of that matter. Every keystroke in a text box used to fire its own
request, and each reply replaced the whole element list with the server's
snapshot. Type faster than the round trip and those snapshots arrive stale —
each one resetting the textarea to a version from several characters ago and
discarding everything typed since. Typing `Hello Juntella!` reliably stored
`Hl Jntla!`, on screen and in the database both. Serialising makes the last
write the newest one; ignoring the reply stops a response that was already out
of date from overwriting what has been typed since. The editor applied the
change optimistically and is the authority on its own text.

Because nothing reads the reply any more, the editor clamps numeric fields to
the same bounds the server does — otherwise a value the server rejected would
go on being displayed as though it had been stored.

Structural changes (add, delete, reorder, canvas size) still take the reply,
since the server decides things the editor can't know, like a new element's id.
Those wait for the edit queue to drain first, so the list they echo back is not
from before the edits.

Whatever is still queued when the page goes away is flushed with
`navigator.sendBeacon`, which outlives the page where a `fetch` would not.

### How the browser source stays current

The editor writes to `/api/studio`; each write bumps `scenes.version` and
publishes it with `pg_notify`. The browser source holds an SSE connection to
`/api/scene/<key>/stream`, which is woken by that notification rather than
sampling the version column on a timer.

Dragging takes a separate path from every other edit. `transform` is one
statement — locate the element through its scene (which is also the ownership
check), write it, bump the version, and notify with the new position inline —
so the stream can forward a drag frame without reading anything back. The
general update path costs six round trips, which is fine for a property edit
and ruinous twenty times a second.

Making that motion look continuous in OBS took more than easing it:

- **The editor sends one request at a time**, newest position coalesced behind
  it. Fired in parallel they commit in whatever order the platform gets to
  them, so a position from 60ms ago lands after the current one and the element
  jerks backwards — and the database keeps the older position as the last thing
  written, which nothing downstream can repair.
- **The overlay buffers positions and plays them back on a delayed clock**,
  interpolating between the two samples bracketing it (`components/sceneMotion.ts`).
  Network jitter is absorbed by the buffer instead of being rendered, and the
  delay sizes itself to the cadence actually observed. A fixed CSS transition
  cannot do this: interrupt one halfway and it restarts from where it is over
  its full duration, so early updates are velocity steps and late ones let the
  element stop dead and then lurch.
- **Samples are spaced by the editor's own timestamp, not by arrival.**
  Timestamping on arrival bakes transit jitter into the timeline — positions
  taken 50ms apart but delivered 30ms and 70ms apart get played back at those
  speeds, so the element speeds up and slows down though the cursor never did.
- **Positions are written straight to the DOM from a rAF loop**, so a drag
  re-renders nothing. React keeps ownership of everything else about an
  element; it simply never sets those four properties.

Simulated against a typical connection, that takes per-frame velocity spread
from 48% of mean to 12%, and frozen frames from 15% to none. Separately and
measured locally, an edit reaches OBS in **~280ms** over SSE versus **~1290ms**
on the old one-second poll.

A listening connection has to stay on one backend, which a transaction-mode
pooler won't give it — and it fails *silently* when it doesn't, so a slow safety
poll runs regardless and the stream drops back to hot polling the moment it sees
a change no notification announced. Set `DATABASE_URL_UNPOOLED` to the direct
endpoint to keep it on the fast path.

If SSE can't be established at all — something between OBS and the server
buffering the stream — the client falls back to the original polling loop. The
buffer doesn't care which is feeding it.

The stream closes itself just under the platform's function duration cap and
reconnects (every 50s on Vercel, every 10 minutes on the studio's own server).

#### On the studio's own server: drags skip the database

Every editor and every OBS source is connected to the same process there, so
`lib/live.ts` hands a movement to all of them from memory the moment it
arrives, and writes it to the database behind it — newest position per
element, one batch per round trip. The database is still the record; it's just
no longer between the cursor and OBS. The pieces that keep that correct:

- **Snapshots get the live positions laid over them.** A scene read from the
  database mid-drag predates positions OBS has already shown; each position is
  overlaid until the database has it at a version at or below the snapshot's.
- **Every other edit waits for queued positions to land first**, so a property
  change made just after a drag can't be overwritten by it.
- **Streams skip the NOTIFY of their own process's writes**, which they already
  had from memory, and take only its version.
- **A multi-selection moves in one request and one frame**, not one per element.

Measured with the database behind an artificial 130ms round trip (roughly the
studio server in Europe, Neon in Virginia), same machine otherwise:

| | Before | After |
|---|---|---|
| Drag: cursor to OBS | 370–700 ms | ~50 ms |
| Drag: positions reaching OBS | 6–7/s | 30/s |
| Text edit: save to OBS | ~1100 ms | ~360 ms |

Text edits got faster by doing less, not by skipping the database: an update is
now one statement instead of five round trips (the scene lookup is remembered,
and the write, version bump and NOTIFY are one query), and a stream re-reads a
scene in one query instead of two.

On the studio server the studio's two tables can also move off Neon into a
Postgres next to the app (`STUDIO_DATABASE_URL`, set by
`scripts/move-studio-db.sh`; DEPLOY-VPS.md has the steps). Every OBS source
checks its scene about once a second, and against Neon that kept its compute
running for the whole of every stream. Only `lib/scene.ts`, `lib/live.ts` and
`lib/studios.ts` touch those tables, through `studioSql`; everything else, logins included,
stays on `sql` and Neon.

**Run one app container.** The in-memory hand-off only reaches streams in the
same process; a second replica would get writes its streams never hear about
until the database catches up. On Vercel none of this runs (`LIVE` is false):
a frozen function would strand the queue, and the database is next door anyway.

On a long-running server connections don't die with the function the way they
do on Vercel, and one that never closes keeps Neon's compute from suspending.
So idle pool connections close after 20 seconds, and the `LISTEN` connection is
shared and refcounted: it opens with the first stream and closes 30 seconds
after the last one goes. With nobody in the studio, no connections are held.

### Lite browser source (`/lite/<key>`)

The same scene, rendered as one self-contained request of ~5 KB: hand-written
HTML with inline vanilla JS, no framework bundle. `/scene/<key>` needs ~383 KB
across 8 requests, most of it React chunks.

That matters on a connection that truncates long responses. Russian ISPs have
been capping foreign-hosted content at roughly 16 KB — measured on one
streamer: `HTTP 200`, 16,506 of 65,536 bytes at 27 B/s, then connection reset.
The normal page is 23x over that cliff and can never finish; the lite page fits
under it. Measured 38x smaller, and it renders identically.

It polls rather than using SSE on purpose: a long-lived stream is exactly what
a throttling middlebox resets, while a small periodic request either arrives or
is retried a second later. The version check costs ~60 bytes when nothing has
changed, and elements ease between transforms the same way, so motion still
looks smooth.

The URL is on the studio page next to the normal one. The editor itself stays
too heavy for such a connection — build scenes with a VPN on, then let OBS run
the lite URL without one.

### Widget safety

Custom-HTML widgets render in an iframe sandboxed **without** `allow-same-origin`.
That gives the frame an opaque origin, so pasted JS can't reach the session
cookie or the parent page even though it's served from this domain.

### What this is not

It is not Pogly, and it is not trying to be. Pogly is ~22k lines built on
SpacetimeDB, and its real-time collaboration — multiple editors, live cursors,
guest permissions, layouts, audit log, OIDC — needs a stateful websocket server
that serverless can't provide. This is the single-editor subset: one person
arranging elements, rendered live in OBS. If you ever want the full thing, run
real Pogly (free cloud at pogly.gg, or `ghcr.io/poglyapp/pogly` on any Docker
host) — it's Apache-2.0.

## Diagnosing a blocked or throttled connection

`/diag` is a self-test the streamer runs in their own browser, with any VPN
off. It reports what their connection can reach and, crucially, whether
responses are being cut short.

It is a route handler serving hand-written HTML, not a page — about 6 KB with
no framework JavaScript. That is the point: the failure it diagnoses truncates
large responses, so a diagnostic carrying the normal ~103 KB bundle would be
truncated too and tell you nothing.

What it checks:

1. Whether this origin is reachable at all, and how slowly.
2. Downloads of 8 / 16 / 32 / 64 / 128 KB, comparing bytes received against
   bytes promised. Russian ISPs have been capping throttled connections at
   ~16 KB of content, which shows up as a page that half-loads rather than one
   that fails cleanly — this finds that cliff and names it.
3. Whether SSE reaches the browser, or is being buffered or dropped.
4. Whether `cdn.7tv.app` and Steam's avatar CDN load, since those are fetched
   directly by the browser and fail independently of where this app is hosted.

The payload endpoint returns random hex rather than repeated filler:
compressible data would shrink to nothing in transit and hide the limit being
measured.

**Copy results** puts the whole run on the clipboard as text.

## What to build next

- **Notifications** on an unfriend (email via Resend, or a Discord webhook).
- **Events timeline** page — the `events` table already records everything.
- A **"delete my data"** button (recommended — you store other people's names/IDs).
- Rate-limit / backoff polish if you get many users.

## Files

```
app/
  page.tsx                     landing + "Sign in through Steam"
  dashboard/page.tsx           friend list + unfriended list
  api/auth/steam/route.ts      redirect to Steam
  api/auth/steam/return/...    verify OpenID, create session, upsert user
  api/auth/logout/route.ts     clear session
  api/cron/poll/route.ts       daily snapshot of every user
  overlay/page.tsx             stream-overlay control panel (allowlisted)
  overlay/[key]/page.tsx       the OBS browser source itself
  api/overlay/[key]/events/    overlay event feed (polled by the source)
components/
  OverlayStage.tsx             renders + polls alerts (also powers the preview)
  OverlayPanel.tsx             settings form with live preview
lib/
  steam.ts                     OpenID + Web API calls
  session.ts                   signed-cookie sessions
  tracker.ts                   fetch + diff + persist (the core)
  overlay.ts                   overlay config, allowlist, event queries
  db.ts                        postgres.js connection
db/schema.sql                  tables
db/migrations/003_overlay.sql  overlay table, for an existing database
db/neon-overlay.sql            paste-ready setup + check for the Neon editor
vercel.json                    cron schedule
```
