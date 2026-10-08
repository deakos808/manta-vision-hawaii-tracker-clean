import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { exactPhotographer, checkInviteHistory, requireInviteAlias, linkInvitedHistory, LINK_WARNING } from '../../../supabase/functions/_shared/invite-history';
import { parseAction, parseManagedRole, requireActiveAdmin } from '../../../supabase/functions/_shared/user-management-policy';
const names = ['Don McLeish', 'Kristen DeCrausaz'];
for (const [input, alias] of [['Don McLeish','Don McLeish'], ['Kristen DeCrausaz','Kristen DeCrausaz'], ['DON MCLEISH','Don McLeish'], ['  Don McLeish  ','Don McLeish'], ['Kristen DeCrauzaz',undefined], ['Don',undefined]]) {
  test(`exact normalized lookup: ${input}`, () => assert.equal(exactPhotographer(names, input).alias, alias));
}
test('multiple stored spellings are ambiguous; repeated same spelling is not', () => {
  assert.equal(exactPhotographer(['Don McLeish','DON MCLEISH'],'don mcleish').status,'ambiguous');
  assert.equal(exactPhotographer(['Don McLeish','Don McLeish'],'don mcleish').status,'eligible');
});
function fixture(options: any = {}) {
  const events: any[] = [];
  const sightings = options.sightings ?? [{pk_sighting_id:1, photographer:'Don McLeish', sighting_date:'2013-07-12'}, {pk_sighting_id:2, photographer:'Don McLeish', sighting_date:'2020-08-18'}];
  const client: any = {
    auth: { getUser: async () => ({data:{user:{id:'actor'}}}), admin: { inviteUserByEmail: async (...args: any[]) => {events.push(['invite',...args]); return {data:{user:options.inviteFails ? null : {id:'new-user'}},error:options.inviteFails};} } },
    from(table: string) {
      let filter: any, operation = 'select', value: any;
      const result = () => {
        if (operation !== 'select') { if (options.auditThrows && table==='user_access_audit' && operation==='update') throw Error('audit transport'); events.push([table,operation,value]); return {data:{id:1},error:table==='contributor_legacy_aliases' && options.linkFails};}
        if (table==='profiles') return {data:{id:'actor',role:'admin',is_active:true,...options.profile}};
        if (table==='sightings') return {data:filter ? sightings.filter((r: any)=>r[filter[0]]===filter[1]) : sightings};
        if (table==='contributor_legacy_aliases') return {data:options.mapped ? [{photographer_alias:'Don McLeish'}] : []};
        return {data:[],count:table==='mantas' ? 3 : 4};
      };
      const chain: any = {select:()=>chain,order:()=>chain,range:(from:number,to:number)=>Promise.resolve({...result(),data:result().data.slice(from,to+1)}),eq:(k:string,v:any)=>{filter=[k,v];return chain;},in:()=>Promise.resolve(result()),insert:(v:any)=>{operation='insert';value=v;return chain;},update:(v:any)=>{operation='update';value=v;return chain;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};
      return chain;
    }
  }; return {client,events};
}
test('summary uses exact stored spelling and associated counts/dates',async()=>{
  const {client}=fixture(); const c=await checkInviteHistory(client,' don mcleish ');
  assert.deepEqual(c,{status:'eligible',alias:'Don McLeish',sightings:2,mantas:3,photos:4,first:'2013-07-12',latest:'2020-08-18'});
});
test('mapped aliases cannot be offered or revalidated',async()=>{
 const {client}=fixture({mapped:true}); assert.equal((await checkInviteHistory(client,'Don McLeish')).status,'mapped');
 await assert.rejects(requireInviteAlias(client,'Don McLeish'),/already linked/);
});
test('invalid browser aliases reject',async()=>{
 const {client}=fixture(); for(const value of ['',null,'Don','Kristen DeCrauzaz']) await assert.rejects(requireInviteAlias(client,value));
});
test('revalidation prevents raced mapping and failed insertion is nonfatal',async()=>{
 for(const opts of [{mapped:true},{linkFails:true}]) { const {client}=fixture(opts); assert.equal(await linkInvitedHistory(client,'new-user','Don McLeish'),false); }
});
async function run(body: any, options: any = {}) {
 const {client,events}=fixture(options); let handler:any;
 const env:any={SUPABASE_URL:'https://example.invalid',PASSWORD_REDIRECT_URL:'https://app.example.invalid/set-password',ALLOWED_REDIRECT_ORIGINS:'https://app.example.invalid'};
 const source=readFileSync('supabase/functions/admin-user-management/index.ts','utf8').replace(/^import .*\n/gm,'');
 const context=vm.createContext({serve:(h:any)=>handler=h,createClient:()=>client,parseAction,parseManagedRole,requireActiveAdmin,checkInviteHistory,requireInviteAlias,linkInvitedHistory,LINK_WARNING,resolvePublishableKey:()=> 'mock',resolveSecretKey:()=> 'mock',Deno:{env:{get:(key:string)=>env[key]}},URL,Response});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer mock'},body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json(),events};
}
const invite={action:'invite',email:'new@example.invalid',display_name:'Don McLeish',reason:'Reviewed invitation'};
test('unchecked invitation sends metadata but creates no alias',async()=>{
 const r=await run(invite); assert.equal(r.status,200); assert.deepEqual(r.body,{ok:true});
 assert.equal(r.events.filter(e=>e[0]==='invite').length,1); assert.equal(r.events.some(e=>e[0]==='contributor_legacy_aliases'),false);
 assert.equal(r.events.find(e=>e[0]==='invite')[2].data.display_name,'Don McLeish');
});
test('approved alias maps only after invitation to returned new user ID and audits success',async()=>{
 const r=await run({...invite,legacy_photographer_alias:' don mcleish '}); assert.equal(r.body.historical_linked,true);
 const ix=r.events.findIndex(e=>e[0]==='invite'), ax=r.events.findIndex(e=>e[0]==='contributor_legacy_aliases'); assert.ok(ax>ix);
 assert.deepEqual(r.events[ax][2],{user_id:'new-user',photographer_alias:'Don McLeish'});
 assert.ok(r.events.some(e=>e[2]?.details?.historical_link_succeeded===true));
});
test('invalid or mapped browser alias rejects before invitation',async()=>{
 for(const [alias,opts] of [['Don',{}],['Don McLeish',{mapped:true}]] as const){const r=await run({...invite,legacy_photographer_alias:alias},opts);assert.equal(r.status,400);assert.equal(r.events.some(e=>e[0]==='invite'),false);}
});
test('failed invitation creates no alias',async()=>{
 const r=await run({...invite,legacy_photographer_alias:'Don McLeish'},{inviteFails:true});assert.equal(r.status,409);assert.equal(r.events.some(e=>e[0]==='contributor_legacy_aliases'),false);
});
test('link failure reports successful invite plus warning and audits failure',async()=>{
 const r=await run({...invite,legacy_photographer_alias:'Don McLeish'},{linkFails:true}); assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.warning,LINK_WARNING);
 assert.ok(r.events.some(e=>e[2]?.details?.historical_link_succeeded===false));assert.equal(r.events.filter(e=>e[0]==='invite').length,1);
});
test('history lookup and linking require active admin',async()=>{
 for(const profile of [{role:'user'},{is_active:false}]) for(const body of [{action:'check_history',display_name:'Don McLeish'},{...invite,legacy_photographer_alias:'Don McLeish'}]) assert.equal((await run(body,{profile})).status,403);
});
test('API omits unchecked alias and includes approved alias exactly',async()=>{
 const source=readFileSync('src/lib/adminUserManagementApi.ts','utf8');
 const fn=source.slice(source.indexOf('export function inviteManagedUser'),source.indexOf('export function updateManagedUserAccess')).replace('export ','');
 const c:any=vm.createContext({invoke:(body:any)=>JSON.parse(JSON.stringify(body))});vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 const input={email:'new@example.invalid',displayName:'Don',reason:'Invite'};
 assert.deepEqual(c.inviteManagedUser(input),{action:'invite',email:input.email,display_name:'Don',reason:'Invite'});
 assert.equal(c.inviteManagedUser({...input,legacyPhotographerAlias:'Don McLeish'}).legacy_photographer_alias,'Don McLeish');
});

test('audit transport failure after invitation never reports a failed invite',async()=>{
 const r=await run({...invite,legacy_photographer_alias:'Don McLeish'},{auditThrows:true});assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.warning,LINK_WARNING);
});
