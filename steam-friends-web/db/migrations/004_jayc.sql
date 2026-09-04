-- JayC: The Rise of the Gooners — leaderboard for the game served at /jayc.
-- Run against your Postgres:  psql "$DATABASE_URL" -f db/migrations/004_jayc.sql
--
-- No psql? Paste db/neon-jayc.sql into the Neon SQL editor instead. It does
-- the same thing, is safe to re-run, and prints a report at the end.

-- Signing in to post a game score creates a `users` row just like signing in to
-- track friends does, but a game player never asked us to call the Steam API on
-- their behalf. This column separates the two so /api/cron/poll can skip them.
-- Existing rows default to true, preserving today's polling behaviour exactly;
-- syncUser() flips it back on if a game player later opens the dashboard.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tracker_opt_in BOOLEAN NOT NULL DEFAULT true;

-- One row per player: their best full clear. The game is a speedrun, so the
-- ranking key is run_frames ascending (the game counts frames at a fixed 60fps).
CREATE TABLE IF NOT EXISTS jayc_scores (
    steam_id     TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
    run_frames   INT NOT NULL CHECK (run_frames > 0),
    kills        INT NOT NULL DEFAULT 0 CHECK (kills >= 0),
    score        INT NOT NULL DEFAULT 0 CHECK (score >= 0),
    -- Which meaning of C the run rolled. 'l' is the deliberately harder one.
    modifier     TEXT NOT NULL DEFAULT 'none'
                 CHECK (modifier IN ('clutch', 'caring', 'catty', 'l', 'none')),
    quotes       INT NOT NULL DEFAULT 0 CHECK (quotes >= 0),
    achievements INT NOT NULL DEFAULT 0 CHECK (achievements >= 0),
    -- How many full clears this player has posted, best-or-not.
    runs         INT NOT NULL DEFAULT 1,
    -- Moderation flag. A browser game cannot prove its own score, so the
    -- backstop is being able to hide an entry without deleting the history.
    hidden       BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jayc_scores_board_idx
    ON jayc_scores (run_frames) WHERE NOT hidden;
