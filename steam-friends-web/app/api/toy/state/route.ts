import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  HISTORY_KEEP,
  MAX_PLAN_BYTES,
  PLAN_ID,
  ensureToyTables,
  hasToySession,
  toyConfigured,
  validPlan,
} from "@/lib/toy";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function guard(): Promise<NextResponse | null> {
  if (!toyConfigured()) {
    return NextResponse.json({ error: "not configured", configured: false }, { status: 503, headers: noStore });
  }
  if (!(await hasToySession())) {
    return NextResponse.json({ error: "locked" }, { status: 401, headers: noStore });
  }
  return null;
}

// GET /api/toy/state → { data, version, updatedAt }  (data null before the first import)
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureToyTables();
  const rows = await sql`SELECT data, version, updated_at FROM toy_plans WHERE id = ${PLAN_ID}`;
  const row = rows[0];
  return NextResponse.json(
    row
      ? { data: row.data, version: row.version, updatedAt: row.updated_at }
      : { data: null, version: 0, updatedAt: null },
    { headers: noStore },
  );
}

// PUT /api/toy/state  { data, baseVersion, note? }
//
// Optimistic concurrency: the save only lands if nobody else saved since the
// editor last loaded. Otherwise 409 with the current plan, and the page
// replays its own unsaved moves on top of it and tries again.
export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const text = await req.text();
  if (text.length > MAX_PLAN_BYTES) {
    return NextResponse.json({ error: "plan too large" }, { status: 413, headers: noStore });
  }
  let body: { data?: unknown; baseVersion?: unknown; note?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad JSON" }, { status: 400, headers: noStore });
  }
  if (!validPlan(body.data)) {
    return NextResponse.json({ error: "bad plan" }, { status: 400, headers: noStore });
  }
  const base = Number(body.baseVersion);
  if (!Number.isInteger(base) || base < 0) {
    return NextResponse.json({ error: "bad baseVersion" }, { status: 400, headers: noStore });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";

  await ensureToyTables();
  const data = sql.json(body.data as Parameters<typeof sql.json>[0]);

  const saved =
    base === 0
      ? await sql`
          INSERT INTO toy_plans (id, data, version)
          VALUES (${PLAN_ID}, ${data}, 1)
          ON CONFLICT (id) DO NOTHING
          RETURNING version, updated_at
        `
      : await sql`
          UPDATE toy_plans
             SET data = ${data}, version = version + 1, updated_at = now()
           WHERE id = ${PLAN_ID} AND version = ${base}
          RETURNING version, updated_at
        `;

  if (!saved[0]) {
    const rows = await sql`SELECT data, version, updated_at FROM toy_plans WHERE id = ${PLAN_ID}`;
    const row = rows[0];
    return NextResponse.json(
      {
        error: "conflict",
        data: row?.data ?? null,
        version: row?.version ?? 0,
        updatedAt: row?.updated_at ?? null,
      },
      { status: 409, headers: noStore },
    );
  }

  const version = saved[0].version as number;
  await sql`
    INSERT INTO toy_plan_history (plan_id, version, data, note)
    VALUES (${PLAN_ID}, ${version}, ${data}, ${note})
  `;
  await sql`
    DELETE FROM toy_plan_history
     WHERE plan_id = ${PLAN_ID}
       AND id < (SELECT min(id) FROM (
             SELECT id FROM toy_plan_history WHERE plan_id = ${PLAN_ID}
             ORDER BY id DESC LIMIT ${HISTORY_KEEP}) keep)
  `;
  return NextResponse.json({ ok: true, version, updatedAt: saved[0].updated_at }, { headers: noStore });
}
