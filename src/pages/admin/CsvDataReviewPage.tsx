import { useState } from 'react';
import Papa from 'papaparse';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

const REQUIRED_HEADERS = [
  'pk_survey_id', 'date2', 'month_name', 'year', 'survey_no', 'sighting_no', 'island',
  'region', 'sitelocation', 'latitude', 'longitude', 'start_time', 'end_time',
  'organization', 'photographer', 'total_mantas', 'skunks', 'behavior',
  'injuries_observed', 'tidal_state', 'day_night', 'notes', 'standardize_survey',
  'total_manta_ids', 'list_manta_ids', 'total_mantas_sized', 'total_mantas_biopsied',
  'total_survey_time'
];

const isValidDate = (val: string) => /^\d{4}-\d{2}-\d{2}$/.test(val);
const isValidTime = (val: string) => /^\d{2}:\d{2}(:\d{2})?$/.test(val);
const isValidFloat = (val: string) => /^-?\d+(\.\d+)?$/.test(val);
const isValidInt = (val: string) => /^\d+$/.test(val);

export default function CsvDataReviewPage() {
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<number, string[]>>({});
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);

  const validateRow = (row: Record<string, string>): string[] => {
    const errs: string[] = [];

    if (!row['pk_survey_id']) errs.push('Missing pk_survey_id');
    if (row['date2'] && !isValidDate(row['date2'])) errs.push('Invalid date2');
    if (row['start_time'] && !isValidTime(row['start_time'])) errs.push('Invalid start_time');
    if (row['end_time'] && !isValidTime(row['end_time'])) errs.push('Invalid end_time');
    if (row['total_survey_time'] && !isValidTime(row['total_survey_time'])) errs.push('Invalid total_survey_time');
    if (row['latitude'] && !isValidFloat(row['latitude'])) errs.push('Invalid latitude');
    if (row['longitude'] && !isValidFloat(row['longitude'])) errs.push('Invalid longitude');
    if (row['year'] && !isValidInt(row['year'])) errs.push('Invalid year');

    return errs;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = results.data as Record<string, string>[];
        const foundHeaders = results.meta.fields || [];

        if (!parsedRows.length || !foundHeaders.length) {
          toast({ title: 'Invalid CSV', description: 'No rows or headers found.', variant: 'destructive' });
          return;
        }

        const missing = REQUIRED_HEADERS.filter((h) => !foundHeaders.includes(h));
        setMissingHeaders(missing);
        setHeaders(foundHeaders);
        setCsvRows(parsedRows);

        const rowErrors: Record<number, string[]> = {};
        parsedRows.forEach((row, idx) => {
          const errs = validateRow(row);
          if (errs.length > 0) rowErrors[idx] = errs;
        });

        setErrors(rowErrors);
        if (missing.length > 0) {
          toast({
            title: 'Missing headers',
            description: `${missing.length} required field(s) missing: ${missing.join(', ')}`,
            variant: 'destructive'
          });
        }
      },
      error: (err) => {
        console.error('CSV parse error:', err);
        toast({ title: 'Error parsing CSV', description: err.message, variant: 'destructive' });
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto mt-10 px-4">
        <h1 className="text-2xl font-bold mb-4">📊 CSV Data Review</h1>

        <p className="text-gray-600 mb-2">
          Upload a metadata CSV file to preview and validate before importing.
        </p>

        <Input type="file" accept=".csv" onChange={handleFileUpload} />

        {missingHeaders.length > 0 && (
          <div className="mt-4 text-red-600">
            <p className="font-semibold">⚠️ Missing Required Headers:</p>
            <ul className="list-disc ml-6 text-sm">
              {missingHeaders.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {csvRows.length > 0 && (
          <div className="mt-6">
            <p>
              Previewing <strong>{csvRows.length}</strong> rows.{' '}
              {Object.keys(errors).length > 0 ? (
                <span className="text-red-600 font-semibold">
                  {Object.keys(errors).length} invalid row(s).
                </span>
              ) : (
                <span className="text-green-600 font-semibold">All rows valid.</span>
              )}
            </p>

            <div className="overflow-x-auto border rounded mt-4">
              <table className="text-sm table-fixed w-full">
                <thead className="bg-gray-100">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="p-2 border-b text-left font-medium w-36">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 50).map((row, i) => (
                    <tr
                      key={i}
                      className={errors[i] ? 'bg-red-100 border-t border-red-300' : 'border-t'}
                    >
                      {headers.map((h, j) => (
                        <td
                          key={j}
                          className="truncate whitespace-nowrap overflow-hidden p-2 border-b h-10 align-top text-xs"
                        >
                          {row[h]}
                          {j === 0 && errors[i] && (
                            <div className="text-red-600 text-[11px] mt-1">
                              {errors[i].join(', ')}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 px-2 py-1">Only showing first 50 rows</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
