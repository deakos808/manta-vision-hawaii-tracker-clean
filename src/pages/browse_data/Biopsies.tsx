import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/hooks/useUserRole";

type Row = {
  pk_biopsy_id: string | number;
  fk_catalog_id: number | null;
  fk_manta_id: number | null;
  sample_date: string | null;
  catalog: {
    pk_catalog_id: number | null;
    name: string | null;
    best_catalog_ventral_thumb_url?: string | null;
    last_gender?: string | null;
    last_age_class?: string | null;
    species?: string | null;
    total_biopsies?: number | null;
  } | null;
  bestPhotoUrl?: string | null;
  sightings?: { is_mprf?: boolean | null } | null;
};

function countBy(rows: Row[], get: (r: Row) => string | undefined | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (get(r) ?? "").toString().trim();
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export default function Biopsies() {
  const [rows, setRows] = useState<Row[]>([]);
  const { role } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [flt, setFlt] = useState({ species: [] as string[], gender: [] as string[], ageClass: [] as string[], mprf: [] as string[] });
  const [multiOnly, setMultiOnly] = useState(false);

  const [namePrefix, setNamePrefix] = useState("");
  const [catalogPrefix, setCatalogPrefix] = useState("");
  const [openStats, setOpenStats] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsCatalogId, setDetailsCatalogId] = useState<number | null>(null);
  const [detailsCatalogName, setDetailsCatalogName] = useState<string | null>(null);
  const [detailsRows, setDetailsRows] = useState<any[] | null>(null);
  const [openAgeRank, setOpenAgeRank] = useState(false);
  const [ageRankRows, setAgeRankRows] = useState<any[]>([]);
  const [ageRankLoading, setAgeRankLoading] = useState(false);
  const [selectedAgeRankRow, setSelectedAgeRankRow] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("biopsies")
        .select(
          'pk_biopsy_id, fk_catalog_id, fk_manta_id, fk_sighting_id, sample_date, ' +
          'catalog:fk_catalog_id ( pk_catalog_id, name, best_catalog_ventral_thumb_url, last_gender, last_age_class, species, total_biopsies ), ' +
          'sightings:fk_sighting_id ( is_mprf )'
        )
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) { console.error("[biopsies] load error", error); setRows([]); setLoading(false); return; }

      const base: Row[] = (data ?? []).map((r: any) => ({
        pk_biopsy_id: r.pk_biopsy_id,
        fk_catalog_id: r.fk_catalog_id,
        fk_manta_id: r.fk_manta_id,
        sample_date: r.sample_date,
        catalog: r.catalog ?? null,
        bestPhotoUrl: r?.catalog?.best_catalog_ventral_thumb_url ?? null,
        sightings: r.sightings ?? null,
      }));

      setRows(base);
      setLoading(false);
    })();
  }, []);

  const distinct = useMemo(() => {
    const species  = countBy(rows, r => r.catalog?.species ?? null);
    const gender   = countBy(rows, r => r.catalog?.last_gender ?? null);
    const ageClass = countBy(rows, r => r.catalog?.last_age_class ?? null);

    let mprfTrue = 0;
    let mprfFalse = 0;
    rows.forEach(r => {
      const v = !!(r.sightings as any)?.is_mprf;
      if (v) mprfTrue += 1;
      else mprfFalse += 1;
    });
    const mprf: [string, number][] = [
      ["MPRF", mprfTrue],
      ["Non-MPRF", mprfFalse],
    ];

    return { species, gender, ageClass, mprf };
  }, [rows]);

  const openCatalogDetails = async (catId: number | null, catName: string | null) => {
    if (catId == null) return;
    setDetailsCatalogId(catId);
    setDetailsCatalogName(catName ?? null);
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsRows(null);

    const { data, error } = await supabase
      .from("biopsies")
      .select(
        "pk_biopsy_id,fk_catalog_id,fk_sighting_id,sample_date,sample_time,collector,island,region,location," +
        "sightings:fk_sighting_id ( sitelocation, location, region, island, photographer )"
      )
      .eq("fk_catalog_id", catId)
      .order("sample_date", { ascending: false });

    if (error) {
      console.error("[biopsies] details load error", error);
      setDetailsRows([]);
      setDetailsLoading(false);
      return;
    }

    setDetailsRows((data as any[]) ?? []);
    setDetailsLoading(false);
  };

  const stats = useMemo(() => {
    const catalogIds = new Set<number>();
    const mantaIds   = new Set<number>();
    const perCatalog = new Map<number, number>();
    let males=0, females=0, adults=0, juveniles=0;

    const norm = (v?: string|null) => (v ?? '').toString().trim().toLowerCase();

    rows.forEach(r => {
      const c:any = r.catalog ?? {};
      const catId = c?.pk_catalog_id ?? r.fk_catalog_id ?? null;
      if (catId != null) {
        catalogIds.add(catId);
        perCatalog.set(catId, (perCatalog.get(catId) ?? 0) + 1);
      }
      if (r.fk_manta_id != null) mantaIds.add(r.fk_manta_id);

      const g = norm(c?.last_gender);
      if (g === 'male' || g === 'm') males++;
      if (g === 'female' || g === 'f') females++;

      const a = norm(c?.last_age_class);
      if (a.includes('adult')) adults++;
      if (a.includes('juven')) juveniles++;
    });

    const catalogsMulti = Array.from(perCatalog.values()).filter(n => n >= 2).length;

    return {
      totalBiopsies: rows.length,
      totalCatalogs: catalogIds.size,
      totalMantas: mantaIds.size,      // relies on non-null fk_manta_id
      catalogsMulti,
      males, females, adults, juveniles
    };
  }, [rows]);

  const openAgeRankModal = async () => {
    setOpenAgeRank(true);
    setSelectedAgeRankRow(null);
    setAgeRankLoading(true);
    const { data, error } = await supabase
      .from("kona_biopsy_age_rank_view_v3")
      .select("*")
      .order("age_rank_v3", { ascending: true });
    if (error) {
      console.error("[biopsies] age rank load error", error);
      setAgeRankRows([]);
      setAgeRankLoading(false);
      return;
    }
    setAgeRankRows((data as any[]) ?? []);
    setAgeRankLoading(false);
  };

  const fmtText = (v: any) => {
    if (v === null || v === undefined) return "—";
    const t = String(v).trim();
    return t ? t : "—";
  };

  const fmtNum = (v: any, digits = 1) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : "—";
  };

  const fmtDate = (v: any) => {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nameNeedle = namePrefix.trim().toLowerCase();
    const catNeedle = catalogPrefix.trim().toLowerCase();

    const pass = (vals: string[], v?: string | null) => vals.length === 0 || (v && vals.includes(v));

    return rows.filter((r) => {
      const c = r.catalog ?? ({} as any);

      const inText =
        !needle ||
        String(r.pk_biopsy_id ?? "").toLowerCase().includes(needle) ||
        String(r.fk_catalog_id ?? "").toLowerCase().includes(needle) ||
        String(c?.name ?? "").toLowerCase().includes(needle);

      const nameOK =
        !nameNeedle ||
        String(c?.name ?? "").toLowerCase().startsWith(nameNeedle);

      const catId = String(c?.pk_catalog_id ?? r.fk_catalog_id ?? "");
      const catOK =
        !catNeedle ||
        catId.toLowerCase().startsWith(catNeedle);

      const multiOK = !multiOnly || ((c?.total_biopsies ?? 0) >= 2);

      const mprfSel = flt.mprf ?? [];
      const isMprf = !!(r.sightings as any)?.is_mprf;
      const mprfOK =
        mprfSel.length === 0 ||
        (mprfSel.includes("MPRF") && isMprf) ||
        (mprfSel.includes("Non-MPRF") && !isMprf);

      return (
        inText &&
        nameOK &&
        catOK &&
        multiOK &&
        mprfOK &&
        pass(flt.species,  c?.species ?? null) &&
        pass(flt.gender,   c?.last_gender ?? null) &&
        pass(flt.ageClass, c?.last_age_class ?? null)
      );
    });
  }, [rows, q, namePrefix, catalogPrefix, flt, multiOnly]);

  const activeFiltersText = useMemo(() => {
    const parts: string[] = [];
    if (q.trim()) parts.push(`Search: "${q.trim()}"`);
    if (flt.species.length) parts.push(`Species: ${flt.species.join(", ")}`);
    if (flt.gender.length) parts.push(`Gender: ${flt.gender.join(", ")}`);
    if (flt.ageClass.length) parts.push(`Age: ${flt.ageClass.join(", ")}`);
    if (multiOnly) parts.push("Catalogs ≥ 2 biopsies");
    if (namePrefix.trim()) parts.push(`Name starts with "${namePrefix.trim()}"`);
    if (catalogPrefix.trim()) parts.push(`Catalog ID starts with "${catalogPrefix.trim()}"`);
    return parts.join(" · ");
  }, [q, flt, multiOnly, namePrefix, catalogPrefix]);


  return (
    <Layout>
      <div className="min-h-screen">
        {/* Hero */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10">
          <div className="max-w-6xl mx-auto px-4">
            <h1 className="text-3xl font-semibold text-center">Biopsies</h1>
          </div>
        </div>

        {/* Light band (full width, Catalog style) */}
        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2 mb-4">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumb */}
            <div className="text-sm text-blue-800 mb-3">
              <Link to="/browse/data" className="text-blue-600 hover:underline">← Return to Browse Data</Link>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3 mb-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by Biopsy ID, Catalog ID, or Name…"
                className="border rounded-lg px-3 py-2 w-full md:w-1/3 max-w-md bg-white"
              />
            </div>

            {/* Filter box (white card inside light band) */}
            <div className="bg-white shadow p-4 rounded border w-full">
              <div className="grid grid-cols-3 items-center mb-2">
                <div className="text-sm font-medium text-blue-700">Filter Biopsies by:</div>

                <div />

                <div className="flex justify-end items-center gap-3">
                  <button
                    className="text-xs text-blue-700 underline"
                    onClick={() => { setFlt({species:[],gender:[],ageClass:[],mprf:[]}); setMultiOnly(false); setNamePrefix(""); setCatalogPrefix(""); setQ(""); }}
                  >
                    Clear All Filters
                  </button>
                  <button
                    className="px-3 py-1 rounded border bg-white shadow-sm text-xs text-blue-700 hover:bg-blue-50"
                    onClick={() => setOpenStats(true)}
                  >
                    Biopsy Stats
                  </button>
                  {role === "admin" && (
                    <button
                      className="px-3 py-1 rounded border bg-white shadow-sm text-xs text-blue-700 hover:bg-blue-50"
                      onClick={openAgeRankModal}
                    >
                      Kona Age Ranking
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <FilterPill label="Species"  options={distinct.species}  selected={flt.species}  onChange={(v)=>setFlt(f=>({...f,species:v}))}/>
                <FilterPill label="Gender"   options={distinct.gender}   selected={flt.gender}   onChange={(v)=>setFlt(f=>({...f,gender:v}))}/>
                <FilterPill label="Age Class" options={distinct.ageClass} selected={flt.ageClass} onChange={(v)=>setFlt(f=>({...f,ageClass:v}))}/>
                <FilterPill label="MPRF" options={distinct.mprf} selected={flt.mprf} onChange={(v)=>setFlt(f=>({...f,mprf:v}))}/>
                <label className="ml-3 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={multiOnly} onChange={(e)=>setMultiOnly(e.target.checked)}/>
                  <span>Only catalogs with ≥ 2 biopsies</span>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Name (starts with)</div>
                  <input
                    value={namePrefix}
                    onChange={(e) => setNamePrefix(e.target.value)}
                    placeholder="e.g., Ra..."
                    className="border rounded-lg px-3 py-2 w-full bg-white text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Catalog ID (starts with)</div>
                  <input
                    value={catalogPrefix}
                    onChange={(e) => setCatalogPrefix(e.target.value)}
                    placeholder="e.g., 12..."
                    className="border rounded-lg px-3 py-2 w-full bg-white text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              Showing <b>{filtered.length}</b> of <b>{rows.length}</b> total records
              {activeFiltersText ? ` — filtered by ${activeFiltersText}` : ""}.
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 pb-16">

          {/* List */}
          {loading ? (
            <div className="text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-500">No biopsies found.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {filtered.map((r, i) => <Card key={String(r.pk_biopsy_id) + "-" + i} row={r} onOpenDetails={openCatalogDetails} />)}
            </div>
          )}
        </div>
      </div>

      {/* Biopsy stats modal */}
      {openStats && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="font-semibold text-lg">Biopsy Stats</div>
              <button onClick={() => setOpenStats(false)} className="text-gray-500 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Total Biopsies</div>
                  <div className="text-lg font-semibold">{stats.totalBiopsies}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Catalog IDs</div>
                  <div className="text-lg font-semibold">{stats.totalCatalogs}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Catalogs ≥ 2 biopsies</div>
                  <div className="text-lg font-semibold">{stats.catalogsMulti}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Males</div>
                  <div className="text-lg font-semibold">{stats.males}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Females</div>
                  <div className="text-lg font-semibold">{stats.females}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Adults</div>
                  <div className="text-lg font-semibold">{stats.adults}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-gray-500">Juveniles</div>
                  <div className="text-lg font-semibold">{stats.juveniles}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Kona Age Ranking details overlay */}
      {selectedAgeRankRow && (
        <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <div className="font-semibold text-lg">
                Rank Details — Catalog {fmtText(selectedAgeRankRow.pk_catalog_id)} ({fmtText(selectedAgeRankRow.hamer_name ?? selectedAgeRankRow.mprf_name)})
              </div>
              <button
                type="button"
                className="text-sm text-blue-600 underline"
                onClick={() => setSelectedAgeRankRow(null)}
              >
                Close details
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg border p-4">
                  <div className="font-semibold mb-3">Identity / Keys</div>
                  <div className="grid grid-cols-2 gap-y-2">
                    <div className="text-gray-500">Catalog ID</div><div>{fmtText(selectedAgeRankRow.pk_catalog_id)}</div>
                    <div className="text-gray-500">MPRF Catalog ID</div><div>{fmtText(selectedAgeRankRow.pk_mprf_catalog_id)}</div>
                    <div className="text-gray-500">HAMER Name</div><div>{fmtText(selectedAgeRankRow.hamer_name)}</div>
                    <div className="text-gray-500">MPRF Name</div><div>{fmtText(selectedAgeRankRow.mprf_name)}</div>
                    <div className="text-gray-500">Biopsy ID</div><div>{fmtText(selectedAgeRankRow.pk_biopsy_id)}</div>
                    <div className="text-gray-500">MPRF Biopsy ID</div><div>{fmtText(selectedAgeRankRow.mprf_biopsy_id)}</div>
                    <div className="text-gray-500">Jonathan Sample ID</div><div>{fmtText(selectedAgeRankRow.jonathan_sample_id)}</div>
                    <div className="text-gray-500">Manta ID</div><div>{fmtText(selectedAgeRankRow.pk_manta_id)}</div>
                    <div className="text-gray-500">Date of Biopsy</div><div>{fmtDate(selectedAgeRankRow.date_of_biopsy)}</div>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="font-semibold mb-3">Sighting / Life History</div>
                  <div className="grid grid-cols-2 gap-y-2">
                    <div className="text-gray-500">Gender</div><div>{fmtText(selectedAgeRankRow.gender)}</div>
                    <div className="text-gray-500">Last Age Class</div><div>{fmtText(selectedAgeRankRow.last_age_class)}</div>
                    <div className="text-gray-500">Effective First Sighting</div><div>{fmtDate(selectedAgeRankRow.effective_first_sighting)}</div>
                    <div className="text-gray-500">Total Years Sighted</div><div>{fmtText(selectedAgeRankRow.total_years_sighted)}</div>
                    <div className="text-gray-500">Ever Seen as Pup</div><div>{fmtText(selectedAgeRankRow.ever_seen_as_pup)}</div>
                    <div className="text-gray-500">Known Age from Pup</div><div>{fmtText(selectedAgeRankRow.known_age_from_pup)}</div>
                    <div className="text-gray-500">Known Age from Pup v3</div><div>{fmtText(selectedAgeRankRow.known_age_from_pup_v3)}</div>
                    <div className="text-gray-500">First Year Confirmed Immature</div><div>{fmtText(selectedAgeRankRow.first_year_confirmed_immature)}</div>
                    <div className="text-gray-500">First Year Confirmed Mature</div><div>{fmtText(selectedAgeRankRow.first_year_confirmed_mature)}</div>
                    <div className="text-gray-500">Min Years Known Mature</div><div>{fmtText(selectedAgeRankRow.min_years_known_mature)}</div>
                    <div className="text-gray-500">Estimated Age at Last Sighting</div><div>{fmtNum(selectedAgeRankRow.estimated_age_at_last_sighting_years, 1)}</div>
                    <div className="text-gray-500">Janice Min Age at Biopsy</div><div>{fmtNum(selectedAgeRankRow.janice_min_age_at_biopsy_yrs, 1)}</div>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="font-semibold mb-3">Size / MPRF Context</div>
                  <div className="grid grid-cols-2 gap-y-2">
                    <div className="text-gray-500">Last Size (m)</div><div>{fmtNum(selectedAgeRankRow.last_size_m, 2)}</div>
                    <div className="text-gray-500">MPRF First Sighting Date</div><div>{fmtDate(selectedAgeRankRow.mprf_first_sighting_date)}</div>
                    <div className="text-gray-500">MPRF First Sighting Size</div><div>{fmtText(selectedAgeRankRow.mprf_first_sighting_size)}</div>
                    <div className="text-gray-500">MPRF Last Age Class</div><div>{fmtText(selectedAgeRankRow.mprf_last_age_class)}</div>
                    <div className="text-gray-500">MPRF Total Years Seen</div><div>{fmtText(selectedAgeRankRow.mprf_total_years_seen)}</div>
                    <div className="text-gray-500">MPRF Size DW</div><div>{fmtText(selectedAgeRankRow.mprf_size_dw)}</div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 md:col-span-2">
                  <div className="font-semibold mb-3">Scoring / Ranking</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4">
                    <div className="text-gray-500">Age Rank v2</div><div>{fmtText(selectedAgeRankRow.age_rank_v2)}</div>
                    <div className="text-gray-500">Janice Age Rank</div><div>{fmtText(selectedAgeRankRow.janice_age_rank)}</div>
                    <div className="text-gray-500">Janice Age Rank Raw</div><div>{fmtText(selectedAgeRankRow.janice_age_rank_raw)}</div>
                    <div className="text-gray-500">Age at Last Sighting</div><div>{fmtNum(selectedAgeRankRow.age_at_last_sighting_years, 1)}</div>
                    <div className="text-gray-500">Age Years at Biopsy</div><div>{fmtNum(selectedAgeRankRow.age_years_at_biopsy, 1)}</div>
                    <div className="text-gray-500">Age Years at Biopsy v3</div><div>{fmtNum(selectedAgeRankRow.age_years_at_biopsy_v3, 1)}</div>
                    <div className="text-gray-500">Maturity Bonus B</div><div>{fmtNum(selectedAgeRankRow.maturity_bonus_b, 2)}</div>
                    <div className="text-gray-500">Maturity Bonus B v3</div><div>{fmtNum(selectedAgeRankRow.maturity_bonus_b_v3, 2)}</div>
                    <div className="text-gray-500">Relative Age Score v2</div><div>{fmtNum(selectedAgeRankRow.relative_age_score_v2, 2)}</div>
                    <div className="text-gray-500">Relative Age Score v3</div><div>{fmtNum(selectedAgeRankRow.relative_age_score_v3, 2)}</div>
                    <div className="text-gray-500">Original Relative Age Score</div><div>{fmtNum(selectedAgeRankRow.original_relative_age_score, 2)}</div>
                    <div className="text-gray-500">Original Relative Age Rank</div><div>{fmtText(selectedAgeRankRow.original_relative_age_rank)}</div>
                    <div className="text-gray-500">Age Rank v3</div><div className="font-semibold">{fmtText(selectedAgeRankRow.age_rank_v3)}</div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 md:col-span-2">
                  <div className="font-semibold mb-3">Justification</div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-gray-500 mb-1">v2</div>
                      <div className="text-sm leading-6">{fmtText(selectedAgeRankRow.age_rank_justification_v2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">v3</div>
                      <div className="text-sm leading-6">{fmtText(selectedAgeRankRow.age_rank_justification_v3)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Biopsy details modal (per Catalog ID) */}
      {detailsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="font-semibold text-lg">
                Biopsy Details — Catalog {detailsCatalogId}{detailsCatalogName ? ` (${detailsCatalogName})` : ""}
              </div>
              <button
                onClick={() => { setDetailsOpen(false); setDetailsRows(null); setDetailsCatalogId(null); }}
                className="text-gray-500 hover:text-gray-700 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              {detailsLoading ? (
                <div className="text-sm text-gray-600">Loading…</div>
              ) : !detailsRows || detailsRows.length === 0 ? (
                <div className="text-sm text-gray-600">No biopsy records found for this catalog.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">Biopsy ID</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Location</th>
                        <th className="py-2 pr-3">Biopsier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailsRows.map((r, idx) => {
                        const biopsyId = r.pk_biopsy_id ?? "—";

                        const dateVal = r.sample_date ?? null;
                        const timeVal = r.sample_time ?? null;

                        const island = (r.island ?? "").toString().trim();
                        const region = (r.region ?? "").toString().trim();
                        const loc = (r.location ?? "").toString().trim();

                        const sgt: any = (r as any).sightings ?? {};
                        const sLoc = (sgt.sitelocation ?? "").toString().trim();
                        const sLoc2 = (sgt.location ?? "").toString().trim();
                        const sRegion = (sgt.region ?? "").toString().trim();
                        const sIsland = (sgt.island ?? "").toString().trim();
                        const sPhotog = (sgt.photographer ?? "").toString().trim();

                        const locationVal =
                          loc || region || island ||
                          sLoc || sLoc2 || sRegion || sIsland ||
                          "—";

                        const biopsierVal =
                          (r.collector ?? "").toString().trim() ||
                          sPhotog ||
                          "—";

                        const dateStr =
                          dateVal ? new Date(dateVal).toLocaleDateString() : "—";

                        const timeStr =
                          timeVal ? String(timeVal).slice(0, 8) : "";

                        return (
                          <tr key={String(biopsyId) + "-" + idx} className="border-b last:border-0">
                            <td className="py-2 pr-3">{String(biopsyId)}</td>
                            <td className="py-2 pr-3">
                              {dateStr}{timeStr ? ` ${timeStr}` : ""}
                            </td>
                            <td className="py-2 pr-3">{locationVal}</td>
                            <td className="py-2 pr-3">{biopsierVal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {openAgeRank && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="font-semibold text-lg">Kona Age Ranking — Summary</div>
              <button
                onClick={() => { setOpenAgeRank(false); setSelectedAgeRankRow(null); }}
                className="text-gray-500 hover:text-gray-700 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-auto max-h-[calc(90vh-72px)]">
              {ageRankLoading ? (
                <div className="text-sm text-gray-600">Loading…</div>
              ) : ageRankRows.length === 0 ? (
                <div className="text-sm text-gray-600">No Kona age-ranking rows found.</div>
              ) : (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-3">Age Rank</th>
                          <th className="py-2 pr-3">Catalog ID</th>
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3">Biopsy ID</th>
                          <th className="py-2 pr-3">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ageRankRows.map((r, idx) => (
                          <tr key={String(r.pk_catalog_id ?? idx) + "-" + String(r.pk_biopsy_id ?? idx)} className="border-b last:border-0">
                            <td className="py-2 pr-3 font-semibold">{fmtText(r.age_rank_v3)}</td>
                            <td className="py-2 pr-3">{fmtText(r.pk_catalog_id)}</td>
                            <td className="py-2 pr-3">{fmtText(r.hamer_name ?? r.mprf_name)}</td>
                            <td className="py-2 pr-3">{fmtText(r.pk_biopsy_id)}</td>
                            <td className="py-2 pr-3">
                              <button
                                className="text-blue-600 underline"
                                onClick={() => setSelectedAgeRankRow(r)}
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedAgeRankRow && (
                    <div className="rounded-xl border p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="font-semibold">
                          Rank Details — Catalog {fmtText(selectedAgeRankRow.pk_catalog_id)} ({fmtText(selectedAgeRankRow.hamer_name ?? selectedAgeRankRow.mprf_name)})
                        </div>
                        <button
                          className="text-sm text-blue-600 underline"
                          onClick={() => setSelectedAgeRankRow(null)}
                        >
                          Close details
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-lg border p-4">
                          <div className="font-semibold mb-3">Core Identifiers</div>
                          <div className="grid grid-cols-2 gap-y-2">
                            <div className="text-gray-500">Catalog ID</div><div>{fmtText(selectedAgeRankRow.pk_catalog_id)}</div>
                            <div className="text-gray-500">MPRF Catalog ID</div><div>{fmtText(selectedAgeRankRow.pk_mprf_catalog_id)}</div>
                            <div className="text-gray-500">HAMER Name</div><div>{fmtText(selectedAgeRankRow.hamer_name)}</div>
                            <div className="text-gray-500">MPRF Name</div><div>{fmtText(selectedAgeRankRow.mprf_name)}</div>
                            <div className="text-gray-500">Biopsy ID</div><div>{fmtText(selectedAgeRankRow.pk_biopsy_id)}</div>
                            <div className="text-gray-500">MPRF Biopsy ID</div><div>{fmtText(selectedAgeRankRow.mprf_biopsy_id)}</div>
                            <div className="text-gray-500">Jonathan Sample ID</div><div>{fmtText(selectedAgeRankRow.jonathan_sample_id)}</div>
                            <div className="text-gray-500">Manta ID</div><div>{fmtText(selectedAgeRankRow.pk_manta_id)}</div>
                            <div className="text-gray-500">Date of Biopsy</div><div>{fmtDate(selectedAgeRankRow.date_of_biopsy)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="font-semibold mb-3">Age / Sighting Context</div>
                          <div className="grid grid-cols-2 gap-y-2">
                            <div className="text-gray-500">Gender</div><div>{fmtText(selectedAgeRankRow.gender)}</div>
                            <div className="text-gray-500">Last Age Class</div><div>{fmtText(selectedAgeRankRow.last_age_class)}</div>
                            <div className="text-gray-500">Effective First Sighting</div><div>{fmtDate(selectedAgeRankRow.effective_first_sighting)}</div>
                            <div className="text-gray-500">Total Years Sighted</div><div>{fmtText(selectedAgeRankRow.total_years_sighted)}</div>
                            <div className="text-gray-500">Ever Seen as Pup</div><div>{fmtText(selectedAgeRankRow.ever_seen_as_pup)}</div>
                            <div className="text-gray-500">Known Age from Pup</div><div>{fmtText(selectedAgeRankRow.known_age_from_pup)}</div>
                            <div className="text-gray-500">Known Age from Pup v3</div><div>{fmtText(selectedAgeRankRow.known_age_from_pup_v3)}</div>
                            <div className="text-gray-500">First Year Confirmed Immature</div><div>{fmtText(selectedAgeRankRow.first_year_confirmed_immature)}</div>
                            <div className="text-gray-500">First Year Confirmed Mature</div><div>{fmtText(selectedAgeRankRow.first_year_confirmed_mature)}</div>
                            <div className="text-gray-500">Min Years Known Mature</div><div>{fmtText(selectedAgeRankRow.min_years_known_mature)}</div>
                            <div className="text-gray-500">Estimated Age at Last Sighting</div><div>{fmtNum(selectedAgeRankRow.estimated_age_at_last_sighting_years, 1)}</div>
                            <div className="text-gray-500">Janice Min Age at Biopsy</div><div>{fmtNum(selectedAgeRankRow.janice_min_age_at_biopsy_yrs, 1)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="font-semibold mb-3">Size / MPRF Context</div>
                          <div className="grid grid-cols-2 gap-y-2">
                            <div className="text-gray-500">Last Size (m)</div><div>{fmtNum(selectedAgeRankRow.last_size_m, 2)}</div>
                            <div className="text-gray-500">MPRF First Sighting Date</div><div>{fmtDate(selectedAgeRankRow.mprf_first_sighting_date)}</div>
                            <div className="text-gray-500">MPRF First Sighting Size</div><div>{fmtText(selectedAgeRankRow.mprf_first_sighting_size)}</div>
                            <div className="text-gray-500">MPRF Last Age Class</div><div>{fmtText(selectedAgeRankRow.mprf_last_age_class)}</div>
                            <div className="text-gray-500">MPRF Total Years Seen</div><div>{fmtText(selectedAgeRankRow.mprf_total_years_seen)}</div>
                            <div className="text-gray-500">MPRF Size DW</div><div>{fmtText(selectedAgeRankRow.mprf_size_dw)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4 md:col-span-2">
                          <div className="font-semibold mb-3">Scoring / Ranking</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4">
                            <div className="text-gray-500">Age Rank v2</div><div>{fmtText(selectedAgeRankRow.age_rank_v2)}</div>
                            <div className="text-gray-500">Janice Age Rank</div><div>{fmtText(selectedAgeRankRow.janice_age_rank)}</div>
                            <div className="text-gray-500">Janice Age Rank Raw</div><div>{fmtText(selectedAgeRankRow.janice_age_rank_raw)}</div>
                            <div className="text-gray-500">Age at Last Sighting</div><div>{fmtNum(selectedAgeRankRow.age_at_last_sighting_years, 1)}</div>
                            <div className="text-gray-500">Age Years at Biopsy</div><div>{fmtNum(selectedAgeRankRow.age_years_at_biopsy, 1)}</div>
                            <div className="text-gray-500">Age Years at Biopsy v3</div><div>{fmtNum(selectedAgeRankRow.age_years_at_biopsy_v3, 1)}</div>
                            <div className="text-gray-500">Maturity Bonus B</div><div>{fmtNum(selectedAgeRankRow.maturity_bonus_b, 2)}</div>
                            <div className="text-gray-500">Maturity Bonus B v3</div><div>{fmtNum(selectedAgeRankRow.maturity_bonus_b_v3, 2)}</div>
                            <div className="text-gray-500">Relative Age Score v2</div><div>{fmtNum(selectedAgeRankRow.relative_age_score_v2, 2)}</div>
                            <div className="text-gray-500">Relative Age Score v3</div><div>{fmtNum(selectedAgeRankRow.relative_age_score_v3, 2)}</div>
                            <div className="text-gray-500">Original Relative Age Score</div><div>{fmtNum(selectedAgeRankRow.original_relative_age_score, 2)}</div>
                            <div className="text-gray-500">Original Relative Age Rank</div><div>{fmtText(selectedAgeRankRow.original_relative_age_rank)}</div>
                            <div className="text-gray-500">Age Rank v3</div><div className="font-semibold">{fmtText(selectedAgeRankRow.age_rank_v3)}</div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4 md:col-span-2">
                          <div className="font-semibold mb-3">Justification</div>
                          <div className="space-y-3">
                            <div>
                              <div className="text-gray-500 mb-1">v2</div>
                              <div className="text-sm leading-6">{fmtText(selectedAgeRankRow.age_rank_justification_v2)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-1">v3</div>
                              <div className="text-sm leading-6">{fmtText(selectedAgeRankRow.age_rank_justification_v3)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BackToTopButton />
    </Layout>
  );
}

/* ---------- Filter pill ---------- */
interface FilterPillProps {
  label: string;
  options: Array<[string, number]> | Array<string>;
  selected: string[];
  onChange: (v: string[]) => void;
}
function FilterPill(props: FilterPillProps) {
  const { label, options, selected, onChange } = props;
  const [open, setOpen] = useState(false);
  const normalized: [string, number | undefined][] = (options as any[]).map((o: any) =>
    Array.isArray(o) ? o : [o, undefined]
  );

  return (
    <div className="relative">
      <button onClick={() => setOpen(o=>!o)} className="px-3 py-1 rounded-full border bg-blue-50 shadow-sm text-xs">
        {label}{selected.length ? ` • ${selected.length}` : ""}
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-64 rounded border bg-white shadow p-2 max-h-72 overflow-auto">
          {normalized.length === 0 ? (
            <div className="text-xs text-gray-500 px-2 py-1">No options yet</div>
          ) : normalized.map(([opt,count]) => {
              const on = selected.includes(opt);
              return (
                <label key={opt} className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={on} onChange={(e)=>{ if(e.target.checked) onChange([...selected,opt]); else onChange(selected.filter(x=>x!==opt)); }}/>
                    <span>{opt}</span>
                  </span>
                  {typeof count === "number" ? <span className="text-[11px] text-gray-500">{count}</span> : null}
                </label>
              );
            })}
          <div className="flex justify-end gap-2 mt-2">
            <button className="text-[11px] text-gray-600" onClick={()=>onChange([])}>Clear</button>
            <button className="text-[11px] text-blue-600" onClick={()=>setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Card (thumb on top like Photos) ---------- */
function Card({ row, onOpenDetails }: { row: Row; onOpenDetails: (catId: number | null, catName: string | null) => void }) {
  const c = row.catalog ?? ({} as any);
  const photo = row.bestPhotoUrl ?? null;
  const total = c?.total_biopsies ?? 0;
  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
      <div className="bg-gray-100 h-[140px] w-full flex items-center justify-center overflow-hidden">
        {photo ? <img src={photo} alt={String(c?.name ?? "")} className="w-full h-full object-cover rounded" /> : <div className="text-gray-400 text-[12px]">No photo</div>}
      </div>
      <div className="p-2 text-xs leading-5">
        <div className="font-semibold text-blue-600">{c?.name ?? "Unknown name"}</div>
        <div className="text-gray-600">Catalog ID: {c?.pk_catalog_id ?? row.fk_catalog_id ?? "—"}</div>
        <div className="text-gray-600">Biopsy ID: {row.pk_biopsy_id}</div>
                <div className="text-gray-600">
          Total Biopsies:{" "}
          <button
            className="text-blue-600 underline"
            onClick={() => onOpenDetails(c?.pk_catalog_id ?? row.fk_catalog_id ?? null, c?.name ?? null)}
            title="View biopsy details"
          >
            {total}
          </button>
        </div>
        <div className="text-gray-600">Gender: {c?.last_gender ?? "—"}</div>
        <div className="text-gray-600">Age Class: {c?.last_age_class ?? "—"}</div>
      </div>
    </div>
  );
}
