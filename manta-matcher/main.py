import os
import io
import json
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
from PIL import Image
import torch
import clip
import asyncio

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

# FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Manta Matcher is running"}

@app.post("/match/")
async def match_photo(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        preprocessed = preprocess(image).unsqueeze(0).to(device)

        with torch.no_grad():
            query_embedding = model.encode_image(preprocessed).cpu().numpy()[0]
            norm = np.linalg.norm(query_embedding)
            if norm == 0:
                return JSONResponse(status_code=400, content={"error": "Invalid image vector"})
            query_embedding /= norm

        response = supabase.table("photo_embeddings").select("photo_id, embedding").execute()
        if not response.data:
            return JSONResponse(status_code=404, content={"error": "No embeddings found in database"})

        similarities = []
        for entry in response.data:
            try:
                stored_vector = np.array(json.loads(entry["embedding"]), dtype=np.float32)
                stored_norm = np.linalg.norm(stored_vector)
                if stored_norm > 0:
                    stored_vector /= stored_norm
                sim = np.dot(query_embedding, stored_vector)
                similarities.append((entry["photo_id"], sim))
            except Exception as e:
                print(f"Skipping photo_id {entry['photo_id']} due to error: {e}")

        top_matches = sorted(similarities, key=lambda x: -x[1])[:50]
        photo_ids = [pid for pid, _ in top_matches]

        photos_resp = (
            supabase
            .table("photos")
            .select("id, storage_path")
            .in_("id", photo_ids)
            .execute()
        )

        photo_url_map = {}
        if photos_resp.data:
            for p in photos_resp.data:
                path = p.get("storage_path")
                if path:
                    url = f"https://{SUPABASE_URL.split('//')[1]}/storage/v1/object/public/manta-images/{path}"
                    photo_url_map[p["id"]] = url

        result = [
            {
                "photo_id": pid,
                "similarity": round(float(score), 4),
                "photo_url": photo_url_map.get(pid)
            }
            for pid, score in top_matches
        ]

        return {
            "filename": file.filename,
            "matches": result
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

def fetch_valid_vectors(photo_ids):
    vectors = []
    for pid in photo_ids:
        emb_resp = (
            supabase
            .from_("photo_embeddings")
            .select("embedding")
            .eq("photo_id", pid)
            .execute()
        )
        if emb_resp.data and emb_resp.data[0]["embedding"]:
            try:
                vec = np.array(json.loads(emb_resp.data[0]["embedding"]), dtype=np.float32)
                vectors.append(vec)
            except Exception as e:
                print(f"Invalid vector for photo {pid}: {e}")
    return vectors

@app.post("/update-catalog-embeddings")
async def update_all_catalog_embeddings():
    try:
        catalog_resp = supabase.table("catalog").select("pk_catalog_id").execute()
        if not catalog_resp.data:
            return JSONResponse(status_code=404, content={"error": "No catalog records found"})

        updated = []
        skipped = []
        batch_size = 100
        cache = {}

        for i in range(0, len(catalog_resp.data), batch_size):
            batch = catalog_resp.data[i:i+batch_size]
            for row in batch:
                catalog_id = row["pk_catalog_id"]
                if catalog_id in cache:
                    continue
                result = update_catalog_embedding_internal(catalog_id)
                cache[catalog_id] = result
                if result["status"] == "updated":
                    updated.append(catalog_id)
                else:
                    skipped.append({"id": catalog_id, "reason": result.get("reason", "unknown")})

        return {"updated_catalogs": updated, "skipped": skipped}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/update-catalog-embeddings/{catalog_id}")
async def update_catalog_embedding(catalog_id: int):
    try:
        result = update_catalog_embedding_internal(catalog_id)
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

def update_catalog_embedding_internal(catalog_id: int):
    try:
        photo_resp = (
            supabase
            .from_("photos_with_catalog_view")
            .select("id")
            .eq("fk_catalog_id", catalog_id)
            .eq("is_best_catalog_photo", True)
            .execute()
        )
        photo_ids = [row["id"] for row in photo_resp.data if "id" in row]
        if not photo_ids:
            return {"status": "skipped", "reason": "No best catalog photos found"}

        vectors = fetch_valid_vectors(photo_ids)
        if not vectors:
            return {"status": "skipped", "reason": "No valid embeddings"}

        avg_vector = np.mean(vectors, axis=0)
        norm = np.linalg.norm(avg_vector)
        if norm > 0:
            avg_vector /= norm

        supabase.table("catalog").update({
            "embedding_vector": avg_vector.tolist()
        }).eq("pk_catalog_id", catalog_id).execute()

        return {"status": "updated", "catalog_id": catalog_id}

    except Exception as e:
        return {"status": "error", "reason": str(e)}

@app.post("/update-sighting-embeddings")
async def update_all_sighting_embeddings():
    try:
        resp = supabase.table("sightings").select("pk_sighting_id").execute()
        if not resp.data:
            return JSONResponse(status_code=404, content={"error": "No sightings found"})

        updated = []
        skipped = []
        batch_size = 100
        cache = {}

        for i in range(0, len(resp.data), batch_size):
            batch = resp.data[i:i+batch_size]
            for row in batch:
                sighting_id = row["pk_sighting_id"]
                if sighting_id in cache:
                    continue
                result = update_sighting_embedding_internal(sighting_id)
                cache[sighting_id] = result
                if result["status"] == "updated":
                    updated.append(sighting_id)
                else:
                    skipped.append({"id": sighting_id, "reason": result.get("reason", "unknown")})

        return {"updated_sightings": updated, "skipped": skipped}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

def update_sighting_embedding_internal(sighting_id: int):
    try:
        photo_resp = (
            supabase
            .from_("photos")
            .select("id")
            .eq("fk_sighting_id", sighting_id)
            .eq("is_best_sighting_photo", True)
            .execute()
        )

        photo_ids = [row["id"] for row in photo_resp.data if "id" in row]
        if not photo_ids:
            return {"status": "skipped", "reason": "No best sighting photos found"}

        vectors = fetch_valid_vectors(photo_ids)
        if not vectors:
            return {"status": "skipped", "reason": "No valid embeddings"}

        avg_vector = np.mean(vectors, axis=0)
        norm = np.linalg.norm(avg_vector)
        if norm > 0:
            avg_vector /= norm

        supabase.table("sightings").update({
            "embedding_vector": avg_vector.tolist()
        }).eq("pk_sighting_id", sighting_id).execute()

        return {"status": "updated", "sighting_id": sighting_id}

    except Exception as e:
        return {"status": "error", "reason": str(e)}

@app.get("/stream-sighting-embedding-update")
async def stream_sighting_embedding_update():
    async def event_generator():
        try:
            resp = supabase.table("sightings").select("pk_sighting_id").execute()
            if not resp.data:
                yield f"data: {json.dumps({'log': 'No sightings found', 'progress': 0, 'done': True})}\n\n"
                return

            total = len(resp.data)
            for i, row in enumerate(resp.data):
                sighting_id = row["pk_sighting_id"]
                result = update_sighting_embedding_internal(sighting_id)

                if result["status"] == "updated":
                    log = f"✅ Updated sighting {sighting_id}"
                else:
                    reason = result.get("reason", "unknown")
                    log = f"⚠️ Skipped sighting {sighting_id}: {reason}"

                progress = int(((i + 1) / total) * 100)
                yield f"data: {json.dumps({'log': log, 'progress': progress, 'done': False})}\n\n"
                await asyncio.sleep(0.01)

            yield f"data: {json.dumps({'log': '🎉 Sighting update complete.', 'progress': 100, 'done': True})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'log': f'Error: {str(e)}', 'progress': 0, 'done': True})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
