import os, sys, random, subprocess
def ensure(p):
    try: __import__(p)
    except ImportError: subprocess.check_call([sys.executable,"-m","pip","install",p])
for p in ("requests","numpy"): ensure(p)
import requests, numpy as np

SUPABASE_URL=os.environ.get("SUPABASE_URL","").rstrip("/")
SERVICE_ROLE_KEY=os.environ.get("SERVICE_ROLE_KEY","")
IMAGE_BUCKET=os.environ.get("IMAGE_BUCKET","manta-images")
EMBED=os.environ.get("EMBED_SERVER_URL","http://127.0.0.1:5050/embed")
VEC_DIM=1024
REST=f"{SUPABASE_URL}/rest/v1"; PUB=f"{SUPABASE_URL}/storage/v1/object/public"
HDRS={"apikey":SERVICE_ROLE_KEY,"Authorization":f"Bearer {SERVICE_ROLE_KEY}"}

def pub_url(storage_path, thumb):
    p=(thumb or storage_path or "").strip()
    if not p: return None
    if p.startswith(("http://","https://")): return p
    if p.startswith("storage/v1/object/public/"): return f"{SUPABASE_URL}/{p.lstrip('/')}"
    return f"{PUB}/{IMAGE_BUCKET}/{p.lstrip('/')}"

def embed_url(u):
    r=requests.post(EMBED, json={"image_url":u}, timeout=120)
    if r.status_code!=200: return None, f"http {r.status_code}: {r.text[:140].replace(chr(10),' ')}"
    js=r.json(); v=js.get("vector") or js.get("embedding")
    if v is None: return None, "no vector key"
    a=np.asarray(v, dtype=np.float32)
    if a.ndim==2 and a.shape[1]==VEC_DIM: a=a[0]
    if a.ndim!=1 or a.shape[0]!=VEC_DIM: return None, f"bad shape {a.shape}"
    n=np.linalg.norm(a); 
    if not np.isfinite(n) or n==0: return None, "bad norm"
    return a/n, None

q={"select":"pk_photo_id,storage_path,thumbnail_url,photo_view","photo_view":"eq.ventral","limit":"60","order":"pk_photo_id.asc"}
rows=requests.get(f"{REST}/photos",params=q,headers=HDRS,timeout=60).json()
random.seed(42); random.shuffle(rows)
items=[{"pid":r["pk_photo_id"],"url":pub_url(r.get("storage_path"),r.get("thumbnail_url"))} for r in rows]
items=[x for x in items if x["url"]]

v1,e1=embed_url(items[0]["url"]); v2,e2=embed_url(items[0]["url"])
rep=float(np.dot(v1,v2)) if (v1 is not None and v2 is not None) else None
ok,bad,norms=[],[],[]
for it in items:
    v,err=embed_url(it["url"])
    if v is None: bad.append({"pid":it["pid"],"err":err})
    else: norms.append(float(np.linalg.norm(v))); ok.append({"pid":it["pid"],"vec":v})

print("\n=== Embed Server Smoke Test ===")
print(f"Server: {EMBED}")
print(f"Repeatability (same URL twice) cosine: {rep:.4f}" if rep is not None else "Repeatability: n/a")
print(f"Embeddings ok: {len(ok)} / {len(items)} ; failures: {len(bad)}")
if bad: 
    print("Failures (up to 10):")
    for b in bad[:10]: print("  pid=",b["pid"], "err=", b["err"])
if norms: 
    import numpy as np
    print(f"Norms: mean={np.mean(norms):.4f} min={np.min(norms):.4f} max={np.max(norms):.4f}")
