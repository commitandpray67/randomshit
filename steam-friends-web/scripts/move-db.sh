#!/bin/sh
# Copy the database to a new, empty Neon project and point the studio at it.
# See DEPLOY-VPS.md, "Moving the database".
#
#   cd /opt/randomshit/steam-friends-web
#   sh scripts/move-db.sh
#
# Reads the current database from .env, asks for the new one, and:
#   1. refuses unless the new one is a different database and has no tables,
#   2. stops the studio, so nothing changes in the middle of the copy,
#   3. copies everything with pg_dump / pg_restore (in a throwaway container),
#   4. compares the row count of every table on both sides,
#   5. only if they all match: saves .env as .env.before-move, points it at the
#      new database, and starts the studio again.
#
# The old database is only ever read. If anything fails, the studio is started
# again on the old one, as it was.

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env ]; then
  echo "No .env here. Run this from steam-friends-web on the studio server."
  exit 1
fi

OLD=$(grep '^DATABASE_URL_UNPOOLED=' .env | cut -d= -f2-)
if [ -z "$OLD" ]; then
  echo "DATABASE_URL_UNPOOLED is empty in .env, so there's nothing to copy from."
  exit 1
fi

echo "Paste the NEW database's connection string (Connection pooling OFF), then Enter:"
printf "> "
read -r NEW

case "$NEW" in
  postgres://*|postgresql://*) ;;
  *) echo "That doesn't look like a connection string. Nothing was changed."; exit 1 ;;
esac
case "$NEW" in
  *-pooler*) echo "That's the pooled one. Switch Connection pooling off in Neon and copy it again."; exit 1 ;;
esac

# The part between @ and the next / or :, with -pooler taken out, names the
# database server. The same server twice means this isn't a new database.
host() { printf '%s' "$1" | sed -e 's|^[^@]*@||' -e 's|[/:?].*$||' -e 's|-pooler||'; }
if [ "$(host "$OLD")" = "$(host "$NEW")" ]; then
  echo "That's the database you're already using, not a new one. Nothing was changed."
  exit 1
fi

echo
echo "Copying from $(host "$OLD")"
echo "          to $(host "$NEW")"
echo
echo "Stopping the studio for the copy..."
docker compose stop app

docker run --rm -i -e OLD="$OLD" -e NEW="$NEW" postgres:17-alpine sh -s <<'COPY'
n=$(psql "$NEW" -tAc "select count(*) from information_schema.tables where table_schema = 'public'") || {
  echo "Couldn't connect to the new database. Check the connection string."; exit 1; }
if [ "$n" != "0" ]; then
  echo "The new database already has $n tables. Stopping, so nothing in it is overwritten."
  exit 1
fi

echo "Reading the old database..."
pg_dump "$OLD" --schema=public -Fc --no-owner --no-acl -f /tmp/db || {
  echo "Couldn't read the old database."; exit 1; }

echo "Writing the new one..."
# Errors here are reported but not fatal: the usual one is "schema public
# already exists", which is harmless. The row counts below are the real test.
pg_restore --no-owner --no-acl -d "$NEW" /tmp/db 2>&1 | grep -v 'schema "public" already exists' | grep -v 'Command was: CREATE SCHEMA public' | grep -v 'errors ignored on restore'

# Exact row count of every table, one "table count" line each.
Q="select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
psql "$OLD" -tAc "$Q" > /tmp/old.txt || exit 1
psql "$NEW" -tAc "$Q" > /tmp/new.txt || exit 1

echo
echo "Rows per table (old -> new):"
awk 'NR == FNR { old[$1] = $2; next } { printf "  %-22s %8s -> %s\n", $1, old[$1], $2 }' /tmp/old.txt /tmp/new.txt
if ! cmp -s /tmp/old.txt /tmp/new.txt; then
  echo
  echo "These don't all match. Someone may have used the main site during the copy."
  exit 1
fi
echo
echo "Every table matches."
COPY
status=$?

if [ $status -ne 0 ]; then
  echo
  echo "Copy not finished. The studio is going back on the old database, unchanged."
  docker compose start app
  exit 1
fi

cp .env .env.before-move
# The studio is one long-running server, so it doesn't need Neon's pooler:
# the direct connection serves both purposes.
tmp=$(mktemp)
awk -v url="$NEW" '
  /^DATABASE_URL=/          { print "DATABASE_URL=" url; next }
  /^DATABASE_URL_UNPOOLED=/ { print "DATABASE_URL_UNPOOLED=" url; next }
  { print }
' .env > "$tmp" && cat "$tmp" > .env && rm -f "$tmp"

echo "Starting the studio on the new database..."
docker compose up -d --force-recreate app

echo
echo "Done. The studio now uses $(host "$NEW")."
echo "The old settings are saved in .env.before-move."
echo "Next: switch Vercel over too (DEPLOY-VPS.md, \"Moving the database\")."
