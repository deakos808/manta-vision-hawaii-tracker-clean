import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(`${process.cwd()}/package.json`);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = readFileSync(process.env.PASSWORD_RESET_DRAFT || 'src/pages/auth/SignInPage.tsx', 'utf8');
async function request(email: string, response: any = { error: null }, thrown = false) {
  const state: any = { notice: false, error: null, busy: false, calls: [] };
  const ctx: any = { email, window: { location: { origin: 'https://example.invalid' } },
    setErrorMsg: (v: any) => state.error=v, setResetNotice: (v: any) => state.notice=v, setResetBusy: (v: any) => state.busy=v,
    supabase: { auth: { resetPasswordForEmail: async (...args: any[]) => { state.calls.push(args); if (thrown) throw Error('network'); return response; } } },
  };
  const handler = source.slice(source.indexOf('  async function handleReset'), source.indexOf('\n  return ('));
  vm.runInNewContext(ts.transpile(handler),ctx);
  await ctx.handleReset({ preventDefault() {} });
  return state;
}
function render(notice: boolean) {
  let index=0;
  const values=['','',null,notice,false,false];
  const module={exports:{} as any};
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  new Function('require','module','exports',code)((id: string) => {
    if(id==='react')return {...React,default:React,useState:()=>[values[index++],()=>{}]};
    if(id==='react-router-dom')return {useNavigate:()=>()=>{},useLocation:()=>({state:null})};
    if(id.includes('authRouting'))return {safeInternalRedirect:()=>'/dashboard'};
    if(id.includes('supabase'))return {supabase:{}};
    throw Error(id);
  },module,module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('known and unknown emails receive identical neutral success UI',async()=>{
  const known=await request('known@example.invalid'),unknown=await request('unknown@example.invalid');
  assert.equal(known.notice,true);assert.equal(unknown.notice,true);assert.equal(known.error,null);assert.equal(unknown.error,null);
  const html=render(known.notice);assert.equal(html,render(unknown.notice));
  assert.match(html,/If an active MantaTracker account exists/);assert.match(html,/Check your email/);assert.match(html,/spam or junk/);assert.match(html,/contact HAMER administration/);
  assert.doesNotMatch(html,/Email sent|User not found|Email not registered|No account exists/);
  assert.equal(known.calls.length,1);assert.equal(unknown.calls.length,1);
});
test('server errors are handled without displaying provider account information',async()=>{
  const result=await request('unknown@example.invalid',{error:{message:'User not found'}});
  assert.equal(result.notice,false);assert.match(result.error,/Unable to process/);assert.doesNotMatch(result.error,/User not found/);assert.equal(result.busy,false);
});
test('thrown network failure is handled and busy state clears',async()=>{
  const result=await request('known@example.invalid',null,true);assert.equal(result.notice,false);assert.match(result.error,/try again later/);assert.equal(result.busy,false);
});
test('missing input is local validation and makes no request',async()=>{
  const result=await request('');assert.equal(result.calls.length,0);assert.match(result.error,/Enter your email/);
});
test('contributor access link remains available before and after reset',()=>{
  for(const notice of [false,true])assert.match(render(notice),/href="\/contribute"[^>]*>Need contributor access\?/);
});
test('public flow neither queries account inventory nor creates accounts',()=>{
  assert.doesNotMatch(source,/auth\.(signUp|admin)|listUsers|getUserById|\.from\(/);
  const routes=readFileSync('src/App.tsx','utf8');assert.doesNotMatch(routes,/path=["']\/(signup|register)["']/);
  assert.doesNotMatch(readFileSync('src/pages/public/ContributePage.tsx','utf8'),/auth\.(signUp|admin)/);
});
