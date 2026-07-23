/**
 * Create the database tables. Run once after setting DATABASE_URL:
 *   node --env-file=.env.local --experimental-strip-types scripts/init-db.ts
 * (or just: psql "$DATABASE_URL" -f db/schema.sql)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");

const sql = postgres(process.env.DATABASE_URL ?? "");
await sql.unsafe(schema);
console.log("✓ Schema applied.");
await sql.end();
