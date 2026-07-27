// Build guard for metadata files that browsers and crawlers expect to exist.
//
// app/icon.svg (the ghost favicon) has been lost three separate times by
// landing on a feature branch that never reached the deployed branch. Next.js
// treats a missing icon as "no favicon" and builds happily, so nothing catches
// it until someone looks at the browser tab. Fail loudly instead.

import { readFileSync } from "node:fs";

const REQUIRED = [
  {
    path: "app/icon.svg",
    what: "the ghost favicon shown in the browser tab",
  },
];

let failed = false;

for (const { path, what } of REQUIRED) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    console.error(`\n  Missing ${path} - ${what}.`);
    failed = true;
    continue;
  }
  if (!contents.includes("<svg")) {
    console.error(`\n  ${path} exists but is not a valid SVG - ${what}.`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\n  Restore the file before building, or the deploy ships without it.\n",
  );
  process.exit(1);
}
