import fs from "node:fs";
const file = "src/pages/browse_data/Mantas.tsx";
let s = fs.readFileSync(file, "utf8");
let orig = s;

// 1) Fix the broken Trash2 self-close before </Button> / </button>
s = s.replace(/<Trash2([^>]*?)\s*\/<\/Button>/g, "<Trash2$1 /></Button>");
s = s.replace(/<Trash2([^>]*?)\s*\/<\/button>/gi, "<Trash2$1 /></button>");

// Also fix the specific "/<" corruption variant (e.g., ...\" /</Button>)
s = s.replace(/<Trash2([^>]*?)\s*\/</g, "<Trash2$1 /><");

// 2) Remove the literal "delete" text node but keep buttons/icons intact
s = s.replace(/>\s*delete\s*<\/Button>/gi, "</Button>");
s = s.replace(/>\s*delete\s*<\/button>/gi, "</button>");

// 3) Optional sanity: collapse any accidental "</</Button>" into a proper close
s = s.replace(/<\/<\/(Button|button)>/g, "</$1>");

if (s !== orig) {
  fs.writeFileSync(file, s);
  console.log("[ok] Repaired Trash2 tag(s) and removed delete text");
} else {
  console.log("[info] No changes applied; file already clean");
}
