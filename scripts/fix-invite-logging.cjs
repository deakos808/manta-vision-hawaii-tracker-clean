const fs = require('fs');
const p = 'src/pages/admin/UsersInvitePage.tsx';
let s = fs.readFileSync(p, 'utf8');

// Fix the extra quote before [create-user]
s = s.replace('console.error(""[create-user] status",', 'console.error("[create-user] status",');
// Also fix any variant with stray double-quote before [
s = s.replace(/console\.error\(""\[create-user\] status",/g, 'console.error("[create-user] status",');

fs.writeFileSync(p, s);
console.log('✔ Fixed console.error string in UsersInvitePage.tsx');
