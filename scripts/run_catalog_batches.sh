#!/bin/bash

# Number of rows per batch
LIMIT=10

# Estimated total rows — adjust this!
TOTAL=300

for ((OFFSET=0; OFFSET<TOTAL; OFFSET+=LIMIT)); do
  echo "📦 Processing offset $OFFSET..."
  curl -s -X POST http://localhost:54321/functions/v1/embeddings-catalog \
    -H "Content-Type: application/json" \
    -d "{\"offset\": $OFFSET, \"limit\": $LIMIT}"
  echo -e "\n✅ Finished batch $OFFSET"
  sleep 1
done

echo "🎉 All batches complete."

