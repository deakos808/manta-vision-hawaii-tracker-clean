#!/usr/bin/env python3
import argparse, json, math, urllib.request

def post_json(url, payload, timeout=60):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)

def cosine(a, b):
    dot = sum(x*y for x, y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a)) or 1.0
    nb = math.sqrt(sum(y*y for y in b)) or 1.0
    return dot/(na*nb)

def embed(embed_url, image_url):
    j = post_json(embed_url, {"image_url": image_url})
    v = j.get("embedding") or j.get("vector") or j.get("data") or j.get("v")
    if not isinstance(v, list): raise RuntimeError(f"No embedding array: {j}")
    return v

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed", default="http://127.0.0.1:5050/embed")
    ap.add_argument("urls", nargs="+")
    a = ap.parse_args()

    vecs = [embed(a.embed, u) for u in a.urls]
    n = len(vecs)
    for i in range(n):
        row = [cosine(vecs[i], vecs[j]) for j in range(n)]
        print("\t".join(f"{v:.6f}" for v in row))
