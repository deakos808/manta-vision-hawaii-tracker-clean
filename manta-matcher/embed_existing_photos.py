# embed_existing_photos.py

import os
import io
import requests
from PIL import Image
import torch
import clip
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
assert SUPABASE_URL and SUPABASE_KEY, "Missing Supabase environment variables"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

# Fetch all photos (id and storage_path only)
print("📥 Fetching photo list...")
try:
    response = supabase.table("photos").select("id, storage_path").execute()
    photos = response.data
except Exception as e:
    print(f"❌ Error fetching photo list: {e}")
    exit(1)

print(f"📸 Found {len(photos)} photos")

# Loop through photos
for photo in photos:
    try:
        photo_id = photo["id"]
        storage_path = photo.get("storage_path")

        if not storage_path:
            print(f"⚠️ Skipping photo_id {photo_id}: missing storage_path")
            continue

        # Construct public image URL
        image_url = f"{SUPABASE_URL}/storage/v1/object/public/manta-images/{storage_path}"
        print(f"➡️ Processing {image_url}")

        image_response = requests.get(image_url)
        image_response.raise_for_status()

        image = Image.open(io.BytesIO(image_response.content)).convert("RGB")
        image_input = preprocess(image).unsqueeze(0).to(device)

        with torch.no_grad():
            embedding = model.encode_image(image_input).cpu().numpy()[0]
            norm = np.linalg.norm(embedding)
            if norm == 0:
                raise ValueError("Zero vector embedding")
            embedding = (embedding / norm).tolist()

        # Upsert embedding into photo_embeddings table
        print(f"✅ Storing embedding for {photo_id}")
        supabase.table("photo_embeddings").upsert({
            "photo_id": photo_id,
            "embedding": embedding,
        }).execute()

    except Exception as e:
        print(f"❌ Failed for photo_id {photo.get('id')}: {e}")
