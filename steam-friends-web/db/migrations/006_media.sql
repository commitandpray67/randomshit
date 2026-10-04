-- The studio's media library: sound files for sound elements.
--
-- The app creates this itself on first use (lib/media.ts), in whichever
-- database holds the scenes. This file is the same schema, for reference or
-- to apply by hand.

CREATE TABLE IF NOT EXISTS studio_media (
  id         TEXT PRIMARY KEY,               -- random; the file is /api/media/<id>
  studio_id  BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                  -- shown in the studio
  mime       TEXT NOT NULL,                  -- from the file's first bytes
  size       INT NOT NULL,
  duration   REAL,                           -- seconds, as the uploader's browser measured it
  data       BYTEA NOT NULL,
  created_by TEXT,                           -- SteamID64
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_media_studio_idx ON studio_media (studio_id, created_at);
