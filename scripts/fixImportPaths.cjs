// scripts/fixImportPaths.js
const fs = require('fs');
const path = require('path');

const moveMap = JSON.parse(fs.readFileSync('scripts/moveMap.json', 'utf-8'));
const srcDir = path.resolve('./src');

let filesScanned = 0;
let filesModified = 0;

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  for (const [oldPath, newPath] of Object.entries(moveMap)) {
    const importRegex = new RegExp(`(['"])@/(${oldPath})(['"])`, 'g');
    content = content.replace(importRegex, (_match, p1, _p2, p3) => {
      return `${p1}@/${newPath}${p3}`;
    });
  }

  filesScanned++;
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    filesModified++;
    console.log(`🛠️ Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      fixFile(fullPath);
    }
  }
}

console.log('🔧 Starting import fix...');
walkDir(srcDir);
console.log(`✅ Finished. Scanned: ${filesScanned}, Modified: ${filesModified}`);
