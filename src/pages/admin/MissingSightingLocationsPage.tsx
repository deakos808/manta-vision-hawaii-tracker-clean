import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type MissingSighting = {
  pk_sighting_id: number;
  sighting_date: string | null;
  island: string | null;
  population: string | null;
  sitelocation: string | null;
  location?: string | null;
  photographer: string | null;
  list_manta_ids?: string | null;
  list_manta_ids_2?: string | null;
  location_unknown?: boolean | null;
};

type MantaLink = {
  pk_manta_id: number;
  fk_sighting_id: number | null;
  fk_catalog_id: number | null;
};

type Cue = {
  catalogId: number;
  sightingId: number;
  date: string | null;
  island: string | null;
  location: string | null;
};

function hasLocation(row: Pick<MissingSighting, "sitelocation" | "location">) {
  return Boolean(String(row.sitelocation ?? row.location ?? "").trim());
}

export default function MissingSightingLocationsPage() {
  const [rows, setRows] = useState<MissingSighting[]>([]);
  const [links, setLinks] = useState<MantaLink[]>([]);
  const [cues, setCues] = useState<Map<number, Cue[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [locationUnknownAvailable, setLocationUnknownAvailable] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows() {
    setLoading(true);
    setNotice(null);

    let select =
      "pk_sighting_id,sighting_date,island,population,sitelocation,location,photographer,list_manta_ids,list_manta_ids_2,location_unknown";
    let res = await loadAllSightings(select);

    if (res.error && /location_unknown/i.test(res.error.message)) {
      setLocationUnknownAvailable(false);
      select = "pk_sighting_id,sighting_date,island,population,sitelocation,location,photographer,list_manta_ids,list_manta_ids_2";
      res = await loadAllSightings(select);
    }

    if (res.error) {
      setNotice(res.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const missing = ((res.data ?? []) as MissingSighting[]).filter((row) => !hasLocation(row) && !row.location_unknown);
    setRows(missing);

    const sightingIds = missing.map((row) => row.pk_sighting_id);
    if (sightingIds.length === 0) {
      setLinks([]);
      setCues(new Map());
      setLoading(false);
      return;
    }

    const linkRes = await supabase
      .from("mantas")
      .select("pk_manta_id,fk_sighting_id,fk_catalog_id")
      .in("fk_sighting_id", sightingIds);
    const nextLinks = (linkRes.data ?? []) as MantaLink[];
    setLinks(nextLinks);
    setCues(await loadLocationCues(missing, nextLinks));
    setLoading(false);
  }

  async function loadAllSightings(select: string) {
    const data: MissingSighting[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const res = await supabase
        .from("sightings")
        .select(select)
        .order("pk_sighting_id", { ascending: false })
        .range(from, from + pageSize - 1);
      if (res.error) return { data: null, error: res.error };
      data.push(...((res.data ?? []) as MissingSighting[]));
      if (!res.data || res.data.length < pageSize) break;
    }
    return { data, error: null };
  }

  async function loadLocationCues(missing: MissingSighting[], nextLinks: MantaLink[]) {
    const catalogIds = Array.from(new Set(nextLinks.map((link) => link.fk_catalog_id).filter((id): id is number => typeof id === "number")));
    if (catalogIds.length === 0) return new Map<number, Cue[]>();

    const relatedMantasRes = await supabase
      .from("mantas")
      .select("fk_catalog_id,fk_sighting_id")
      .in("fk_catalog_id", catalogIds)
      .limit(3000);

    const missingIds = new Set(missing.map((row) => row.pk_sighting_id));
    const relatedRows = (relatedMantasRes.data ?? []) as Array<{ fk_catalog_id: number | null; fk_sighting_id: number | null }>;
    const relatedSightingIds = Array.from(
      new Set(relatedRows.map((row) => row.fk_sighting_id).filter((id): id is number => typeof id === "number" && !missingIds.has(id))),
    );
    if (relatedSightingIds.length === 0) return new Map<number, Cue[]>();

    const sightingRes = await supabase
      .from("sightings")
      .select("pk_sighting_id,sighting_date,island,sitelocation,location")
      .in("pk_sighting_id", relatedSightingIds)
      .limit(3000);

    const sightingById = new Map((sightingRes.data ?? []).map((row: any) => [Number(row.pk_sighting_id), row]));
    const out = new Map<number, Cue[]>();

    for (const missingRow of missing) {
      const rowCatalogs = nextLinks
        .filter((link) => link.fk_sighting_id === missingRow.pk_sighting_id && link.fk_catalog_id != null)
        .map((link) => Number(link.fk_catalog_id));
      const rowCues: Cue[] = [];
      for (const catalogId of rowCatalogs) {
        for (const related of relatedRows.filter((row) => row.fk_catalog_id === catalogId)) {
          const sighting = related.fk_sighting_id == null ? null : sightingById.get(related.fk_sighting_id);
          if (!sighting || !hasLocation({ sitelocation: sighting.sitelocation, location: sighting.location })) continue;
          rowCues.push({
            catalogId,
            sightingId: Number(sighting.pk_sighting_id),
            date: sighting.sighting_date ?? null,
            island: sighting.island ?? null,
            location: sighting.sitelocation ?? sighting.location ?? null,
          });
        }
      }
      out.set(missingRow.pk_sighting_id, rowCues.slice(0, 5));
    }

    return out;
  }

  async function markLocationUnknown(row: MissingSighting, checked: boolean) {
    if (!locationUnknownAvailable) return;
    setBusyId(row.pk_sighting_id);
    const { error } = await supabase
      .from("sightings")
      .update({ location_unknown: checked })
      .eq("pk_sighting_id", row.pk_sighting_id);
    setBusyId(null);
    if (error) {
      setNotice(error.message);
      return;
    }
    setRows((prev) => prev.filter((item) => item.pk_sighting_id !== row.pk_sighting_id));
  }

  const linksBySighting = useMemo(() => {
    const map = new Map<number, MantaLink[]>();
    for (const link of links) {
      if (link.fk_sighting_id == null) continue;
      if (!map.has(link.fk_sighting_id)) map.set(link.fk_sighting_id, []);
      map.get(link.fk_sighting_id)!.push(link);
    }
    return map;
  }, [links]);

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold">Missing Sighting Locations</h1>
          <p className="mt-2 text-blue-50">Review missing-location sightings and use resight cues before marking a location truly unknown.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/admin/qc/sightings" className="text-sm text-blue-700 underline">Sightings QC</Link>
        <span className="text-sm text-slate-600"> / Missing Locations</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {!locationUnknownAvailable ? (
          <Card>
            <CardContent className="p-4 text-sm text-amber-700">
              The <code>sightings.location_unknown</code> column is not available yet. Apply <code>supabase/migrations/20260511_163434_sightings_location_unknown.sql</code> to enable the checkbox.
            </CardContent>
          </Card>
        ) : null}

        {notice ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{notice}</div> : null}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-5 text-sm text-slate-600">Loading missing-location sightings...</div>
            ) : rows.length === 0 ? (
              <div className="p-5 text-sm text-slate-600">No missing-location sightings need review.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Sighting</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Island / Population</th>
                    <th className="px-4 py-3 font-semibold">Listed Mantas</th>
                    <th className="px-4 py-3 font-semibold">Resight Location Cues</th>
                    <th className="px-4 py-3 font-semibold">Unknown</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowLinks = linksBySighting.get(row.pk_sighting_id) ?? [];
                    const rowCues = cues.get(row.pk_sighting_id) ?? [];
                    return (
                      <tr key={row.pk_sighting_id} className="border-t align-top">
                        <td className="px-4 py-3 font-medium">{row.pk_sighting_id}</td>
                        <td className="px-4 py-3">{row.sighting_date ?? "unknown"}</td>
                        <td className="px-4 py-3">{row.island ?? "—"} / {row.population ?? "—"}</td>
                        <td className="px-4 py-3">
                          {rowLinks.length ? rowLinks.map((link) => `M${link.pk_manta_id} / C${link.fk_catalog_id ?? "—"}`).join(", ") : row.list_manta_ids ?? row.list_manta_ids_2 ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {rowCues.length === 0 ? (
                            <span className="text-slate-500">No resight cues found</span>
                          ) : (
                            <div className="space-y-1">
                              {rowCues.map((cue) => (
                                <div key={`${cue.catalogId}-${cue.sightingId}`}>
                                  C{cue.catalogId}: {cue.island ?? "—"} · {cue.location ?? "—"} · S{cue.sightingId} · {cue.date ?? "unknown date"}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={!locationUnknownAvailable || busyId === row.pk_sighting_id}
                              checked={Boolean(row.location_unknown)}
                              onChange={(event) => void markLocationUnknown(row, event.currentTarget.checked)}
                            />
                            <span>Location unknown</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Button variant="outline" onClick={() => void loadRows()}>Refresh List</Button>
      </div>
    </Layout>
  );
}
