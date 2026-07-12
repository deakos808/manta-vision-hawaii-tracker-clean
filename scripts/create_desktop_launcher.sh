#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean"
APPS_DIR="/Users/littlemac/Desktop/Codex APPs"
BACKUP_DIR="/Users/littlemac/Desktop/Codex Launcher Backups"
MANTA_APP="$APPS_DIR/mantatracker.app"
QUIT_APP="$APPS_DIR/Quit Manta Tracker.app"
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

MANTA_TEMP="$TEMP_ROOT/mantatracker.app"
QUIT_TEMP="$TEMP_ROOT/Quit Manta Tracker.app"

/bin/mkdir -p "$MANTA_TEMP/Contents/MacOS" "$MANTA_TEMP/Contents/Resources"
/bin/mkdir -p "$QUIT_TEMP/Contents/MacOS" "$QUIT_TEMP/Contents/Resources"

# Preserve the installed custom icon resources when updating an existing launcher.
if [[ -d "$MANTA_APP/Contents/Resources" ]]; then
  /usr/bin/ditto "$MANTA_APP/Contents/Resources" "$MANTA_TEMP/Contents/Resources"
elif [[ -f "$PROJECT_DIR/public/manta-pacific-logo.png" ]]; then
  /bin/cp "$PROJECT_DIR/public/manta-pacific-logo.png" "$MANTA_TEMP/Contents/Resources/mantatracker-base.png"
fi

if [[ -d "$MANTA_TEMP/Contents/Resources" ]]; then
  /usr/bin/ditto "$MANTA_TEMP/Contents/Resources" "$QUIT_TEMP/Contents/Resources"
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
FRONTEND_PORT="8080"
MATCHER_PORT="8766"
URL="http://127.0.0.1:8080/"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/launcher.log"

/bin/mkdir -p "$LOG_DIR"
/usr/bin/touch "$LOG_FILE"

log_message() {
  /bin/echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

port_is_listening() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

show_startup_error() {
  log_message "ERROR: Local Manta Ray App did not become available at $URL."
  /usr/bin/open "$LOG_DIR" >/dev/null 2>&1 || true
  /usr/bin/osascript -e 'display dialog "Manta Ray App could not start on port 8080. The launcher logs folder has been opened. Review launcher.log for details." with title "Manta Ray App Startup Failed" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
}

log_message "Launcher invoked."

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

log_message "Frontend is responding at $URL."

if /usr/bin/open -Ra "Google Chrome" >/dev/null 2>&1; then
  if /usr/bin/open -na "Google Chrome" --args --app="$URL"; then
    log_message "Opened $URL in Google Chrome app mode."
    exit 0
  fi
  log_message "Chrome app-mode launch failed; falling back to the default browser."
else
  log_message "Google Chrome is unavailable; falling back to the default browser."
fi

if /usr/bin/open "$URL"; then
  log_message "Opened $URL in the default browser."
  exit 0
fi

log_message "ERROR: Frontend started, but no browser could be opened."
/usr/bin/open "$LOG_DIR" >/dev/null 2>&1 || true
/usr/bin/osascript -e 'display dialog "Manta Ray App started, but the browser could not be opened. The launcher logs folder has been opened." with title "Manta Ray App Browser Error" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
exit 1
LAUNCHER

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

/usr/bin/plutil -lint "$MANTA_TEMP/Contents/Info.plist" >/dev/null
/usr/bin/plutil -lint "$QUIT_TEMP/Contents/Info.plist" >/dev/null
/bin/zsh -n "$MANTA_TEMP/Contents/MacOS/mantatracker"
/bin/zsh -n "$QUIT_TEMP/Contents/MacOS/quit-manta-tracker"

/usr/bin/ditto "$MANTA_TEMP" "$MANTA_APP"
/usr/bin/ditto "$QUIT_TEMP" "$QUIT_APP"
/usr/bin/touch "$MANTA_APP" "$QUIT_APP"

/bin/echo "Created or updated: $MANTA_APP"
/bin/echo "Created or updated: $QUIT_APP"
/bin/echo "Launcher backups: $BACKUP_DIR"
