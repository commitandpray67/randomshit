/**
 * Wedding seating planner at /toy.
 *
 * One shared plan (a JSON document) edited by a handful of family members who
 * know a single password. There are no accounts: the password is checked here,
 * and a signed cookie remembers it for 30 days.
 *
 * The password lives in TOY_PASSWORD only. This repo is public, so neither the
 * password nor the guest list is ever committed — the list is imported from
 * the spreadsheet on the page itself and lives in the database. With
 * TOY_PASSWORD unset the planner stays locked for everyone (fail closed).
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

const COOKIE = "toy_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The plan is one row; history keeps recent saves so a bad import can be undone. */
export const PLAN_ID = "laman";
export const HISTORY_KEEP = 200;
/** A few hundred guests is ~60 KB of JSON; anything near this is not a plan. */
export const MAX_PLAN_BYTES = 1_000_000;

export function toyConfigured(): boolean {
  return Boolean(process.env.TOY_PASSWORD);
}

/**
 * The cookie is keyed on the password as well as SESSION_SECRET, so changing
 * TOY_PASSWORD in Vercel signs everybody out at the next request.
 */
function key(): string {
  return `${process.env.SESSION_SECRET ?? ""}\u0000toy\u0000${process.env.TOY_PASSWORD ?? ""}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", key()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function passwordMatches(given: string): boolean {
  const expected = process.env.TOY_PASSWORD;
  if (!expected) return false;
  // Hash both sides so the comparison is constant-time whatever the lengths.
  const h = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  return safeEqual(h(given), h(expected));
}

export async function startToySession(): Promise<void> {
  const expiry = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `toy.${expiry}`;
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endToySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function hasToySession(): Promise<boolean> {
  if (!toyConfigured()) return false;
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "toy") return false;
  const expiry = Number(parts[1]);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`));
}

/**
 * Tables are created on first use, so the planner works on the existing
 * database without a manual migration. db/neon-toy.sql holds the same
 * statements for anyone who prefers to run them by hand.
 */
let ensured: Promise<unknown> | null = null;
export function ensureToyTables(): Promise<unknown> {
  if (!ensured) {
    ensured = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS toy_plans (
          id         TEXT PRIMARY KEY,
          data       JSONB NOT NULL,
          version    INT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS toy_plan_history (
          id         BIGSERIAL PRIMARY KEY,
          plan_id    TEXT NOT NULL,
          version    INT NOT NULL,
          data       JSONB NOT NULL,
          note       TEXT NOT NULL DEFAULT '',
          saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS toy_plan_history_plan_idx
          ON toy_plan_history (plan_id, id DESC)
      `;
    })().catch((err) => {
      // Let the next request try again rather than caching the failure.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

/** Light shape check: the page owns the format, the server only guards size and type. */
export function validPlan(data: unknown): data is { guests: unknown[] } {
  if (!data || typeof data !== "object") return false;
  const guests = (data as { guests?: unknown }).guests;
  if (!Array.isArray(guests) || guests.length > 5000) return false;
  return guests.every(
    (g) =>
      g &&
      typeof g === "object" &&
      typeof (g as { id?: unknown }).id === "string" &&
      typeof (g as { name?: unknown }).name === "string",
  );
}
