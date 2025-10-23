const fs = require('fs');
const p = 'src/lib/adminApi.ts';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p, 'utf8');

function ensureEdgeBase(s) {
  if (s.includes('function edgeBase(')) return s;
  const add =
`\nexport function edgeBase() {
  const edge = import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\\/$/, "");
  if (edge) return edge;
  const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\\/$/, "");
  return url ? \`\${url}/functions/v1\` : "https://apweteosdbgsolmvcmhn.supabase.co/functions/v1";
}\n`;
  return s + add;
}

function appendIfMissing(s, marker, block) {
  return s.includes(marker) ? s : s + '\n' + block + '\n';
}

s = ensureEdgeBase(s);

const mantaBlock =
`export async function deleteManta(pk_manta_id: number) {
  const base = edgeBase();
  const r = await fetch(\`\${base}/delete-manta\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk_manta_id })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || \`delete-manta failed (\${r.status})\`);
  return j;
}`;

const photoBlock =
`export async function deletePhoto(pk_photo_id: number) {
  const base = edgeBase();
  const r = await fetch(\`\${base}/delete-photo\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pk_photo_id })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || \`delete-photo failed (\${r.status})\`);
  return j;
}`;

s = appendIfMissing(s, 'export async function deleteManta', mantaBlock);
s = appendIfMissing(s, 'export async function deletePhoto', photoBlock);

fs.writeFileSync(p, s);
console.log('✔ adminApi.ts now has deleteManta & deletePhoto');
