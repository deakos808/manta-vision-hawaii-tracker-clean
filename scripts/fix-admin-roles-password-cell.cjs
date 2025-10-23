const fs = require('fs');
const p = 'src/pages/admin/AdminRolesPage.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

/* Ensure import */
if (!s.includes('PasswordCell')) {
  const imports = s.match(/^(?:import[\s\S]*?;\s*)+/m);
  if (imports) {
    s = s.slice(0, imports[0].length) + `import PasswordCell from "@/pages/admin/components/PasswordCell";\n` + s.slice(imports[0].length);
  } else {
    s = `import PasswordCell from "@/pages/admin/components/PasswordCell";\n` + s;
  }
}

/* Ensure header "Password" exists before Actions header */
if (!s.includes('>Password<')) {
  s = s.replace(
    /(<th[^>]*>\s*Actions\s*<\/th>)/,
    `<th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Password</th>\n      $1`
  );
}

/* Detect the row variable name used in the table .map((row) => ...) */
let rowVar = null;
// Try to find something like: {users.map((x) => ( ... <tr> ... ))}
const mapMatches = [...s.matchAll(/\.map\(\((\w+)\)\s*=>/g)];
if (mapMatches.length) {
  // choose the one that appears closest to a <tr> in the next ~400 chars
  let best = null;
  for (const m of mapMatches) {
    const idx = m.index ?? 0;
    const window = s.slice(idx, idx + 500);
    if (/<tr[^>]*>/.test(window)) { best = m; break; }
  }
  rowVar = (best || mapMatches[0])[1];
}
if (!rowVar) {
  console.error('✖ Could not detect the row variable used in .map((row)=>...).');
  console.error('  Please tell me the file path and the <tbody> map snippet.');
  process.exit(1);
}

/* Fix the PasswordCell usage to use the detected row variable */
const userExpr = `String(${rowVar}.user_id ?? ${rowVar}.id)`;
const emailExpr = `${rowVar}.email`;

s = s
  // fix any previous insertion that used u.*
  .replace(/<PasswordCell userId=\{String\(u\.user_id \?\? u\.id\)\} email=\{u\.email\} \/>/g,
           `<PasswordCell userId={${userExpr}} email={${emailExpr}} />`)
  .replace(/<PasswordCell userId=\{String\((\w+)\.user_id \?\? \1\.id\)\} email=\{\1\.email\} \/>/g,
           `<PasswordCell userId={${userExpr}} email={${emailExpr}} />`);

// If PasswordCell is not yet in a <td>, inject before Actions <td> (Delete/Actions)
if (!s.includes('<PasswordCell userId=')) {
  const tdActionsRe = /<td[^>]*>[\s\S]*?(Delete|Remove|Actions)[\s\S]*?<\/td>/m;
  if (tdActionsRe.test(s)) {
    const pwdTd =
`<td className="px-3 py-2 align-top">
        <PasswordCell userId={${userExpr}} email={${emailExpr}} />
      </td>
      `;
    s = s.replace(tdActionsRe, (m) => pwdTd + m);
  } else {
    console.warn('! Could not find Actions cell to inject Password cell; import/header fixed anyway.');
  }
}

fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Fixed AdminRolesPage.tsx');
console.log('  • Row variable:', rowVar);
console.log('  • Backup:', bak);
