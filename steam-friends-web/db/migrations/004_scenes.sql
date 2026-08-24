-- Overlay studio: a canvas of freely-positioned elements rendered in OBS.
-- Modelled on Pogly's Elements table (transform / clip / transparency / locked
-- / z-index), minus the multi-editor machinery this single-user build skips.
-- Run once: psql "$DATABASE_URL" -f db/migrations/004_scenes.sql

CREATE TABLE IF NOT EXISTS scenes (
  id          BIGSERIAL PRIMARY KEY,
  steam_id    TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  -- Unguessable key in the browser-source URL; an OBS source can't carry a
  -- session cookie, so this is the scene's only credential.
  scene_key   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT 'Main',
  canvas_w    INT NOT NULL DEFAULT 1920 CHECK (canvas_w BETWEEN 16 AND 7680),
  canvas_h    INT NOT NULL DEFAULT 1080 CHECK (canvas_h BETWEEN 16 AND 4320),
  -- Bumped on every mutation. The browser source polls this and only refetches
  -- the element list when it changes, so an idle overlay costs one tiny query.
  version     BIGINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_steam_id_idx ON scenes (steam_id);

CREATE TABLE IF NOT EXISTS scene_elements (
  id        BIGSERIAL PRIMARY KEY,
  scene_id  BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('text','image','video','widget')),

  -- Transform, in canvas pixels. The overlay scales the whole canvas to the
  -- browser source, so these stay resolution-independent.
  x         REAL NOT NULL DEFAULT 0,
  y         REAL NOT NULL DEFAULT 0,
  w         REAL NOT NULL DEFAULT 320,
  h         REAL NOT NULL DEFAULT 180,
  rotation  REAL NOT NULL DEFAULT 0,

  z_index   INT NOT NULL DEFAULT 0,
  opacity   REAL NOT NULL DEFAULT 1 CHECK (opacity BETWEEN 0 AND 1),
  locked    BOOLEAN NOT NULL DEFAULT false,
  hidden    BOOLEAN NOT NULL DEFAULT false,
  clip      TEXT,   -- CSS clip-path, e.g. inset(10% 0 0 0)

  -- Per-kind payload: text/color/font, image url, video url + loop/mute,
  -- widget html or embed url. JSONB rather than a column per kind, mirroring
  -- how Pogly stores a tagged enum in one Element column.
  props     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scene_elements_scene_idx ON scene_elements (scene_id, z_index);
