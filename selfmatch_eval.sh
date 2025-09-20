#!/usr/bin/env bash
# selfmatch_eval.sh — best-manta-ventral vs catalog-best-ventral (same catalog)
# Logs detailed progress so we can spot where things go wrong.
# ENV: SUPABASE_URL, SERVICE_ROLE_KEY
# Optional: IMAGE_BUCKET (default manta-images), EMBED_SERVER_URL (default http://127.0.0.1:5050/embed)
# Optional: EMBED_PAYLOAD_KEY=image_url, EMBED_RESPONSE_KEY=embedding

set -euo pipefail

python3 - "$@" <<'PY'
import os, sys, time, subprocess, json, random
def ensure(p):
    try: __import__(p)
    except ImportError: subprocess.check_call([sys.executable,"-m","pip","install",p])
for p in ("requests","numpy","pandas","tabulate"):
    ensure(p)

import requests, numpy as np, pandas as pd
from tabulate import tabulate

SUPABASE_URL = os.environ.get("SUPABASE_URL","").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SERVICE_ROLE_KEY","")
IMAGE_BUCKET = os.environ.get("IMAGE_BUCKET","manta-images")
EMBED_SERVER_URL = os.environ.get("EMBED_SERVER_URL","http://127.0.0.1:5050/embed")
EMBED_PAYLOAD_KEY = os.environ.get("EMBED_PAYLOAD_KEY","image_url")
EMBED_RESPONSE_KEY = os.environ.get("EMBED_RESPONSE_KEY","embedding")
VEC_DIM = 1024

def log(msg): print(msg, flush=True)
def j(obj): return json.dumps(obj, indent=2)

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("ERROR: set SUPABASE_URL and SERVICE_ROLE_KEY", file=sys.stderr); sys.exit(1)

REST = f"{SUPABASE_URL}/rest/v1"
PUB  = f"{SUPABASE_URL}/storage/v1/object/public"
HDRS = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer":"count=exact"}

log("=== Config ===")
log(j({"SUPABASE_URL": SUPABASE_URL, "IMAGE_BUCKET": IMAGE_BUCKET, "EMBED_SERVER_URL": EMBED_SERVER_URL,
       "EMBED_PAYLOAD_KEY": EMBED_PAYLOAD_KEY, "EMBED_RESPONSE_KEY": EMBED_RESPONSE_KEY}))

def storage_public_url(storage_path, thumbnail_url):
    p = (thumbnail_url or storage_path or "").strip()
    if not p: return None
    if p.startswith(("http://","https://")): return p
    if p.startswith("storage/v1/object/public/"): return f"{SUPABASE_URL}/{p.lstrip('/')}"
    return f"{PUB}/{IMAGE_BUCKET}/{p.lstrip('/')}"

def get_json(url, params=None, retry=3):
    for i in range(retry):
        try:
            r = requests.get(url, params=params, headers=HDRS, timeout=60)
            if r.status_code in (200,206): return r.json()
            raise RuntimeError(f"GET {url} -> {r.status_code} {r.text[:160]}")
        except Exception as e:
            if i == retry-1: raise
            time.sleep(1 + 0.5*i)

def EMBED_F(image_url: str):
    try:
        payload = {EMBED_PAYLOAD_KEY: image_url}
        r = requests.post(EMBED_SERVER_URL, json=payload, headers={"Content-Type":"application/json"}, timeout=180)
        if r.status_code != 200:
            txt = r.text[:180].replace("\n"," ")
            print(f"embed HTTP {r.status_code} {txt}", file=sys.stderr)
            return None
        js = r.json()
        vec = js.get(EMBED_RESPONSE_KEY) or js.get("vector")
        if vec is None:
            print("embed: missing vector key", file=sys.stderr)
            return None
        v = np.asarray(vec, dtype=np.float32)
        if v.ndim == 2 and v.shape[1] == VEC_DIM: v = v[0]
        if v.ndim != 1 or v.shape[0] != VEC_DIM:
            print(f"embed: bad shape {getattr(v,'shape',None)}", file=sys.stderr)
            return None
        n = np.linalg.norm(v)
        if not np.isfinite(n) or n == 0.0: return None
        return v / n
    except Exception as e:
        print(f"embed exception {e}", file=sys.stderr)
        return None

# --- Step 1: fetch catalogs with a ventral pointer ---
log("\n[1/5] Fetching catalogs with best_cat_mask_ventral_id_int …")
cats = get_json(f"{REST}/catalog", params={
    "select":"pk_catalog_id,best_cat_mask_ventral_id_int",
    "best_cat_mask_ventral_id_int":"not.is.null",
    "limit":"200000",
}) or []
log(f"catalogs with pointer: {len(cats)}")

if not cats:
    log("No catalogs with ventral pointer. STOP."); sys.exit(0)

pointer_ids = [c["best_cat_mask_ventral_id_int"] for c in cats if c.get("best_cat_mask_ventral_id_int") is not None]
log(f"unique pointer photo ids: {len(set(pointer_ids))}")

# --- Step 2: fetch those photo rows & validate ventral + flag ---
log("\n[2/5] Fetching referenced photo rows …")
ref_rows = {}
for i in range(0, len(pointer_ids), 1000):
    chunk = pointer_ids[i:i+1000]
    idlist = f"({','.join(str(x) for x in chunk)})"
    rows = get_json(f"{REST}/photos", params={
        "select":"pk_photo_id,storage_path,thumbnail_url,photo_view,is_best_catalog_ventral_photo",
        "pk_photo_id": f"in.{idlist}",
    }) or []
    for r in rows:
        ref_rows[r["pk_photo_id"]] = r

valid_refs = {}
bad_refs = []
for c in cats:
    cid = c["pk_catalog_id"]; pid = c["best_cat_mask_ventral_id_int"]
    pr = ref_rows.get(pid)
    if not pr:
        bad_refs.append({"catalog_id": cid, "ref_photo_id": pid, "reason":"missing photo row"})
        continue
    if pr.get("photo_view") != "ventral":
        bad_refs.append({"catalog_id": cid, "ref_photo_id": pid, "reason":f"photo_view={pr.get('photo_view')}"})
        continue
    if not bool(pr.get("is_best_catalog_ventral_photo")):
        bad_refs.append({"catalog_id": cid, "ref_photo_id": pid, "reason":"flag not true"})
        continue
    url = storage_public_url(pr.get("storage_path"), pr.get("thumbnail_url"))
    valid_refs[cid] = {"ref_photo_id": pid, "ref_url": url}

log(f"valid ventral refs: {len(valid_refs)} ; issues: {len(bad_refs)}")
if bad_refs[:5]:
    log("examples of issues (up to 5):")
    for x in bad_refs[:5]: log("  " + j(x))

if not valid_refs:
    log("No valid references after checks. STOP."); sys.exit(0)

# --- Step 3: fetch queries (best manta ventral per manta) ---
log("\n[3/5] Fetching best-manta ventral queries …")
cid_list = list(valid_refs.keys())
out = []
for i in range(0, len(cid_list), 1000):
    chunk = cid_list[i:i+1000]
    idlist = f"({','.join(str(x) for x in chunk)})"
    rows = get_json(f"{REST}/photos", params={
        "select":"pk_photo_id,fk_catalog_id,fk_manta_id,storage_path,thumbnail_url,photo_view,is_best_manta_ventral_photo",
        "fk_catalog_id": f"in.{idlist}",
        "is_best_manta_ventral_photo": "is.true",
        "photo_view": "eq.ventral",
        "limit": "200000",
    }) or []
    for r in rows:
        if r.get("fk_catalog_id") is None or r.get("fk_manta_id") is None: continue
        out.append({
            "catalog_id": r["fk_catalog_id"],
            "manta_id": r["fk_manta_id"],
            "q_photo_id": r["pk_photo_id"],
            "q_url": storage_public_url(r.get("storage_path"), r.get("thumbnail_url")),
        })
# one query per (catalog, manta)
seen=set(); queries=[]
for r in out:
    key=(r["catalog_id"], r["manta_id"])
    if key in seen: continue
    seen.add(key); queries.append(r)

log(f"query candidates (unique by catalog,manta): {len(queries)}")
# exclude identical photo as both ref and query
queries = [q for q in queries if q["q_photo_id"] != valid_refs[q["catalog_id"]]["ref_photo_id"]]
log(f"queries after excluding same-photo-as-ref: {len(queries)}")

if not queries:
    log("No queries to compare. STOP."); sys.exit(0)

# --- Step 4: quick embed sanity on first 3 pairs ---
log("\n[4/5] Quick embed sanity on first 3 pairs …")
sample = queries[:3]
ref_vec = {}
# embed needed refs first
need_cids = sorted({q["catalog_id"] for q in sample})
for cid in need_cids:
    v = EMBED_F(valid_refs[cid]["ref_url"])
    ref_vec[cid] = v
    log(f"ref embed cid={cid} ok={v is not None}")

for q in sample:
    vq = EMBED_F(q["q_url"])
    vr = ref_vec[q["catalog_id"]]
    ok = vq is not None and vr is not None
    cos = float(np.dot(vq, vr)) if ok else None
    log(j({"catalog_id": q["catalog_id"], "manta_id": q["manta_id"], "q_photo_id": q["q_photo_id"], "cos_ref": cos}))

# --- Step 5: full run + outputs ---
log("\n[5/5] Full run … this can take a bit.")
ref_cache = {}
rows = []; skipped = 0
for q in queries:
    cid = q["catalog_id"]
    if cid not in ref_cache:
        vv = EMBED_F(valid_refs[cid]["ref_url"])
        if vv is None: skipped += 1; continue
        ref_cache[cid] = vv
    vq = EMBED_F(q["q_url"])
    if vq is None: skipped += 1; continue
    cos = float(np.dot(vq, ref_cache[cid]))
    rows.append({
        "catalog_id": cid,
        "manta_id": q["manta_id"],
        "q_photo_id": q["q_photo_id"],
        "ref_photo_id": valid_refs[cid]["ref_photo_id"],
        "q_path": q["q_url"],
        "ref_path": valid_refs[cid]["ref_url"],
        "cos_ref": cos,
    })

if not rows:
    log("No comparable query/ref pairs produced output (all skipped). STOP."); sys.exit(0)

df = pd.DataFrame(rows).sort_values("cos_ref", ascending=False)
df.to_csv("selfmatch_casewise.csv", index=False)

cos = df["cos_ref"].values
summary = {
    "n_catalogs": len(valid_refs),
    "n_queries": int(df.shape[0]),
    "mean": float(np.mean(cos)),
    "median": float(np.median(cos)),
    "std": float(np.std(cos)),
    "p5": float(np.percentile(cos,5)),
    "p50": float(np.percentile(cos,50)),
    "p95": float(np.percentile(cos,95)),
    "bins": {
        ">=0.95": int((cos >= 0.95).sum()),
        "0.90-0.95": int(((cos >= 0.90) & (cos < 0.95)).sum()),
        "0.80-0.90": int(((cos >= 0.80) & (cos < 0.90)).sum()),
        "0.70-0.80": int(((cos >= 0.70) & (cos < 0.80)).sum()),
        "<0.70": int((cos < 0.70).sum()),
    },
}
with open("selfmatch_summary.json","w") as f: json.dump(summary, f, indent=2)

log("\n=== Self-Match Summary ===")
log(j(summary))

worst = df.sort_values("cos_ref", ascending=True).head(10)
log("\n=== 10 Lowest cos_ref (hard cases) ===")
log(tabulate(worst[["catalog_id","manta_id","q_photo_id","ref_photo_id","cos_ref","q_path","ref_path"]],
             headers="keys", tablefmt="github", floatfmt=".4f"))
log("\nWrote selfmatch_casewise.csv and selfmatch_summary.json")
PY
