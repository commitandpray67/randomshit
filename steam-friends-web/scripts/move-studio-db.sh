#!/bin/sh
# Move the studio's own tables (scenes, scene_elements) from Neon into a
# Postgres on this server, so OBS checking its scene stops waking Neon.
# See DEPLOY-VPS.md, "The studio's own database".
#
#   cd /opt/randomshit/steam-friends-web
#   sh scripts/move-studio-db.sh
#
# What it does:
#   1. starts the local database (the "studio-db" containers in
#      docker-compose.yml), with a password it generates into .env,
#   2. stops the studio, so nothing changes in the middle of the copy,
#   3. copies the two tables from Neon, then compares every row on both sides,
#   4. only if they match: points the studio at the local copy, switches on
#      the nightly backups, and starts it again.
#
# Neon is only ever read. If anything fails, the studio is started again on
# Neon, exactly as it was, and the script can simply be run again.

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env ]; then
  echo "No .env here. Run this from steam-friends-web on the studio server."
  exit 1
fi
if grep -q '^STUDIO_DATABASE_URL=.' .env; then
  echo "Already done: .env has STUDIO_DATABASE_URL, so the studio uses its own database."
  exit 1
fi

NEON=$(grep '^DATABASE_URL_UNPOOLED=' .env | cut -d= -f2-)
[ -n "$NEON" ] || NEON=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
if [ -z "$NEON" ]; then
  echo "DATABASE_URL is empty in .env, so there's nothing to copy from."
  exit 1
fi

# A password for the local database. Kept if a previous run already made one:
# the database was created with it.
PW=$(grep '^STUDIO_DB_PASSWORD=' .env | cut -d= -f2-)
if [ -z "$PW" ]; then
  PW=$(tr -dc a-f0-9 </dev/urandom | head -c 40)
  printf '\n# The studio'"'"'s own database (scripts/move-studio-db.sh).\nSTUDIO_DB_PASSWORD=%s\n' "$PW" >> .env
fi

echo "Starting the studio's own database..."
if ! docker compose --profile studio-db up -d --wait db; then
  echo "The database didn't start. Nothing else was changed."
  exit 1
fi

echo "Stopping the studio for the copy..."
docker compose stop app

docker compose --profile studio-db exec -T -e NEON="$NEON" db sh -s <<'COPY'
L="psql -v ON_ERROR_STOP=1 -U studio -d studio -tA"

# Nothing uses this database until the very end of the script, so whatever an
# earlier, unfinished run left here can go.
$L -c "SET client_min_messages = warning; DROP TABLE IF EXISTS scene_elements, scenes CASCADE" >/dev/null || exit 1

# Give up rather than wait for ever: on connecting, on a lock someone else
# holds, and on the whole read. What pg_dump was doing when it stopped is
# kept, and shown if it fails.
export PGCONNECT_TIMEOUT=20

echo "Reading the studio's tables from Neon..."
if ! timeout 180 pg_dump "$NEON" --lock-wait-timeout=30s --verbose -Fc --no-owner --no-acl \
  -t public.scenes -t public.scenes_id_seq \
  -t public.scene_elements -t public.scene_elements_id_seq \
  -f /tmp/studio.dump 2>/tmp/studio.log; then
  echo "Couldn't read from Neon. The last thing it was doing:"
  tail -4 /tmp/studio.log | sed 's/^/  /'
  exit 1
fi

# Everything but the link from scenes to users: users stay in Neon.
pg_restore -l /tmp/studio.dump | grep -v 'FK CONSTRAINT public scenes ' > /tmp/studio.list
echo "Writing them here..."
pg_restore --exit-on-error --no-owner --no-acl -L /tmp/studio.list -U studio -d studio /tmp/studio.dump || {
  echo "Couldn't write them here."; exit 1; }

# Row counts, every row's contents, and where the id counters stand — on both
# sides. Times are compared in UTC, since the two servers' defaults can differ.
Q="select (select count(*) from scenes) || ' scenes, '
       || (select count(*) from scene_elements) || ' elements | '
       || coalesce((select md5(string_agg(s::text, '|' order by s.id)) from scenes s), '-') || ' '
       || coalesce((select md5(string_agg(e::text, '|' order by e.id)) from scene_elements e), '-') || ' '
       || (select last_value from scenes_id_seq) || ' '
       || (select last_value from scene_elements_id_seq)"
A=$(PGTZ=UTC timeout 60 psql "$NEON" -tAc "$Q") || { echo "Couldn't check Neon's side."; exit 1; }
B=$(PGTZ=UTC $L -c "$Q") || exit 1

echo
echo "Neon: ${A%% |*}"
echo "Here: ${B%% |*}"
if [ "$A" != "$B" ]; then
  echo "They don't match."
  exit 1
fi
echo "Every row matches."
COPY
status=$?

if [ $status -ne 0 ]; then
  echo
  echo "Copy not finished. The studio is going back on Neon, unchanged."
  docker compose --profile studio-db stop db
  docker compose start app
  exit 1
fi

cp .env .env.before-studio-db
printf 'STUDIO_DATABASE_URL=postgres://studio:%s@db:5432/studio\n' "$PW" >> .env
if grep -q '^COMPOSE_PROFILES=' .env; then
  grep -q '^COMPOSE_PROFILES=.*studio-db' .env || sed -i 's/^COMPOSE_PROFILES=\(.*\)$/COMPOSE_PROFILES=\1,studio-db/' .env
else
  printf 'COMPOSE_PROFILES=studio-db\n' >> .env
fi

echo "Starting the studio on its own database, with nightly backups..."
docker compose up -d --wait app backup

# Proof it's reading the new copy: ask the studio for a scene from it.
KEY=$(docker compose exec -T db psql -U studio -d studio -tAc "select scene_key from scenes order by id limit 1")
if [ -n "$KEY" ] && docker compose exec -T app wget -qO- "http://127.0.0.1:3000/api/scene/$KEY" | grep -q '"ok":true'; then
  echo
  echo "Done. The studio's scenes now live on this server; Neon's copy is no"
  echo "longer used. Backups go to backups/ every day, kept for two weeks."
  echo "The old settings are saved in .env.before-studio-db."
else
  echo
  echo "The studio started, but didn't answer for a scene as expected."
  echo "To put it back on Neon:  cp .env.before-studio-db .env && docker compose up -d"
  exit 1
fi
