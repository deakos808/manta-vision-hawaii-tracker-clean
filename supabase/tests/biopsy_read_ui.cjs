// Executes the actual Admin page's list and ranking callbacks against disposable SQL.
const fs=require('fs'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const ts=require('typescript'),jsx=require('react/jsx-runtime');
assert.ok(process.env.PGHOST?.startsWith('/tmp/manta-biopsy.'));
let states=[],cursor=0,effects=[],first=true,calls=[],checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++};
const hooks={useState(v){const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useMemo:f=>f(),useEffect:f=>{if(first)effects.push(f)}};
const client={rpc:async name=>{
 assert.ok(['admin_biopsy_browse','admin_biopsy_age_ranking'].includes(name));calls.push(name);
 const out=execFileSync('psql',['-XAtq','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:`begin;set local role authenticated;set local request.jwt.claim.sub='00000001-0000-4000-8000-000000000000';select public.${name}();commit;`});
 return{data:JSON.parse(out.trim()),error:null};
},from(){throw Error('Unexpected direct read in tested Admin callbacks')}};
const code=ts.transpileModule(fs.readFileSync('src/pages/browse_data/Biopsies.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const mod={exports:{}};
function req(n){if(n==='react')return hooks;if(n==='react/jsx-runtime')return jsx;if(n==='react-router-dom')return{Link:'a'};if(n==='@/lib/supabase')return{supabase:client};if(n==='@/hooks/useUserRole')return{useUserRole:()=>({role:'admin'})};if(n==='@/features/photos/MantaImage')return{MantaImage:'img'};if(n.includes('Layout')||n.includes('BackToTopButton'))return{__esModule:true,default:'div'};throw Error(n)}
new Function('require','module','exports',code)(req,mod,mod.exports);
function render(){cursor=0;return mod.exports.default()}
function find(node,p){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const x of node){const r=find(x,p);if(r)return r}}else{if(p(node))return node;return find(node.props?.children,p)}}
(async()=>{
 render();for(const f of effects)f();await new Promise(r=>setImmediate(r));first=false;
 check(calls.join(',')==='admin_biopsy_browse','list RPC used');
 check(states[0].length===1&&states[0][0].fk_manta_id===1,'manta stats identity preserved');
 check(states[0][0].catalog.pk_catalog_id===733,'catalog join preserved');
 let tree=render();const button=find(tree,n=>n.type==='button'&&n.props.children==='Kona Age Ranking');check(button,'ranking control retained');
 await button.props.onClick();await new Promise(r=>setImmediate(r));tree=render();
 check(calls.join(',')==='admin_biopsy_browse,admin_biopsy_age_ranking','guarded ranking RPC used');
 check(states.some(x=>Array.isArray(x)&&x[0]?.mprf_biopsy_id==='LAB-SECRET'),'ranking sample data populated');
 const full=find(tree,n=>n.type==='button'&&n.props.children==='Export Full CSV');check(full,'existing export retained');
 let downloaded,clicked=false;
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 URL.createObjectURL=b=>{downloaded=b;return 'blob:fixture'};URL.revokeObjectURL=()=>{};
 global.document={createElement:()=>({click(){clicked=true},remove(){}}),body:{appendChild(){}}};
 try {full.props.onClick();const csv=await downloaded.text();check(clicked&&csv.includes('LAB-SECRET')&&csv.includes('SAMPLE-SECRET'),'full CSV contains sample identifiers');check(csv.split('\n')[0].split(',').length===44,'full CSV has exact 44 fields');}
 finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete global.document;}
 const details=find(tree,n=>n.type==='button'&&n.props.children==='Details');check(details,'ranking details control');details.props.onClick();tree=render();
 check(find(tree,n=>n.props?.children==='LAB-SECRET')&&find(tree,n=>n.props?.children==='SAMPLE-SECRET'),'details show authorized identifiers');
 console.log(`${checks} actual Admin page/disposable SQL assertions passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
