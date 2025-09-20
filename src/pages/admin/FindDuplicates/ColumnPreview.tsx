import type { CatalogSummary } from "./data/types";

type Props = {
  title: string;
  record: CatalogSummary | null;
};

function imageUrlFromStoragePath(path: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_SUPABASE_URL;
  const BUCKET = "manta-images"; // change if needed
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/storage/v1/object/public/${BUCKET}/${normalized}`;
}

export default function ColumnPreview({ title, record }: Props) {
  const imgSrc = record?.best_catalog_ventral_path
    ? imageUrlFromStoragePath(record.best_catalog_ventral_path)
    : "";

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>

      {!record ? (
        <div className="text-sm text-muted-foreground">Select a catalog to preview.</div>
      ) : (
        <div className="grid gap-3">
          {/* Smaller image to fit controls on one screen */}
          <div className="h-64 w-full overflow-hidden rounded-lg bg-muted">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt={`Best ventral for #${record.pk_catalog_id}`}
                className="h-full w-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                No best ventral selected
              </div>
            )}
          </div>

          {/* Title, blue like Catalog list */}
          <div className="text-sm font-semibold">
            <span className="text-sky-700">{record.name ?? `#${record.pk_catalog_id}`}</span>
            {record.name ? <span className="text-foreground"> — #{record.pk_catalog_id}</span> : null}
          </div>

          {/* Single-column compact meta (match Catalog list vibe) */}
          <dl className="text-xs leading-5">
            <div className="grid grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">Species</dt>
              <dd>{record.species ?? "—"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">Gender</dt>
              <dd>{record.gender ?? "—"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">Age Class</dt>
              <dd>{record.age_class ?? "—"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">First Sighting</dt>
              <dd>{record.first_sighting ? new Date(record.first_sighting).toLocaleDateString() : "—"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">Last Sighting</dt>
              <dd>{record.last_sighting ? new Date(record.last_sighting).toLocaleDateString() : "—"}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
