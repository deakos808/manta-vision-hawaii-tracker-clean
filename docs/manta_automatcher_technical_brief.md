# Hawaii Manta Tracker Automated Ventral Photo-ID Matcher

Technical status brief for review by AI/computer-vision collaborators.

## Objective

Hawaii Manta Tracker is building a local, deterministic, explainable photo-identification pipeline for reef manta rays. The practical goal is to let an admin or citizen-science workflow submit a new ventral manta image and receive catalog candidates sorted by likely identity, ideally placing the correct individual in the top 10 for good-quality resight photos and top 20-50 for lower-quality photos.

The biological target is the ventral pigment pattern: especially dark markings between and around the gill slits, the central/navel region, and the pelvic/clasper region. Wing-margin spots may help, but they should not dominate. A successful match should be explainable by visible pigment regions, anatomical alignment, and consistent local spot geometry, not by generic image similarity.

This system is currently an experimental admin-assist tool, not an authoritative ID model. It is meant to reduce manual browsing through roughly 800 catalog individuals while a human confirms the final match visually.

## Current Implementation

The current implementation lives primarily under:

- `scripts/matching/pigment_region_matcher.py`
- `scripts/matching/matcher_api_server.py`
- `scripts/matching/eval_resight_rank.py`
- `scripts/matching/eval_catalog_selfmatch_rank.py`
- `scripts/matching/analyze_within_catalog_consistency.py`
- `src/components/mantas/MatchModal.tsx`
- `src/pages/admin/MatchingPage.tsx`

The matcher is a Python/OpenCV local worker exposed at `http://127.0.0.1:8766`. The React app talks to this worker for admin testing and Add Sighting candidate sorting. The desktop launcher now starts both the Vite app and the matcher worker. The worker preloads anchor signatures and keeps them in memory, then accepts `/rank` requests for query images.

The current pipeline is roughly:

1. Load and normalize the image.
2. Produce a body/valid-photo mask, with special handling for white-background cutouts and rotated image padding.
3. Define a widened central ventral ROI rather than a very narrow gill-only crop.
4. Enhance dark pigment regions using local contrast and spotness-style maps.
5. Segment connected dark pigment regions inside the ROI/body mask.
6. Extract region-level features: centroid, normalized area, contour/shape metrics, darkness/contrast, zone label, and neighborhood/constellation descriptors.
7. Cache per-photo signatures as JSON in `scripts/matching/cache/photo_signatures/`.
8. Use coarse prefiltering to reduce the candidate set, then exact score a smaller set of likely anchors.
9. Aggregate by catalog ID using catalog best ventral photos plus extra best-manta-ventral resight anchors.
10. Return ranked candidates with score components and debug overlays.

The scoring no longer relies on raw inlier count alone. Current score components include pigment-region matching, weighted region support, median reprojection error, pigment IoU, zone coverage, local neighbor/constellation consistency, large-region penalties, and region coverage diagnostics. The UI shows that suggestions are experimental and includes reviewer-facing score diagnostics.

## What Has Been Learned

Several earlier approaches failed in scientifically predictable ways. Edge/blob pipelines detected halos around body margins, gill slits, cephalic fin edges, background texture, water/sand artifacts, and compression noise. Those features produced plausible-looking green lines but did not correspond to stable biological pigment. The current direction therefore favors fewer high-quality connected pigment regions over hundreds of generic keypoints.

Major lessons:

- Background/body segmentation matters more than minor score tuning.
- Large pigment patches are highly informative and should not be reduced to point centers only.
- Small spots are useful when they form a stable local neighborhood pattern.
- Gill slits and edge shadows can create false pigment detections.
- Same-catalog resights are essential for learning which features remain stable under lighting, parallax, and rotation.
- Some best-manta-ventral photos are low-quality relative to best-catalog-ventral photos; they should sometimes be labeled low-confidence rather than expected to rank top 10.

We also found data/export quality issues that affect testing. Example: a manifest referenced `export/best_manta_ventral_photos_100/1_manta-1650_photo-6128.jpg`, but that file was missing from that export folder while the same photo existed under `export/best_catalog_photos/1_Male_Adult_Maui-Nui.jpg`. A separate data QC initiative is planned to verify database/storage/export consistency.

## Current Performance

There are two distinct performance categories:

### Exact-image/self-match sanity checks

The Admin Matching Diagnostics page has shown exact-image self-match behavior at 100% for the loaded self-match rows: 792 of 792 catalog individuals ranked themselves #1. This is a necessary sanity check: the system can recognize identical or near-identical anchor images when the same image is present. It does not prove true resight performance.

### True resight / best-manta-ventral matching

True resight performance is still mixed. Recent measured outputs include:

- Controlled 10-query neighbor-constellation run:
  - Rank #1: 3/10
  - Top 10: 7/10
  - Top 20: 8/10
  - Top 50: 10/10
  - Usable-query top 10: 7/9
  - Usable-query top 20: 8/9

- Stratified 10-query best-manta-ventral run using multi-anchor primary-zone scoring:
  - Rank #1: 4/10
  - Top 10: 5/10
  - Top 20: 5/10
  - Top 50: 6/10
  - Needs review: 5/10

These numbers are promising for an admin-assist sorter but not production-grade autonomous identification. The current tool can reduce browsing effort in some cases, but the correct catalog may still appear outside the top 20 or top 50 for difficult images.

Observed individual cases:

- Some clean images rank correctly in the top 10.
- Catalog 4 / Photo 3800 has been observed with the expected catalog around rank 38 in the UI, which is not acceptable for a confident matcher.
- Catalog 6 cases remain difficult because of severe rotation/parallax and asymmetric visible spot fields.
- Dark/backlit images can still create baseline/intensity confusion where shaded white body areas compete with true pigment.

## Current Failure Modes

The most important open failure modes are:

1. Body/subject segmentation is still fragile for some rotated or partially cropped images. Straight image-padding edges can be confused with biological contours unless explicitly ignored.
2. The ROI can be anatomically wrong when the manta is rotated or strongly parallaxed; an upright ROI compared to a tilted ROI can match the wrong body zones.
3. The detector still sometimes picks up gill slits, mouth/cephalic edges, shadows, or contrast halos as pigment.
4. Large obvious pigment patches are not always weighted strongly enough to rule out false candidates.
5. Matching is still slower than desired because exact scoring can run over hundreds of candidate anchors after prefiltering.
6. Export/storage consistency issues can create false test failures if manifest rows point to files that are absent locally.

## Current UI Integration

The matcher is integrated into the Add Sighting “Find Catalog Match” modal as an experimental sort option. Admins can still browse by Catalog ID and use filters. When they run the matcher, the catalog list can be sorted by experimental match score. The UI displays progress for anchor loading and candidate scoring.

There is also an Admin `/admin/matching` page for testing a query image against catalog/resight anchors and inspecting top candidates, scores, and overlays.

The app is production-safe in the sense that matcher calls now use `VITE_MATCHER_API_BASE`; localhost is used only in local development. A future live deployment requires a persistent Python/OpenCV worker host, not a browser or Supabase Edge Function.

## Next Improvements

The best next technical improvements are:

1. Build a consolidated precomputed anchor index so startup and repeated matching are faster.
2. Improve subject segmentation, especially rotated/cropped images and straight padding boundaries.
3. Add stronger anatomical region modeling: chest/gill, central/navel, pelvic, and optional wing-secondary zones.
4. Learn stable same-animal pigment priors from multi-resight catalogs, treating stable features as positive evidence and unstable edge/shadow artifacts as negative evidence.
5. Improve rotation/parallax robustness using local constellation descriptors and zone-wise comparisons rather than relying too heavily on absolute XY positions.
6. Add quality classification so low-confidence photos are flagged instead of treated as expected top-10 matches.
7. Build a data/photo QC pipeline to ensure database photo rows, storage objects, exports, manifests, and cached signatures all agree.
8. Continue human-in-the-loop review packs: show high/low performers with detected regions so domain experts can label false pigment, missed pigment, and ROI/cutout failures.

## What Help Would Be Valuable

An AI/computer-vision collaborator could help most with:

- Robust segmentation of manta body from water/reef/background and rotated padding.
- A biologically constrained region descriptor for pigment constellations that tolerates parallax and partial visibility.
- A scoring/ranking model that combines deterministic region features with learned priors while remaining explainable.
- A two-stage retrieval pipeline: fast global/region prefilter followed by slower explainable pigment-region verification.
- Benchmark design: curated positive/negative sets, multi-anchor catalog scoring, and quality-tier-specific metrics.

The project preference is still local/deterministic and inspectable first. Cloud or black-box embeddings may be useful as a coarse prefilter later, but the final decision support should show why a candidate ranked highly.
