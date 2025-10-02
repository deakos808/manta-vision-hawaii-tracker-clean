import fs from "fs";

const f = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(f)) { console.log("missing", f); process.exit(0); }
let s = fs.readFileSync(f, "utf8");
const before = s;

/* remove the inline “Match” link between thumbnails (keep the button below) */
const reDiv = /\s*<div[^>]*className="[^"]*text-\[11px\][^"]*underline[^"]*mt-1[^"]*"[^>]*>[\s\S]*?Match[\s\S]*?<\/div>\s*/g;
const reA   = /\s*<a[^>]*className="[^"]*text-\[11px\][^"]*underline[^"]*mt-1[^"]*"[^>]*>\s*Match\s*<\/a>\s*/g;
s = s.replace(reDiv, "\n");
s = s.replace(reA, "\n");

/* remove empty JSX conditionals that cause parse errors, e.g. {(vBest)&&()} */
s = s.replace(/\{\s*\([^{}]*\)\s*&&\s*\(\s*\)\s*\}/g, "");   // {( ... ) && ()}
s = s.replace(/\{\s*[^\{\}\(\)]*\s*&&\s*\(\s*\)\s*\}/g, ""); // {  ...   && ()}
s = s.replace(/\{\s*\(\s*\)\s*\}/g, "");

/* tidy extra blank lines */
s = s.replace(/[ \t]*\n{3,}/g, "\n\n");

if (s !== before) {
  fs.writeFileSync(f, s);
  console.log("patched", f);
} else {
  console.log("no changes", f);
}
