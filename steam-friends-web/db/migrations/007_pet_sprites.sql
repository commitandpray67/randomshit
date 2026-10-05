-- Chat pets (lib/petsprites.ts): every walking pet, and who gets which.
--
-- The app creates and updates this itself on first use, in whichever
-- database holds the scenes, and fills it once from the pets that used to be
-- built into the app. This file is the same schema, for reference or to
-- apply by hand.

CREATE TABLE IF NOT EXISTS pet_sprites (
  id          TEXT PRIMARY KEY,                -- random; the strip is /api/chatpets/sprite/<id>
  studio_id   BIGINT REFERENCES studios(id) ON DELETE CASCADE,  -- NULL = every chat (admins)
  name        TEXT NOT NULL,
  login       TEXT,                            -- Twitch login it's given to; NULL = a mix
  w           INT NOT NULL,                    -- one cell of the strip, px
  h           INT NOT NULL,
  data        BYTEA NOT NULL,                  -- the strip, PNG: right-1, right-2, left-1, left-2
  created_by  TEXT,                            -- SteamID64, or 'built-in'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pet_sprites_studio_idx ON pet_sprites (studio_id, created_at);
CREATE INDEX IF NOT EXISTS pet_sprites_global_idx ON pet_sprites (created_at) WHERE studio_id IS NULL;

-- Whether a chat also uses the default mix (the every-chat, no-name pets).
ALTER TABLE studios ADD COLUMN IF NOT EXISTS pets_default_mix BOOLEAN NOT NULL DEFAULT true;

-- 'seeded': when the built-in pets were copied in, so it happens once.
CREATE TABLE IF NOT EXISTS pet_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
