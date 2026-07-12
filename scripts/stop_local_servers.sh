#!/bin/zsh

set -u

PROJECT_DIR="/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/launcher.log"
TARGET_PORTS=(8080 8766)
CURRENT_UID="$(/usr/bin/id -u)"

/bin/mkdir -p "$LOG_DIR"
/usr/bin/touch "$LOG_FILE"

emit() {
  local message="$*"
  /bin/echo "$message"
  /bin/echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
}

listener_pids=()
for port in "${TARGET_PORTS[@]}"; do
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && listener_pids+=("$pid")
  done < <(/usr/sbin/lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
done

listener_pids=("${(@u)listener_pids}")

if (( ${#listener_pids[@]} == 0 )); then
  emit "No local Manta servers are listening on ports 8080 or 8766."
  exit 0
fi

failure=0
stopped_pids=()

for pid in "${listener_pids[@]}"; do
  owner_uid="$(/bin/ps -o uid= -p "$pid" 2>/dev/null | /usr/bin/tr -d '[:space:]')"
  command_line="$(/bin/ps -o command= -p "$pid" 2>/dev/null)"

  if [[ -z "$owner_uid" || "$owner_uid" != "$CURRENT_UID" ]]; then
    emit "Refusing to stop PID $pid because it is not owned by the current user."
    failure=1
    continue
  fi

  emit "Stopping local listener PID $pid: ${command_line:-unknown command}"
  if /bin/kill -TERM "$pid" 2>/dev/null; then
    stopped_pids+=("$pid")
  else
    emit "Failed to send TERM to PID $pid."
    failure=1
  fi
done

for attempt in {1..10}; do
  remaining=false
  for pid in "${stopped_pids[@]}"; do
    if /bin/kill -0 "$pid" 2>/dev/null; then
      remaining=true
      break
    fi
  done
  [[ "$remaining" == "false" ]] && break
  /bin/sleep 1
done

for pid in "${stopped_pids[@]}"; do
  if /bin/kill -0 "$pid" 2>/dev/null; then
    emit "PID $pid did not stop after TERM; it was not force-killed."
    failure=1
  else
    emit "Stopped PID $pid."
  fi
done

for port in "${TARGET_PORTS[@]}"; do
  if /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    emit "A process is still listening on local port $port."
    failure=1
  else
    emit "Local port $port is clear."
  fi
done

if (( failure != 0 )); then
  emit "One or more local Manta servers could not be stopped safely."
  exit 1
fi

emit "Local Manta Tracker servers stopped successfully."
exit 0
