import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

type CatalogStatsRow = {
  pk_catalog_id: number;
  gender?: string | null;
  age_class?: string | null;
  total_sightings?: number | null;
  populations?: string[] | null;
  islands?: string[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CatalogStatsRow[];
};

function norm(v?: string | null): string {
  return (v ?? "").toString().trim();
}

function countByArrayValue(rows: CatalogStatsRow[], key: "populations" | "islands") {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const vals = Array.isArray(row[key]) ? row[key] : [];
    for (const v of vals) {
      const s = norm(v);
      if (!s) continue;
      out[s] = (out[s] || 0) + 1;
    }
  }
  return out;
}

const COLORS = ["#2563eb", "#60a5fa", "#93c5fd", "#1d4ed8", "#3b82f6"];

function CountOnlyPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  value,
}: any) {
  if (!percent || percent < 0.08) return null;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
    >
      {value}
    </text>
  );
}

export default function CatalogStatsModal({ open, onOpenChange, rows }: Props) {
  const stats = useMemo(() => {
    const totalCatalogIds = rows.length;

    const totalMales = rows.filter((r) => norm(r.gender).toLowerCase() === "male").length;
    const totalFemales = rows.filter((r) => norm(r.gender).toLowerCase() === "female").length;
    const totalAdults = rows.filter((r) => norm(r.age_class).toLowerCase() === "adult").length;
    const totalJuveniles = rows.filter((r) => norm(r.age_class).toLowerCase() === "juvenile").length;

    const byPopulation = countByArrayValue(rows, "populations");
    const byIsland = countByArrayValue(rows, "islands");

    const resightGt2 = rows.filter((r) => Number(r.total_sightings ?? 0) > 2).length;
    const resightGt10 = rows.filter((r) => Number(r.total_sightings ?? 0) > 10).length;
    const resightGt30 = rows.filter((r) => Number(r.total_sightings ?? 0) > 30).length;
    const resightGt50 = rows.filter((r) => Number(r.total_sightings ?? 0) > 50).length;

    return {
      totalCatalogIds,
      totalMales,
      totalFemales,
      totalAdults,
      totalJuveniles,
      byPopulation,
      byIsland,
      resightGt2,
      resightGt10,
      resightGt30,
      resightGt50,
    };
  }, [rows]);

  const populationOrder = ["Big Island", "Maui Nui", "Oahu", "Kauai"];
  const islandOrder = ["Big Island", "Maui", "Molokai", "Lanai", "Kahoolawe", "Oahu", "Kauai", "Niihau"];

  const genderPie = useMemo(
    () => [
      { name: "Male", value: stats.totalMales },
      { name: "Female", value: stats.totalFemales },
    ].filter((d) => d.value > 0),
    [stats.totalMales, stats.totalFemales]
  );

  const agePie = useMemo(
    () => [
      { name: "Adult", value: stats.totalAdults },
      { name: "Juvenile", value: stats.totalJuveniles },
    ].filter((d) => d.value > 0),
    [stats.totalAdults, stats.totalJuveniles]
  );

  const populationBars = useMemo(
    () => populationOrder.map((k) => ({ name: k, value: stats.byPopulation[k] ?? 0 })),
    [stats.byPopulation]
  );

  const islandBars = useMemo(
    () => islandOrder.map((k) => ({ name: k, value: stats.byIsland[k] ?? 0 })),
    [stats.byIsland]
  );

  const resightRows = useMemo(
    () => [
      { bucket: ">2", count: stats.resightGt2 },
      { bucket: ">10", count: stats.resightGt10 },
      { bucket: ">30", count: stats.resightGt30 },
      { bucket: ">50", count: stats.resightGt50 },
    ],
    [stats.resightGt2, stats.resightGt10, stats.resightGt30, stats.resightGt50]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catalog Stats</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-slate-500 mb-2">
          Summary counts and charts for the currently loaded catalog dataset.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Totals</div>
            <div className="space-y-2 text-sm">
              <div>Total Catalog IDs: {stats.totalCatalogIds}</div>
              <div>Total Males: {stats.totalMales}</div>
              <div>Total Females: {stats.totalFemales}</div>
              <div>Total Adults: {stats.totalAdults}</div>
              <div>Total Juveniles: {stats.totalJuveniles}</div>
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Total Resights</div>
            <div className="rounded border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left">
                    <th className="px-3 py-2">Bucket</th>
                    <th className="px-3 py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {resightRows.map((r) => (
                    <tr key={r.bucket} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.bucket}</td>
                      <td className="px-3 py-2">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Gender</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderPie}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={95}
                    innerRadius={55}
                    labelLine={false}
                    label={CountOnlyPieLabel}
                  >
                    {genderPie.map((entry, idx) => (
                      <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Age Class</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={agePie}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={95}
                    innerRadius={55}
                    labelLine={false}
                    label={CountOnlyPieLabel}
                  >
                    {agePie.map((entry, idx) => (
                      <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Totals by Population</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={populationBars}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" height={60} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="font-semibold mb-3">Totals by Island</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={islandBars}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
