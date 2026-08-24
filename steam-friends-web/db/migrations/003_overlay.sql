-- Pogly-style stream overlay: per-user OBS browser-source config.
-- Run once: psql "$DATABASE_URL" -f db/migrations/003_overlay.sql

CREATE TABLE IF NOT EXISTS overlay_configs (
  steam_id      TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
  -- Unguessable key in the browser-source URL. OBS cannot carry a session
  -- cookie, so this key IS the overlay's only credential — rotating it
  -- immediately invalidates any URL that leaked on stream.
  overlay_key   TEXT NOT NULL UNIQUE,

  -- Appearance
  position      TEXT NOT NULL DEFAULT 'top-right'
                CHECK (position IN ('top-left','top-right','bottom-left','bottom-right')),
  accent        TEXT NOT NULL DEFAULT '#66c0f4',
  show_avatars  BOOLEAN NOT NULL DEFAULT true,
  -- Hide names/avatars and show "Someone" instead. For streamers who want the
  -- count on screen without putting a viewer on blast.
  anonymize     BOOLEAN NOT NULL DEFAULT false,

  -- Which event types produce an alert
  show_added    BOOLEAN NOT NULL DEFAULT true,
  show_removed  BOOLEAN NOT NULL DEFAULT true,
  show_readded  BOOLEAN NOT NULL DEFAULT true,

  -- Behaviour
  max_events    INT NOT NULL DEFAULT 5   CHECK (max_events BETWEEN 1 AND 20),
  event_ttl_sec INT NOT NULL DEFAULT 60  CHECK (event_ttl_sec BETWEEN 3 AND 3600),
  poll_sec      INT NOT NULL DEFAULT 15  CHECK (poll_sec BETWEEN 5 AND 300),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overlay_configs_key_idx ON overlay_configs (overlay_key);
