/**
 * Tiny stateless session: a signed cookie holding the logged-in SteamID.
 * Value format:  <steamid>.<expiryUnixMs>.<hmacSHA256Hex>
 * No DB lookups, no dependencies beyond Node's crypto.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sfw_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return s;
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createSession(steamId: string): Promise<void> {
  const expiry = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${steamId}.${expiry}`;
  const value = `${payload}.${signPayload(payload)}`;
  const store = await cookies();
  store.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Returns the SteamID of the current user, or null if not logged in. */
export async function getSession(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [steamId, expiryStr, mac] = parts;
  const payload = `${steamId}.${expiryStr}`;

  const expected = signPayload(payload);
  // Constant-time compare to avoid signature-guessing timing leaks.
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  if (Date.now() > Number(expiryStr)) return null;
  return steamId;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
