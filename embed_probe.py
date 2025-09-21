import os, sys, random, subprocess
def ensure(p):
    try: __import__(p)
    except ImportError: subprocess.check_call([sys.executable,"-m","pip","install",p])
for p in ("requests",): ensure(p)
import requests

SUPABASE_URL=os.environ.get("SUPABASE_URL","").rstrip("/")
SERVICE_ROLE_KEY=os.environ.get("SERVICE_ROLE_KEY","")
IMAGE_BUCKET=os.environ.get("IMAGE_BUCKET","manta-images")
EMBED=os.environ.get("EMBED_SERVER_URL","http://127.0.0.1:5050/embed")
REST=f"{SUPABASE_URL}/rest/v1"
PUB=f"{SUPABASE_URL}/storage/v1/object/public"
HDRS={"apikey":SERVICE_ROLE_KEY,"Authorization":f"Bearer {SERVICE_ROLE_KEY}"}

def build_public_url(storage_path, thumbnail_url):
    p=(thumbnail_url or storage_path or "").strip()
    if not p: return None
    if p.startswith(("http://","https://")): return p
    if p.startswith("storage/v1/object/public/"): return f"{SUPABASE_URL}/{p.lstrip('/')}"
    return f"{PUB}/{IMAGE_BUCKET}/{p.lstrip('/')}"

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("Set SUPABASE_URL and SERVICE_ROLE_KEY"); sys.exit(1)

q={"select":"pk_photo_id,storage_path,thumbnail_url,photo_view","photo_view":"eq.ventral","limit":"50","order":"pk_photo_id.asc"}
r=requests.get(f"{REST}/photos",params=q,headers=HDRS,timeout=60); r.raise_for_status()
rows=r.json(); random.seed(42); random.shuffle(rows)

url=None; pid=None
for row in rows:
    u=build_public_url(row.get("storage_path"), row.get("thumbnail_url"))
    if u: url=u; pid=row["pk_photo_id"]; break
if not url:
    print("No public image url found"); sys.exit(1)
print("TEST URL:", url, "pid:", pid)

def try_json(payload):  return requests.post(EMBED, json=payload, timeout=60)
def try_upload(u):
    img=requests.get(u,timeout=60); img.raise_for_status()
    return requests.post(EMBED, files={"file":("img.jpg", img.content, "application/octet-stream")}, timeout=120)

tests=[
  ("json:image_url", lambda: try_json({"image_url":url})),
  ("json:url",       lambda: try_json({"url":url})),
  ("json:image",     lambda: try_json({"image":url})),
  ("form:file",      lambda: try_upload(url)),
]

for name,fn in tests:
    try:
        resp=fn(); print(f"\n{name} -> {resp.status_code}")
        try:
            js=resp.json()
            print("json keys:", list(js)[:10])
            if "detail" in js: print("detail:", js["detail"])
            for k in ("vector","embedding","data","emb","features"):
                if isinstance(js.get(k), list):
                    print(f"candidate '{k}' len={len(js[k])}")
                    break
        except Exception:
            print("body:", resp.text[:300].replace("\n"," "))
    except Exception as e:
        print(f"\n{name} -> EXC {e}")
