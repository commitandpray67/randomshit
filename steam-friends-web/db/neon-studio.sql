-- Overlay studio — idempotent setup + check for the Neon SQL editor.
--
-- Paste and run as-is. Safe on a database that already has the tables: it
-- creates only what is absent and never drops or rewrites existing data.
-- The last statement prints a report — every row should read OK.
--
-- Same reasoning as db/neon-setup.sql: CREATE TABLE IF NOT EXISTS silently
-- does nothing when a table already exists, including when it predates a
-- constraint the code needs, so constraints are added separately and guarded.

CREATE TABLE IF NOT EXISTS scenes (
  id          BIGSERIAL PRIMARY KEY,
  steam_id    TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  scene_key   TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Main',
  canvas_w    INT NOT NULL DEFAULT 1920,
  canvas_h    INT NOT NULL DEFAULT 1080,
  version     BIGINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_steam_id_idx ON scenes (steam_id);

CREATE TABLE IF NOT EXISTS scene_elements (
  id        BIGSERIAL PRIMARY KEY,
  scene_id  BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,
  x         REAL NOT NULL DEFAULT 0,
  y         REAL NOT NULL DEFAULT 0,
  w         REAL NOT NULL DEFAULT 320,
  h         REAL NOT NULL DEFAULT 180,
  rotation  REAL NOT NULL DEFAULT 0,
  z_index   INT NOT NULL DEFAULT 0,
  opacity   REAL NOT NULL DEFAULT 1,
  locked    BOOLEAN NOT NULL DEFAULT false,
  hidden    BOOLEAN NOT NULL DEFAULT false,
  clip      TEXT,
  props     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scene_elements_scene_idx ON scene_elements (scene_id, z_index);

-- GET /api/scene/<key> resolves a scene by key alone. Without UNIQUE, two rows
-- could share a key and a browser source would show the wrong overlay.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'scenes'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(scene_key)%'
  ) THEN
    ALTER TABLE scenes ADD CONSTRAINT scenes_scene_key_key UNIQUE (scene_key);
  END IF;
END $$;

-- The renderer switches on kind; an unknown value would render as nothing at
-- all and be very confusing to debug from OBS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'scene_elements'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  ) THEN
    ALTER TABLE scene_elements ADD CONSTRAINT scene_elements_kind_check
      CHECK (kind IN ('text','image','video','widget'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'scene_elements'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%opacity%'
  ) THEN
    ALTER TABLE scene_elements ADD CONSTRAINT scene_elements_opacity_check
      CHECK (opacity BETWEEN 0 AND 1);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Report. Every row should read OK.
-- ---------------------------------------------------------------------------
WITH required(ord, kind, obj, detail, used_by) AS (VALUES
  ( 1, 'table',      'scenes',         NULL,                        'studio + browser source'),
  ( 2, 'table',      'scene_elements', NULL,                        'the elements themselves'),
  ( 3, 'column',     'scenes',         'scene_key',                 'browser-source URL secret'),
  ( 4, 'column',     'scenes',         'canvas_w',                  'canvas width'),
  ( 5, 'column',     'scenes',         'canvas_h',                  'canvas height'),
  ( 6, 'column',     'scenes',         'version',                   'cheap change-poll for OBS'),
  ( 7, 'column',     'scene_elements', 'kind',                      'text/image/video/widget'),
  ( 8, 'column',     'scene_elements', 'rotation',                  'element rotation'),
  ( 9, 'column',     'scene_elements', 'z_index',                   'stacking order'),
  (10, 'column',     'scene_elements', 'opacity',                   'transparency'),
  (11, 'column',     'scene_elements', 'locked',                    'lock from editing'),
  (12, 'column',     'scene_elements', 'hidden',                    'hide without deleting'),
  (13, 'column',     'scene_elements', 'clip',                      'CSS clip-path'),
  (14, 'column',     'scene_elements', 'props',                     'per-kind payload (JSONB)'),
  (15, 'constraint', 'scenes',         '%UNIQUE (scene_key)%',      'scene lookup by key'),
  (16, 'constraint', 'scenes',         '%FOREIGN KEY (steam_id)%',  'scene dies with the user'),
  (17, 'constraint', 'scene_elements', '%FOREIGN KEY (scene_id)%',  'elements die with the scene'),
  (18, 'constraint', 'scene_elements', '%CHECK%kind%',              'rejects unknown element kinds'),
  (19, 'index',      'scene_elements', '%(scene_id, z_index)%',     'ordered element fetch')
)
SELECT
  r.kind,
  r.obj AS object,
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
