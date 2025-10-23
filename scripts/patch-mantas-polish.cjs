const fs = require('fs');
const p = 'src/pages/browse_data/Mantas.tsx';
let s = fs.readFileSync(p, 'utf8');

/* 1) Search bar background = white */
s = s.replace(
  /className="max-w-md mb-3(?![^"]*bg-white)"/,
  'className="max-w-md mb-3 bg-white"'
);

/* 2) Remove the outer white "Filter Manta Records by" panel incl. its Clear All;
      keep only the inner <MantaFilterBox ... /> with existing props. */
{
  const panelRe = /<div className="bg-white shadow p-4 border mb-3">[\s\S]*?<MantaFilterBox([\s\S]*?)\/>\s*<\/div>/m;
  if (panelRe.test(s)) {
    s = s.replace(panelRe, (_, props) => `\n          <MantaFilterBox${props.trim()} />\n`);
  }
}

/* 3) Move the summary line out of the blue block to just below it */
{
  // Remove the summary div inside the blue block if present
  s = s.replace(
    /\n\s*<div className="mt-3 text-sm text-muted-foreground">\{headerSubtitle\}<\/div>\s*\n/,
    '\n'
  );
  // Insert summary after the light-blue block closing tag, before Results
  s = s.replace(
    /<\/div>\s*\n\s*{\s*\/\* Results \*\/\s*}/,
    `</div>\n\n        <div className="text-sm text-gray-700 mb-4">{headerSubtitle}</div>\n\n        {/* Results */}`
  );
}

/* Save backup + write */
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Mantas polished: white search, removed outer filter box, summary moved. Backup at', p + '.bak');
