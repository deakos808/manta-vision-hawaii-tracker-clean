// src/lib/parseCsvFile.ts
export async function parseCsvFile(file: File): Promise<any[]> {
  const text = await file.text();
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

  const headers = lines[0].split(',').map(h => h.trim());
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, j) => {
      row[header] = values[j] || '';
    });
    rows.push(row);
  }

  return rows;
}
