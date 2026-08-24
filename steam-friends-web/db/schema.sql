-- steam-friends-web database schema
-- Run against your Postgres:  psql "$DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS users (
    steam_id      TEXT PRIMARY KEY,
    display_name  TEXT,
    avatar        TEXT,
    -- 'public' | 'private' | 'unknown' — last known friends-list visibility
    api_visibility TEXT NOT NULL DEFAULT 'unknown',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_polled   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS friends (
    user_steam_id    TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
    friend_steam_id  TEXT NOT NULL,
    name             TEXT,
    profile_url      TEXT,
    avatar           TEXT,
    friend_since     TIMESTAMPTZ,   -- when Steam says the friendship formed
    first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 'active' | 'removed'
    status           TEXT NOT NULL DEFAULT 'active',
    removed_at       TIMESTAMPTZ,
    PRIMARY KEY (user_steam_id, friend_steam_id)
);

CREATE INDEX IF NOT EXISTS friends_user_status_idx
    ON friends (user_steam_id, status);

-- A clean timeline of what happened, for the history UI.
CREATE TABLE IF NOT EXISTS events (
    id               BIGSERIAL PRIMARY KEY,
    user_steam_id    TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
    friend_steam_id  TEXT NOT NULL,
    friend_name      TEXT,
    -- 'added' | 'removed' | 'readded'
    type             TEXT NOT NULL,
    at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_at_idx
    ON events (user_steam_id, at DESC);

-- ELO Terrorists: community FACEIT griefer database (Chrome extension).
-- See db/migrations/002_et_v2.sql for the upgrade from nickname-based v1.

CREATE TABLE IF NOT EXISTS et_player_cache (
    nickname          TEXT PRIMARY KEY,   -- lowercase FACEIT nickname
    faceit_player_id  TEXT NOT NULL,
    steam_id          TEXT NOT NULL,
    cached_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS et_player_cache_steam_id_idx ON et_player_cache (steam_id);

CREATE TABLE IF NOT EXISTS et_flags (
    id            BIGSERIAL PRIMARY KEY,
    steam_id      TEXT NOT NULL,
    display_name  TEXT,
    rank          TEXT NOT NULL CHECK (rank IN ('S','A','B','C','D','F')),
    comment       TEXT NOT NULL,
    reporter_id   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, steam_id)
);

CREATE INDEX IF NOT EXISTS et_flags_steam_id_idx ON et_flags (steam_id);

-- Stream overlay: per-user OBS browser-source config.
-- See db/migrations/003_overlay.sql to add this to an existing database.

CREATE TABLE IF NOT EXISTS overlay_configs (
    steam_id      TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
    -- Unguessable key in the browser-source URL. OBS cannot carry a session
    -- cookie, so this key IS the overlay's only credential.
    overlay_key   TEXT NOT NULL UNIQUE,

    position      TEXT NOT NULL DEFAULT 'top-right'
                  CHECK (position IN ('top-left','top-right','bottom-left','bottom-right')),
    accent        TEXT NOT NULL DEFAULT '#66c0f4',
    show_avatars  BOOLEAN NOT NULL DEFAULT true,
    anonymize     BOOLEAN NOT NULL DEFAULT false,

    show_added    BOOLEAN NOT NULL DEFAULT true,
    show_removed  BOOLEAN NOT NULL DEFAULT true,
    show_readded  BOOLEAN NOT NULL DEFAULT true,

    max_events    INT NOT NULL DEFAULT 5   CHECK (max_events BETWEEN 1 AND 20),
    event_ttl_sec INT NOT NULL DEFAULT 60  CHECK (event_ttl_sec BETWEEN 3 AND 3600),
    poll_sec      INT NOT NULL DEFAULT 15  CHECK (poll_sec BETWEEN 5 AND 300),

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overlay_configs_key_idx ON overlay_configs (overlay_key);
