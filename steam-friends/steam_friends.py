#!/usr/bin/env python3
"""
steam_friends — snapshot your Steam friends list and detect unfriends over time.

How it works
------------
Each run fetches your current friends via the Steam Web API and compares it
against a locally stored history (a JSON file). It then reports:

  * new friends   — people in the current list but not in the stored history
  * unfriended    — people in the stored history (marked active) who are no
                    longer in the current list
  * still friends — everyone who was there before and still is

The history file remembers everyone it has ever seen, when they were first
seen, when Steam says you became friends, and — for people who left — when
they disappeared. So even months later you can look back and see exactly who
unfriended you and roughly when.

Requirements
------------
  * A Steam Web API key:            https://steamcommunity.com/dev/apikey
  * Your 64-bit SteamID:            https://steamid.io  (the "steamID64")
  * Your friends list must be set to *Public* in your Steam privacy settings,
    otherwise the API returns nothing.

Only the Python standard library is used — no pip installs.

Usage
-----
    export STEAM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    export STEAM_ID=7656119xxxxxxxxxx

    python3 steam_friends.py update     # fetch, diff, and save (the main command)
    python3 steam_friends.py list       # show currently-tracked friends
    python3 steam_friends.py removed     # show everyone who has unfriended you
    python3 steam_friends.py status     # summary counts

You can also pass values on the command line instead of via env vars:

    python3 steam_friends.py update --api-key KEY --steam-id ID --db my.json
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://api.steampowered.com"
DEFAULT_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "friends_history.json")


# --------------------------------------------------------------------------- #
# Steam Web API
# --------------------------------------------------------------------------- #
def _get(url):
    """Fetch a URL and return the parsed JSON body, with friendly errors."""
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise SystemExit(
                "Steam API returned 401 Unauthorized.\n"
                "  - Check that your API key is correct, and\n"
                "  - Make sure your friends list privacy is set to Public."
            )
        if e.code == 403:
            raise SystemExit(
                "Steam API returned 403 Forbidden — usually a wrong API key "
                "or a private friends list."
            )
        raise SystemExit(f"Steam API HTTP error {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Network error talking to Steam: {e.reason}")


def fetch_friend_ids(api_key, steam_id):
    """Return {steamid: friend_since_unix} for every friend."""
    params = urllib.parse.urlencode(
        {"key": api_key, "steamid": steam_id, "relationship": "friend"}
    )
    url = f"{API_BASE}/ISteamUser/GetFriendList/v1/?{params}"
    data = _get(url)
    friends = data.get("friendslist", {}).get("friends", [])
    return {f["steamid"]: int(f.get("friend_since", 0)) for f in friends}


def fetch_player_summaries(api_key, steam_ids):
    """Return {steamid: {personaname, profileurl}} for the given ids.

    GetPlayerSummaries accepts up to 100 ids per call, so we batch.
    """
    result = {}
    ids = list(steam_ids)
    for i in range(0, len(ids), 100):
        batch = ids[i : i + 100]
        params = urllib.parse.urlencode({"key": api_key, "steamids": ",".join(batch)})
        url = f"{API_BASE}/ISteamUser/GetPlayerSummaries/v2/?{params}"
        data = _get(url)
        for p in data.get("response", {}).get("players", []):
            result[p["steamid"]] = {
                "personaname": p.get("personaname", ""),
                "profileurl": p.get("profileurl", ""),
            }
    return result


# --------------------------------------------------------------------------- #
# Local history storage
# --------------------------------------------------------------------------- #
def load_db(path):
    if not os.path.exists(path):
        return {"steam_id": None, "last_check": None, "friends": {}}
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_db(path, db):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(db, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, path)  # atomic — never leave a half-written history file


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def unix_to_date(ts):
    if not ts:
        return "unknown"
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------- #
# Core: fetch current list, diff against history, persist
# --------------------------------------------------------------------------- #
def update(api_key, steam_id, db_path):
    db = load_db(db_path)

    if db.get("steam_id") and db["steam_id"] != steam_id:
        raise SystemExit(
            f"History file {db_path} belongs to SteamID {db['steam_id']}, "
            f"but you asked to update {steam_id}.\n"
            "Use a different --db file for a different account."
        )

    current = fetch_friend_ids(api_key, steam_id)
    known = db["friends"]

    # Enrich only the ids we don't already have a name for, plus current ones
    # (names can change, so refresh names for everyone currently present).
    summaries = fetch_player_summaries(api_key, current.keys()) if current else {}

    ts = now_iso()
    new_friends, back_again = [], []

    # Walk the current list: add newcomers, revive returners, refresh actives.
    for sid, friend_since in current.items():
        info = summaries.get(sid, {})
        name = info.get("personaname") or (known.get(sid, {}).get("name")) or sid
        if sid not in known:
            known[sid] = {
                "name": name,
                "profileurl": info.get("profileurl", ""),
                "friend_since": friend_since,
                "first_seen": ts,
                "last_seen": ts,
                "status": "active",
            }
            new_friends.append(sid)
        else:
            rec = known[sid]
            if rec.get("status") == "removed":
                rec["status"] = "active"
                rec["returned_at"] = ts
                rec.pop("removed_at", None)
                back_again.append(sid)
            rec["name"] = name
            if info.get("profileurl"):
                rec["profileurl"] = info["profileurl"]
            if friend_since:
                rec["friend_since"] = friend_since
            rec["last_seen"] = ts

    # Anyone previously active but not in the current list = unfriended.
    unfriended = []
    for sid, rec in known.items():
        if rec.get("status") == "active" and sid not in current:
            rec["status"] = "removed"
            rec["removed_at"] = ts
            unfriended.append(sid)

    is_first_run = db.get("last_check") is None
    db["steam_id"] = steam_id
    db["last_check"] = ts
    save_db(db_path, db)

    _print_update_report(
        known, current, new_friends, back_again, unfriended, is_first_run, db_path
    )
    return db


def _name(known, sid):
    return known.get(sid, {}).get("name", sid)


def _print_update_report(known, current, new_friends, back_again, unfriended, first_run, db_path):
    print(f"Fetched {len(current)} friends at {now_iso()}")
    if first_run:
        print(f"\nFirst run — saved a baseline of {len(current)} friends to {db_path}.")
        print("Run this again later to detect who added or removed you.")
        return

    if not (new_friends or back_again or unfriended):
        print("\nNo changes since last check — same friends as before.")
        return

    if unfriended:
        print(f"\n✗ Unfriended you ({len(unfriended)}):")
        for sid in unfriended:
            rec = known[sid]
            print(f"    {rec['name']}  ({sid})")
            print(f"        friends since {unix_to_date(rec.get('friend_since'))}, "
                  f"gone by {rec.get('removed_at', '?')[:10]}")

    if new_friends:
        print(f"\n✓ New friends ({len(new_friends)}):")
        for sid in new_friends:
            print(f"    {_name(known, sid)}  ({sid})")

    if back_again:
        print(f"\n↩ Re-added you ({len(back_again)}):")
        for sid in back_again:
            print(f"    {_name(known, sid)}  ({sid})")


def cmd_list(db_path):
    db = load_db(db_path)
    active = {s: r for s, r in db["friends"].items() if r.get("status") == "active"}
    if not active:
        print("No active friends tracked yet. Run 'update' first.")
        return
    print(f"Currently tracking {len(active)} friends:\n")
    for sid, rec in sorted(active.items(), key=lambda kv: kv[1]["name"].lower()):
        print(f"  {rec['name']:<32} since {unix_to_date(rec.get('friend_since'))}  {sid}")


def cmd_removed(db_path):
    db = load_db(db_path)
    removed = {s: r for s, r in db["friends"].items() if r.get("status") == "removed"}
    if not removed:
        print("Nobody has unfriended you (in the tracked history). 🎉")
        return
    print(f"{len(removed)} people have unfriended you:\n")
    for sid, rec in sorted(removed.items(), key=lambda kv: kv[1].get("removed_at", "")):
        print(f"  {rec['name']:<32} friends {unix_to_date(rec.get('friend_since'))} "
              f"→ gone {rec.get('removed_at', '?')[:10]}  {sid}")


def cmd_status(db_path):
    db = load_db(db_path)
    friends = db.get("friends", {})
    active = sum(1 for r in friends.values() if r.get("status") == "active")
    removed = sum(1 for r in friends.values() if r.get("status") == "removed")
    print(f"History file:  {db_path}")
    print(f"SteamID:       {db.get('steam_id') or '(none yet)'}")
    print(f"Last check:    {db.get('last_check') or '(never)'}")
    print(f"Active friends: {active}")
    print(f"Unfriended:     {removed}")
    print(f"Total tracked:  {len(friends)}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Snapshot your Steam friends list and detect unfriends over time.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "command",
        choices=["update", "list", "removed", "status"],
        help="update: fetch+diff+save (main). list: active friends. "
             "removed: people who unfriended you. status: summary.",
    )
    parser.add_argument("--api-key", default=os.environ.get("STEAM_API_KEY"),
                        help="Steam Web API key (or set STEAM_API_KEY).")
    parser.add_argument("--steam-id", default=os.environ.get("STEAM_ID"),
                        help="Your 64-bit SteamID (or set STEAM_ID).")
    parser.add_argument("--db", default=os.environ.get("STEAM_FRIENDS_DB", DEFAULT_DB),
                        help=f"History file path (default: {DEFAULT_DB}).")
    args = parser.parse_args(argv)

    if args.command in ("list", "removed", "status"):
        {"list": cmd_list, "removed": cmd_removed, "status": cmd_status}[args.command](args.db)
        return

    # update needs credentials
    if not args.api_key:
        raise SystemExit("Missing API key. Set STEAM_API_KEY or pass --api-key. "
                         "Get one at https://steamcommunity.com/dev/apikey")
    if not args.steam_id:
        raise SystemExit("Missing SteamID. Set STEAM_ID or pass --steam-id. "
                         "Find yours at https://steamid.io")
    update(args.api_key, args.steam_id, args.db)


if __name__ == "__main__":
    main()
