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
lib/
  steam.ts                     OpenID + Web API calls
  session.ts                   signed-cookie sessions
  tracker.ts                   fetch + diff + persist (the core)
  db.ts                        postgres.js connection
db/schema.sql                  tables
vercel.json                    cron schedule
```
