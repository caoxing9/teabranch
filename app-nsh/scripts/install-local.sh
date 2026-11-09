#!/bin/sh
# Build TeaBranch from this checkout and install it in /Applications, replacing the copy there.
#
# A build made on this Mac is never quarantined, so Gatekeeper has nothing to say about it — no
# "open anyway", no waiting for a release and for Homebrew. The running copy is asked to quit first
# (it owns the data files under ~/Library/Application Support/com.teabranch.dev; the new build
# picks them up as they are), then the new one is started.
#
#     app-nsh/scripts/install-local.sh
#
# Needs nsh (`curl -fsSL https://nsh.dev/install.sh | NSH_VERSION=v0.4.0 sh`) and the Rust
# toolchain, like any build of the app.
set -eu

cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
app="${TEABRANCH_APP:-/Applications/TeaBranch.app}"
out="dist/local"

rm -rf "$out"
nsh package --target macos -o "$out"
built="$out/TeaBranch.app"
test -d "$built" || { echo "install-local: nsh package left no app in $out" >&2; exit 1; }

version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$built/Contents/Info.plist")
commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# Ask nicely, then wait for it to go; a copy that ignores the request is stopped.
osascript -e 'tell application id "com.teabranch.dev" to quit' >/dev/null 2>&1 || true
i=0
while pgrep -xq TeaBranch && [ "$i" -lt 20 ]; do
  i=$((i + 1))
  sleep 0.5
done
pkill -x TeaBranch >/dev/null 2>&1 || true

rm -rf "$app"
ditto "$built" "$app"
open "$app"
echo "install-local: TeaBranch $version ($commit) is in $app and running"
