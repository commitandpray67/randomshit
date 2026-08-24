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
- Deploys on Vercel; the cron is a Vercel Cron job

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

> Steam's API key registration asks for a domain. For local testing you can
> register with any domain you control (or `localhost`); the key itself works
> from anywhere — the domain is just metadata.

## Deploy (Vercel)

1. Push this folder to a repo and import it in Vercel.
2. Add the same env vars in the Vercel project settings. Set `APP_URL` to your
   production URL.
3. Vercel reads `vercel.json` and schedules the daily cron. When `CRON_SECRET`
   is set, Vercel automatically sends it as the `Authorization: Bearer` header,
   which the endpoint checks.
4. Create the tables against your production database (run the schema once).

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

## Overlay studio (the canvas editor)

A Pogly-style overlay editor: place text, images, videos and browser widgets on
a canvas, arrange them, and render the result in an OBS browser source. Nothing
to do with the Steam friends tracker — it just lives in the same app.

- **Editor** — `/studio`, gated by `POGLY_ALLOWED_STEAM_IDS` (same allowlist as
  the alert overlay; anyone else gets a 404).
- **Browser source** — `/scene/<key>`, reachable only via its unguessable key.

Create the tables with `db/neon-studio.sql` (Neon SQL editor) or
`db/migrations/004_scenes.sql` (psql).

### Elements

| Kind | What it does |
|---|---|
| **Text** | content, colour, size, weight, alignment, font, drop shadow |
| **Image** | any URL (incl. `data:`), object-fit |
| **Video** | a media file, or a YouTube / Vimeo link; play/pause, loop, autoplay, mute + volume, object-fit |
| **Widget** | custom HTML+CSS+JS, or an embedded URL |

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
reconnects.

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
