import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout/Layout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import CatalogSelector from "./CatalogSelector";
import ColumnPreview from "./ColumnPreview";
import BestVentralPhotosModal from "./modals/BestVentralPhotosModal";
import SightingsListModal from "./modals/SightingsListModal";
import {
  getBestMantaVentralPhotosForCatalog,
  getCatalogById,
  mergeCatalogs as doMergeCatalogs,
} from "./data/catalog.service";

import type { CatalogSummary, MergeResult } from "./data/types";
import BestVentralPreview from "./BestVentralPreview";
import CatalogMiniMeta from "./CatalogMiniMeta";
import SightingsCount from "./SightingsCount";
import { getCatalogSummaryById } from "./data/catalog.service";



export default function FindingDuplicatesPage() {
  const [leftId, setLeftId] = useState<number | null>(null);
  const [rightId, setRightId] = useState<number | null>(null);

  const [left, setLeft] = useState<CatalogSummary | null>(null);
  const [right, setRight] = useState<CatalogSummary | null>(null);

  const [leftBestCount, setLeftBestCount] = useState<number | null>(null);
  const [rightBestCount, setRightBestCount] = useState<number | null>(null);

  const [merging, setMerging] = useState(false);
  const [deleteIfDetached, setDeleteIfDetached] = useState(false);

  // Success modal
  const [success, setSuccess] = useState<MergeResult | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Reload the page after the success dialog is dismissed
  useEffect(() => {
    if (success && !showSuccess) { window.location.reload(); }
  }, [success, showSuccess]);

  const [showBestModal, setShowBestModal] = useState(false);
  
  const refreshCard = useCallback(
    async (which: "left" | "right", id: number) => {
      const fresh = await getCatalogSummaryById(id);
      if (!fresh) return;
      if (which === "left") {
        setLeft(fresh);
        setLeftId(fresh.pk_catalog_id); // keep inputs in sync
      } else {
        setRight(fresh);
        setRightId(fresh.pk_catalog_id);
      }
    },
    [setLeft, setRight, setLeftId, setRightId]
  );

  
  
  
  // -- merge handler -----------------------------------------------------------


  async function onMerge() {
  if (!leftId || !rightId) {
    alert("Pick two catalog IDs first.");
    return;
  }
  setMerging(true);
  try {
    // Server always merges into the smaller ID
    const res = await doMergeCatalogs({
      primary_pk_catalog_id: Math.min(leftId, rightId),
      secondary_pk_catalog_id: Math.max(leftId, rightId),
      delete_secondary_if_detached: deleteIfDetached,
    });
      // Force UI refresh so counts reflect the merge

    // Show success modal
    setSuccess(res);
    setShowSuccess(true);

    // Refresh the primary card immediately
    const primaryId = Math.min(leftId, rightId);
    const refreshed = await getCatalogSummaryById(primaryId);
    if (leftId === primaryId) setLeft(refreshed);
    else setRight(refreshed);
  } catch (e: any) {
    alert(`Merge failed: ${e?.message || e}`);
  } finally {
    setMerging(false);
  }
}

  const [bestModalFor, setBestModalFor] = useState<number | null>(null);
  const [sightingsFor, setSightingsFor] = useState<number | null>(null);

  // Load selections
  useEffect(() => {
    if (leftId != null) {
      getCatalogById(leftId).then(setLeft).catch(() => setLeft(null));
      getBestMantaVentralPhotosForCatalog(leftId)
        .then((rows) => setLeftBestCount(rows.length))
        .catch(() => setLeftBestCount(0));
    } else {
      setLeft(null);
      setLeftBestCount(null);
    }
  }, [leftId]);

  useEffect(() => {
    if (rightId != null) {
      getCatalogById(rightId).then(setRight).catch(() => setRight(null));
      getBestMantaVentralPhotosForCatalog(rightId)
        .then((rows) => setRightBestCount(rows.length))
        .catch(() => setRightBestCount(0));
    } else {
      setRight(null);
      setRightBestCount(null);
    }
  }, [rightId]);

  const canMerge = useMemo(
    () => Boolean(left && right && left.pk_catalog_id !== right.pk_catalog_id),
    [left, right]
  );

  async function _handleMerge_UNUSED() {
     if (!left || !right) return;
  setMerging(true);
  try {
    // Call Edge Function (server will still use the smaller ID as primary)
    const result = await doMergeCatalogs({
  primary_pk_catalog_id: primaryId,
  secondary_pk_catalog_id: secondaryId,
  delete_secondary_if_detached: deleteIfDetached,
});
      // Force UI refresh so counts reflect the merge

;

    // Validate & adapt to your MergeResult shape
    if (!("ok" in resp) || !resp.ok) {
      const msg = (resp as any)?.error || "Merge failed";
      throw new Error(msg);
    }

    const s = (resp as any).summary ?? {};
    const primaryId   = Number.isInteger(s.primary_pk_catalog_id)   ? Number(s.primary_pk_catalog_id)   : Math.min(left.pk_catalog_id, right.pk_catalog_id);
    const secondaryId = Number.isInteger(s.secondary_pk_catalog_id) ? Number(s.secondary_pk_catalog_id) : Math.max(left.pk_catalog_id, right.pk_catalog_id);

    const adapted: MergeResult = {
      primary_pk_catalog_id: primaryId,
      secondary_pk_catalog_id: secondaryId,
      updated: {
        photos: Number(s.photos_moved ?? 0),
        mantas: Number(s.mantas_moved ?? 0),
        // keep extra fields if your UI reads them; harmless if ignored
        catalog_embeddings: Number(s.embeddings_moved ?? 0),
      } as any,
      deleted_secondary: Boolean(s.secondary_deleted),
      note: (resp as any).note ?? undefined,
    };

    setSuccess(adapted);
    setShowSuccess(true);

    // Refresh the two columns (survive secondary delete)
    const [L, R] = await Promise.all([
      getCatalogById(primaryId),
      getCatalogById(secondaryId).catch(() => null),
    ]);
    setLeft(L);
    setRight(R);

    if (L?.pk_catalog_id) {
      const rows = await getBestMantaVentralPhotosForCatalog(L.pk_catalog_id).catch(() => []);
      setLeftBestCount(rows.length);
    }
    if (R?.pk_catalog_id) {
      const rows = await getBestMantaVentralPhotosForCatalog(R.pk_catalog_id).catch(() => []);
      setRightBestCount(rows.length);
    }
  } catch (e: any) {
    alert(`Merge failed: ${e?.message ?? e}`);
  } finally {
    setMerging(false);
  }

  }
// Merge click handler (uses the smaller ID as primary)


  return (
    <Layout>
      <main className="mx-auto w-full max-w-6xl p-4">
        {/* Hero */}
        <section className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 p-5 text-white">
          <div className="text-sm/5 opacity-90">Admin • Tools</div>
          <h1 className="text-2xl font-semibold">Finding Duplicates</h1>
          <p className="mt-1 text-white/90">
            Select two catalog records side-by-side. Merging always moves data into the <b>smaller</b> ID.
          </p>
        </section>

        {/* Breadcrumb under hero (blue like Catalog page) */}
        <div className="mt-3 text-sky-700 [&_a]:text-sky-700">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Finding Duplicates</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Merge button OUTSIDE and BELOW the blue header */}
        <div className="flex items-center gap-3">
  <Button onClick={onMerge} disabled={merging}>
    {merging ? "Merging..." : "Merge Catalog Records (into smaller ID)"}
  </Button>

  <label className="inline-flex items-center gap-2 text-sm select-none">
    <input
      type="checkbox"
      className="h-4 w-4"
      checked={deleteIfDetached}
      onChange={(e) => setDeleteIfDetached(e.target.checked)}
    />
    Delete secondary if detached
  </label>
</div>



        {/* Selectors + previews */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* LEFT */}
          <div className="space-y-3">
           
 
            <CatalogSelector label="Catalog A" value={leftId} onChange={(id) => setLeftId(id)} />

            <BestVentralPreview pkCatalogId={leftId} className="mt-3" />
<CatalogMiniMeta   pkCatalogId={leftId} />


            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!left?.pk_catalog_id}
                onClick={() => left?.pk_catalog_id && setSightingsFor(left.pk_catalog_id)}
              >
                <SightingsCount pkCatalogId={leftId} />

              </Button>
              <Button
                variant="secondary"
                disabled={!left?.pk_catalog_id}
                onClick={() => {
                  if (left?.pk_catalog_id) {
                    setBestModalFor(left.pk_catalog_id);
                    setShowBestModal(true);
                  }
                }}
              >
                Best Manta Ventral Photos ({leftBestCount ?? 0})
              </Button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-3">
            <CatalogSelector label="Catalog B" value={rightId} onChange={(id) => setRightId(id)} />

            <BestVentralPreview pkCatalogId={rightId} className="mt-3" />
<CatalogMiniMeta   pkCatalogId={rightId} />


            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!right?.pk_catalog_id}
                onClick={() => right?.pk_catalog_id && setSightingsFor(right.pk_catalog_id)}
              >
                <SightingsCount pkCatalogId={rightId} />

              </Button>
              <Button
                variant="secondary"
                disabled={!right?.pk_catalog_id}
                onClick={() => {
                  if (right?.pk_catalog_id) {
                    setBestModalFor(right.pk_catalog_id);
                    setShowBestModal(true);
                  }
                }}
              >
                Best Manta Ventral Photos ({rightBestCount ?? 0})
              </Button>
            </div>
          </div>
        </section>

        {/* Success modal */}
        <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Merge complete</DialogTitle>
            </DialogHeader>
            {success ? (
              <div className="text-sm">
                <div>
                  Merged <span className="font-medium">#{success.secondary_pk_catalog_id}</span> →{" "}
                  <span className="font-medium">#{success.primary_pk_catalog_id}</span>
                </div>
                <ul className="mt-2 grid gap-1 text-muted-foreground">
                  <li>Photos moved: {success.updated?.photos ?? 0}</li>
                  <li>Mantas moved: {success.updated?.mantas ?? 0}</li>
                  {"catalog_embeddings" in (success.updated ?? {}) && (
                    <li>Embeddings removed: {success.updated.catalog_embeddings}</li>
                  )}
                  {"embedding_selfmatch_results" in (success.updated ?? {}) && (
                    <li>Self-match rows removed: {success.updated.embedding_selfmatch_results}</li>
                  )}
                  {"match_attempts" in (success.updated ?? {}) && (
                    <li>Match attempts relinked: {success.updated.match_attempts}</li>
                  )}
                  <li>Secondary {success.deleted_secondary ? "deleted (detached)" : "retained"}</li>
                </ul>
                {success.note && <div className="mt-2 italic">{success.note}</div>}

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setBestModalFor(success.primary_pk_catalog_id);
                      setShowBestModal(true);
                      setShowSuccess(false);
                    }}
                  >
                    Review Best Ventral Photos
                  </Button>
                  <Button onClick={() => setShowSuccess(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No summary available.</div>
            )}
          </DialogContent>
        </Dialog>


        {/* Modals */}
        <BestVentralPhotosModal
          open={showBestModal}
          onOpenChange={(o) => setShowBestModal(o)}
          pk_catalog_id={bestModalFor}
          onSaved={async () => {
            if (bestModalFor) {
              const rec = await getCatalogById(bestModalFor);
              if (rec) {
                if (left?.pk_catalog_id === bestModalFor) setLeft(rec);
                if (right?.pk_catalog_id === bestModalFor) setRight(rec);
              }
              const rows = await getBestMantaVentralPhotosForCatalog(bestModalFor).catch(() => []);
              if (left?.pk_catalog_id === bestModalFor) setLeftBestCount(rows.length);
              if (right?.pk_catalog_id === bestModalFor) setRightBestCount(rows.length);
            }
          }}
        />

        <SightingsListModal
          open={!!sightingsFor}
          onOpenChange={() => setSightingsFor(null)}
          pk_catalog_id={sightingsFor}
        />
      </main>
    </Layout>
  );
}
