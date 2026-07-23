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
