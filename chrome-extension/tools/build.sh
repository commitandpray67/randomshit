#!/usr/bin/env bash
#
# Packages the extension for Chrome Web Store upload.
#
# Builds from an explicit allowlist rather than zipping the source folder: the
# store rejects surprises, and a stray README, .DS_Store or private key in the
# package is the kind of thing that costs a review cycle. Anything new that the
# extension actually loads at runtime has to be added to FILES below.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/../elo-terrorists"
dist="$here/../dist"

FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.css
  popup.js
  icons
)

version="$(python3 -c "import json;print(json.load(open('$src/manifest.json'))['version'])")"
out="$dist/elo-terrorists-$version.zip"

# The store refuses an upload whose version already exists, and a stale key
# would silently ship a fixed extension ID over the store's own.
if python3 -c "import json,sys;sys.exit(0 if 'key' in json.load(open('$src/manifest.json')) else 1)"; then
  echo "refusing to build: manifest.json still has a 'key' field" >&2
  exit 1
fi

mkdir -p "$dist"
rm -f "$out"
( cd "$src" && zip -qr "$out" "${FILES[@]}" -x '*.DS_Store' )

echo "built $out"
unzip -l "$out"
