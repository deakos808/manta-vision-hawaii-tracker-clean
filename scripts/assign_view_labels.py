# assign_view_labels.py
import os
import requests
import torch
import clip
from PIL import Image
from io import BytesIO
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

print("Supabase URL:", SUPABASE_URL)
print("Supabase Key present:", bool(SUPABASE_KEY))


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
assert SUPABASE_URL and SUPABASE_KEY, "Missing Supabase env vars"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
        print("Error loading image:", e)
        return "other"

def main():
    print("Fetching photos...")
    photos = supabase.table("photos").select("pk_photo_id, thumbnail_url").limit(5000).execute().data

    for photo in photos:
        pid = photo["pk_photo_id"]
        url = photo["thumbnail_url"]
        if not url:
            continue

        label = classify_view(url)
        print(f"Photo {pid} → {label}")

        # Update Supabase
        supabase.table("photos").update({"view_label": label}).eq("pk_photo_id", pid).execute()

if __name__ == "__main__":
    main()
