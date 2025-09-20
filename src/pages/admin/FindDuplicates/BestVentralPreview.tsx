import * as React from "react";
import { getBestCatalogVentralPhoto } from "./data/catalog.service";

type Props = {
  pkCatalogId?: number | null;
  refreshKey?: number | string;
  className?: string;
};

export default function BestVentralPreview({ pkCatalogId, refreshKey, className }: Props) {
  const id = typeof pkCatalogId === "number" ? pkCatalogId : Number(pkCatalogId);
  const [photo, setPhoto] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!Number.isInteger(id)) {
        setPhoto(null);
        return;
      }
      try {
        setLoading(true);
        const p = await getBestCatalogVentralPhoto(id);
        if (!cancelled) setPhoto(p ?? null);
      } catch {
        if (!cancelled) setPhoto(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, refreshKey]);

  return (
    <div
      className={
        "w-full aspect-[4/3] rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 flex items-center justify-center overflow-hidden " +
        (className || "")
      }
    >
      {photo?.url ? (
        <img
          src={photo.url}
          alt={`Photo ${photo.pk_photo_id ?? ""}`}
          className="h-full w-full object-contain"
          loading="eager"
          draggable={false}
        />
      ) : (
        <span className="text-sm text-neutral-500">
          {loading ? "Loading…" : "No best ventral selected"}
        </span>
      )}
    </div>
  );
}
