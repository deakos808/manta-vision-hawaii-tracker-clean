#!/bin/bash

# Number of rows per batch (should match PAGE_SIZE in Edge Function)
LIMIT=10

# Estimate total number of mantas to embed
TOTAL=800

# Supabase function endpoint
FN_URL="https://apweteosdbgsolmvcmhn.supabase.co/functions/v1/embeddings-manta"

# Optional: paste your anon key here or export from shell
AUTH="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5ODc4MjksImV4cCI6MjA2MjU2MzgyOX0.tjo2en6kNIIAcpZH_hvyG_CbXB1AIfwCajR1CdTaXv4"

echo "🚀 Starting Manta Embedding Batch Loop..."

for ((OFFSET=0; OFFSET<TOTAL; OFFSET+=LIMIT)); do
  echo -e "\n🔄 Running batch at offset: $OFFSET"
  
  curl -s -N "${FN_URL}?offset=${OFFSET}" \
    -H "Authorization: Bearer $AUTH" \
    --max-time 60 \
    -o "embedding-log-offset-${OFFSET}.txt"

  echo "✅ Saved log: embedding-log-offset-${OFFSET}.txt"
  sleep 2
done

echo -e "\n🎉 All batches submitted."
