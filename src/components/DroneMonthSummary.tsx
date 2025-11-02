import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  month_num: number;
  month_name: string;
  surveys: number;
  total_mantas: number;
  mantas_per_survey: number;
};

export default function DroneMonthSummary() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_drone_month_summary")
        .select("*")
        .order("month_num", { ascending: true });
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="px-4 sm:px-8 lg:px-16 mb-3">
      <div className="rounded border bg-white overflow-x-auto">
        <div className="px-3 py-2 font-semibold text-gray-800 border-b">
          Monthly Drone Survey Summary
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Month</th>
              <th className="text-right px-3 py-2">Surveys</th>
              <th className="text-right px-3 py-2">Total Mantas</th>
              <th className="text-right px-3 py-2">Mantas / Survey</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={4}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={4}>No data</td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.month_num} className="border-t">
                  <td className="px-3 py-2">{r.month_name}</td>
                  <td className="px-3 py-2 text-right">{r.surveys}</td>
                  <td className="px-3 py-2 text-right">{r.total_mantas}</td>
                  <td className="px-3 py-2 text-right">
                    {Number.isFinite(r.mantas_per_survey) ? r.mantas_per_survey.toFixed(2) : "0.00"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
