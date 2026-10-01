-- Studios: one canvas per streamer, and who may edit which.
--
-- The app creates these itself on first use (lib/studios.ts, in whichever
-- database holds the scenes), and turns the existing shared canvas into the
-- first studio. This file is the same schema, for reference or to apply by hand.

CREATE TABLE IF NOT EXISTS studios (
  id         BIGSERIAL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,        -- the Twitch channel; /studio/<slug>
  name       TEXT NOT NULL,               -- shown in the studio
  channel    TEXT,                        -- stream preview + 7TV default
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_members (
  studio_id  BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  steam_id   TEXT NOT NULL,
  added_by   TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, steam_id)
);
CREATE INDEX IF NOT EXISTS studio_members_steam_idx ON studio_members (steam_id);

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS studio_id BIGINT REFERENCES studios(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scenes_studio_idx ON scenes (studio_id) WHERE studio_id IS NOT NULL;
