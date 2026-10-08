#!/bin/zsh
# Same copy/configure/ad-hoc-sign pattern as Diver Ops create_desktop_launcher.sh.
set -euo pipefail
DESKTOP="${0:A:h}"
APP_NAME='MantaTracker Development'
APP_DIR="$HOME/Applications/Codex APPs/$APP_NAME.app"
RUNTIME="$DESKTOP/node_modules/electron/dist/Electron.app"
[[ -d "$RUNTIME" ]] || { echo 'Run npm ci --prefix desktop first.' >&2; exit 1; }
TEMP_ROOT="$(mktemp -d /tmp/mantatracker-desktop.XXXXXX)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
STAGED="$TEMP_ROOT/$APP_NAME.app"
ditto "$RUNTIME" "$STAGED"
mv "$STAGED/Contents/MacOS/Electron" "$STAGED/Contents/MacOS/$APP_NAME"
mkdir -p "$STAGED/Contents/Resources/app"
cp "$DESKTOP/main.cjs" "$DESKTOP/package.json" "$STAGED/Contents/Resources/app/"
cp "$DESKTOP/mantatracker.icns" "$STAGED/Contents/Resources/"
PLIST="$STAGED/Contents/Info.plist"
for FIELD in CFBundleName CFBundleDisplayName CFBundleExecutable; do
  /usr/libexec/PlistBuddy -c "Set :$FIELD $APP_NAME" "$PLIST"
done
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.hamer.mantatracker.development-launcher' "$PLIST"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIconFile mantatracker.icns' "$PLIST"
/usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 1.0' "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(date +%Y%m%d%H%M%S)" "$PLIST"
codesign --force --deep --sign - "$STAGED"
codesign --verify --deep "$STAGED"
# Only replace this exact reproducible app, never other launchers or worktrees.
rm -rf "$APP_DIR"
ditto "$STAGED" "$APP_DIR"
echo "Packaged: $APP_DIR"
