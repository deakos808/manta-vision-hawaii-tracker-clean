#!/usr/bin/env python3
import argparse, json, math, sys, urllib.request

def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)

def cosine(a, b):
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x*y for x, y in zip(a, b)) / (na * nb)

def embed(embed_url, image_url):
    j = post_json(embed_url, {"image_url": image_url})
    v = j.get("embedding") or j.get("vector") or j.get("data") or j.get("v")
    if not isinstance(v, list):
        raise RuntimeError("No embedding array in response")
    return v

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True, help="Public URL to the SAME image")
    p.add_argument("--repeats", type=int, default=5, help="How many times to re-embed")
    p.add_argument("--embed", default="http://127.0.0.1:5050/embed", help="Embedding server URL")
    p.add_argument("--other-url", help="Optional second image to compare against")
    args = p.parse_args()

    runs = [embed(args.embed, args.url) for _ in range(args.repeats)]
    n = len(runs)

    print(f"Got {n} embeddings for {args.url}")
    # cosine matrix
    M = [[cosine(runs[i], runs[j]) for j in range(n)] for i in range(n)]
    print("\nSame-image cosine matrix:")
    for row in M:
        print("\t".join(f"{v:.6f}" for v in row))
    off_diag = [M[i][j] for i in range(n) for j in range(n) if i != j]
    print(f"\nmin same-image cosine: {min(off_diag):.6f}  (expect ≳ 0.990; if deterministic, ≈ 1.000000)")

    if args.other_url:
        other = embed(args.embed, args.other_url)
        cross = [cosine(v, other) for v in runs]
        print(f"\nCross-image cosines vs {args.other_url}:")
        print("\t".join(f"{v:.6f}" for v in cross))
        print("(Different mantas should be meaningfully lower than same-image; near-dupes will be high.)")

if __name__ == "__main__":
    sys.exit(main())
