export function fmtMeters(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return '';
  const n = Number(value);
  return `${n.toFixed(2)} m`;
}
