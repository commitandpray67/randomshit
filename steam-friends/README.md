# steam-friends — track your Steam friends and catch unfriends

A tiny, dependency-free Python tool that snapshots your Steam friends list and
tells you — the next time you run it — **who added you and who unfriended you**.

It keeps a local JSON history of everyone it has ever seen: when you became
friends, when they were first observed, and (for people who left) roughly when
they disappeared. So even months later you can look back and see exactly who
dropped you.

## Setup

1. **Get a Steam Web API key:** <https://steamcommunity.com/dev/apikey>
2. **Find your 64-bit SteamID** (the `steamID64`): <https://steamid.io>
3. **Make your friends list Public** in Steam → Profile → Edit Profile →
   Privacy Settings → *My friends list* → Public. The API returns nothing for
   a private list.

No `pip install` needed — it uses only the Python standard library
(Python 3.7+).

## Usage

### Windows: just double-click `run.bat`

The easiest way on Windows. Double-click **`run.bat`**. The first time it asks
for your API key and SteamID, remembers them (in a local, git-ignored
`config.bat`), then checks your friends list and keeps the window open so you
can read the result. Run it again anytime to see who unfriended you. To change
your saved key/SteamID, delete `config.bat` and run it again.

### Any OS: the command line

```sh
export STEAM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export STEAM_ID=7656119xxxxxxxxxx

# The main command: fetch current friends, compare to history, save.
python3 steam_friends.py update

# View your currently-tracked friends.
python3 steam_friends.py list

# View everyone who has unfriended you.
python3 steam_friends.py removed

# Summary counts and when it last ran.
python3 steam_friends.py status
```

The **first** `update` just saves a baseline. Every run after that reports the
differences:

```
✗ Unfriended you (1):
    SomeGamer  (7656119xxxxxxxxxx)
        friends since 2021-03-04, gone by 2026-07-23

✓ New friends (2):
    ...

↩ Re-added you (1):
    ...
```

Run it whenever you like — manually now and then, or on a schedule (see below).
The comparison is always against the last saved history, so gaps between runs
are fine; you'll still catch anyone who left in the meantime.

## Where the history lives

By default the history is written next to the script as
`friends_history.json`. Override it with `--db path` or the
`STEAM_FRIENDS_DB` env var — useful if you want to track more than one account.

This file is **git-ignored** on purpose: it contains your friends' SteamIDs and
names. Keep it somewhere durable (it's the whole point of the tool), but don't
commit it.

## Run it automatically (optional)

To check daily, add a cron entry (Linux/macOS):

```sh
# crontab -e   — runs every day at 18:00 and logs the diff
0 18 * * *  STEAM_API_KEY=xxxx STEAM_ID=7656119xxxx \
            python3 /path/to/steam-friends/steam_friends.py update \
            >> /path/to/steam-friends/friends.log 2>&1
```

## Notes & limitations

- Requires the target profile's friends list to be **public** — Steam has no
  authenticated "my own friends" endpoint for third-party keys.
- Steam's `friend_since` timestamp is when the friendship was formed, not when
  this tool first saw it. "gone by" is the time of the run that first noticed
  the person missing, so its precision depends on how often you run `update`.
- If someone removes and re-adds you between two runs, only the net result is
  visible; a re-add after a detected removal is reported as "Re-added you".
