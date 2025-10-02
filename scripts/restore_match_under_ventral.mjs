import fs from "fs";

const f = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(f)) { console.log("missing", f); process.exit(0); }
let s = fs.readFileSync(f, "utf8");
const before = s;

const hasUnderVentral =
  s.includes('className="text-[11px] text-blue-600 underline cursor-pointer mt-1"') &&
  s.includes(">Match<");

const reVBestBlock =
  /\{vBest\s*\?\s*<img[\s\S]*?src=\{vBest\.url\}[\s\S]*?\/>\s*:\s*<div[^>]*>no V<\/div>\s*\}/m;

if (!hasUnderVentral && reVBestBlock.test(s)) {
  const replacement = `{vBest ? (
  <div className="flex flex-col items-start">
    <img src={vBest.url} alt="V" className="w-14 h-14 object-cover rounded" />
    <div
      className="text-[11px] text-blue-600 underline cursor-pointer mt-1"
      onClick={() => {
        try {
          console.log("[AddSightingPage] Match click vBest", vBest.url);
          if (typeof setPageMatchUrl === "function") setPageMatchUrl(vBest.url);
          if (typeof setPageMatchMeta === "function") setPageMatchMeta({ name: m.name, gender: m.gender ?? null, ageClass: m.ageClass ?? null, meanSize: m.size ?? null });
          if (typeof setPageMatchOpen === "function") setPageMatchOpen(true);
        } catch (e) {
          console.log("[AddSightingPage] match click error", e);
        }
      }}
    >
      Match
    </div>
  </div>
) : (
  <div className="w-14 h-14 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no V</div>
)}`;
  s = s.replace(reVBestBlock, replacement);
}

/* clean any empty JSX expressions that may have been left behind earlier */
s = s.replace(/\{\s*\([^{}]*\)\s*&&\s*\(\s*\)\s*\}/g, "");
s = s.replace(/\{\s*[^\{\}\(\)]*\s*&&\s*\(\s*\)\s*\}/g, "");
s = s.replace(/\{\s*\(\s*\)\s*\}/g, "");
s = s.replace(/[ \t]*\n{3,}/g, "\n\n");

if (s !== before) {
  fs.writeFileSync(f, s);
  console.log("patched", f);
} else {
  console.log("no changes", f);
}
