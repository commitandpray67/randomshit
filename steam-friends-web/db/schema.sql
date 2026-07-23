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
