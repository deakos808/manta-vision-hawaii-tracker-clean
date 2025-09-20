// src/pages/MetadataImportPage.tsx

import { useState } from 'react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { TABLES_WITH_CSV_SCHEMA, type TableWithCsvSchema, csvSchemas } from '@/utils/csvSchemas';
import { validateCsvRows } from '@/utils/ValidateCsvRows';
import CsvImportPreview from '@/components/importTools/CsvImportPreview';

export default function MetadataImportPage() {
  const [selectedTable, setSelectedTable] = useState<TableWithCsvSchema | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [validRows, setValidRows] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<number, string[]>>({});

  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTable(e.target.value as TableWithCsvSchema);
    setValidRows([]);
    setInvalidRows([]);
    setErrors({});
    setFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !selectedTable) return;

    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      transform: (value) => value.trim(),
      complete: (results) => {
        const rawRows = results.data as Record<string, string>[];
        console.log('[MetadataImport] Parsed rows:', rawRows.length);

        if (!TABLES_WITH_CSV_SCHEMA.includes(selectedTable as TableWithCsvSchema)) {
          toast.error(`Unsupported table selected: ${selectedTable}`);
          return;
        }

        try {
          const schema = csvSchemas[selectedTable];
          if (!schema) throw new Error(`Schema not found for table: ${selectedTable}`);

          const { validRows, invalidRows, errors } = validateCsvRows(selectedTable as TableWithCsvSchema, rawRows);
          setValidRows(validRows);
          setInvalidRows(invalidRows);
          setErrors(errors);
        } catch (err: any) {
          console.error('Validation error:', err);
          toast.error(err.message || 'Validation failed');
        }
      },
      error: (err) => {
        toast.error('CSV parsing error: ' + err.message);
      },
    });
  };

  const handleExportInvalidRows = () => {
    if (invalidRows.length === 0) return;
    const csv = Papa.unparse(invalidRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${selectedTable}_invalid_rows.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async () => {
    if (!selectedTable || validRows.length === 0) return;

    const { error } = await supabase.from(selectedTable).insert(validRows);
    if (error) {
      toast.error('Import failed: ' + error.message);
    } else {
      toast.success(`${validRows.length} records imported.`);
      setValidRows([]);
      setInvalidRows([]);
      setFile(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4">Metadata Import</h1>

        <label className="block font-medium mb-1">Choose table</label>
        <select
          value={selectedTable}
          onChange={handleTableChange}
          className="mb-4 w-full border px-2 py-1"
        >
          <option value="">Select table</option>
          {TABLES_WITH_CSV_SCHEMA.map(table => (
            <option key={table} value={table}>{table}</option>
          ))}
        </select>

        <label className="block font-medium mb-1">Upload .csv file</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="mb-4"
        />

        {(validRows.length > 0 || invalidRows.length > 0) && (
          <div className="mb-4">
            <p className="text-green-600">✅ Valid rows: {validRows.length}</p>
            <p className="text-yellow-600">⚠️ Invalid rows: {invalidRows.length}</p>
            {invalidRows.length > 0 && (
              <button
                onClick={handleExportInvalidRows}
                className="bg-yellow-500 text-white px-4 py-2 rounded mt-2"
              >
                Download Invalid Rows
              </button>
            )}
            {validRows.length > 0 && (
              <CsvImportPreview headers={Object.keys(validRows[0])} rows={validRows.slice(0, 5)} />
            )}
          </div>
        )}

        {validRows.length > 0 && (
          <button
            onClick={handleImport}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Import {validRows.length} Records
          </button>
        )}
      </div>
    </Layout>
  );
}
