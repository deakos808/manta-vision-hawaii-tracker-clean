import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
// Adjust this import path to your Supabase client singleton:
import { supabase } from '../lib/supabaseClient';

type ImportTarget = 'surveys' | 'photos';

type CommitResult = {
  batch: string;
  target: 'drone_surveys' | 'drone_photos';
  inserted: number;
  updated: number;
  invalid: number;
  skipped: number;
  errors_table: string;
  invalid_view: string;
};

const CHUNK_SIZE = 1000;

function useBatchId() {
  const ref = useRef<string>('');
  if (!ref.current) ref.current = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  return ref.current;
}

// Basic admin guard via app_metadata.role === 'admin'
// (UI is already guarded elsewhere; this is belt-and-suspenders)
async function isAdmin(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const role = (data?.user?.app_metadata as any)?.role;
  const isAdminFlag = (data?.user?.app_metadata as any)?.is_admin;
  return role === 'admin' || isAdminFlag === true;
}

async function fileToRows(file: File): Promise<any[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return await new Promise((resolve, reject) => {
      Papa.parse(file, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false,
        complete: (res) => resolve(res.data as any[]), error: reject });
    });
  }
  // xlsx path
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null }); // headers in row 1
}

export default function ImportCsvPanel() {
  const [target, setTarget] = useState<ImportTarget>('surveys');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<CommitResult | null>(null);

  const batchId = useBatchId();

  const tableName = useMemo(
    () => (target === 'surveys' ? 'stg_drone_surveys' : 'stg_drone_photos'),
    [target]
  );
  const commitFn = useMemo(
    () => (target === 'surveys' ? 'fn_imports_commit_drone_surveys' : 'fn_imports_commit_drone_photos'),
    [target]
  );

  const appendLog = (s: string) => setLog((prev) => [...prev, s]);

  async function handleImport() {
    setResult(null);
    if (!file) { appendLog('Choose a CSV file first.'); return; }
    if (!(await isAdmin())) { appendLog('Not authorized (admin only).'); return; }

    setBusy(true);
    appendLog(`Batch: ${batchId}`);
    appendLog(`Parsing ${file.name} ...`);

    const rows: any[] = await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        complete: (res) => resolve(res.data as any[]),
        error: reject,
      });
    });

    appendLog(`Parsed ${rows.length} rows`);

    // map rows -> staging shape
    const mapped = rows.map((r, i) => {
      const row_no = i + 2; // account for header
      const common = {
        import_batch_id: batchId,
        source_file: file.name,
        row_no,
        raw: r,
      };
      if (target === 'surveys') {
        return {
          ...common,
          pk_drone_survey_text: r.pk_drone_survey ?? r.pk_drone_survey_text ?? null,
          survey_date_text: r.survey_date ?? r.survey_date_text ?? null,
          drone_pilot: r.drone_pilot ?? null,
          population: r.population ?? null,
          island: r.island ?? null,
          region: r.region ?? null,
          location: r.location ?? null,
          notes: r.notes ?? null,
        };
      } else {
        return {
          ...common,
          pk_drone_photo_text: r.pk_drone_photo ?? r.pk_drone_photo_text ?? null,
          fk_drone_survey_text: r.fk_drone_survey ?? r.fk_drone_survey_text ?? null,
          drone_photo_lat_text: r.drone_photo_lat ?? r.drone_photo_lat_text ?? null,
          drone_photo_lon_text: r.drone_photo_lon ?? r.drone_photo_lon_text ?? null,
          drone_photo_timestamp_text: r.drone_photo_timestamp ?? r.drone_photo_timestamp_text ?? null,
          total_mantas_text: r.total_mantas ?? r.total_mantas_text ?? null,
          gquicksearch: r.gquicksearch ?? null,
        };
      }
    });

    // chunked inserts
    let written = 0;
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      appendLog(`Inserting rows ${i + 1}–${i + chunk.length} into ${tableName} ...`);
      const { error } = await supabase.from(tableName).insert(chunk, { returning: 'minimal' });
      if (error) {
        appendLog(`Insert error at chunk starting ${i + 1}: ${error.message}`);
        setBusy(false);
        return;
      }
      written += chunk.length;
    }
    appendLog(`Staged ${written} rows.`);

    // Commit
    appendLog(`Commit via ${commitFn} ...`);
    const { data, error } = await supabase.rpc(commitFn, { p_batch: batchId });
    if (error) {
      appendLog(`Commit failed: ${error.message}`);
      setBusy(false);
      return;
    }
    appendLog('Commit complete.');
    setResult(data as CommitResult);
    setBusy(false);
  }

  async function loadInvalid() {
  appendLog('Loading invalid rows for this batch…');
  const view =
    target === 'surveys' ? 'v_stg_invalid_drone_surveys'
    : target === 'photos' ? 'v_stg_invalid_drone_photos'
    : 'v_stg_invalid_biopsies';
  const { data, error } = await supabase
    .from(view)
    .select('*')
    .eq('import_batch_id', batchId)
    .limit(2000);
  if (error) { appendLog('Invalid fetch error: ' + error.message); return; }
  appendLog(`Invalid rows loaded: ${data?.length ?? 0}`);
  console.log('Invalid rows', data);
  alert(`Invalid rows: ${data?.length ?? 0}. Check console for details.`);
}

return (
  <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">CSV Import (Admin)</h1>

      <div className="flex gap-4 items-center mb-4">
        <label className="font-medium">Dataset</label>
        <select
          className="border rounded px-3 py-2"
          value={target}
          onChange={(e) => setTarget(e.target.value as ImportTarget)}
        >
          <option value="surveys">Surveys</option>
          <option value="photos">Photos</option>
        </select>
      </div>

      <div className="mb-4">
        <input
          type="file"
          accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mb-4">
        <button
          disabled={busy || !file}
          onClick={handleImport}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Upload & Commit'}
        </button>
      </div>

      <div className="mb-6 text-sm text-gray-600">
        <div>Batch ID: <code>{batchId}</code></div>
        <div>Staging table: <code>{tableName}</code></div>
        <div>Commit RPC: <code>{commitFn}(p_batch uuid)</code></div>
        <div className="mt-2">Tip: Import surveys first, then photos (FK check).</div>
      </div>

      {!!result && (
        <div className="mb-6 border rounded p-4">
          <div className="font-medium mb-2">Commit summary</div>
          <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          <div className="text-sm mt-2">
            Invalid rows (if any) are in <code>{result.errors_table}</code> and view <code>{result.invalid_view}</code>.
          </div>
          <button
            onClick={loadInvalid}
            className="mt-3 px-3 py-2 rounded border"
          >
            Load invalid rows (console)
          </button>
        </div>
      )}


      {log.length > 0 && (
        <div className="border rounded p-4 bg-gray-50">
          <div className="font-medium mb-2">Log</div>
          <ul className="list-disc ml-6 text-sm">
            {log.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
