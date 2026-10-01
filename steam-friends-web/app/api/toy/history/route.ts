import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { PLAN_ID, ensureToyTables, hasToySession } from "@/lib/toy";

export const dynamic = "force-dynamic";

// GET /api/toy/history            → the last saves: [{ id, version, note, savedAt, guests, seated }]
// GET /api/toy/history?id=<id>    → one saved plan in full, for restoring
//
// Restoring is an ordinary save from the page, so it lands in the history too
// and can itself be undone.
export async function GET(req: NextRequest) {
  if (!(await hasToySession())) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  await ensureToyTables();

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    const rows = await sql`
      SELECT data, version, saved_at FROM toy_plan_history
       WHERE plan_id = ${PLAN_ID} AND id = ${id}
    `;
    if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(
      { data: rows[0].data, version: rows[0].version, savedAt: rows[0].saved_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await sql`
    SELECT id, version, note, saved_at,
           (SELECT count(*) FROM jsonb_array_elements(data->'guests') g
             WHERE coalesce(g->>'status', 'active') = 'active')::int AS guests,
           (SELECT count(*) FROM jsonb_array_elements(data->'guests') g
             WHERE coalesce(g->>'status', 'active') = 'active'
               AND g->>'table' IS NOT NULL)::int AS seated
      FROM toy_plan_history
     WHERE plan_id = ${PLAN_ID}
     ORDER BY id DESC
     LIMIT 40
  `;
  return NextResponse.json(
    {
      items: rows.map((r) => ({
        id: String(r.id),
        version: r.version,
        note: r.note,
        savedAt: r.saved_at,
        guests: r.guests,
        seated: r.seated,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
