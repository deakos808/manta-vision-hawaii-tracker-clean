import fs from 'fs';

const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) {
  console.log('missing', file);
  process.exit(0);
}
let s = fs.readFileSync(file, 'utf8');
const before = s;

/* ---- 1) Import ---- */
if (!/from\s+["']@\/components\/mantas\/MatchModal["']/.test(s)) {
  const lines = s.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) lastImport = i;
  }
  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, 'import MatchModal from "@/components/mantas/MatchModal";');
    s = lines.join('\n');
  }
}

/* ---- 2) Hooks ---- */
if (!/pageMatchOpen\s*,\s*setPageMatchOpen/.test(s)) {
  // insert after component opening "{"
  const compStart =
    s.indexOf('export default function') >= 0
      ? s.indexOf('export default function')
      : (s.indexOf('function AddSightingPage') >= 0
          ? s.indexOf('function AddSightingPage')
          : s.indexOf('const AddSightingPage'));
  let brace = -1;
  if (compStart >= 0) {
    brace = s.indexOf('{', compStart);
  }
  if (brace >= 0) {
    const block = `
  /* MM_STATE_START */
  const [pageMatchOpen, setPageMatchOpen] = useState(false);
  const [pageMatchUrl, setPageMatchUrl] = useState<string | null>(null);
  const [pageMatchMeta, setPageMatchMeta] = useState<{name?: string|null; gender?: string|null; ageClass?: string|null; meanSize?: number|null}>({});
  /* MM_STATE_END */
`;
    s = s.slice(0, brace + 1) + block + s.slice(brace + 1);
  }
}

/* ---- 3) Mount modal once ---- */
if (!/MM_MOUNT_START/.test(s)) {
  let insertPos = -1;
  const sentinel = s.indexOf('probe:add-sighting-v2');
  if (sentinel >= 0) {
    insertPos = s.lastIndexOf('\n', sentinel);
  } else {
    // fallback: before the last ");"
    const endReturn = s.lastIndexOf(');');
    insertPos = endReturn > 0 ? endReturn : s.length;
  }
  const mount = `
  {/* MM_MOUNT_START */}
  <MatchModal
    open={pageMatchOpen}
    onClose={() => setPageMatchOpen(false)}
    tempUrl={pageMatchUrl}
    aMeta={pageMatchMeta}
    onChoose={(catalogId) => {
      console.log("[MatchModal] chosen:", catalogId);
      // TODO: persist chosen catalogId onto current manta row
    }}
    onNoMatch={() => {
      console.log("[MatchModal] no matches");
    }}
  />
  {/* MM_MOUNT_END */}
`;
  if (insertPos >= 0) {
    s = s.slice(0, insertPos) + mount + s.slice(insertPos);
  }
}

/* ---- 4) Trim duplicate naked anchor links like <a>Match</a> ---- */
s = s.replace(/<a[^>]*>\s*Match\s*<\/a>/g, '');

/* Write if changed */
if (s !== before) {
  fs.writeFileSync(file, s);
  console.log('patched', file);
} else {
  console.log('no changes', file);
}
