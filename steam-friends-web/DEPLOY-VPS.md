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
cd /opt
git clone https://github.com/commitandpray67/randomshit.git
cd randomshit/steam-friends-web
```

The repository is private, so `git clone` will ask for a username and
password. The password is a **GitHub personal access token**, not your GitHub
password: GitHub → Settings → Developer settings → Fine-grained tokens → give it
read-only *Contents* access to this one repository.

This deploys the default branch, `steamfriends`. The VPS setup is new, so merge
it into `steamfriends` before this step (or `git checkout` the branch it's on).

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
  already there under that name.

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
