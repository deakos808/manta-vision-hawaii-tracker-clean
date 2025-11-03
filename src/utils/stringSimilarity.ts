export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  const s = normalizeKey(a);
  const t = normalizeKey(b);
  if (s.length < 2 || t.length < 2) return s === t ? 1 : 0;
  const bigrams = (str: string) => {
    const arr: string[] = [];
    for (let i = 0; i < str.length - 1; i++) arr.push(str.slice(i, i + 2));
    return arr;
  };
  const sB = bigrams(s);
  const tB = bigrams(t);
  const multiset = new Map<string, number>();
  for (const g of sB) multiset.set(g, (multiset.get(g) || 0) + 1);
  let matches = 0;
  for (const g of tB) {
    const c = multiset.get(g) || 0;
    if (c > 0) {
      matches++;
      multiset.set(g, c - 1);
    }
  }
  return (2 * matches) / (sB.length + tB.length);
}
