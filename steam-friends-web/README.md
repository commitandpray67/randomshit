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
