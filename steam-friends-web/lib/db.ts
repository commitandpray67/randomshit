import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  // Don't crash at import time in the browser; only server code uses this.
  console.warn("DATABASE_URL is not set — database calls will fail.");
}

/**
 * Neon's connection strings now end in `channel_binding=require`. postgres.js
 * doesn't know that option, so it forwards it to the server as a setting, and
 * the server refuses the connection: `unrecognized configuration parameter
 * "channel_binding"`. postgres.js doesn't do channel binding either way, so
 * dropping it loses nothing and lets Neon's string be pasted as-is.
 */
function dbUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (!u.searchParams.has("channel_binding")) return url;
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

// A single shared connection pool. postgres.js handles pooling internally.
export const sql = postgres(dbUrl(process.env.DATABASE_URL), {
  // Supabase/Neon poolers speak SSL; most managed URLs include sslmode already.
  // Uncomment if your provider needs it explicitly:
  // ssl: "require",
  max: 10,
  // Close a connection once it has sat unused this long. postgres.js defaults
  // to never, which is invisible on serverless — a frozen function takes its
  // sockets with it — but on a long-running server it holds connections open
  // indefinitely, and Neon cannot suspend its compute while any are open. On
  // the free tier that spends the month's compute allowance on nothing.
  idle_timeout: 20,
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
const LISTEN_URL = dbUrl(
  process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL,
);

/**
 * Borrowed and returned rather than exported as a singleton, because nothing
 * else ever closes it.
 *
 * postgres.js runs every listen() over one internal connection created with
 * `idle_timeout` and `max_lifetime` both forced off, and unlisten() only sends
 * UNLISTEN — the socket stays open for the life of the process. Serverless
 * hid that. On a long-running server, the first studio visit would pin Neon's
 * compute awake from then on, whether or not anyone was using the studio.
 *
 * So streams hold a reference while they are open, and the last one out closes
 * the client after a grace period. The grace matters: the scene stream closes
 * itself every ~50s and the browser reconnects within milliseconds, and
 * tearing the connection down and re-establishing it each time would be pure
 * churn.
 */
type Client = ReturnType<typeof postgres>;

const LISTEN_GRACE_MS = 30_000;

let listener: Client | null = null;
let holders = 0;
let closing: ReturnType<typeof setTimeout> | null = null;

export function acquireListener(): Client {
  holders++;
  if (closing) {
    clearTimeout(closing);
    closing = null;
  }
  if (!listener) {
    // postgres.js multiplexes every listen() over one reserved connection, so
    // this is a ceiling for reconnects, not one socket per browser source.
    listener = postgres(LISTEN_URL, { max: 2, idle_timeout: 0 });
  }
  return listener;
}

export function releaseListener(): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || !listener || closing) return;
  closing = setTimeout(() => {
    closing = null;
    if (holders > 0 || !listener) return;
    const done = listener;
    listener = null;
    // Anything that acquires from here on gets a fresh client, so an end that
    // is still in flight never races a new subscription.
    void done.end({ timeout: 5 }).catch(() => {});
  }, LISTEN_GRACE_MS);
}

/** How many streams are holding the listener, for diagnostics and tests. */
export function listenerHolders(): number {
  return holders;
}
