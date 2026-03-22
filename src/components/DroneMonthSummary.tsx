import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  month_num: number;
  month_name: string;
  surveys: number;
  total_mantas: number;
  mantas_per_survey: number;
};

type Props = {
  centered?: boolean;
};

export default function DroneMonthSummary({ centered = false }: Props) {
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

  const thClass = centered ? "px-3 py-2 text-center" : "text-left px-3 py-2";
  const tdMonthClass = centered ? "px-3 py-2 text-center" : "px-3 py-2";
  const tdNumClass = centered ? "px-3 py-2 text-center" : "px-3 py-2 text-right";

  return (
    <div className={centered ? "" : "px-4 sm:px-8 lg:px-16 mb-3"}>
      <div className="rounded border bg-white overflow-x-auto">
        <div className={`px-3 py-2 font-semibold text-gray-800 border-b ${centered ? "text-center" : ""}`}>
          Monthly Drone Survey Summary
        </div>

        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className={thClass}>Month</th>
              <th className={thClass}>Surveys</th>
              <th className={thClass}>Total Mantas</th>
              <th className={thClass}>Mantas / Survey</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500 text-center" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500 text-center" colSpan={4}>
                  No data
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.month_num} className="border-t">
                  <td className={tdMonthClass}>{r.month_name}</td>
                  <td className={tdNumClass}>{r.surveys}</td>
                  <td className={tdNumClass}>{r.total_mantas}</td>
                  <td className={tdNumClass}>
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
