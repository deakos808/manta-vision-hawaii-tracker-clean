#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean"
APPS_DIR="/Users/littlemac/Desktop/Codex APPs"
BACKUP_DIR="/Users/littlemac/Desktop/Codex Launcher Backups"
MANTA_APP="$APPS_DIR/mantatracker.app"
CHROME_APP="$APPS_DIR/Manta Tracker Chrome.app"
QUIT_APP="$APPS_DIR/Quit Manta Tracker.app"
CREATE_CHROME_FALLBACK="${CREATE_CHROME_FALLBACK:-0}"
TIMESTAMP="$(/bin/date '+%Y%m%d-%H%M%S')"
TEMP_ROOT="$(/usr/bin/mktemp -d /tmp/manta-desktop-launchers.XXXXXX)"

cleanup() {
  /bin/rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

if [[ ! -d "$PROJECT_DIR" || ! -f "$PROJECT_DIR/package.json" ]]; then
  /bin/echo "Canonical Manta repository not found at $PROJECT_DIR" >&2
  exit 1
fi

/bin/mkdir -p "$APPS_DIR" "$BACKUP_DIR"

backup_bundle() {
  local bundle="$1"
  local label="$2"
  if [[ -d "$bundle" ]]; then
    local destination="$BACKUP_DIR/${label}-${TIMESTAMP}.app"
    /usr/bin/ditto "$bundle" "$destination"
    /bin/echo "Backed up $bundle to $destination"
  fi
}

backup_bundle "$MANTA_APP" "mantatracker"
backup_bundle "$QUIT_APP" "Quit-Manta-Tracker"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  backup_bundle "$CHROME_APP" "Manta-Tracker-Chrome"
fi

MANTA_TEMP="$TEMP_ROOT/mantatracker.app"
CHROME_TEMP="$TEMP_ROOT/Manta Tracker Chrome.app"
QUIT_TEMP="$TEMP_ROOT/Quit Manta Tracker.app"

/bin/mkdir -p "$MANTA_TEMP/Contents/MacOS" "$MANTA_TEMP/Contents/Resources"
/bin/mkdir -p "$QUIT_TEMP/Contents/MacOS" "$QUIT_TEMP/Contents/Resources"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /bin/mkdir -p "$CHROME_TEMP/Contents/MacOS" "$CHROME_TEMP/Contents/Resources"
fi

# Preserve the installed custom icon resources when updating an existing launcher.
if [[ -d "$MANTA_APP/Contents/Resources" ]]; then
  /usr/bin/ditto "$MANTA_APP/Contents/Resources" "$MANTA_TEMP/Contents/Resources"
elif [[ -f "$PROJECT_DIR/public/manta-pacific-logo.png" ]]; then
  /bin/cp "$PROJECT_DIR/public/manta-pacific-logo.png" "$MANTA_TEMP/Contents/Resources/mantatracker-base.png"
fi

if [[ -d "$MANTA_TEMP/Contents/Resources" ]]; then
  /usr/bin/ditto "$MANTA_TEMP/Contents/Resources" "$QUIT_TEMP/Contents/Resources"
  if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
    /usr/bin/ditto "$MANTA_TEMP/Contents/Resources" "$CHROME_TEMP/Contents/Resources"
  fi
fi

/bin/cat > "$MANTA_TEMP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>mantatracker</string>
  <key>CFBundleExecutable</key><string>mantatracker</string>
  <key>CFBundleIconFile</key><string>mantatracker</string>
  <key>CFBundleIdentifier</key><string>com.local.mantatracker.launcher</string>
  <key>CFBundleName</key><string>mantatracker</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
</dict>
</plist>
PLIST

/bin/cat > "$MANTA_TEMP/Contents/MacOS/mantatracker" <<'LAUNCHER'
#!/bin/zsh

set -u

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean"
ELECTRON_BIN="$PROJECT_DIR/desktop/node_modules/.bin/electron"
MAIN_FILE="$PROJECT_DIR/desktop/manta-tracker-main.cjs"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/launcher.log"
SCRIPT_DIR="${0:A:h}"
ICON_FILE="$SCRIPT_DIR/../Resources/mantatracker-base.png"

/bin/mkdir -p "$LOG_DIR"
/usr/bin/touch "$LOG_FILE"

if [[ ! -x "$ELECTRON_BIN" || ! -f "$MAIN_FILE" ]]; then
  /bin/echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] Electron wrapper dependency is missing. Run npm --prefix desktop install." >> "$LOG_FILE"
  /usr/bin/open "$LOG_DIR" >/dev/null 2>&1 || true
  /usr/bin/osascript -e 'display dialog "The local Electron dependency is missing. Run npm --prefix desktop install, then recreate the launcher. The logs folder has been opened." with title "Manta Tracker Electron Missing" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
  exit 1
fi

export MANTA_PROJECT_DIR="$PROJECT_DIR"
export MANTA_ICON="$ICON_FILE"
cd "$PROJECT_DIR" || exit 1
exec /usr/bin/arch -arm64 /bin/zsh -lic "exec '$ELECTRON_BIN' '$MAIN_FILE'" >> "$LOG_FILE" 2>&1
LAUNCHER

if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /bin/cat > "$CHROME_TEMP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>Manta Tracker Chrome (Fallback)</string>
  <key>CFBundleExecutable</key><string>manta-tracker-chrome</string>
  <key>CFBundleIconFile</key><string>mantatracker</string>
  <key>CFBundleIdentifier</key><string>com.local.mantatracker.chrome-fallback</string>
  <key>CFBundleName</key><string>Manta Tracker Chrome</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
</dict>
</plist>
PLIST

/bin/cat > "$CHROME_TEMP/Contents/MacOS/manta-tracker-chrome" <<'CHROME_LAUNCHER'
#!/bin/zsh

set -u

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean"
FRONTEND_PORT="8080"
MATCHER_PORT="8766"
URL="http://127.0.0.1:8080/"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/launcher.log"

/bin/mkdir -p "$LOG_DIR"
/usr/bin/touch "$LOG_FILE"

log_message() {
  /bin/echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] [chrome-fallback] $*" >> "$LOG_FILE"
}

port_is_listening() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

show_startup_error() {
  log_message "ERROR: Local Manta Ray App did not become available at $URL."
  /usr/bin/open "$LOG_DIR" >/dev/null 2>&1 || true
  /usr/bin/osascript -e 'display dialog "Manta Ray App could not start on port 8080. The launcher logs folder has been opened. Review launcher.log for details." with title "Manta Tracker Chrome Fallback Failed" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
}

log_message "Chrome fallback launcher invoked."

if port_is_listening "$FRONTEND_PORT"; then
  log_message "Detected an existing listener on frontend port $FRONTEND_PORT; not starting a second Vite process."
else
  log_message "Starting Vite from $PROJECT_DIR on 127.0.0.1:$FRONTEND_PORT."
  (
    cd "$PROJECT_DIR" || exit 1
    /usr/bin/nohup /usr/bin/arch -arm64 /bin/zsh -lic 'npm run dev -- --host 127.0.0.1 --port 8080' >> "$LOG_FILE" 2>&1 &
  )
fi

if port_is_listening "$MATCHER_PORT"; then
  log_message "Detected an existing matcher API listener on port $MATCHER_PORT."
else
  log_message "Starting matcher API from $PROJECT_DIR on port $MATCHER_PORT."
  (
    cd "$PROJECT_DIR" || exit 1
    /usr/bin/nohup /usr/bin/arch -arm64 /bin/zsh -lic 'npm run dev:matcher-api' >> "$LOG_FILE" 2>&1 &
  )
fi

frontend_ready=false
for attempt in {1..60}; do
  if /usr/bin/curl --fail --silent --show-error --max-time 2 "$URL" >/dev/null 2>&1; then
    frontend_ready=true
    break
  fi
  /bin/sleep 1
done

if [[ "$frontend_ready" != "true" ]]; then
  show_startup_error
  exit 1
fi

if /usr/bin/open -Ra "Google Chrome" >/dev/null 2>&1 && /usr/bin/open -na "Google Chrome" --args --app="$URL"; then
  log_message "Opened $URL in Google Chrome app mode."
  exit 0
fi

log_message "Chrome app-mode launch failed or Chrome is unavailable; falling back to the default browser."
/usr/bin/open "$URL"
CHROME_LAUNCHER
fi

/bin/cat > "$QUIT_TEMP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>Quit Manta Tracker</string>
  <key>CFBundleExecutable</key><string>quit-manta-tracker</string>
  <key>CFBundleIconFile</key><string>mantatracker</string>
  <key>CFBundleIdentifier</key><string>com.local.mantatracker.quit</string>
  <key>CFBundleName</key><string>Quit Manta Tracker</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
</dict>
</plist>
PLIST

/bin/cat > "$QUIT_TEMP/Contents/MacOS/quit-manta-tracker" <<'QUITTER'
#!/bin/zsh

STOP_SCRIPT="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean/scripts/stop_local_servers.sh"
LOG_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean/logs"

if "$STOP_SCRIPT"; then
  /usr/bin/osascript -e 'display dialog "Local Manta Tracker servers on ports 8080 and 8766 have been stopped." with title "Manta Tracker Stopped" buttons {"OK"} default button "OK" with icon note' >/dev/null 2>&1 || true
  exit 0
fi

/usr/bin/open "$LOG_DIR" >/dev/null 2>&1 || true
/usr/bin/osascript -e 'display dialog "One or more local Manta Tracker servers could not be stopped safely. The launcher logs folder has been opened." with title "Manta Tracker Stop Failed" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
exit 1
QUITTER

/bin/chmod 755 "$MANTA_TEMP/Contents/MacOS/mantatracker"
/bin/chmod 755 "$QUIT_TEMP/Contents/MacOS/quit-manta-tracker"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /bin/chmod 755 "$CHROME_TEMP/Contents/MacOS/manta-tracker-chrome"
fi

/usr/bin/plutil -lint "$MANTA_TEMP/Contents/Info.plist" >/dev/null
/usr/bin/plutil -lint "$QUIT_TEMP/Contents/Info.plist" >/dev/null
/bin/zsh -n "$MANTA_TEMP/Contents/MacOS/mantatracker"
/bin/zsh -n "$QUIT_TEMP/Contents/MacOS/quit-manta-tracker"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /usr/bin/plutil -lint "$CHROME_TEMP/Contents/Info.plist" >/dev/null
  /bin/zsh -n "$CHROME_TEMP/Contents/MacOS/manta-tracker-chrome"
fi

/usr/bin/ditto "$MANTA_TEMP" "$MANTA_APP"
/usr/bin/ditto "$QUIT_TEMP" "$QUIT_APP"
/usr/bin/touch "$MANTA_APP" "$QUIT_APP"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /usr/bin/ditto "$CHROME_TEMP" "$CHROME_APP"
  /usr/bin/touch "$CHROME_APP"
fi

/bin/echo "Created or updated: $MANTA_APP"
/bin/echo "Created or updated: $QUIT_APP"
if [[ "$CREATE_CHROME_FALLBACK" == "1" ]]; then
  /bin/echo "Created or updated optional fallback: $CHROME_APP"
else
  /bin/echo "Skipped Chrome fallback (set CREATE_CHROME_FALLBACK=1 to create it)."
fi
/bin/echo "Launcher backups: $BACKUP_DIR"
