import os
import argparse
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

# Optional for auto mode
import torch
import clip
from PIL import Image
from io import BytesIO

# Load env
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
assert SUPABASE_URL and SUPABASE_KEY, "Missing Supabase env vars"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def assign_manual_labels():
    label_map = {
        "ventral": [6, 16, 26, 31, 45, 50, 105, 122, 305, 503, 505, 1665, 1892, 2141, 2250],
        "dorsal": [75, 102, 108, 116, 174, 308, 490, 492, 494, 1108, 1163, 1454, 1455, 1708, 1984],
        "other": [338, 368, 427, 513, 515, 521, 548, 553, 554, 630, 2330, 5072, 5073, 5224, 661],
    }

    updates = []
    for label, ids in label_map.items():
        for pid in ids:
            updates.append({"pk_photo_id": pid, "view_label": label})

    print(f"Updating {len(updates)} photos with manual labels...")
    for record in updates:
        supabase.table("photos").update({"view_label": record["view_label"]}).eq("pk_photo_id", record["pk_photo_id"]).execute()

    print("✅ Manual label assignment complete.")

def assign_auto_labels():
    print("Loading CLIP model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load("ViT-B/32", device=device)

    labels = ["ventral", "dorsal", "other"]
    text_tokens = clip.tokenize([f"a {lbl} view of a manta ray" for lbl in labels]).to(device)

    def classify_view(image_url: str) -> str:
        try:
            response = requests.get(image_url)
            img = Image.open(BytesIO(response.content)).convert("RGB")
            image_tensor = preprocess(img).unsqueeze(0).to(device)

            with torch.no_grad():
                image_features = model.encode_image(image_tensor)
                text_features = model.encode_text(text_tokens)
                probs = (image_features @ text_features.T).softmax(dim=-1)

            pred_index = probs.argmax().item()
            return labels[pred_index]
        except Exception as e:
            print(f"⚠️ Error loading image ({image_url}): {e}")
            return "other"

    print("Fetching up to 5000 photos from Supabase...")
    photos = supabase.table("photos").select("pk_photo_id, thumbnail_url").limit(5000).execute().data

    for photo in photos:
        pid = photo["pk_photo_id"]
        url = photo["thumbnail_url"]
        if not url:
            continue

        label = classify_view(url)
        print(f"Photo {pid} → {label}")
        supabase.table("photos").update({"view_label": label}).eq("pk_photo_id", pid).execute()

    print("✅ Automatic label assignment complete.")

def main():
    parser = argparse.ArgumentParser(description="Assign view_label to manta photos.")
    parser.add_argument("--mode", choices=["manual", "auto"], default="manual", help="Labeling mode: manual or auto (CLIP-based)")

    args = parser.parse_args()
    if args.mode == "manual":
        assign_manual_labels()
    else:
        assign_auto_labels()

if __name__ == "__main__":
    main()
