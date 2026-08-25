import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  // Don't crash at import time in the browser; only server code uses this.
  console.warn("DATABASE_URL is not set — database calls will fail.");
}

// A single shared connection pool. postgres.js handles pooling internally.
export const sql = postgres(process.env.DATABASE_URL ?? "", {
  // Supabase/Neon poolers speak SSL; most managed URLs include sslmode already.
  // Uncomment if your provider needs it explicitly:
  // ssl: "require",
  max: 10,
});

/**
 * A second client, used only for LISTEN on the scene channels.
 *
 * A listening connection is stateful — it has to stay put on one backend for
 * the life of the subscription — so it can't go through a transaction-mode
 * pooler. Neon and Vercel both expose the direct endpoint alongside the pooled
 * one; when neither is set this falls back to DATABASE_URL, and the scene
 * stream copes with LISTEN never delivering anything (see the stream route).
 *
 * NOTIFY has no such constraint: it commits with the surrounding statement, so
 * the writers keep using the pooled `sql` above.
 */
const LISTEN_URL =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  "";

export const listenSql = postgres(LISTEN_URL, {
  // postgres.js multiplexes every listen() over one reserved connection, so
  // this is a ceiling for reconnects, not one socket per browser source.
  max: 2,
  idle_timeout: 0,
});
