import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { rateLimit } from "@/lib/ratelimit";

/**
 * 7TV emote lookup for a Twitch channel.
 *
 * Proxied server-side rather than called from the browser for two reasons: it
 * avoids CORS, and it means the lookup works even where 7TV's API is awkward to
 * reach directly — Vercel does the fetching. Emote images themselves still load
 * from cdn.7tv.app in the overlay; see the note in the studio README section if
 * that CDN turns out to be unreachable for the streamer.
 *
 * Endpoints match the ones Pogly's SevenTVWrap uses.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const SEVENTV = "https://7tv.io/v3";

type Emote = { id: string; name: string };

function emoteUrl(id: string, size: "1x" | "2x" | "3x" | "4x" = "3x"): string {
  return `https://cdn.7tv.app/emote/${id}/${size}.webp`;
}

/** Twitch numeric id → 7TV user, the cheapest path when we have one. */
async function byTwitchId(id: string) {
  const res = await fetch(`${SEVENTV}/users/twitch/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

/** Username → 7TV user id, via the same GQL search Pogly uses. */
async function searchUserId(username: string): Promise<string | null> {
  const res = await fetch(`${SEVENTV}/gql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      operationName: "SearchUsers",
      variables: { query: username.toLowerCase() },
      query: "query SearchUsers($query: String!) {\n  users(query: $query) {\n    id, username}\n}",
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const users = json?.data?.users ?? [];
  const exact = users.find(
    (u: any) => String(u?.username ?? "").toLowerCase() === username.toLowerCase(),
  );
  return exact?.id ?? users[0]?.id ?? null;
}

async function emoteSetEmotes(emoteSetId: string): Promise<Emote[]> {
  const res = await fetch(`${SEVENTV}/emote-sets/${encodeURIComponent(emoteSetId)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.emotes ?? []).map((e: any) => ({ id: e.id, name: e.name }));
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
    return NextResponse.json(
      { ok: false, error: "bad_channel" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    // A numeric input is a Twitch user id; anything else is a login name.
    let user: any = /^\d+$/.test(channel) ? await byTwitchId(channel) : null;

    if (!user) {
      const userId = await searchUserId(channel);
      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "channel_not_found" },
          { status: 404, headers: NO_STORE },
        );
      }
      const res = await fetch(`${SEVENTV}/users/${encodeURIComponent(userId)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: "channel_not_found" },
          { status: 404, headers: NO_STORE },
        );
      }
      user = await res.json();
    }

    // The emote set hangs off either the user's active set or a platform
    // connection, depending on which endpoint answered.
    let emotes: Emote[] = user?.emote_set?.emotes
      ? user.emote_set.emotes.map((e: any) => ({ id: e.id, name: e.name }))
      : [];

    if (emotes.length === 0) {
      const setId =
        user?.emote_set?.id ??
        (user?.connections ?? []).map((c: any) => c?.emote_set_id).find(Boolean);
      if (setId) emotes = await emoteSetEmotes(setId);
    }

    return NextResponse.json(
      {
        ok: true,
        channel,
        count: emotes.length,
        emotes: emotes.slice(0, 300).map((e) => ({
          id: e.id,
          name: e.name,
          url: emoteUrl(e.id),
        })),
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "seventv_unreachable" },
      { status: 502, headers: NO_STORE },
    );
  }
}
