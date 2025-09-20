// scripts/scanBadImports.mts
import fs from 'fs';
import path from 'path';

const badPatterns = [
  '@/lib/supabase',
  '@/lib/supabaseHelper',
  '@/integrations/supabase/client',
  '@/integrations/supabase/types',
  '@supabase/supabase-js'
];

const srcDir = path.resolve('./src');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  badPatterns.forEach((pattern) => {
    if (content.includes(pattern)) {
      console.log(`❌ Found "${pattern}" in ${filePath}`);
    }
  });
}

function scanDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      scanFile(fullPath);
    }
  }
}

console.log('🔍 Scanning for outdated or incorrect imports...\n');
scanDir(srcDir);
console.log('\n✅ Scan complete.');
