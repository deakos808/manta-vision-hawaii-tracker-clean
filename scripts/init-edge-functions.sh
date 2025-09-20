#!/bin/bash

echo "📦 Initializing Supabase Edge Function folders..."

BASE_DIR="supabase/functions"
FUNCTIONS=("create-user" "delete-user" "repair-profile")

for fn in "${FUNCTIONS[@]}"; do
  FN_DIR="$BASE_DIR/$fn"
  FN_FILE="$FN_DIR/index.ts"

  if [ ! -d "$FN_DIR" ]; then
    mkdir -p "$FN_DIR"
    echo "📁 Created: $FN_DIR"
  fi

  if [ ! -f "$FN_FILE" ]; then
    touch "$FN_FILE"
    echo "// $fn function entry" > "$FN_FILE"
    echo "📝 Created placeholder: $FN_FILE"
  else
    echo "✅ Exists: $FN_FILE"
  fi
done

echo "✅ All done! You can now paste function code into each index.ts file."
echo "➡️ Example: code supabase/functions/create-user/index.ts"
