import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

/**
 * Server-side FACEIT token exchange.
 *
 * FACEIT's token endpoint authenticates the client with HTTP Basic
 * (client_id:client_secret) — it does not support public PKCE clients. A
 * Chrome extension cannot hold that secret (anyone can unzip the package), so
 * the extension sends us the authorization code and we perform the exchange.
 *
 * The code is single-use and bound to our client_id, so proxying it is not a
 * meaningful abuse vector, but the endpoint is rate limited regardless.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const FACEIT_TOKEN_URL = "https://api.faceit.com/auth/v1/oauth/token";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`et-oauth:${clientIp(req)}`, 20, 300);
  if (!rl.ok) {
    return new NextResponse("Rate limited", {
      status: 429,
      headers: { ...CORS, "Retry-After": String(rl.retryAfter) },
    });
  }

  const clientId = process.env.FACEIT_CLIENT_ID;
  const clientSecret = process.env.FACEIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse("FACEIT OAuth not configured", { status: 503, headers: CORS });
  }

  let body: {
    grantType?: unknown;
    code?: unknown;
    redirectUri?: unknown;
    codeVerifier?: unknown;
    refreshToken?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const grantType = String(body.grantType ?? "authorization_code");
  const form = new URLSearchParams();

  if (grantType === "refresh_token") {
    const refreshToken = String(body.refreshToken ?? "").trim();
    if (!refreshToken) {
      return new NextResponse("Missing refreshToken", { status: 400, headers: CORS });
    }
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refreshToken);
  } else {
    const code = String(body.code ?? "").trim();
    const redirectUri = String(body.redirectUri ?? "").trim();
    if (!code || !redirectUri) {
      return new NextResponse("Missing code or redirectUri", { status: 400, headers: CORS });
    }
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", redirectUri);
    // Harmless when FACEIT ignores PKCE; required if it validated the challenge.
    const codeVerifier = String(body.codeVerifier ?? "").trim();
    if (codeVerifier) form.set("code_verifier", codeVerifier);
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(FACEIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch {
    return new NextResponse("Upstream unreachable", { status: 502, headers: CORS });
  }

  if (!res.ok) {
    // Surface FACEIT's error text so extension-side debugging is possible,
    // but never echo our own credentials.
    const detail = await res.text().catch(() => "");
    return new NextResponse(`FACEIT token exchange failed: ${res.status} ${detail}`.trim(), {
      status: res.status === 401 ? 400 : res.status,
      headers: CORS,
    });
  }

  const tokens = await res.json();

  return NextResponse.json(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_in: tokens.expires_in ?? 3600,
    },
    { headers: CORS },
  );
}
