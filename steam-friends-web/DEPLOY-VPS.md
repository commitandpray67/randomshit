# Running the studio on a VPS

The studio (`/studio` and the OBS browser source at `/scene/<key>`) moves to
its own server at **`studio.steamfriends.xyz`**. Everything else — the main
site, the friends tracker, the ELO TERRORISTS extension's API, the daily cron —
stays on Vercel exactly as it is. Both use the same Neon database, so there is
no data to move.

Why split it: the studio keeps connections open — live updates to every editor
and every OBS source, and a `LISTEN` on the database — which is exactly what
serverless is worst at. The main site doesn't, and the published extension
hardcodes `https://steamfriends.xyz`, so that domain must not move.

Commands below assume Ubuntu or Debian and are meant to be pasted as-is. Allow
about 30 minutes, most of it waiting for DNS.

---

## What you need

- The server's **IP address** and **SSH access** (root, or a user with `sudo`).
- Access to the **DNS** for `steamfriends.xyz`.
- The **Vercel dashboard**, to copy environment variables and to flip the switch
  at the end.
- At least **1 GB of RAM**. Building the app needs more than that briefly, so
  step 2 adds swap.

---

## 1. Point the subdomain at the server

In your DNS provider, add a record:

| Type | Name     | Value              |
|------|----------|--------------------|
| `A`  | `studio` | *your server's IP* |

**If the domain is on Cloudflare, set it to "DNS only" (grey cloud), not
proxied.** Caddy has to answer Let's Encrypt directly to get a certificate, and
Cloudflare's proxy addresses are among those throttled in Russia — the problem
`/diag` exists to detect.

Do this first: it takes anywhere from a minute to an hour to propagate, and you
can carry on meanwhile. Check it with `dig +short studio.steamfriends.xyz` —
it should print your server's IP.

## 2. Prepare the server

SSH in (`ssh root@YOUR_IP`), then:

```sh
# Updates, and Docker (with Compose) from Docker's own installer.
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Firewall: SSH first, or enabling it locks you out.
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Swap, so building doesn't run out of memory on a small server.
# Skip if `free -h` already shows swap.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Get the code

```sh
apt install -y git nano
cd /opt
git clone https://github.com/commitandpray67/randomshit.git
cd randomshit/steam-friends-web
```

This deploys the default branch, `steamfriends` — the same code Vercel runs.

## 4. Configure

```sh
cp .env.vps.example .env
nano .env
```

The file explains each value. Two things matter most:

- **`APP_URL` must be `https://studio.steamfriends.xyz`** — this server's own
  address, *not* the value from Vercel. Steam sends people back to it after
  login, and the studio shows it as the OBS URL.
- Copy the rest from **Vercel → Project → Settings → Environment Variables**.
  For `DATABASE_URL_UNPOOLED`, use Neon's *direct* connection string — the one
  without `-pooler` in the host name. If Vercel has the Neon integration, it's
  already there under that name; otherwise it's in the Neon console under
  **Connect**, with connection pooling switched off.
- Vercel won't show a variable marked *Sensitive*. For those:
  `DATABASE_URL` is in the Neon console under **Connect**, `STEAM_API_KEY` is
  shown at <https://steamcommunity.com/dev/apikey>, and `SESSION_SECRET` can
  simply be a new one from `openssl rand -hex 32` — it only signs login
  cookies, and this host has its own login anyway.

Save with <kbd>Ctrl</kbd>+<kbd>O</kbd>, <kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>X</kbd>.

## 5. Start it

```sh
docker compose up -d --build
```

The first build takes a few minutes. Then:

```sh
docker compose ps        # both should say "running"; app should say "healthy"
docker compose logs -f   # Ctrl+C to stop watching
```

Caddy fetches the TLS certificate by itself once DNS from step 1 points here.

## 6. Check it

1. Open **`https://studio.steamfriends.xyz/diag`** and press *Run the check*.
   The top line should say **`edge: vps`** — that's how you know you reached
   this server and not Vercel. Every row should be green. Row 4 is the new
   server's distance to the database: tens of milliseconds is normal.
2. Open **`https://studio.steamfriends.xyz/studio`**. It sends you to Steam to
   sign in and back to the studio. (It's a separate login from the main site —
   one sign-in per browser.)
3. The *Browser source* box now shows `studio.steamfriends.xyz/scene/…` and
   `/lite/…` URLs.

Every other page on this host redirects to `steamfriends.xyz`. That's
deliberate — only the studio lives here.

## 7. Hand the studio over

So far both hosts serve the studio. To make the main site send people here:

1. **Vercel → Project → Settings → Environment Variables**, add
   `STUDIO_ORIGIN` = `https://studio.steamfriends.xyz`.
2. **Redeploy** (Deployments → ⋯ → Redeploy). Redirects are fixed at build time,
   so the variable does nothing until then.

Now `steamfriends.xyz/studio` and every `steamfriends.xyz/scene/<key>` redirect
here. **OBS follows the redirect**, so existing browser sources keep working
without anyone re-pasting a URL — though pasting the new one from the studio
saves a hop.

`/lite/<key>` URLs are left alone: they poll rather than stream, so they work
the same from either host, and the ones already in OBS keep loading from
`steamfriends.xyz`.

---

## Day to day

**Updating** after new code is merged:

```sh
cd /opt/randomshit/steam-friends-web
git pull
docker compose up -d --build
```

The studio is down for a few seconds while the new container starts.

**Rolling back** to Vercel: delete `STUDIO_ORIGIN` in Vercel and redeploy.
Everything goes back to how it was; the VPS can keep running or be stopped with
`docker compose down`.

**Restarts** are automatic — after a crash, or after the server reboots.

## Moving the database closer

Neon's project was created in the US (AWS us-east-1, Virginia), an ocean from a
server in Europe. Row 4 on `/diag` shows what that costs every save. Neon
can't move a project, so moving it means a new project, a copy and a switch —
about 20 minutes, with the studio down for a minute or so during the copy.

Pick a quiet time. Anything saved on the main site between the copy and the
Vercel switch stays behind in the old database. Avoid 06:00 UTC, when the daily
poll runs.

**1. Create the new database.** In the Neon console, **New project** (or
Vercel → **Storage** → **Create Database** → Neon, if the console sends you
there). Region **AWS Europe Central 1 (Frankfurt)**, Postgres **17**, the same
version as now. Don't connect it to the Vercel project yet. Then **Connect**,
switch **Connection pooling off**, **Show password**, **Copy snippet**.

**2. Copy it**, on the studio server:

```sh
cd /opt/randomshit/steam-friends-web
git pull
sh scripts/move-db.sh
```

Paste the new connection string when it asks. The script:
- refuses unless the target is a different database with no tables;
- stops the studio, copies everything and compares every table's row count;
- only if they all match, points `.env` at the new database (keeping the old
  one as `.env.before-move`) and starts the studio again.

The old database is only ever read. If it says the counts don't match,
someone used the site during the copy: delete the new project in Neon, create
it again and re-run.

**3. Switch Vercel.**
- **Settings → Environment Variables**: set `DATABASE_URL` to the new
  connection string *with* pooling on, and `DATABASE_URL_UNPOOLED` to the one
  without. If Vercel won't let you edit them because the Neon integration
  manages them, go to **Storage**, disconnect the old database from the
  project, and connect the new one instead.
- **Settings → Functions → Function Region**: **Frankfurt (fra1)**. Otherwise
  the main site's functions stay in Washington, an ocean from their database.
- **Deployments** → ⋯ → **Redeploy**.

**4. Check.** `/diag` on both hosts: row 4 should drop to tens of milliseconds
on the studio host and a few on `steamfriends.xyz`. Sign in on the main site
and open the studio.

Keep the old project for a week in case anything turns up missing, then delete
it.

## The studio's own database

Every OBS source showing the studio checks its scene about once a second, and
so does every open studio tab. Against Neon, that keeps its compute running for
as long as OBS is open: about four hours of the free plan's monthly allowance
per stream. The studio's two tables, scenes and their elements, can live in a
small Postgres on this server instead. Nothing but the studio reads them.
Logins, the friends tracker, the extension and everything else stay in Neon,
and this server only talks to Neon when someone signs in.

It's done once:

```sh
cd /opt/randomshit/steam-friends-web
git pull
docker compose up -d --build
sh scripts/move-studio-db.sh
```

The script:
- starts the local database, with a password it generates into `.env`;
- stops the studio, copies the two tables from Neon, and compares every row on
  both sides;
- only if they all match, points the studio at the local copy, switches on the
  nightly backups and starts it again (the old settings are kept as
  `.env.before-studio-db`).

Neon is only ever read. If anything fails, the studio goes back on Neon exactly
as it was, and the script can simply be run again.

Afterwards, row 4 on `/diag` on this host shows the local database: about a
millisecond. Neon still holds a copy of the two tables as they were at the
move; it's no longer used or updated, so don't edit scenes there.

**Backups.** One a day in `backups/` (`studio-YYYY-MM-DD.dump`), kept for two
weeks. They're on the same disk as the database, so if this server dies, they
go with it — download one to your own computer now and then:

```sh
scp root@YOUR_SERVER_IP:/opt/randomshit/steam-friends-web/backups/studio-*.dump .
```

To restore one, which replaces the studio's current scenes with the backup's:

```sh
docker compose exec -T db pg_restore --clean --if-exists -U studio -d studio < backups/studio-2026-10-01.dump
docker compose restart app
```

**Never run `docker compose down -v`.** The `-v` deletes Docker's volumes, and
one of them is this database. (Plain `docker compose down` is fine.)

**Going back.** Handing the studio back to Vercel now also means copying these
two tables back into Neon first — Neon's copy stops at the day of the move.

## When something's wrong

| Symptom | Likely cause |
|---|---|
| Browser says the certificate is invalid, or the site doesn't load at all | DNS isn't pointing here yet (`dig +short studio.steamfriends.xyz`), or ports 80/443 are closed. `docker compose logs caddy` says which. |
| `502 Bad Gateway` | The app isn't running. `docker compose logs app` — usually a missing value in `.env`. |
| Keeps sending you to Steam, never lets you in | `APP_URL` doesn't match the address in your browser bar, or your SteamID isn't in `POGLY_ALLOWED_STEAM_IDS`. |
| `/studio` is a 404 after logging in | Your SteamID isn't in `POGLY_ALLOWED_STEAM_IDS`. |
| Studio loads but saving feels slow | Look at row 4 on `/diag`. Run `/diag` on `steamfriends.xyz` too and compare: that's how far Vercel is from the database, versus this server. Hundreds of milliseconds here means the server is far from Neon's region. |
| Other editors' changes arrive late | `DATABASE_URL_UNPOOLED` is a pooled (`-pooler`) address. It still works — it falls back to checking every second — but live updates need the direct one. |

## What's different from Vercel

A long-running server behaves differently from serverless functions in one way
that needed code changes: **connections don't die on their own.** On Vercel a
function freezes between requests and its database connections go with it,
which lets Neon suspend its compute when nobody is using the site. A server
keeps them open indefinitely, so Neon would never suspend — on the free tier,
that spends the month's compute allowance doing nothing. The app now closes
idle database connections after 20 seconds, and closes the `LISTEN` connection
30 seconds after the last studio or OBS source disconnects. With nobody using
the studio, it holds no connections at all.

The other difference works in the studio's favour: with every editor and OBS
source connected to this one server, a drag is passed straight to them from
memory and saved to the database behind it, instead of waiting on a round trip
to Neon first. That's why this runs **one** app container — don't scale it up;
a second copy wouldn't hear the first one's drags. README → *On the studio's
own server* has the details.
