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
