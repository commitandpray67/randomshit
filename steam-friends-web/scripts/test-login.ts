/**
 * Checks for where a login may send you afterwards.
 *
 * `next` arrives in a query string anyone can craft, so these are mostly the
 * ways people turn a login link into an open redirect.
 * Run with:  node --experimental-strip-types scripts/test-login.ts
 */
import { safeNext, buildLoginUrl } from "../lib/steam.ts";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`}`);
}

const returnTo = (next?: string) =>
  new URL(buildLoginUrl("https://studio.example", next)).searchParams.get("openid.return_to");

console.log("allowed destinations");
check("studio", safeNext("/studio"), "/studio");
check("dashboard", safeNext("/dashboard"), "/dashboard");
check("overlay", safeNext("/overlay"), "/overlay");

console.log("\nanything else falls back to the dashboard");
for (const bad of [
  "//evil.example", "/\\evil.example", "https://evil.example", "http:evil.example",
  "%2F%2Fevil.example", "/studio/../../evil", "/studio?x=1", " /studio", "javascript:alert(1)",
  "", null, undefined,
]) {
  check(JSON.stringify(bad), safeNext(bad as any), "/dashboard");
}

console.log("\nthe login URL");
check("carries next=/studio through Steam", returnTo("/studio"), "https://studio.example/api/auth/steam/return?next=%2Fstudio");
check("leaves a bad next out entirely", returnTo("//evil.example"), "https://studio.example/api/auth/steam/return");
check("no next, no parameter", returnTo(), "https://studio.example/api/auth/steam/return");
check("the default needs no parameter", returnTo("/dashboard"), "https://studio.example/api/auth/steam/return");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
