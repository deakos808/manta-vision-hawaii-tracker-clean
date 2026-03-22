import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import DroneMonthSummary from "@/components/DroneMonthSummary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DronePhotosMapModal, { PhotoPoint } from "@/components/maps/DronePhotosMapModal";

type SurveyRow = {
  pk_drone_survey: string;
  survey_date: string | null;
  location: string | null;
  min_mantas_observed: number | null;
  total_photos: number;
};

type PhotoRow = {
  id: string;
  path: string;
  url: string;
  ts: string | null;
  pilot: string | null;
  total_mantas: number | null;
  lat: number | null;
  lon: number | null;
};

export default function DroneSurveysPage() {
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [search, setSearch] = useState("");
  const [loc, setLoc] = useState("");
  const [date, setDate] = useState("");
  const [isDesc, setIsDesc] = useState(true);

  const [openPhotos, setOpenPhotos] = useState(false);
  const [photosTitle, setPhotosTitle] = useState("Survey Photos");
  const [photoList, setPhotoList] = useState<PhotoRow[]>([]);

  const [openMap, setOpenMap] = useState(false);
  const [mapPoints, setMapPoints] = useState<PhotoPoint[]>([]);

  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_drone_surveys_card_rows")
        .select("pk_drone_survey,survey_date,location,min_mantas_observed,total_photos")
        .order("survey_date", { ascending: false });

      if (error) {
        console.error("[drone] fetch error", error);
        return;
      }

      setRows((data as SurveyRow[]) ?? []);
    })();
  }, []);

  const locations = useMemo(
    () => Array.from(new Set(rows.map((r) => (r.location || "").trim()).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = rows.filter((r) => {
      const hit =
        !q ||
        String(r.pk_drone_survey).toLowerCase().includes(q) ||
        (r.location || "").toLowerCase().includes(q);

      const locOK = !loc || (r.location || "") === loc;
      const dateOK = !date || (r.survey_date || "") === date;

      return hit && locOK && dateOK;
    });

    list.sort((a, b) => {
      const ad = a.survey_date ? Date.parse(a.survey_date) : 0;
      const bd = b.survey_date ? Date.parse(b.survey_date) : 0;
      return isDesc ? bd - ad : ad - bd;
    });

    return list;
  }, [rows, search, loc, date, isDesc]);

  return (
    <Layout>
      <div className="min-h-screen">
        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 text-center shadow">
          <h1 className="text-4xl font-bold">Drone Surveys</h1>
        </div>

        <div className="px-4 sm:px-8 lg:px-16 py-3 text-sm">
          <a href="/browse/data" className="text-blue-600 hover:underline">
            &larr; Return to Browse Data
          </a>
        </div>

        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Search</span>
              <Input
                className="w-full sm:w-72 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Survey ID or Location…"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded border px-3 py-2 bg-white text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Location</span>
              <select
                className="h-10 text-sm border rounded px-2 py-1 bg-white min-w-[180px]"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
              >
                <option value="">All</option>
                {locations.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setLoc("");
                setDate("");
                setIsDesc(true);
              }}
            >
              Clear Filters
            </Button>

            <Button variant="outline" onClick={() => setSummaryOpen(true)}>
              Drone Summary
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-16 pt-3">
          <div className="rounded border bg-amber-50 border-amber-200 px-4 py-3 text-sm text-amber-900">
            Only committed drone surveys appear here. Newly submitted drone surveys remain in
            <span className="font-medium"> Admin → Drone Review </span>
            until committed.
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-16 py-3 text-sm text-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>{filtered.length} surveys showing of {rows.length} total</div>

            <Button
              variant="outline"
              onClick={async () => {
                const ids = filtered.map((f) => f.pk_drone_survey);

                if (ids.length === 0) {
                  setMapPoints([]);
                  setOpenMap(true);
                  return;
                }

                const { data, error } = await supabase
                  .from("drone_photos")
                  .select("pk_drone_photo, fk_drone_survey, drone_photo_lat, drone_photo_lon, drone_photo_timestamp, total_mantas, drone_pilot")
                  .in("fk_drone_survey", ids);

                if (error) {
                  console.error("[drone] map fetch error", error);
                  return;
                }

                const pts: PhotoPoint[] = (data ?? [])
                  .filter((p: any) => p.drone_photo_lat != null && p.drone_photo_lon != null)
                  .map((p: any) => ({
                    id: p.pk_drone_photo,
                    lat: Number(p.drone_photo_lat),
                    lon: Number(p.drone_photo_lon),
                    ts: p.drone_photo_timestamp ?? null,
                    pilot: p.drone_pilot ?? null,
                    mantas: typeof p.total_mantas === "number" ? p.total_mantas : 0,
                  }));

                setMapPoints(pts);
                requestAnimationFrame(() => setOpenMap(true));
              }}
            >
              View Map
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Sort surveys by Date</span>
            <button
              className="px-2 py-1 border rounded bg-white hover:bg-muted/50"
              onClick={() => setIsDesc((v) => !v)}
              title="Toggle date sort"
            >
              {isDesc ? "▼" : "▲"}
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-8 lg:px-16 pb-16">
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Location</th>
                  <th className="text-left px-3 py-2">Min Mantas</th>
                  <th className="text-left px-3 py-2">Total Photos</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr key={r.pk_drone_survey} className="border-t">
                    <td className="px-3 py-2">{r.survey_date ?? "—"}</td>
                    <td className="px-3 py-2">{r.location ?? "—"}</td>
                    <td className="px-3 py-2">{r.min_mantas_observed ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{r.total_photos}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const { data, error } = await supabase
                              .from("drone_photos")
                              .select("pk_drone_photo, drone_photo_timestamp, total_mantas, drone_photo_lat, drone_photo_lon, drone_pilot")
                              .eq("fk_drone_survey", r.pk_drone_survey)
                              .order("drone_photo_timestamp", { ascending: true });

                            if (error) {
                              console.error("[drone] photos fetch error", error);
                              return;
                            }

                            const list = (data ?? []).map((p: any) => {
                              const path = p.pk_drone_photo as string;
                              const url = supabase.storage.from("drone-photo").getPublicUrl(path).data.publicUrl;

                              return {
                                id: p.pk_drone_photo as string,
                                path,
                                url,
                                ts: p.drone_photo_timestamp as string | null,
                                pilot: p.drone_pilot as string | null,
                                total_mantas: p.total_mantas as number | null,
                                lat: p.drone_photo_lat as number | null,
                                lon: p.drone_photo_lon as number | null,
                              };
                            });

                            setPhotoList(list);
                            setPhotosTitle(`Survey ${r.pk_drone_survey} — Photos`);
                            setOpenPhotos(true);
                          }}
                        >
                          View Photos
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>
                      No surveys found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle className="text-center">Drone Survey Summary</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              <DroneMonthSummary centered />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openPhotos} onOpenChange={setOpenPhotos}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>{photosTitle}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2 max-h-[70vh] overflow-auto">
              {photoList.length === 0 ? (
                <div className="text-sm text-slate-500">No photos found for this survey.</div>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {photoList.map((p) => (
                    <div key={p.id} className="border rounded p-3 bg-white text-sm">
                      <div className="overflow-hidden rounded border bg-white mb-3">
                        <img
                          src={p.url}
                          alt={p.path}
                          className="w-full h-56 object-contain bg-white"
                        />
                      </div>

                      <div className="font-medium break-all text-slate-700">{p.path}</div>
                      <div className="mt-2 text-slate-600">Time: {p.ts || "—"}</div>
                      <div className="text-slate-600">Pilot: {p.pilot || "—"}</div>
                      <div className="text-slate-600">Mantas: {p.total_mantas ?? "—"}</div>
                      <div className="text-slate-600">Lat: {p.lat ?? "—"}</div>
                      <div className="text-slate-600">Lon: {p.lon ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <DronePhotosMapModal
          open={openMap}
          onClose={() => setOpenMap(false)}
          points={mapPoints}
        />
      </div>
    </Layout>
  );
}
