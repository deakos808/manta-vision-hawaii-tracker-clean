import subprocess,os,json,re
from pathlib import Path
assert os.environ.get('PGHOST','').startswith('/tmp/manta-biopsy.'),'Disposable socket required'
checks=0
compat=Path('supabase/migrations/20261017200432_introduce_guarded_biopsy_admin_reads.sql')
compat_rollback=Path('supabase/rollback/20261017200432_introduce_guarded_biopsy_admin_reads_rollback.sql')
forward=Path('supabase/migrations/20261017200435_contain_biopsy_read_paths.sql')
rollback=Path('supabase/rollback/20261017200435_contain_biopsy_read_paths_rollback.sql')
views=re.findall(r'revoke all privileges on public\.(\w+) from authenticated;',forward.read_text())
safe=['pk_biopsy_id','fk_catalog_id','fk_sighting_id','sample_date','sample_time','collector','island','region','location']
ids={name:f'{i:08d}-0000-4000-8000-000000000000' for name,i in [('admin',1),('contributor',2),('inactive',3),('missing',4),('inactive_admin',5)]}
def check(value,label):
 global checks
 assert value,label
 checks+=1
def sql(s,role=None,uid=None,denied=False):
 prefix='begin;'+(f'set local role {role};' if role else '')+(f"set local request.jwt.claim.sub='{uid}';" if uid else '')
 p=subprocess.run(['psql','-XAtq','-v','ON_ERROR_STOP=1'],input=prefix+s+';commit;',text=True,capture_output=True)
 if denied:
  check(p.returncode!=0 and ('permission denied' in p.stderr or 'Active administrator access required' in p.stderr),p.stderr);return
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def apply(path):subprocess.run(['psql','-Xq','-v','ON_ERROR_STOP=1','-f',str(path)],check=True)
def state():
 return sql("""select jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('name',relname,'owner',relowner,'acl',(select array_agg(x::text order by x::text) from unnest(relacl)x),'rls',relrowsecurity,'options',reloptions) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind in('r','v')),
 'columns',(select jsonb_agg(jsonb_build_object('rel',attrelid,'name',attname,'type',atttypid,'notnull',attnotnull,'acl',attacl) order by attrelid,attnum) from pg_attribute where attrelid in(select oid from pg_class where relnamespace='public'::regnamespace and relkind in('r','v')) and attnum>0 and not attisdropped),
 'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p),
 'new_functions',(select count(*) from pg_proc where proname in('admin_biopsy_browse','admin_biopsy_age_ranking')))""")
def rpc_state():return sql("select jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text,'owner',proowner) order by pronamespace,proname) from pg_proc where proname in ('admin_biopsy_browse','admin_biopsy_age_ranking')")
def data():return sql("select md5(string_agg(to_jsonb(b)::text,'' order by pk_biopsy_id)) from public.biopsies b")
def definitions():return sql("""select jsonb_build_object('views',(select jsonb_agg(pg_get_viewdef(oid,true) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='v'),'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where connamespace='public'::regnamespace),'helper',pg_get_functiondef('is_admin_user()'::regprocedure))""")
before=state();contents=data();defs=definitions()
columns=json.loads(sql("select json_agg(attname order by attnum) from pg_attribute where attrelid='biopsies'::regclass and attnum>0 and not attisdropped"))
def matrix():
 for name,uid in ids.items():
  expected='1' if name in ('admin','contributor') else '0'
  check(sql('select count(pk_biopsy_id) from public.biopsies','authenticated',uid)==expected,name+' visibility')
  sql('select '+','.join(safe)+' from public.biopsies','authenticated',uid)
  for c in columns:
   check(sql(f"select has_column_privilege('authenticated','public.biopsies','{c}','SELECT')")==('t' if c in safe else 'f'),c+' grant')
   if c not in safe:sql(f'select {c} from public.biopsies','authenticated',uid,True)
  sql('select * from public.biopsies','authenticated',uid,True)
  for s in ["insert into public.biopsies(pk_biopsy_id) values(11)",'update public.biopsies set collector=collector','delete from public.biopsies']:
   sql(s,'authenticated',uid,True)
  for v in views:sql(f'select * from public.{v}','authenticated',uid,True)
  for rpc in ['admin_biopsy_browse','admin_biopsy_age_ranking']:
   for schema in ['public','private']:
    if name!='admin' or schema=='private':sql(f'select {schema}.{rpc}()','authenticated',uid,True)
    else:
     result=json.loads(sql(f'select {schema}.{rpc}()','authenticated',uid))
     check(len(result)==1,rpc+' row count')
     if rpc.endswith('browse'):
      check(set(result[0])=={'pk_biopsy_id','fk_catalog_id','fk_manta_id','fk_sighting_id','sample_date','catalog','sightings'},'exact browse keys')
      check(result[0]['catalog']['pk_catalog_id']==733 and result[0]['sightings']=={'is_mprf':False},'joins retained')
     else:
      check(result[0]['mprf_biopsy_id']=='LAB-SECRET' and result[0]['jonathan_sample_id']=='SAMPLE-SECRET','admin sample identifiers')
      check('notes' not in result[0] and len(result[0])==44,'fixed ranking projection')
 for rpc in ['admin_biopsy_browse','admin_biopsy_age_ranking']:
  sql(f'select public.{rpc}()','authenticated',denied=True)
  sql(f'select public.{rpc}()','anon',denied=True)
  check(sql(f"select count(*) from pg_proc p, lateral aclexplode(p.proacl) a where p.proname='{rpc}' and a.grantee=0")=='0','no PUBLIC execute')
 for s in ['select pk_biopsy_id from biopsies','insert into biopsies(pk_biopsy_id) values(11)','update biopsies set collector=collector','delete from biopsies']:
  sql(s,'anon',denied=True)
 for v in views:
  sql(f'select * from public.{v}','anon',denied=True)
  check(sql(f'select count(*) from public.{v}','service_role')=='1','service view retained') if v!='kona_biopsy_age_rank_view_v3' else None
 for priv in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
  check(sql(f"select has_table_privilege('authenticated','biopsies','{priv}')")=='f','no table-wide '+priv)
  check(sql(f"select has_table_privilege('service_role','biopsies','{priv}')")=='t','service '+priv)
 sql("insert into biopsies(pk_biopsy_id) values(20);update biopsies set notes='TEST' where pk_biopsy_id=20;delete from biopsies where pk_biopsy_id=20",'service_role')
 check(data()==contents,'service test cleanup and content equality')
 check(definitions()==defs,'unchanged definitions')

def rpc_security():
 for rpc in ['admin_biopsy_browse','admin_biopsy_age_ranking']:
  for schema in ['public','private']:
   check(sql(f"select prosecdef and proowner='postgres'::regrole and proconfig=ARRAY['search_path=\"\"'] from pg_proc where oid='{schema}.{rpc}()'::regprocedure")=='t','definer owner and fixed path')
   for role in ['anon','authenticated','service_role']:
    expected='t' if schema=='public' and role=='authenticated' else 'f'
    check(sql(f"select has_function_privilege('{role}','{schema}.{rpc}()','EXECUTE')")==expected,'exact EXECUTE '+schema+role)
   sql(f'select {schema}.{rpc}()','anon',denied=True)
   sql(f'select {schema}.{rpc}()','service_role',denied=True)
   for name,uid in ids.items():
    if schema=='private' or name!='admin':sql(f'select {schema}.{rpc}()','authenticated',uid,True)
    else:check(len(json.loads(sql(f'select public.{rpc}()','authenticated',uid)))==1,'Admin public RPC')
   check(len(json.loads(sql(f'select {schema}.{rpc}()',uid=ids['admin'])))==1,'owner with authorized identity')
 check(sql("select has_schema_privilege('authenticated','private','USAGE')")=='t','existing schema usage retained but cannot execute private routines')

def old_client():
 check(sql('select count(*) from biopsies','authenticated',ids['admin'])=='1','old Admin list')
 sql('select b.pk_biopsy_id,b.fk_catalog_id,b.fk_manta_id,b.fk_sighting_id,b.sample_date,c.name,s.is_mprf from biopsies b left join catalog c on c.pk_catalog_id=b.fk_catalog_id left join sightings s on s.pk_sighting_id=b.fk_sighting_id order by b.created_at desc limit 2000','authenticated',ids['admin'])
 sql('select '+','.join(safe)+' from biopsies','authenticated',ids['contributor'])
 # Known pre-existing Production helper denial must not be disguised as a regression.
 sql('select * from kona_biopsy_age_rank_view_v3 order by age_rank_v3','authenticated',ids['admin'],True)

def ui(stage):
 subprocess.run(['node','supabase/tests/biopsy_read_ui.cjs'],check=True)
 print(stage+' actual frontend callbacks passed',flush=True)

old_client()
apply(compat);rpc_security();old_client()
compat_state=json.loads(state());baseline=json.loads(before)
check({k:v for k,v in compat_state.items() if k!='new_functions'}=={k:v for k,v in baseline.items() if k!='new_functions'},'A leaves all existing relation/column ACLs and policies unchanged')
check(data()==contents and definitions()==defs,'A content/view/constraint/helper integrity')
ui('A')
apply(compat_rollback);check(state()==before,'A exact rollback');check(data()==contents,'A rollback content')
apply(compat);stage_a=state();stage_a_rpcs=rpc_state();rpc_security()
apply(forward);matrix();rpc_security();check(rpc_state()==stage_a_rpcs,'B leaves RPC definitions/ACLs/owners unchanged');ui('B')
apply(rollback);check(state()==stage_a,'B rollback preserves A and restores prior ACL/RLS/policies');check(data()==contents,'B rollback content');check(rpc_state()==stage_a_rpcs,'B rollback leaves RPCs intact');ui('B rollback')
apply(compat_rollback);check(state()==before,'both rollbacks restore baseline')
apply(compat);apply(forward);matrix();rpc_security();ui('reapply A+B')
print(f'{checks} isolated biopsy read-boundary assertions passed')
