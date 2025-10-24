const fs = require('fs');
const p = 'src/pages/browse_data/Mantas.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Insert sortAsc after the photographer state (if missing)
if (!s.includes('const [sortAsc, setSortAsc]')) {
  s = s.replace(
    'const [photographer, setPhotographer] = useState<string[]>([]);\n',
    'const [photographer, setPhotographer] = useState<string[]>([]);\n\n  // Sort: false = newest first (desc), true = oldest first (asc)\n  const [sortAsc, setSortAsc] = useState(false);\n'
  );
}

// 2) Insert sortedMantas memo right AFTER the filteredMantas memo (if missing)
if (!s.includes('const sortedMantas = useMemo')) {
  const reFiltered = /const\s+filteredMantas\s*=\s*useMemo\([\s\S]*?\);\n\}\)\,\s*\[[^\]]*\]\);\n/;
  const m = s.match(reFiltered);
  if (m) {
    const insertAfter = m[0] + '\n  // Sort AFTER filters\n  const sortedMantas = useMemo(() => {\n    const arr = [...filteredMantas];\n    arr.sort((a,b) => (sortAsc ? a.pk_manta_id - b.pk_manta_id : b.pk_manta_id - a.pk_manta_id));\n    return arr;\n  }, [filteredMantas, sortAsc]);\n';
    s = s.replace(reFiltered, insertAfter);
  } else {
    // Fallback: append near the top of the "Summary line" section
    s = s.replace(
      '\n  // Human-readable active filters string',
      '\n  // Sort AFTER filters\n  const sortedMantas = useMemo(() => {\n    const arr = [...filteredMantas];\n    arr.sort((a,b) => (sortAsc ? a.pk_manta_id - b.pk_manta_id : b.pk_manta_id - a.pk_manta_id));\n    return arr;\n  }, [filteredMantas, sortAsc]);\n\n  // Human-readable active filters string'
    );
  }
}

// 3) Use sortedMantas in the renderer
s = s.replace(/filteredMantas\.map\(/g, 'sortedMantas.map(');

// Save backup + write
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Mantas.tsx: added sortAsc + sortedMantas and switched render. Backup at', p + '.bak');
