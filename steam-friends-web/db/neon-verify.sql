-- ELO TERRORISTS — schema check for the Neon SQL editor.
--
-- Paste and run as-is. Read-only: it changes nothing, so it is safe against
-- production. Every row should read OK. Any MISSING row names something an API
-- route depends on.
--
-- The constraint rows matter most. /api/et/flag and /api/et/resolve both write
-- with ON CONFLICT, which needs a matching unique constraint to exist — without
-- it the table looks perfectly fine and every write fails at runtime.

WITH required(ord, kind, obj, detail, used_by) AS (VALUES
  ( 1, 'table',      'et_flags',        NULL,                              'all flag routes'),
  ( 2, 'table',      'et_player_cache', NULL,                              'resolve + lookup'),

  ( 3, 'column',     'et_flags',        'id',                              'primary key'),
  ( 4, 'column',     'et_flags',        'steam_id',                        'who was reported'),
  ( 5, 'column',     'et_flags',        'display_name',                    'nickname at report time'),
  ( 6, 'column',     'et_flags',        'rank',                            'S..F severity'),
  ( 7, 'column',     'et_flags',        'comment',                         'reason text'),
  ( 8, 'column',     'et_flags',        'reporter_id',                     'SHA-256 of FACEIT guid'),
  ( 9, 'column',     'et_flags',        'created_at',                      'recency weighting'),

  (10, 'column',     'et_player_cache', 'nickname',                        'cache key'),
  (11, 'column',     'et_player_cache', 'faceit_player_id',                'FACEIT player id'),
  (12, 'column',     'et_player_cache', 'steam_id',                        'resolved Steam ID64'),
  (13, 'column',     'et_player_cache', 'cached_at',                       '24h TTL + freshest-name pick'),

  (14, 'constraint', 'et_flags',        '%PRIMARY KEY (id)%',              'row identity'),
  (15, 'constraint', 'et_flags',        '%UNIQUE (reporter_id, steam_id)%','ON CONFLICT in POST /api/et/flag'),
  (16, 'constraint', 'et_flags',        '%CHECK%rank%',                    'rejects ranks outside S..F'),
  (17, 'constraint', 'et_player_cache', '%PRIMARY KEY (nickname)%',        'ON CONFLICT in GET /api/et/resolve'),

  (18, 'index',      'et_flags',        '%(steam_id)%',                    'lookup by Steam ID'),
  (19, 'index',      'et_player_cache', '%(steam_id)%',                    'nickname join in lookup')
)
SELECT
  r.kind,
  r.obj                        AS object,
  COALESCE(r.detail, '—')      AS item,
  CASE r.kind
    WHEN 'table' THEN
      CASE WHEN to_regclass('public.' || r.obj) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
    WHEN 'column' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = 'public' AND ic.table_name = r.obj
          AND ic.column_name = r.detail
      ) THEN 'OK' ELSE 'MISSING' END
    WHEN 'constraint' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint pc
        WHERE pc.conrelid = to_regclass('public.' || r.obj)
          AND pg_get_constraintdef(pc.oid) ILIKE r.detail
      ) THEN 'OK' ELSE 'MISSING' END
    WHEN 'index' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes pi
        WHERE pi.schemaname = 'public' AND pi.tablename = r.obj
          AND pi.indexdef ILIKE r.detail
      ) THEN 'OK' ELSE 'MISSING' END
  END                          AS status,
  r.used_by
FROM required r
ORDER BY r.ord;
