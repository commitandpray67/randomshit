import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { passwordMatches, startToySession, toyConfigured } from "@/lib/toy";

// POST /api/toy/login  { password } → sets the planner cookie.
export async function POST(req: NextRequest) {
  if (!toyConfigured()) {
    return NextResponse.json({ error: "The planner is not set up yet (TOY_PASSWORD)." }, { status: 503 });
  }
  // Ten guesses per five minutes per address is plenty for a person typing.
  const rl = rateLimit(`toy-login:${clientIp(req)}`, 10, 300);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "bad JSON" }, { status: 400 });
  }
  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  await startToySession();
  return NextResponse.json({ ok: true });
}
