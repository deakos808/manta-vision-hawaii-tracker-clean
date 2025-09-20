import * as React from "react";
import { getCatalogById, getSightingsForCatalog } from "./data/catalog.service";

type Props = {
  pkCatalogId?: number | null;
  className?: string;
};

// Simple date formatter → YYYY-MM-DD or "—"
function fmtDate(v: any): string {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default function CatalogMiniMeta({ pkCatalogId, className }: Props) {
  const id = typeof pkCatalogId === "number" ? pkCatalogId : Number(pkCatalogId);
  const [meta, setMeta] = React.useState<{
    name?: string;
    species?: string;
    gender?: string;
    age_class?: string;
    first?: string;
    last?: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!Number.isInteger(id)) {
        setMeta(null);
        return;
      }

      try {
        // Base catalog row
        const cat: any = await getCatalogById(id);

        // Try to derive first/last from sightings if not on catalog
        let first: string | undefined;
        let last: string | undefined;

        try {
          const srows: any[] = (await getSightingsForCatalog(id)) as any[];
          const dates = (srows || [])
            .map((r) => r.date || r.sighting_date || r.observed_at || r.created_at)
            .filter(Boolean)
            .map((x) => new Date(x))
            .filter((d) => !isNaN(d.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
          if (dates.length > 0) {
            first = dates[0].toISOString().slice(0, 10);
            last = dates[dates.length - 1].toISOString().slice(0, 10);
          }
        } catch {
          // ignore — optional enhancement only
        }

        const mapped = {
          name: cat?.name ?? "—",
          species: cat?.species ?? "—",
          gender: cat?.gender ?? "—",
          age_class: cat?.age_class ?? "—",
          first: fmtDate(cat?.first_sighting_date ?? cat?.first_sighting ?? first),
          last: fmtDate(cat?.last_sighting_date ?? cat?.last_sighting ?? last),
        };

        if (!cancelled) setMeta(mapped);
      } catch {
        if (!cancelled) setMeta(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!Number.isInteger(id)) return null;

  return (
    <div className={"mt-2 " + (className || "")}>
      <div className="text-sm font-semibold text-primary">
        {meta?.name ?? "—"} <span className="text-muted-foreground">— #{id}</span>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-6 text-sm">
        <div className="space-y-0.5">
          <div>
            Species: <span className="text-foreground/80">{meta?.species ?? "—"}</span>
          </div>
          <div>
            Gender: <span className="text-foreground/80">{meta?.gender ?? "—"}</span>
          </div>
          <div>
            Age Class: <span className="text-foreground/80">{meta?.age_class ?? "—"}</span>
          </div>
        </div>
        <div className="space-y-0.5">
          <div>
            First Sighting: <span className="text-foreground/80">{meta?.first ?? "—"}</span>
          </div>
          <div>
            Last Sighting: <span className="text-foreground/80">{meta?.last ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
