/**
 * Checks for where a login may send you afterwards.
 *
 * The name arrives in a query string anyone can craft, so these are mostly the
 * ways people turn a login link into an open redirect.
 * Run with:  node --experimental-strip-types scripts/test-login.ts
 */
import { afterLogin, buildLoginUrl } from "../lib/steam.ts";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`}`);
}

console.log("known destinations");
check("studio", afterLogin("studio"), "/studio");
check("jayc", afterLogin("jayc"), "/jayc");
check("overlay", afterLogin("overlay"), "/overlay");

console.log("\nanything else finds nothing, so the caller uses the dashboard");
for (const bad of [
  "//evil.example", "/\\evil.example", "https://evil.example", "http:evil.example",
  "%2F%2Fevil.example", "/studio", "studio/../../evil", "studio?x=1", " studio", "STUDIO",
  "javascript:alert(1)", "constructor", "__proto__", "toString", "hasOwnProperty",
  "", null, undefined,
]) {
  check(JSON.stringify(bad), afterLogin(bad as any), null);
}

console.log("\nthe login URL is unchanged by any of this");
const url = new URL(buildLoginUrl("https://studio.example"));
check("return_to", url.searchParams.get("openid.return_to"), "https://studio.example/api/auth/steam/return");
check("realm", url.searchParams.get("openid.realm"), "https://studio.example");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
