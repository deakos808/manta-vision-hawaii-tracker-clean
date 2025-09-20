#!/bin/bash

PROJECT_REF="apweteosdbgsolmvcmhn"
FUNCTIONS_DIR="./supabase/functions"
ENV_FILE=".env"

# Spinner setup
spin() {
  local -a marks=( '/' '-' '\' '|' )
  while :; do
    for m in "${marks[@]}"; do
      printf "\r  ⏳ Deploying: %s " "$m"
      sleep 0.1
    done
  done
}

echo "🚀 Deploying all Supabase Edge Functions..."

# Docker check
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and retry."
  exit 1
fi

# Update version stamp in .env if update-version script exists
if [ -f "scripts/updateVersionEnv.js" ]; then
  echo "📅 Updating VITE_DEPLOYED_AT in .env..."
  npm run update-version
fi

# Loop and deploy each function
for dir in "$FUNCTIONS_DIR"/*/; do
  function_name=$(basename "$dir")

  # Skip helper/shared folders
  if [[ "$function_name" == _* ]]; then
    echo "⏭ Skipping non-function folder: $function_name"
    continue
  fi

  echo "📤 Deploying function: $function_name"
  spin &
  SPIN_PID=$!

  # Deploy function using Supabase CLI (not npx)
  supabase functions deploy "$function_name" --project-ref "$PROJECT_REF" > /dev/null 2>&1

  kill "$SPIN_PID" > /dev/null 2>&1
  wait "$SPIN_PID" 2>/dev/null

  echo -e "\r✅ Deployed: $function_name"
done

echo "🎉 Done: All functions deployed successfully."
