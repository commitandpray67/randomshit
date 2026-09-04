/**
 * Edge-runtime half of lib/session.ts.
 *
 * Middleware runs on the Edge runtime, where `node:crypto` does not exist, so
 * the session cookie cannot be verified with the same code the routes use.
 * This reads the identical cookie — `<steamid>.<expiryUnixMs>.<hmacSHA256Hex>`
 * signed with SESSION_SECRET — using Web Crypto instead.
 *
 * It only ever VERIFIES. Issuing and clearing sessions stays in lib/session.ts,
 * so there is one place that can mint a cookie.
 */

const COOKIE = "sfw_session";

/** Hex-encoded HMAC-SHA256 of `payload`, matching signPayload() in session.ts. */
async function sign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, content-constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Distinguishes "you are not signed in" from "this deployment cannot tell". */
export type SessionCheck =
  | { status: "ok"; steamId: string }
  | { status: "anonymous" }
  | { status: "misconfigured" };

/**
 * Returns the SteamID carried by the request's session cookie.
 *
 * Fails closed: with no SESSION_SECRET nobody is authenticated, rather than
 * everybody being let through on an unverifiable cookie. That case is reported
 * separately, though, because a caller that treats it as "not signed in" will
 * bounce the visitor to Steam, mint a cookie it still cannot verify, and bounce
 * them again — an infinite redirect loop instead of a legible error.
 */
export async function checkSession(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<SessionCheck> {
  const steamId = await verify(req);
  if (steamId === MISCONFIGURED) return { status: "misconfigured" };
  return steamId ? { status: "ok", steamId } : { status: "anonymous" };
}

const MISCONFIGURED = Symbol("no SESSION_SECRET");

async function verify(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<string | null | typeof MISCONFIGURED> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return MISCONFIGURED;

  const value = req.cookies.get(COOKIE)?.value;
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [steamId, expiryStr, mac] = parts;

  const expected = await sign(`${steamId}.${expiryStr}`, secret);
  if (!safeEqual(mac, expected)) return null;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return null;

  return steamId;
}
