import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import {
  dlM,
  dwDlRatio,
  dwM,
  formatCalibration,
  formatMeters,
  formatRatio,
  hasLegacySizeExport,
  isDuplicateLegacyImport,
  legacyShotType,
  legacySizeId,
  photoCodeId,
  scalePx,
  sizeMeasurementLabel,
} from "@/utils/sizeMeasurements";

type Summary = {
  total_mantas: number | null;
  catalog_ids: number | null;
  males: number | null;
  females: number | null;
  adults: number | null;
  juveniles: number | null;
};

type QuadRow = {
  age_group: "Adult" | "Juvenile";
  gender: "Male" | "Female";
  mean_m: number | null;
  min_m: number | null;
  max_m: number | null;
  n: number | null;
  std_m: number | null;
};

type MantaSizeRow = {
  pk_manta_id: number;
  fk_catalog_id: number;
  fk_sighting_id: number | null;
  name: string | null;
  species: string | null;
  gender: string | null;
  age_class: string | null;
  manta_size_m: number | null;
  thumbnail_url: string | null;
  is_mprf: boolean | null;
  sighting_date: string | null;
  total_sizes?: number | null;
};

type SizeMeasurementRow = {
  pk_manta_size_id: number;
  fk_manta_id: number | null;
  fk_catalog_id?: number | null;
  fk_sighting_id?: number | null;
  measurement_type?: string | null;
  size_m: number | null;
  measured_on?: string | null;
  photo_code?: string | null;
  quality_note?: string | null;
  calibration_params?: unknown;
  src_file?: string | null;
};

type SizePhotoRow = {
  pk_photo_id: number;
  file_name2?: string | null;
  storage_path?: string | null;
  thumbnail_url?: string | null;
};

const fmtN = (n: number | null | undefined) => (n == null ? "—" : n.toString());
const fmtM = (m: number | null | undefined, d = 2) => (m == null ? "—" : `${Number(m).toFixed(d)} m`);
const uniq = <T,>(arr: (T | null | undefined)[]) => [...new Set(arr.filter(Boolean) as T[])];

function calibrationSummaries(rows: Array<{ calibration_params?: unknown }>) {
  return Array.from(
    new Set(rows.map((row) => formatCalibration(row.calibration_params)).filter((value) => value !== "—"))
  );
}

function isTrustedIndependentSize(row: { calibration_params?: unknown }) {
  return hasLegacySizeExport(row) && !isDuplicateLegacyImport(row);
}

async function loadAllRows<T extends Record<string, unknown>>(table: string, columns: string) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-white">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function Sizes() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quads, setQuads] = useState<QuadRow[]>([]);
  const [rows, setRows] = useState<MantaSizeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [mantaIdPrefix, setMantaIdPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [catalogPrefix, setCatalogPrefix] = useState("");

  const [filterSpecies, setFilterSpecies] = useState<string[]>([]);
  const [filterGender, setFilterGender] = useState<string[]>([]);
  const [filterAge, setFilterAge] = useState<string[]>([]);
  const [onlyMultiple, setOnlyMultiple] = useState<boolean>(false);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const [openSizesFor, setOpenSizesFor] = useState<MantaSizeRow | null>(null);
  const [sizeRows, setSizeRows] = useState<SizeMeasurementRow[] | null>(null);
  const [sizePhotos, setSizePhotos] = useState<Map<number, SizePhotoRow>>(new Map());

  const [openStats, setOpenStats] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const [s1, s2, s3, allSizeRows] = await Promise.all([
        supabase.from("v_sizes_summary_stats_v3").select("*").single(),
        supabase.from("v_sizes_quadrant_stats_v3").select("*"),
        supabase.from("v_sizes_manta_rows_v1").select("*").order("pk_manta_id", { ascending: true }),
        loadAllRows<SizeMeasurementRow>("manta_sizes", "pk_manta_size_id,fk_manta_id,calibration_params"),
      ]);

      if (!alive) return;

      if (s1.error) console.error("[Sizes] summary load error", s1.error);
      if (s2.error) console.error("[Sizes] quadrant load error", s2.error);
      if (s3.error) console.error("[Sizes] manta rows load error", s3.error);
      const countMap = new Map<number, number>();
      allSizeRows.filter(isTrustedIndependentSize).forEach((r) => {
        const mantaId = Number(r.fk_manta_id);
        if (Number.isFinite(mantaId)) countMap.set(mantaId, (countMap.get(mantaId) ?? 0) + 1);
      });

      const merged = (((s3.data as MantaSizeRow[] | null) ?? []).map((r) => ({
        ...r,
        total_sizes: countMap.get(Number(r.pk_manta_id)) ?? 0,
      })));

      setSummary((s1.data as Summary) ?? null);
      setQuads((s2.data as QuadRow[]) ?? []);
      setRows(merged);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!openSizesFor) return;

    let alive = true;
    setSizeRows(null);
    setSizePhotos(new Map());

    (async () => {
      const { data, error } = await supabase
        .from("manta_sizes")
        .select("*")
        .eq("fk_manta_id", openSizesFor.pk_manta_id)
        .order("pk_manta_size_id", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("[Sizes] independent sizes load error", error);
        setSizeRows([]);
        return;
      }

      const nextRows = (data as SizeMeasurementRow[]) ?? [];
      setSizeRows(nextRows);

      const photoIds = Array.from(new Set(nextRows.map(photoCodeId).filter((id): id is number => id != null)));
      if (photoIds.length) {
        const { data: photos, error: photoError } = await supabase
          .from("photos")
          .select("pk_photo_id,file_name2,storage_path,thumbnail_url")
          .in("pk_photo_id", photoIds);
        if (!alive) return;
        if (photoError) {
          console.warn("[Sizes] size photo lookup error", photoError);
          setSizePhotos(new Map());
        } else {
          setSizePhotos(new Map(((photos ?? []) as SizePhotoRow[]).map((photo) => [photo.pk_photo_id, photo])));
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [openSizesFor]);

  const speciesOptions = useMemo(() => uniq(rows.map((r) => r.species)).sort(), [rows]);
  const genderOptions = useMemo(() => uniq(rows.map((r) => r.gender ?? "Unknown")).sort(), [rows]);
  const ageOptions = useMemo(() => uniq(rows.map((r) => r.age_class)).sort(), [rows]);

  const gt1Count = useMemo(
    () => rows.filter((r) => Number(r.total_sizes ?? 0) > 1).length,
    [rows]
  );
  const openSizeCalibrationSummaries = useMemo(
    () => calibrationSummaries((sizeRows ?? []).filter(isTrustedIndependentSize)),
    [sizeRows]
  );
  const visibleSizeRows = useMemo(
    () => (sizeRows ?? []).filter(isTrustedIndependentSize),
    [sizeRows]
  );
  const hiddenRawSizeCount = (sizeRows?.length ?? 0) - visibleSizeRows.length;

  const speciesCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.species) m[r.species] = (m[r.species] || 0) + 1;
    });
    return m;
  }, [rows]);

  const genderCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const g = r.gender ?? "Unknown";
      m[g] = (m[g] || 0) + 1;
    });
    return m;
  }, [rows]);

  const ageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.age_class) m[r.age_class] = (m[r.age_class] || 0) + 1;
    });
    return m;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const mantaNeedle = mantaIdPrefix.trim().toLowerCase();
    const nameNeedle = namePrefix.trim().toLowerCase();
    const catalogNeedle = catalogPrefix.trim().toLowerCase();

    const textOK = (r: MantaSizeRow) => {
      if (!term) return true;

      return (
        String(r.pk_manta_id ?? "").toLowerCase().includes(term) ||
        String(r.fk_catalog_id ?? "").toLowerCase().includes(term) ||
        String(r.name ?? "").toLowerCase().includes(term)
      );
    };

    const mantaOK = (r: MantaSizeRow) =>
      !mantaNeedle || String(r.pk_manta_id ?? "").toLowerCase().startsWith(mantaNeedle);

    const nameOK = (r: MantaSizeRow) =>
      !nameNeedle || String(r.name ?? "").toLowerCase().startsWith(nameNeedle);

    const catalogOK = (r: MantaSizeRow) =>
      !catalogNeedle || String(r.fk_catalog_id ?? "").toLowerCase().startsWith(catalogNeedle);

    const speciesOK = (r: MantaSizeRow) =>
      filterSpecies.length === 0 || (r.species ? filterSpecies.includes(r.species) : false);

    const genderOK = (r: MantaSizeRow) =>
      filterGender.length === 0 || filterGender.includes(r.gender ?? "Unknown");

    const ageOK = (r: MantaSizeRow) =>
      filterAge.length === 0 || (r.age_class ? filterAge.includes(r.age_class) : false);

    const multOK = (r: MantaSizeRow) =>
      !onlyMultiple || Number(r.total_sizes ?? 0) > 1;

    const out = rows.filter(
      (r) =>
        textOK(r) &&
        mantaOK(r) &&
        nameOK(r) &&
        catalogOK(r) &&
        speciesOK(r) &&
        genderOK(r) &&
        ageOK(r) &&
        multOK(r)
    );

    out.sort((a, b) =>
      sortAsc ? a.pk_manta_id - b.pk_manta_id : b.pk_manta_id - a.pk_manta_id
    );

    return out;
  }, [
    rows,
    search,
    mantaIdPrefix,
    namePrefix,
    catalogPrefix,
    filterSpecies,
    filterGender,
    filterAge,
    onlyMultiple,
    sortAsc,
  ]);

  const summaryLine = useMemo(() => {
    const parts: string[] = [];
    if (mantaIdPrefix) parts.push(`Manta ID starts with: ${mantaIdPrefix}`);
    if (namePrefix) parts.push(`Name starts with: ${namePrefix}`);
    if (catalogPrefix) parts.push(`Catalog ID starts with: ${catalogPrefix}`);
    if (filterSpecies.length) parts.push(`Species: ${filterSpecies.join(", ")}`);
    if (filterGender.length) parts.push(`Gender: ${filterGender.join(", ")}`);
    if (filterAge.length) parts.push(`Age: ${filterAge.join(", ")}`);
    if (onlyMultiple) parts.push("Independent Sizes > 1");
    return parts.join("; ");
  }, [mantaIdPrefix, namePrefix, catalogPrefix, filterSpecies, filterGender, filterAge, onlyMultiple]);

  const clearAll = () => {
    setSearch("");
    setMantaIdPrefix("");
    setNamePrefix("");
    setCatalogPrefix("");
    setFilterSpecies([]);
    setFilterGender([]);
    setFilterAge([]);
    setOnlyMultiple(false);
    setSortAsc(true);
  };

  const pillMenu = (
    label: string,
    selected: string[],
    setSelected: (v: string[]) => void,
    options: string[],
    counts: Record<string, number>
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-sm">
          {label}
          {selected.length ? ` (${selected.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-medium text-sm">{label}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setSelected([])}
          >
            All
          </Button>
        </div>
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-sm"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() =>
                  setSelected(
                    selected.includes(opt)
                      ? selected.filter((v) => v !== opt)
                      : [...selected, opt]
                  )
                }
              />
              {opt || "—"}
            </div>
            <span className="text-xs text-muted-foreground">{counts[opt] ?? 0}</span>
          </label>
        ))}
        {options.length === 0 && <div className="text-xs text-muted-foreground">— none —</div>}
      </PopoverContent>
    </Popover>
  );

  return (
    <Layout title="Sizes">
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Sizes</h1>
      </div>

      <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm">
        <div className="text-sm text-blue-800 mb-3">
          <a href="/browse/data" className="hover:underline">
            ← Return to Browse Data
          </a>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Manta ID, Catalog ID, or Name…"
          className="mb-3 w-full sm:w-80 bg-white"
        />

        <div className="bg-white shadow p-4 rounded border">
          <div className="grid grid-cols-3 items-center mb-3">
            <div className="text-sm font-medium">Filter Size by:</div>

            <div className="flex justify-center">
              <Button variant="link" size="sm" onClick={clearAll}>
                Clear All Filters
              </Button>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpenStats(true)}>
                Size Stats
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {pillMenu("Species", filterSpecies, setFilterSpecies, speciesOptions, speciesCounts)}
            {pillMenu("Gender", filterGender, setFilterGender, genderOptions, genderCounts)}
            {pillMenu("Age Class", filterAge, setFilterAge, ageOptions, ageCounts)}

            <Button
              variant={onlyMultiple ? "default" : "outline"}
              className="text-sm"
              onClick={() => setOnlyMultiple((v) => !v)}
              title="Show only manta encounters with more than one independent size measurement"
            >
              Independent Sizes &gt; 1 {onlyMultiple ? "✓" : ""}{" "}
              <span className="ml-1 text-xs text-muted-foreground">({gt1Count})</span>
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            <div>
              <div className="text-xs text-gray-600 mb-1">Manta ID (starts with)</div>
              <Input
                value={mantaIdPrefix}
                onChange={(e) => setMantaIdPrefix(e.target.value)}
                placeholder="e.g., 73..."
                className="bg-white text-sm"
              />
            </div>

            <div>
              <div className="text-xs text-gray-600 mb-1">Name (starts with)</div>
              <Input
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                placeholder="e.g., Ta..."
                className="bg-white text-sm"
              />
            </div>

            <div>
              <div className="text-xs text-gray-600 mb-1">Catalog ID (starts with)</div>
              <Input
                value={catalogPrefix}
                onChange={(e) => setCatalogPrefix(e.target.value)}
                placeholder="e.g., 12..."
                className="bg-white text-sm"
              />
            </div>
          </div>

          <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
            <span>Sort by Manta ID</span>
            <Button
              size="icon"
              variant="ghost"
              className={sortAsc ? "text-blue-600" : ""}
              onClick={() => setSortAsc(true)}
            >
              ▲
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={!sortAsc ? "text-blue-600" : ""}
              onClick={() => setSortAsc(false)}
            >
              ▼
            </Button>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            {loading ? "Loading…" : `${filteredRows.length} records showing of ${rows.length} total records`}
            {!loading && summaryLine ? ` (filtered by ${summaryLine})` : ""}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-12 pb-16 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
        {!loading &&
          filteredRows.map((r) => (
            <Card key={r.pk_manta_id} className="p-2">
              <div className="w-full">
                <img
                  src={r.thumbnail_url || "/manta-logo.svg"}
                  alt={r.name ?? `Manta ${r.pk_manta_id}`}
                  className="w-full aspect-square object-contain rounded border"
                  onError={(ev) => {
                    (ev.currentTarget as HTMLImageElement).src = "/manta-logo.svg";
                  }}
                  loading="lazy"
                />
              </div>

              <div className="mt-3 space-y-0.5 text-xs text-gray-700">
                <div className="text-blue-600 font-bold text-sm">
                  {r.name || `Manta ${r.pk_manta_id}`}
                </div>
                <div>Manta ID: {fmtN(r.pk_manta_id)}</div>
                <div>Catalog ID: {fmtN(r.fk_catalog_id)}</div>
                <div>Species: {r.species || "—"}</div>
                <div>Gender: {r.gender || "—"}</div>
                <div>Age: {r.age_class || "—"}</div>
                <div>
                  Independent Sizes:{" "}
                  {Number(r.total_sizes ?? 0) > 1 ? (
                    <button
                      className="text-blue-600 underline"
                      onClick={() => setOpenSizesFor(r)}
                    >
                      {fmtN(r.total_sizes)}
                    </button>
                  ) : (
                    fmtN(r.total_sizes)
                  )}
                </div>
                <div>Mean Size: {fmtM(r.manta_size_m)}</div>
              </div>
            </Card>
          ))}
      </div>

      <Modal
        open={openSizesFor != null}
        title={openSizesFor ? `Manta ${openSizesFor.pk_manta_id} Independent Sizes` : "Independent Sizes"}
        onClose={() => {
          setOpenSizesFor(null);
          setSizeRows(null);
        }}
      >
        {!sizeRows ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : visibleSizeRows.length === 0 ? (
          <div className="text-sm text-gray-500">No independent size measurements found for this manta encounter.</div>
        ) : (
          <div className="space-y-3">
            {hiddenRawSizeCount > 0 ? (
              <div className="rounded border bg-slate-50 p-3 text-xs text-slate-600">
                {hiddenRawSizeCount} raw size row{hiddenRawSizeCount === 1 ? "" : "s"} without trusted legacy Size ID data are hidden from this independent measurement list.
              </div>
            ) : null}
            {openSizeCalibrationSummaries.length > 0 ? (
              <div className="rounded border bg-slate-50 p-3 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Calibration / scale:</span>{" "}
                {openSizeCalibrationSummaries.length === 1
                  ? openSizeCalibrationSummaries[0]
                  : `${openSizeCalibrationSummaries.length} calibration scales used`}
              </div>
            ) : null}
            <div className="overflow-auto">
              <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Size ID</th>
                  <th className="py-2 pr-4">Photo</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Shot</th>
                  <th className="py-2 pr-4">Scale px</th>
                  <th className="py-2 pr-4">DL m</th>
                  <th className="py-2 pr-4">DW m</th>
                  <th className="py-2 pr-4">DW/DL</th>
                  <th className="py-2 pr-4">Measured On</th>
                  <th className="py-2 pr-4">Sighting</th>
                  <th className="py-2 pr-4">Photo Code</th>
                  <th className="py-2 pr-4">Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleSizeRows.map((row) => {
                  const photo = sizePhotos.get(photoCodeId(row) ?? -1);
                  return (
                    <tr key={row.pk_manta_size_id} className="border-b align-top">
                      <td className="py-2 pr-4">{fmtN(legacySizeId(row))}</td>
                      <td className="py-2 pr-4">
                        {photo?.thumbnail_url ? (
                          <img src={photo.thumbnail_url} alt={`photo ${photo.pk_photo_id}`} className="h-14 w-14 rounded border object-cover" />
                        ) : (
                          "—"
                        )}
	                      </td>
	                      <td className="py-2 pr-4">{sizeMeasurementLabel(row)}</td>
                        <td className="py-2 pr-4">{legacyShotType(row) || "—"}</td>
                        <td className="py-2 pr-4">{scalePx(row) == null ? "—" : scalePx(row)?.toFixed(1)}</td>
	                      <td className="py-2 pr-4">{formatMeters(dlM(row))}</td>
	                      <td className="py-2 pr-4">{formatMeters(dwM(row))}</td>
	                      <td className="py-2 pr-4">{formatRatio(dwDlRatio(row))}</td>
	                      <td className="py-2 pr-4">{row.measured_on || "—"}</td>
	                      <td className="py-2 pr-4">{fmtN(row.fk_sighting_id)}</td>
	                      <td className="py-2 pr-4">{row.photo_code || "—"}</td>
	                      <td className="py-2 pr-4">{row.quality_note || row.src_file || photo?.file_name2 || "—"}</td>
	                    </tr>
	                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={openStats} title="Size Stats" onClose={() => setOpenStats(false)}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Total Mantas</div>
            <div className="text-lg font-semibold">{fmtN(summary?.total_mantas)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Catalog IDs</div>
            <div className="text-lg font-semibold">{fmtN(summary?.catalog_ids)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Males</div>
            <div className="text-lg font-semibold">{fmtN(summary?.males)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Females</div>
            <div className="text-lg font-semibold">{fmtN(summary?.females)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Adults</div>
            <div className="text-lg font-semibold">{fmtN(summary?.adults)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-gray-500">Juveniles</div>
            <div className="text-lg font-semibold">{fmtN(summary?.juveniles)}</div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">Age Group</th>
                <th className="py-2 pr-4">Gender</th>
                <th className="py-2 pr-4">Mean</th>
                <th className="py-2 pr-4">Min</th>
                <th className="py-2 pr-4">Max</th>
                <th className="py-2 pr-4">N</th>
                <th className="py-2 pr-4">Std Dev</th>
              </tr>
            </thead>
            <tbody>
              {quads.map((q, idx) => (
                <tr key={`${q.age_group}-${q.gender}-${idx}`} className="border-b">
                  <td className="py-2 pr-4">{q.age_group}</td>
                  <td className="py-2 pr-4">{q.gender}</td>
                  <td className="py-2 pr-4">{fmtM(q.mean_m)}</td>
                  <td className="py-2 pr-4">{fmtM(q.min_m)}</td>
                  <td className="py-2 pr-4">{fmtM(q.max_m)}</td>
                  <td className="py-2 pr-4">{fmtN(q.n)}</td>
                  <td className="py-2 pr-4">{q.std_m == null ? "—" : Number(q.std_m).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <BackToTopButton />
    </Layout>
  );
}
