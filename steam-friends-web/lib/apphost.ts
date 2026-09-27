/**
 * Which origin the app should talk about *right now*.
 *
 * APP_URL is the canonical public domain and stays the answer for SEO — the
 * sitemap, canonical tags and Open Graph URLs must not follow whatever host a
 * visitor happened to use.
 *
 * Auth and the copyable overlay/scene URLs are different: if the canonical
 * domain is unreachable for someone (an ISP blocking its IP, say), they need to
 * reach the app on one of its other hostnames — a *.vercel.app URL — and have
 * sign-in return *there* rather than bouncing them to a domain they cannot
 * load. The session cookie is per-host, so a login that returns to the wrong
 * host leaves them with no session on the host they can actually use.
 *
 * Only known hostnames are honoured. Trusting the Host header blindly turns the
 * Steam round-trip into an open redirect: an attacker could send someone to a
 * real login and have Steam hand them back to a lookalike host.
 */
import { headers } from "next/headers";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hostnames this deployment will answer on. */
export function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null) => {
    if (h) hosts.add(h);
  };

  add(hostOf(process.env.APP_URL));
  // Set by Vercel: the current deployment's own URL and the project's stable
  // production alias. These make alternate hostnames work with no extra config.
  add(hostOf(process.env.VERCEL_URL));
  add(hostOf(process.env.VERCEL_PROJECT_PRODUCTION_URL));
  add(hostOf(process.env.VERCEL_BRANCH_URL));

  // Escape hatch for any other domain pointed at this deployment.
  for (const h of (process.env.ALT_HOSTS ?? "").split(/[,\s]+/)) {
    add(hostOf(h.trim()));
  }

  // Local development.
  add("localhost:3000");
  add("127.0.0.1:3000");
  return hosts;
}

export function canonicalOrigin(): string {
  return process.env.APP_URL || "https://steamfriends.xyz";
}

/**
 * Origin for the request being served — the host the user is actually on, when
 * we recognise it, otherwise the canonical domain.
 *
 * Pass `reqHeaders` from a route handler (`req.headers`); in a server component
 * omit it and the request's headers are read for you.
 */
export async function currentOrigin(reqHeaders?: Headers): Promise<string> {
  const h = reqHeaders ?? (await headers());
  // Vercel sets x-forwarded-host to the hostname the browser asked for; `host`
  // can be the internal one.
  const raw = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase().trim();
  if (!raw) return canonicalOrigin();

  if (!allowedHosts().has(raw)) return canonicalOrigin();

  const proto =
    h.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (raw.startsWith("localhost") || raw.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${raw}`;
}
