-- Wedding seating planner (/toy) — idempotent setup for the Neon SQL editor.
--
-- Optional: the API creates these on first use. Paste and run as-is; it only
-- creates what is absent and never touches existing rows.

CREATE TABLE IF NOT EXISTS toy_plans (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    version    INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every save, newest last; the API keeps the most recent 200.
CREATE TABLE IF NOT EXISTS toy_plan_history (
    id         BIGSERIAL PRIMARY KEY,
    plan_id    TEXT NOT NULL,
    version    INT NOT NULL,
    data       JSONB NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS toy_plan_history_plan_idx
    ON toy_plan_history (plan_id, id DESC);
