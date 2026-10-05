-- Chat pet sprites uploaded in the studio (lib/petsprites.ts).
--
-- The app creates this itself on first use, in whichever database holds the
-- scenes. This file is the same schema, for reference or to apply by hand.

CREATE TABLE IF NOT EXISTS pet_sprites (
  id          TEXT PRIMARY KEY,                -- random; the strip is /api/chatpets/sprite/<id>
  studio_id   BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  login       TEXT,                            -- Twitch login it's given to; NULL = the streamer's random mix
  everywhere  BOOLEAN NOT NULL DEFAULT false,  -- given to that login in every streamer's chat (admins)
  w           INT NOT NULL,                    -- one cell of the strip, px
  h           INT NOT NULL,
  data        BYTEA NOT NULL,                  -- the strip, PNG: right-1, right-2, left-1, left-2
  created_by  TEXT,                            -- SteamID64
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pet_sprites_studio_idx ON pet_sprites (studio_id, created_at);
CREATE INDEX IF NOT EXISTS pet_sprites_everywhere_idx ON pet_sprites (login) WHERE everywhere;
