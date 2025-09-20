// src/utils/validateCsvSchema.ts

export function validateCsvSchema(headers: string[], primaryKey: string) {
  if (!headers.includes(primaryKey)) {
    return {
      valid: false,
      message: `Missing required primary key column: ${primaryKey}`,
    };
  }

  return { valid: true, message: 'Valid CSV schema' };
}
