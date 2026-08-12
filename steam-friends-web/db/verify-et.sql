-- Verifies the live database has everything the ELO TERRORISTS API routes need.
--
--   psql "$DATABASE_URL" -f db/verify-et.sql
--
-- Reports rather than changes anything. Every "status" column should read `ok`
-- or a type name; `MISSING` means the route that depends on it will fail at
-- runtime. Safe to run against production.

\echo ''
\echo '=== Tables ==================================================='
SELECT r.name AS required_table,
       CASE WHEN t.table_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status
FROM (VALUES ('et_flags'), ('et_player_cache')) AS r(name)
LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public' AND t.table_name = r.name;

\echo ''
\echo '=== et_flags columns  (POST/DELETE /api/et/flag, GET /api/et/lookup) ==='
SELECT r.name AS required_column,
       COALESCE(c.data_type, 'MISSING') AS status
FROM (VALUES ('id'), ('steam_id'), ('display_name'), ('rank'),
             ('comment'), ('reporter_id'), ('created_at')) AS r(name)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = 'et_flags'
      AND c.column_name = r.name;

\echo ''
\echo '=== et_player_cache columns  (GET /api/et/resolve) ==='
SELECT r.name AS required_column,
       COALESCE(c.data_type, 'MISSING') AS status
FROM (VALUES ('nickname'), ('faceit_player_id'), ('steam_id'), ('cached_at')) AS r(name)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = 'et_player_cache'
      AND c.column_name = r.name;

\echo ''
\echo '=== Constraints ============================================='
\echo '-- et_flags needs UNIQUE (reporter_id, steam_id): the flag route upserts'
\echo '-- with ON CONFLICT on that pair, which errors without a matching index.'
\echo '-- et_flags also needs the rank CHECK, and et_player_cache a PK on nickname.'
SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE con.conrelid IN (to_regclass('public.et_flags'),
                       to_regclass('public.et_player_cache'))
ORDER BY c.relname, con.contype DESC;

\echo ''
\echo '=== Indexes ================================================='
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('et_flags', 'et_player_cache')
ORDER BY tablename, indexname;

\echo ''
\echo '=== Row counts =============================================='
SELECT 'et_flags' AS table_name, count(*) AS rows FROM et_flags
UNION ALL
SELECT 'et_player_cache', count(*) FROM et_player_cache;

\echo ''
\echo '=== Data health ============================================='
\echo '-- A Steam ID appearing under several nicknames is expected after a'
\echo '-- rename: the cache is keyed by nickname and the old row is never'
\echo '-- deleted. The lookup route picks the freshest, so these are harmless.'
SELECT steam_id, count(*) AS cached_nicknames, string_agg(nickname, ', ' ORDER BY cached_at DESC) AS nicknames
FROM et_player_cache
GROUP BY steam_id
HAVING count(*) > 1
ORDER BY count(*) DESC
LIMIT 20;

\echo ''
\echo '-- Flags whose rank is outside S/A/B/C/D/F (should be none).'
SELECT id, steam_id, rank FROM et_flags WHERE rank NOT IN ('S','A','B','C','D','F');
