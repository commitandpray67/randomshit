-- Stream overlay — idempotent setup + check for the Neon SQL editor.
--
-- Paste and run as-is. Safe on a database that already has the table: it
-- creates only what is absent and never drops or rewrites existing data.
-- The last statement prints a report — every row should read OK.
--
-- Same reasoning as db/neon-setup.sql: CREATE TABLE IF NOT EXISTS silently
-- does nothing when a table is already there, including when that table
-- predates a constraint the code now needs, so the constraints are added
-- separately and guarded.

CREATE TABLE IF NOT EXISTS overlay_configs (
    steam_id      TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
    overlay_key   TEXT NOT NULL,
    position      TEXT NOT NULL DEFAULT 'top-right',
    accent        TEXT NOT NULL DEFAULT '#66c0f4',
    show_avatars  BOOLEAN NOT NULL DEFAULT true,
    anonymize     BOOLEAN NOT NULL DEFAULT false,
    show_added    BOOLEAN NOT NULL DEFAULT true,
    show_removed  BOOLEAN NOT NULL DEFAULT true,
    show_readded  BOOLEAN NOT NULL DEFAULT true,
    max_events    INT NOT NULL DEFAULT 5,
    event_ttl_sec INT NOT NULL DEFAULT 60,
    poll_sec      INT NOT NULL DEFAULT 15,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overlay_configs_key_idx ON overlay_configs (overlay_key);

-- GET /api/overlay/<key>/events looks an overlay up by key alone. Without
-- UNIQUE, two rows could share a key and one streamer's source would start
-- showing another's friend activity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'overlay_configs'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(overlay_key)%'
  ) THEN
    ALTER TABLE overlay_configs
      ADD CONSTRAINT overlay_configs_overlay_key_key UNIQUE (overlay_key);
  END IF;
END $$;

-- The panel clamps these, but a hand-crafted form post shouldn't be able to
-- store a 100000-second alert or a corner the CSS has no rule for.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'overlay_configs'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%position%'
  ) THEN
    ALTER TABLE overlay_configs ADD CONSTRAINT overlay_configs_position_check
      CHECK (position IN ('top-left','top-right','bottom-left','bottom-right'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'overlay_configs'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%max_events%'
  ) THEN
    ALTER TABLE overlay_configs ADD CONSTRAINT overlay_configs_max_events_check
      CHECK (max_events BETWEEN 1 AND 20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'overlay_configs'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%event_ttl_sec%'
  ) THEN
    ALTER TABLE overlay_configs ADD CONSTRAINT overlay_configs_event_ttl_sec_check
      CHECK (event_ttl_sec BETWEEN 3 AND 3600);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'overlay_configs'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%poll_sec%'
  ) THEN
    ALTER TABLE overlay_configs ADD CONSTRAINT overlay_configs_poll_sec_check
      CHECK (poll_sec BETWEEN 5 AND 300);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Report. Every row should read OK.
-- ---------------------------------------------------------------------------
WITH required(ord, kind, obj, detail, used_by) AS (VALUES
  ( 1, 'table',      'overlay_configs', NULL,                          'overlay panel + event feed'),
  ( 2, 'column',     'overlay_configs', 'steam_id',                    'whose overlay this is'),
  ( 3, 'column',     'overlay_configs', 'overlay_key',                 'the browser-source URL secret'),
  ( 4, 'column',     'overlay_configs', 'position',                    'which corner alerts appear in'),
  ( 5, 'column',     'overlay_configs', 'accent',                      'alert border colour'),
  ( 6, 'column',     'overlay_configs', 'show_avatars',                'avatar toggle'),
  ( 7, 'column',     'overlay_configs', 'anonymize',                   'strips names server-side'),
  ( 8, 'column',     'overlay_configs', 'show_added',                  'alert on new friends'),
  ( 9, 'column',     'overlay_configs', 'show_removed',                'alert on unfriends'),
  (10, 'column',     'overlay_configs', 'show_readded',                'alert on re-adds'),
  (11, 'column',     'overlay_configs', 'max_events',                  'how many show at once'),
  (12, 'column',     'overlay_configs', 'event_ttl_sec',               'how long each alert lasts'),
  (13, 'column',     'overlay_configs', 'poll_sec',                    'browser-source poll interval'),
  (14, 'constraint', 'overlay_configs', '%PRIMARY KEY (steam_id)%',    'one overlay per user'),
  (15, 'constraint', 'overlay_configs', '%UNIQUE (overlay_key)%',      'key lookup in the event feed'),
  (16, 'constraint', 'overlay_configs', '%FOREIGN KEY (steam_id)%',    'config dies with the user'),
  (17, 'constraint', 'overlay_configs', '%CHECK%position%',            'rejects unknown corners'),
  (18, 'index',      'overlay_configs', '%(overlay_key)%',             'key lookup on every poll')
)
SELECT
  r.kind,
  r.obj   AS object,
  COALESCE(r.detail, '—') AS item,
  CASE r.kind
    WHEN 'table' THEN
      CASE WHEN to_regclass('public.' || r.obj) IS NOT NULL THEN 'OK' ELSE 'MISSING' END
    WHEN 'column' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = r.obj AND column_name = r.detail
      ) THEN 'OK' ELSE 'MISSING' END
    WHEN 'constraint' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.' || r.obj)
          AND pg_get_constraintdef(oid) ILIKE r.detail
      ) THEN 'OK' ELSE 'MISSING' END
    WHEN 'index' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = r.obj AND indexdef ILIKE r.detail
      ) THEN 'OK' ELSE 'MISSING' END
  END AS status,
  r.used_by
FROM required r
ORDER BY r.ord;
