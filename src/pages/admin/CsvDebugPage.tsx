import { useState } from 'react';
import Papa from 'papaparse';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';

type Row = Record<string, string>;

export default function CsvDebugPage() {
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [cleanHeaders, setCleanHeaders] = useState<string[]>([]);
  const [firstRows, setFirstRows] = useState<Row[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(), // normalize headers
      transform: (value) => value.trim(), // normalize values
      complete: (results) => {
        const parsed = results.data;
        const headers = results.meta.fields ?? [];

        setRawHeaders(headers);
        setCleanHeaders(headers.map((h) => h.trim()));
        setFirstRows(parsed.slice(0, 3));
      },
      error: (err) => {
        console.error('CSV Parse Error:', err.message);
      },
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">🧪 CSV Debugger</h1>

        <Input type="file" accept=".csv" onChange={handleFileUpload} />

        {rawHeaders.length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-lg font-semibold">Headers</h2>
            <div className="bg-gray-50 p-4 border rounded-md text-sm">
              <div><strong>Raw:</strong> {JSON.stringify(rawHeaders)}</div>
              <div><strong>Trimmed:</strong> {JSON.stringify(cleanHeaders)}</div>
            </div>
          </div>
        )}

        {firstRows.length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-lg font-semibold">First 3 Rows (Trimmed)</h2>
            <div className="overflow-x-auto border rounded">
              <table className="text-sm w-full">
                <thead className="bg-gray-100">
                  <tr>
                    {cleanHeaders.map((h) => (
                      <th key={h} className="p-2 border-b text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {firstRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {cleanHeaders.map((h) => (
                        <td key={h} className="p-2 text-xs whitespace-nowrap">
                          {row[h] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
