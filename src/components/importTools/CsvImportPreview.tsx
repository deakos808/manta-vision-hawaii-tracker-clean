// src/components/importTools/CsvImportPreview.tsx

type CsvImportPreviewProps = {
  headers: string[];
  rows: Record<string, string>[]; // or any[]
};

export default function CsvImportPreview({ headers, rows }: CsvImportPreviewProps) {
  return (
    <div className="overflow-x-auto border rounded mt-2">
      <table className="text-sm table-auto w-full">
        <thead className="bg-gray-100">
          <tr>
            {headers.map((h) => (
              <th key={h} className="p-2 border-b text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {headers.map((h) => (
                <td key={h} className="p-2 text-xs whitespace-nowrap">{row[h]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 px-2 py-1">Showing {rows.length} row(s)</p>
    </div>
  );
}
