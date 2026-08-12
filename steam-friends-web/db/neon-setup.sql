-- ELO TERRORISTS — idempotent setup for the Neon SQL editor.
--
-- Paste and run as-is. Safe on a database that already has the tables: it
-- creates only what is absent and never drops or rewrites existing data. Run
-- db/neon-verify.sql afterwards to confirm.
--
-- Deliberately not a copy of db/schema.sql, which assumes a fresh database.
-- CREATE TABLE IF NOT EXISTS silently does nothing when a table is already
-- there — including when that table predates a constraint the code now needs —
-- so the constraints are added separately, guarded.

CREATE TABLE IF NOT EXISTS et_player_cache (
    nickname          TEXT PRIMARY KEY,   -- lowercase FACEIT nickname
    faceit_player_id  TEXT NOT NULL,
    steam_id          TEXT NOT NULL,
    cached_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS et_player_cache_steam_id_idx
    ON et_player_cache (steam_id);

CREATE TABLE IF NOT EXISTS et_flags (
    id            BIGSERIAL PRIMARY KEY,
    steam_id      TEXT NOT NULL,
    display_name  TEXT,
    rank          TEXT NOT NULL,
    comment       TEXT NOT NULL,
    reporter_id   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS et_flags_steam_id_idx ON et_flags (steam_id);

-- POST /api/et/flag upserts with ON CONFLICT (reporter_id, steam_id), which
-- errors unless a unique constraint covers exactly that pair. One report per
-- person per player; re-flagging updates rather than stacking.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'et_flags'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(reporter_id, steam_id)%'
  ) THEN
    ALTER TABLE et_flags
      ADD CONSTRAINT et_flags_reporter_id_steam_id_key UNIQUE (reporter_id, steam_id);
  END IF;
END $$;

-- Guards the rank vocabulary at the database level. The API validates too, but
-- an out-of-range rank would silently score as F in the lookup query.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'et_flags'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%rank%'
  ) THEN
    ALTER TABLE et_flags
      ADD CONSTRAINT et_flags_rank_check CHECK (rank IN ('S','A','B','C','D','F'));
  END IF;
END $$;
