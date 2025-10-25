import fs from "node:fs";
const f = "src/pages/browse_data/Mantas.tsx";
let s = fs.readFileSync(f, "utf8");
let o = s;

// 1) Fix malformed self-closing Trash2 before </Button> or </button>
s = s.replace(/<Trash2([^>]*?)\s*\/<\/Button>/g, "<Trash2$1 /></Button>");
s = s.replace(/<Trash2([^>]*?)\s*\/<\/button>/gi, "<Trash2$1 /></button>");

// 2) Fix any dangling "<Trash2 ... /<" fragments created by earlier edits
s = s.replace(/<Trash2([^>]*?)\s*\/</g, "<Trash2$1 /><");

// 3) Remove visible "delete" label text while keeping the button and icon
s = s.replace(/>\s*delete\s*<\/Button>/gi, "</Button>");
s = s.replace(/>\s*delete\s*<\/button>/gi, "</button>");

// 4) Optional: normalize accidental double closes like "</</Button>"
s = s.replace(/<\/<\/(Button|button)>/g, "</$1>");

if (s !== o) {
  fs.writeFileSync(f, s);
  console.log("[ok] Fixed Trash2 markup and removed text label");
} else {
  console.log("[info] No changes applied (file already clean)");
}
