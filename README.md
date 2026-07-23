# Steam Friends Tracker

Save a snapshot of your Steam friends list and find out later **who unfriended
you**. Each time it runs it re-fetches your current friends, compares them
against the stored history, and reports who was added, who was removed, and who
re-added you.

This repo has two ways to use it:

## [`steam-friends/`](./steam-friends) — command-line tool

A tiny, dependency-free Python script. Runs on your own machine, stores history
in a local JSON file. Great if you just want it for yourself. Includes a
double-clickable `run.bat` for Windows.

→ See [`steam-friends/README.md`](./steam-friends/README.md)

## [`steam-friends-web/`](./steam-friends-web) — website

A Next.js web app where anyone signs in with Steam and sees their friend
history. Snapshots are stored per-user in Postgres, and a daily scheduled job
re-checks every user so unfriends are caught even when nobody is on the site.

→ See [`steam-friends-web/README.md`](./steam-friends-web/README.md)

## The one important caveat (both versions)

Reading a Steam friends list requires a Steam Web API key **and** the target
profile's friends list being set to **Public**. Steam does not let any
third-party app read a private friends list — not even your own, and not even
after you sign in. Set *My friends list* to *Public* in your Steam privacy
settings first.
