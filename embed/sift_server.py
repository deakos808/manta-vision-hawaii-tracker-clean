import os, time, requests, numpy as np, cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

SIFT_NFEATURES=int(os.getenv("SIFT_NFEATURES","4000"))
SIFT_RATIO=float(os.getenv("SIFT_RATIO","0.75"))
RANSAC_THRESH=float(os.getenv("RANSAC_THRESH","3.0"))
RANSAC_ITERS=int(os.getenv("RANSAC_ITERS","2000"))
RANSAC_CONF=float(os.getenv("RANSAC_CONF","0.995"))
MAX_LONG_EDGE=int(os.getenv("SIFT_MAX_LONG_EDGE","900"))

app = FastAPI(title="SIFT Match Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_sift=cv2.SIFT_create(nfeatures=SIFT_NFEATURES)
_bf=cv2.BFMatcher(cv2.NORM_L2)
_sess=requests.Session()

class SiftReq(BaseModel):
  image_url_a: str
  image_url_b: str

def _fetch_gray(url:str):
  try:
    r=_sess.get(url,timeout=30); r.raise_for_status()
    arr=np.frombuffer(r.content,np.uint8)
    im=cv2.imdecode(arr,cv2.IMREAD_GRAYSCALE)
    if im is None: raise ValueError("cv2.imdecode failed")
    im=cv2.equalizeHist(im)
    h,w=im.shape[:2]; m=max(h,w)
    if m>MAX_LONG_EDGE:
      s=MAX_LONG_EDGE/m; im=cv2.resize(im,(int(w*s),int(h*s)),interpolation=cv2.INTER_AREA)
    return im
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"failed to fetch/decode image: {e}")

def _sift_inliers(im1,im2):
  k1,d1=_sift.detectAndCompute(im1,None)
  k2,d2=_sift.detectAndCompute(im2,None)
  if d1 is None or d2 is None or len(d1)==0 or len(d2)==0:
    return len(k1 or []),len(k2 or []),0,0,0.0
  matches=_bf.knnMatch(d1,d2,k=2)
  good=[m for m,n in matches if len((m,n))==2 and m.distance<SIFT_RATIO*n.distance]
  if len(good)<6: return len(k1),len(k2),len(good),0,0.0
  pts1=np.float32([k1[m.queryIdx].pt for m in good])
  pts2=np.float32([k2[m.trainIdx].pt for m in good])
  H,mask=cv2.findHomography(pts1,pts2,cv2.RANSAC,RANSAC_THRESH,maxIters=RANSAC_ITERS,confidence=RANSAC_CONF)
  inl=int(mask.sum()) if mask is not None else 0
  return len(k1),len(k2),len(good),inl,inl/max(1,len(good))

@app.get("/health")
def health():
  return {"ok":True,"sift_nfeatures":SIFT_NFEATURES,"ratio":SIFT_RATIO,
          "ransac":{"thr":RANSAC_THRESH,"iters":RANSAC_ITERS,"conf":RANSAC_CONF},
          "max_long_edge":MAX_LONG_EDGE}

@app.post("/match/sift")
def match(req:SiftReq):
  t=time.time()
  im1=_fetch_gray(req.image_url_a); im2=_fetch_gray(req.image_url_b)
  kp1,kp2,good,inl,inl_ratio=_sift_inliers(im1,im2)
  return {"ok":True,"kp1":kp1,"kp2":kp2,"good":good,"inliers":inl,"inlier_ratio":inl_ratio,
          "elapsed_ms":int((time.time()-t)*1000),
          "params":{"nfeatures":SIFT_NFEATURES,"ratio":SIFT_RATIO,
                    "ransac":{"thr":RANSAC_THRESH,"iters":RANSAC_ITERS,"conf":RANSAC_CONF},
                    "max_long_edge":MAX_LONG_EDGE}}
