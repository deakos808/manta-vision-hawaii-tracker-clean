const fs = require('fs');
const p = 'src/pages/admin/AdminRolesPage.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

/* 1) import PasswordCell */
if (!s.includes('PasswordCell')) {
  const imports = s.match(/^(?:import[\s\S]*?;\s*)+/m);
  if (imports) {
    s = s.slice(0, imports[0].length) + `import PasswordCell from "@/pages/admin/components/PasswordCell";\n` + s.slice(imports[0].length);
  } else {
    s = `import PasswordCell from "@/pages/admin/components/PasswordCell";\n` + s;
  }
}

/* 2) add header "Password" before "Actions" header */
if (!s.includes('>Password<')) {
  s = s.replace(
    /(<th[^>]*>\s*Actions\s*<\/th>)/,
    `<th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Password</th>\n      $1`
  );
}

/* 3) insert <PasswordCell .../> td before the Actions td (look for cell containing Delete button or Actions controls) */
const tdActionsRe = /<td[^>]*>[\s\S]*?(Delete|Remove|Actions)[\s\S]*?<\/td>/m;
if (tdActionsRe.test(s) && !s.includes('<PasswordCell')) {
  const pwdTd =
`<td className="px-3 py-2 align-top">
        <PasswordCell userId={String(u.user_id ?? u.id)} email={u.email} />
      </td>
      `;
  s = s.replace(tdActionsRe, (m) => pwdTd + m);
}

/* save */
fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Patched AdminRolesPage.tsx');
console.log('  • Backup:', bak);
