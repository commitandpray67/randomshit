-- JayC leaderboard — idempotent setup + check for the Neon SQL editor.
--
-- Paste and run as-is. Safe on a database that already has the table: it
-- creates only what is absent and never drops or rewrites existing data.
-- The last statement prints a report — every row should read OK.
--
-- Same reasoning as db/neon-setup.sql: CREATE TABLE IF NOT EXISTS silently
-- does nothing when a table is already there, including when that table
-- predates a constraint the code now needs, so the constraints are added
-- separately and guarded.

-- Signing in to post a score creates a `users` row exactly like signing in to
-- track friends does, but a game player never asked us to call the Steam API
-- on their behalf. /api/cron/poll walks every opted-in row at 250ms under a
-- 300s budget, so without this column the daily poll would slowly fill with
-- people who only wanted to play. Existing rows default true, which keeps
-- today's polling behaviour exactly as it is.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tracker_opt_in BOOLEAN NOT NULL DEFAULT true;

-- One row per player: their best full clear. The game is a speedrun, so the
-- ranking key is run_frames ascending (the game counts frames at a fixed 60fps).
CREATE TABLE IF NOT EXISTS jayc_scores (
    steam_id     TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
    run_frames   INT NOT NULL,
    kills        INT NOT NULL DEFAULT 0,
    score        INT NOT NULL DEFAULT 0,
    -- Which meaning of C the run rolled. 'l' is the deliberately harder one.
    modifier     TEXT NOT NULL DEFAULT 'none',
    quotes       INT NOT NULL DEFAULT 0,
    achievements INT NOT NULL DEFAULT 0,
    -- How many full clears this player has posted, best-or-not.
    runs         INT NOT NULL DEFAULT 1,
    -- Moderation. A browser game cannot prove its own score, so the backstop
    -- is being able to hide an entry without losing the history.
    hidden       BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The API validates all of this before it ever reaches Postgres, but the API
-- is not the only thing that can write here — a hand-run UPDATE in this very
-- editor is not validated by anything. These keep the board's own invariants.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%run_frames%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_run_frames_check
      CHECK (run_frames > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%modifier%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_modifier_check
      CHECK (modifier IN ('clutch', 'caring', 'catty', 'l', 'none'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kills%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_kills_check
      CHECK (kills >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%score%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%run_frames%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_score_check
      CHECK (score >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%quotes%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_quotes_check
      CHECK (quotes >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jayc_scores'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%achievements%'
  ) THEN
    ALTER TABLE jayc_scores ADD CONSTRAINT jayc_scores_achievements_check
      CHECK (achievements >= 0);
  END IF;
END $$;

-- GET /api/jayc/leaderboard orders the whole visible board by run_frames.
CREATE INDEX IF NOT EXISTS jayc_scores_board_idx
    ON jayc_scores (run_frames) WHERE NOT hidden;


-- ---------------------------------------------------------------------------
-- Report. Every row should read OK.
-- ---------------------------------------------------------------------------
WITH required(ord, kind, obj, detail, used_by) AS (
  VALUES
  (1,  'column',     'users',       'tracker_opt_in',           'keeps game-only players out of the daily poll'),
  (2,  'table',      'jayc_scores', NULL,                       'the leaderboard itself'),
  (3,  'column',     'jayc_scores', 'steam_id',                 'who the run belongs to'),
  (4,  'column',     'jayc_scores', 'run_frames',               'the ranking key'),
  (5,  'column',     'jayc_scores', 'kills',                    'shown on the board'),
  (6,  'column',     'jayc_scores', 'score',                    'shown on the victory screen'),
  (7,  'column',     'jayc_scores', 'modifier',                 'which meaning of C the run rolled'),
  (8,  'column',     'jayc_scores', 'quotes',                   'quote-archive high-water mark'),
  (9,  'column',     'jayc_scores', 'achievements',             'achievement high-water mark'),
  (10, 'column',     'jayc_scores', 'runs',                     'how many clears posted'),
  (11, 'column',     'jayc_scores', 'hidden',                   'moderation: drop a bogus time'),
  (12, 'column',     'jayc_scores', 'updated_at',               'tie-break on equal times'),
  (13, 'constraint', 'jayc_scores', '%FOREIGN KEY (steam_id)%', 'score dies with the user'),
  (14, 'constraint', 'jayc_scores', '%CHECK%run_frames%',       'rejects a zero-length run'),
  (15, 'constraint', 'jayc_scores', '%CHECK%modifier%',         'rejects an unknown C modifier'),
  (16, 'index',      'jayc_scores', '%(run_frames)%',           'ordering the board')
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
