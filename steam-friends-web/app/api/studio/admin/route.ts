import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { getPlayerSummaries, resolveSteamId } from "@/lib/steam";
import {
  isStudioAdmin,
  isStudioSlug,
  studioFor,
  createStudio,
  listMembers,
  addMember,
  removeMember,
} from "@/lib/studios";

/**
 * Managing studios: who may edit which, and creating new ones. Admins only
 * (STUDIO_ADMIN_STEAM_IDS); everyone else gets the same 403 whatever they ask.
 *
 *   { action: "members", studio }          who may edit it
 *   { action: "add", studio, who }         `who` is a SteamID or profile link
 *   { action: "remove", studio, steamId }
 *   { action: "create", channel, name? }   a new studio for a Twitch channel
 *
 * Members come back with their Steam name and avatar, looked up from Steam
 * rather than our own users table, which a member who has never signed in
 * isn't in yet.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

async function membersOf(studioId: number) {
  const members = await listMembers(studioId);
  let profiles = new Map<string, { personaname: string; avatar: string }>();
  try {
    profiles = await getPlayerSummaries(members.map((m) => m.steamId));
  } catch {
    // Names are a nicety; the list is still right without them.
  }
  return members.map((m) => ({
    steamId: m.steamId,
    name: profiles.get(m.steamId)?.personaname || null,
    avatar: profiles.get(m.steamId)?.avatar || null,
    addedAt: m.addedAt,
  }));
}

export async function POST(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId || !isStudioAdmin(steamId)) return fail("forbidden", 403);

  const rl = rateLimit(`studio-admin:${steamId}`, 60, 60);
  if (!rl.ok) return fail("rate_limited", 429);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("bad_json", 400);
  }
  const action = String(body?.action ?? "");

  if (action === "create") {
    const res = await createStudio(steamId, { channel: body.channel, name: body.name });
    if (!res.ok) return fail(res.error, res.error === "exists" ? 409 : 400);
    return NextResponse.json({ ok: true, slug: res.studio.slug }, { headers: NO_STORE });
  }

  // Everything else is about one studio. An admin may open every one, so
  // studioFor finds any that exists.
  if (!isStudioSlug(body?.studio)) return fail("bad_studio", 400);
  const studio = await studioFor(steamId, body.studio);
  if (!studio) return fail("no_such_studio", 404);

  switch (action) {
    case "members":
      return NextResponse.json({ ok: true, members: await membersOf(studio.id) }, { headers: NO_STORE });

    case "add": {
      let who: string | null = null;
      try {
        who = await resolveSteamId(String(body.who ?? ""));
      } catch {
        return fail("steam_unreachable", 502);
      }
      if (!who) return fail("not_a_steam_account", 400);
      if (isStudioAdmin(who)) return fail("already_admin", 400);
      await addMember(studio.id, who, steamId);
      return NextResponse.json(
        { ok: true, added: who, members: await membersOf(studio.id) },
        { headers: NO_STORE },
      );
    }

    case "remove": {
      const who = String(body.steamId ?? "");
      if (!/^\d{17}$/.test(who)) return fail("bad_steam_id", 400);
      await removeMember(studio.id, who);
      return NextResponse.json({ ok: true, members: await membersOf(studio.id) }, { headers: NO_STORE });
    }

    default:
      return fail("unknown_action", 400);
  }
}
