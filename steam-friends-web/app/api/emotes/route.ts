import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { rateLimit } from "@/lib/ratelimit";
import { emotesFromSet, findEmoteSet, pickSearchedUserId, type Emote } from "@/lib/seventv";

/**
 * 7TV emote lookup for a Twitch channel.
 *
 * Proxied server-side rather than called from the browser: it avoids CORS, and
 * the lookup keeps working where 7TV's API is awkward to reach directly, since
 * Vercel does the fetching. Emote images themselves still load from
 * cdn.7tv.app in the overlay.
 *
 * Endpoints per the 7TV v3 OpenAPI spec — see lib/seventv.ts for the response
 * shapes, which differ between the two user endpoints.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
// Overridable so the lookup chain can be exercised against a stub, and so a
// future 7TV base URL doesn't need a code change.
const SEVENTV = process.env.SEVENTV_API_BASE || "https://7tv.io/v3";
const TIMEOUT_MS = 8000;

async function getJson(url: string, init?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId || !isOverlayAllowed(steamId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const rl = rateLimit(`emotes:${steamId}`, 30, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
    );
  }

  const channel = (req.nextUrl.searchParams.get("channel") ?? "").trim();
  if (!channel || channel.length > 64 || !/^[\w.-]+$/.test(channel)) {
    return NextResponse.json({ ok: false, error: "bad_channel" }, { status: 400, headers: NO_STORE });
  }

  try {
    // 1. Numeric input is a Twitch user id — the direct, cheapest path.
    let payload = /^\d+$/.test(channel)
      ? await getJson(`${SEVENTV}/users/twitch/${encodeURIComponent(channel)}`)
      : null;

    // 2. Otherwise resolve the login name through GQL, then load the user.
    if (!payload) {
      const gql = await getJson(`${SEVENTV}/gql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationName: "SearchUsers",
          variables: { query: channel.toLowerCase() },
          query:
            "query SearchUsers($query: String!) {\n  users(query: $query) {\n    id, username}\n}",
        }),
      });
      const userId = pickSearchedUserId(gql, channel);
      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "channel_not_found" },
          { status: 404, headers: NO_STORE },
        );
      }
      payload = await getJson(`${SEVENTV}/users/${encodeURIComponent(userId)}`);
      if (!payload) {
        return NextResponse.json(
          { ok: false, error: "channel_not_found" },
          { status: 404, headers: NO_STORE },
        );
      }
    }

    // 3. The emote set arrives inline on some shapes and as an id on others.
    const { set, setId } = findEmoteSet(payload);
    let emotes: Emote[] = set ? emotesFromSet(set) : [];

    if (emotes.length === 0 && setId) {
      const full = await getJson(`${SEVENTV}/emote-sets/${encodeURIComponent(setId)}`);
      if (full) emotes = emotesFromSet(full);
    }

    return NextResponse.json(
      { ok: true, channel, count: emotes.length, emotes: emotes.slice(0, 300) },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "seventv_unreachable" },
      { status: 502, headers: NO_STORE },
    );
  }
}
