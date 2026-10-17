// Executes current application component callbacks and service code. SQL goes only
// to disposable PostgreSQL; Auth and Storage are in-memory synthetic adapters.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=process.cwd();
const ts=require(root+'/node_modules/typescript');
const react=require(root+'/node_modules/react');
assert.ok(process.env.PGHOST?.startsWith('/tmp/manta-calibration.'),'Disposable socket required');
const env={...process.env};
const uid='00000001-0000-4000-8000-000000000000';
let checks=0;const ok=(b,s)=>{assert.ok(b,s);checks++};
const lit=v=>v==null?'null':typeof v==='number'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const ident=x=>{assert.match(x,/^[a-z_][a-z_0-9]*$/);return '"'+x+'"'};
function sql(q,admin=true){return execFileSync('psql',['-XAtq','-v','ON_ERROR_STOP=1'],{env,input:`begin; ${admin?`set local role authenticated; set local request.jwt.claim.sub='${uid}';`:''}${q};commit;`,encoding:'utf8'}).trim()}
const operations=[],objects=new Set();let pending=0;
class Query{
 constructor(table){assert.ok(['calibration_sessions','calibration_photos','calibration_measurements','calibration_session_stats'].includes(table));this.table=table;this.kind='select';this.cols='*';this.filters=[];}
 select(cols='*',opts={}){this.cols=cols;this.opts=opts;this.returning=true;return this}
 insert(rows){this.kind='insert';this.rows=rows;return this}
 update(row){this.kind='update';this.row=row;return this}
 delete(){this.kind='delete';return this}
 eq(k,v){this.filters.push(ident(k)+'='+lit(v));return this}
 in(k,vs){this.filters.push(ident(k)+' in ('+vs.map(lit).join(',')+')');return this}
 order(k,o){this.orderBy=ident(k)+(o.ascending?' asc':' desc');return this}
 single(){this.one=true;return this}
 then(resolve,reject){pending++;try{
  let q,where=this.filters.length?' where '+this.filters.join(' and '):'',cols=this.cols==='*'?'*':this.cols.split(',').map(x=>ident(x.trim())).join(',');
  if(this.kind==='select')q='select '+cols+' from '+ident(this.table)+where+(this.orderBy?' order by '+this.orderBy:'');
  if(this.kind==='insert'){const keys=Object.keys(this.rows[0]);q='insert into '+ident(this.table)+' ('+keys.map(ident).join(',')+') values '+this.rows.map(r=>'('+keys.map(k=>lit(r[k])).join(',')+')').join(',')+' returning *';}
  if(this.kind==='update')q='update '+ident(this.table)+' set '+Object.entries(this.row).map(([k,v])=>ident(k)+'='+lit(v)).join(',')+where+' returning *';
  if(this.kind==='delete')q='delete from '+ident(this.table)+where+' returning *';
  const rows=JSON.parse(sql('with result as ('+q+") select coalesce(json_agg(result),'[]'::json) from result"));
  operations.push({table:this.table,kind:this.kind,rows:rows.length});
  resolve({data:this.one?rows[0]??null:rows,error:null,count:rows.length});
 }catch(e){reject(e)}finally{pending--}}
}
const supabase={from:t=>new Query(t),auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},storage:{from:bucket=>{assert.equal(bucket,'calibration-images');return {
 upload:async(p,f)=>{objects.add(p);return {error:null}},createSignedUrl:async p=>({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='},error:null}),remove:async ps=>{ps.forEach(p=>objects.delete(p));return {error:null}}
}}}};
let current,routeId,navigation;const cache={};
const hooks={...react,useState(initial){const c=current,i=c.index++;if(!(i in c.state))c.state[i]=typeof initial==='function'?initial():initial;return [c.state[i],v=>{c.state[i]=typeof v==='function'?v(c.state[i]):v}]},useEffect(fn){if(!current.mounted)current.effects.push(fn)}};
function load(file){file=path.resolve(root,file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 function req(name){
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return require(root+'/node_modules/react/jsx-runtime');
  if(name==='react-router-dom')return {Link:'a',useParams:()=>({id:routeId}),useNavigate:()=>v=>{navigation=v}};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name.includes('supabase'))return {supabase};
  if(name.includes('CalibrationPhotoCard'))return {__esModule:true,default:'PhotoCard'};
  if(name.includes('Layout'))return {__esModule:true,default:'Layout'};
  if(name.includes('services/calibration'))return load('src/services/calibration.ts');
  if(name.includes('utils/format'))return {fmtMeters:v=>Number(v).toFixed(2)+' m'};
  throw Error('Unexpected import '+name);
 }
 new Function('require','module','exports',code)(req,m,m.exports);return m.exports;
}
function mount(component){const c={component,state:[],effects:[],mounted:false,index:0};c.render=()=>{current=c;c.index=0;c.tree=c.component();current=null;return c.tree};c.render();c.mounted=true;c.effects.forEach(e=>e());return c}
async function settle(c){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));assert.equal(pending,0);c.render()}
function nodes(t){if(Array.isArray(t))return t.flatMap(nodes);if(!t||typeof t!=='object')return [];return [t,...nodes(t.props?.children)]}
function txt(t){if(Array.isArray(t))return t.map(txt).join('');if(typeof t==='string'||typeof t==='number')return String(t);return txt(t?.props?.children??'')}
const find=(c,p)=>{const n=nodes(c.tree).find(p);assert.ok(n,'element found');return n};
const button=(c,label)=>find(c,n=>n.type==='button'&&txt(n)===label);
global.Image=class {width=600;height=400;set src(v){queueMicrotask(()=>this.onload())}};
global.confirm=()=>true;global.alert=m=>{throw Error('Unexpected alert '+m)};global.window={scrollTo(){}};
(async()=>{
 const Add=load('src/pages/admin/AddCalibrationPage.tsx').default;
 const Landing=load('src/pages/admin/CalibrationLandingPage.tsx').default;
 const Session=load('src/pages/admin/CalibrationSessionPage.tsx').default;
 const add=mount(Add);
 find(add,n=>n.type==='input'&&n.props.placeholder==='e.g., J. Doe').props.onChange({target:{value:'SYNTHETIC UI CONTRACT'}});add.render();
 const photo={file:{name:'fixture.jpg'},width:600,height:400,scalePx:100,objectPx:200,actualLengthM:1.2,scale:{p0:{x:1,y:1},p1:{x:101,y:1}},object:{p0:{x:1,y:2},p1:{x:201,y:2}}};
 await find(add,n=>typeof n.props?.onSave==='function').props.onSave([photo]);
 ok(navigation==='/admin/calibration','real Add page returns to list');
 const created=JSON.parse(sql("select row_to_json(t) from calibration_sessions t where photographer_name='SYNTHETIC UI CONTRACT'"));routeId=created.id;
 ok(objects.size===1,'synthetic storage upload only');
 const list=mount(Landing);await settle(list);ok(txt(list.tree).includes('SYNTHETIC UI CONTRACT'),'actual landing list uses invoker view');
 const session=mount(Session);await settle(session);ok(txt(session.tree).includes('fixture.jpg'),'photo load');ok(txt(session.tree).includes('0.00%'),'measurement load');
 button(session,'Edit').props.onClick();session.render();
 find(session,n=>n.type==='input'&&n.props.value==='SYNTHETIC UI CONTRACT').props.onChange({target:{value:'SYNTHETIC UI EDITED'}});session.render();await button(session,'Save').props.onClick();session.render();
 ok(sql(`select photographer_name from calibration_sessions where id=${lit(routeId)}`)==='SYNTHETIC UI EDITED','metadata persisted');
 find(session,n=>n.type==='button'&&n.props.title==='Edit').props.onClick();session.render();
 const card=find(session,n=>n.type==='PhotoCard');ok(card.props.initial.actual===1.2,'existing measurement hydration');
 card.props.onChange({...photo,actualLengthM:1.3,estLengthM:1.2});session.render();await button(session,'Save').props.onClick();session.render();
 ok(sql(`select count(*) from calibration_measurements m join calibration_photos p on p.id=m.photo_id where p.session_id=${lit(routeId)}`)==='1','replace measurement once');
 ok(Number(sql(`select actual_length_m from calibration_photos where session_id=${lit(routeId)}`))===1.3,'photo actual updated');
 ok(!operations.some(x=>x.table==='calibration_measurements'&&x.kind==='update'),'no measurement UPDATE');
 const reopened=mount(Session);await settle(reopened);ok(txt(reopened.tree).includes('SYNTHETIC UI EDITED'),'reopened metadata');ok(txt(reopened.tree).includes('1.30 m'),'reopened actual');
 await find(reopened,n=>n.type==='button'&&n.props.title==='Delete').props.onClick();reopened.render();ok(objects.size===0,'photo delete removes fixture storage');
 ok(sql(`select count(*) from calibration_photos where session_id=${lit(routeId)}`)==='0','photo delete');
 const extraFile=new File(['synthetic image adapter'],'added.jpg',{type:'image/jpeg'});
 find(reopened,n=>n.type==='input'&&n.props.id==='addPhotosInputBottom').props.onChange({target:{files:[extraFile]},currentTarget:{value:'fixture'}});await settle(reopened);
 ok(txt(reopened.tree).includes('added.jpg'),'actual immediate-add photo handler');
 ok(sql(`select count(*) from calibration_measurements m join calibration_photos p on p.id=m.photo_id where p.session_id=${lit(routeId)}`)==='0','immediate add creates unmeasured photo');
 await find(reopened,n=>n.type==='button'&&n.props.title==='Delete').props.onClick();reopened.render();ok(objects.size===0,'added fixture photo deleted');
 const service=load('src/services/calibration.ts');const second=await service.saveCalibrationSession({photographer_name:'SYNTHETIC CASCADE',camera_model:'fixture',lens_type:'fixture',laser_setup:'fixture',default_scale_m:.6},[photo]);
 const list2=mount(Landing);await settle(list2);
 const row=find(list2,n=>n.type==='tr'&&txt(n).includes('SYNTHETIC CASCADE'));
 await nodes(row).find(n=>n.type==='button'&&n.props.title==='Delete').props.onClick();await settle(list2);
 ok(sql(`select count(*) from calibration_sessions where id=${lit(second.sessionId)}`)==='0','landing deletes parent');
 ok(sql(`select count(*) from calibration_measurements where photo_id=${lit(second.photoIds[0])}`)==='0','FK removes measurement child');
 // Existing landing code does not remove Storage files; preserve and report this behavior.
 ok(objects.size===1,'existing session deletion leaves Storage object');
 // Direct parent delete exercises both real FK cascades under authenticated admin.
 const third=await service.saveCalibrationSession({photographer_name:'SYNTHETIC CASCADE DIRECT',default_scale_m:.6},[photo]);
 sql(`delete from calibration_sessions where id=${lit(third.sessionId)}`);
 ok(sql(`select count(*) from calibration_measurements where photo_id=${lit(third.photoIds[0])}`)==='0','two-level FK cascade under RLS');
 console.log(`${checks} actual application callback/service assertions passed`);
 fs.writeFileSync(path.join(process.env.CALIBRATION_TEST_RESULTS,'ui.json'),JSON.stringify({checks,operations,storage:'in-memory only',limitations:['headless callback/render contract; not a visual browser test','existing session deletion leaves storage files','measurement_date passed by Add page but omitted by existing service']},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
