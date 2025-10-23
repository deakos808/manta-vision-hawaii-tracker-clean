const fs = require('fs');
const p = 'supabase/functions/create-user/index.ts';
let s = fs.readFileSync(p, 'utf8');

// 1) force from: onboarding@resend.dev (sandbox sender)
s = s.replace(
  /from:\s*'[^']*<[^']*>'/g,
  `from: 'Acme <onboarding@resend.dev>'`
);

// 2) inject logging for failed Resend responses (only if not present)
if (!s.includes("console.log('[resend] status'")) {
  s = s.replace(
    /const mail = await fetch\('https:\/\/api\.resend\.com\/emails'[\s\S]*?}\);\s*emailed = mail\.ok;/,
`const mail = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${RESEND_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Acme <onboarding@resend.dev>',
    to: [emailLower],
    subject: 'You have been invited to Hawaii Manta Tracker',
    html: \`
      <p>You have been invited to the Hawaii Manta Tracker.</p>
      <p>Click the button below to set your password and sign in:</p>
      <p><a href="\${actionLink}" style="padding:10px 16px;background:#0b66ff;color:#fff;border-radius:6px;text-decoration:none">Set Password</a></p>
      <p>If the button does not work, copy and paste this URL into your browser:</p>
      <p><a href="\${actionLink}">\${actionLink}</a></p>
    \`,
  }),
});
if (!mail.ok) {
  const e = await mail.text().catch(() => '');
  console.log('[resend] status', mail.status, e);
}
emailed = mail.ok;`
  );
}

fs.writeFileSync(p, s);
console.log('✔ patched create-user: sandbox sender + logging');
