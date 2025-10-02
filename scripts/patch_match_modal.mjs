import fs from 'fs';
import path from 'path';

function read(p){try{return fs.readFileSync(p,'utf8')}catch{return null}}
function write(p,s){fs.writeFileSync(p,s);console.log('patched',p)}
function walk(dir){let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out=out.concat(walk(p));else if(p.endsWith('.tsx'))out.push(p)}return out}

const files = walk('src');
const modalFiles = files.filter(f=>{
  const s = read(f); if(!s) return false;
  return s.includes('Find Catalog Match') || s.includes('export default function MatchModal') || s.includes('function MatchModal(');
});

if(modalFiles.length===0) console.log('no MatchModal files found');

for(const f of modalFiles){
  let s = read(f), o = s;

  s = s.replace(/onClick=\{\s*onClose\s*\}/g,'onClick={()=>{try{typeof onClose==="function"&&onClose()}catch(e){console.error("[MatchModal] onClose error",e)}}}');
  s = s.replace(/className="px-3 py-2 border-b bg-gray-50"/,'className="px-3 py-2 border-b bg-gray-50 min-h-[136px]"');
  s = s.replace(/(\s+)<div className="border rounded p-3 bg-white">/,'$1<div className="hidden md:block h-[136px]"></div>\n$&');
  s = s.replace(/Catalog\s*\{\s*current\.pk_catalog_id\s*\}[^<]*/,'Catalog {current?.pk_catalog_id}{current?.name ? `: ${current.name}` : ""}');
  s = s.replace(/Gender:\s*\{current\.gender[^}]*\}\s*·\s*Age class:\s*\{current\.age_class[^}]*\}\s*·\s*Species:\s*\{current\.species[^}]*\}/,'{current?.species||"—"} - {current?.gender||"—"} - {current?.age_class||"—"}');
  s = s.replace(/onClick=\{\s*\(\)\s*=>\s*\{\s*if\s*\(\s*current\s*\)\s*onChoose\(current\.pk_catalog_id\);\s*onClose\(\);\s*\}\s*\}\s*\}/,'onClick={()=>{if(current){try{onChoose(current.pk_catalog_id)}catch{}}try{typeof onClose==="function"&&onClose()}catch{}}}');

  if(s!==o) write(f,s); else console.log('no changes',f);
}

const addPage = 'src/pages/AddSightingPage.tsx';
let a = read(addPage);
if(a){
  const re = /<div className="text-\[11px\] text-blue-600 underline cursor-pointer mt-1"[^>]*>\s*Match\s*<\/div>/g;
  let seen = 0;
  a = a.replace(re, m => {
    if(seen===0) { seen++; return m.replace('cursor-pointer','cursor-pointer match-primary'); }
    return '';
  });
  if(a!==read(addPage)) write(addPage,a); else console.log('no changes',addPage);
}else{
  console.log('skip',addPage);
}
