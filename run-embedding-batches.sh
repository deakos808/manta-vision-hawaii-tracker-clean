#!/bin/bash

# Number of rows per batch (should match PAGE_SIZE in Edge Function)
LIMIT=10

# Estimate total number of mantas to embed
TOTAL=800

# Supabase function endpoint
FN_URL="https://apweteosdbgsolmvcmhn.supabase.co/functions/v1/embeddings-manta"

# Optional: paste your anon key here or export from shell
AUTH="JWT_REDACTED"

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
