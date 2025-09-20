// src/components/admin/UniversalCsvUpdateTool.tsx

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'react-hot-toast';
import { parseCsvFile } from '@/lib/parseCsvFile';

const SUPABASE_EDGE_URL =
  import.meta.env.VITE_SUPABASE_EDGE_URL ||
  'https://apweteosdbgsolmvcmhn.supabase.co/functions/v1';

const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export default function UniversalCsvUpdateTool() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [existingColumns, setExistingColumns] = useState<string[]>([]);
  const [newColumns, setNewColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);

  useEffect(() => {
    if (parsedRows.length === 0) return;

    const headers = Object.keys(parsedRows[0]);
    console.log('[DEBUG] Headers from CSV:', headers);

    fetch(`${SUPABASE_EDGE_URL}/pg_get_columns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ table_name: 'catalog' }),
    })
      .then((res) => res.json())
      .then((data) => {
        const current = data.columns || [];
        console.log('[DEBUG] Existing columns:', current);

        const newCols = headers.filter(
          (h) => !current.includes(h) && h !== 'pk_catalog_id'
        );
        console.log('[DEBUG] New columns to add:', newCols);

        setExistingColumns(current);
        setNewColumns(newCols);
        setHasPreviewed(true);
      })
      .catch((err) => {
        toast.error('Failed to check existing columns');
        console.error('[ERROR] Column fetch failed:', err);
      });
  }, [parsedRows]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    console.log('[DEBUG] Uploaded file:', uploadedFile);

    try {
      const parsed = await parseCsvFile(uploadedFile);
      console.log('[DEBUG] Parsed rows (first 3):', parsed.slice(0, 3));

      if (!parsed.every((row) => 'pk_catalog_id' in row)) {
        toast.error('Missing pk_catalog_id in one or more rows');
        return;
      }

      setFile(uploadedFile);
      setParsedRows(parsed);
      toast.success(`Parsed ${parsed.length} rows`);
    } catch (err) {
      console.error('[ERROR] CSV parsing failed:', err);
      toast.error('CSV parsing failed');
    }
  };

  const confirmAndSend = async () => {
    if (!file || parsedRows.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch(`${SUPABASE_EDGE_URL}/update-catalog-columns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ rows: parsedRows }),
      });

      const data = await res.json();
      console.log('[DEBUG] Update response:', data);

      if (res.ok && data.success) {
        if (data.updated > 0 && (data.errors?.length ?? 0) === 0) {
          toast.success(`✅ Successfully updated ${data.updated} rows.`);
        } else if (data.updated > 0 && data.errors?.length > 0) {
          toast.success(
            `⚠️ Updated ${data.updated} rows, but ${data.errors.length} rows had issues.`
          );
          console.warn('[WARN] Update partial errors:', data.errors);
        } else if (data.updated === 0 && (data.errors?.length ?? 0) > 0) {
          toast.error(`⚠️ No rows updated. ${data.errors.length} errors logged.`);
          console.error('[ERROR] All update attempts failed:', data.errors);
        } else {
          toast.success('No changes needed.');
        }
      } else {
        toast.error(`❌ Update failed: ${data.error || 'Unknown error'}`);
        console.error('[ERROR] Update failure:', data);
      }
    } catch (err) {
      console.error('[ERROR] Update request failed:', err);
      toast.error('Update request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">🔄 Catalog Metadata Updater</h1>
      <Input type="file" accept=".csv" onChange={handleFileChange} />

      {hasPreviewed && (
        <div className="bg-yellow-100 text-yellow-800 p-4 rounded-md">
          <p className="font-medium mb-2">🧪 Preview</p>
          <p>
            Detected <strong>{parsedRows.length}</strong> rows
          </p>
          <p>
            Primary Key: <code>pk_catalog_id</code>
          </p>
          {newColumns.length > 0 ? (
            <>
              <p className="mt-2">🆕 The following columns will be added:</p>
              <ul className="list-disc list-inside">
                {newColumns.map((col) => (
                  <li key={col}>{col}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2">✅ All columns already exist in the table.</p>
          )}
        </div>
      )}

      <div>
        <Button
          disabled={!hasPreviewed || parsedRows.length === 0 || loading}
          onClick={confirmAndSend}
        >
          {loading ? 'Updating...' : `Run Update (${parsedRows.length} rows)`}
        </Button>
      </div>
    </div>
  );
}
