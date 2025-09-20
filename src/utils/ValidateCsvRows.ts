// src/utils/validateCsvRows.ts
import { csvSchemas, TableWithCsvSchema } from './csvSchemas';

type Row = Record<string, string>;

export function validateCsvRows(tableName: TableWithCsvSchema, rawRows: Row[]) {
  const schema = csvSchemas[tableName];
  if (!schema) {
    throw new Error(`Schema not found for table: ${tableName}`);
  }

  const requiredFields = Object.entries(schema)
    .filter(([, def]) => def.required)
    .map(([key]) => key);

  const validRows: Row[] = [];
  const invalidRows: Row[] = [];
  const errors: Record<number, string[]> = {};

  rawRows.forEach((row, index) => {
    const rowErrors: string[] = [];

    requiredFields.forEach((field) => {
      const val = row[field];
      if (!val || val.trim() === '') {
        rowErrors.push(`Missing required: ${field}`);
      }
    });

    if (rowErrors.length > 0) {
      errors[index] = rowErrors;
      invalidRows.push(row);
    } else {
      validRows.push(row);
    }
  });

  return { validRows, invalidRows, errors };
}
