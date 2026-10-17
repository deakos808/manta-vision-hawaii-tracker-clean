import subprocess,os,json
assert os.environ.get('PGHOST','').startswith('/tmp/manta-calibration.'), 'Disposable socket required'
count=0
def sql(q,role=None,uid=None,fail=False):
 prefix='begin;'+(f'set local role {role};' if role else '')+(f"set local request.jwt.claim.sub='{uid}';" if uid else '')
 p=subprocess.run(['psql','-XAtq','-v','ON_ERROR_STOP=1'],input=prefix+q+';commit;',text=True,capture_output=True)
 if fail:
  check(p.returncode!=0 and ('permission denied' in p.stderr or 'row-level security' in p.stderr),p.stderr)
  return
 if p.returncode:raise Exception(p.stderr)
 return p.stdout.strip()
def check(b,label):
 global count
 assert b,label
 count+=1
ids=[f'{i:08d}-0000-4000-8000-000000000000' for i in range(1,5)]
tables=['calibration_sessions','calibration_photos','calibration_measurements']
sid='aaaaaaaa-0000-4000-8000-000000000000';pid='bbbbbbbb-0000-4000-8000-000000000000'
ins=["insert into calibration_sessions (photographer_name) values ('FIXTURE')",f"insert into calibration_photos(session_id,storage_path) values('{sid}','fixture.jpg')",f"insert into calibration_measurements(photo_id,scale_px,object_px,scale_p0,scale_p1,object_p0,object_p1,scale_m,est_length_m,error_pct) values('{pid}',10,20,'{{}}','{{}}','{{}}','{{}}',0.6,1.2,0)"]
sql(f"insert into calibration_sessions(id,photographer_name) values('{sid}','FIXTURE BASE'); insert into calibration_photos(id,session_id,storage_path) values('{pid}','{sid}','fixture.jpg');"+ins[2])
def state():
 return sql("select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'options',c.reloptions) order by c.relname) from pg_class c where c.relname in ('calibration_sessions','calibration_photos','calibration_measurements','calibration_session_stats')),'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where tablename like 'calibration%'))")
def contents():
 return [sql(f"select md5(string_agg(to_jsonb(t)::text,'' order by id)) from {t} t") for t in tables]
def structure():
 return sql("""select jsonb_build_object(
 'columns',(select jsonb_agg(jsonb_build_object('table',a.attrelid,'name',a.attname,'type',a.atttypid,'mod',a.atttypmod,'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attrelid,a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in ('calibration_sessions'::regclass,'calibration_photos'::regclass,'calibration_measurements'::regclass) and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid in ('calibration_sessions'::regclass,'calibration_photos'::regclass,'calibration_measurements'::regclass)),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by oid) from pg_trigger where tgrelid in ('calibration_sessions'::regclass,'calibration_photos'::regclass,'calibration_measurements'::regclass)),
 'view',pg_get_viewdef('calibration_session_stats'::regclass,true),
 'helper',pg_get_functiondef('is_admin_user()'::regprocedure))""")
before=state();data=contents();definitions=structure()
def apply(path):subprocess.run(['psql','-Xq','-v','ON_ERROR_STOP=1','-f',path],check=True)
apply('supabase/migrations/20261017173149_contain_calibration_admin_access.sql')
for uid,expected in zip(ids,['t','f','f','f']):check(sql('select is_admin_user()','authenticated',uid)==expected,'helper')
sql('select is_admin_user()','anon',fail=True)
def matrix():
 for t,insert in zip(tables,ins):
  for q in [f'select * from {t}',insert,f'update {t} set id=id',f'delete from {t}']:sql(q,'anon',fail=True)
  for uid in ids[1:]:
   check(sql(f'select count(*) from {t}','authenticated',uid)=='0',t+' zero visible')
   sql(insert,'authenticated',uid,fail=True)
   if t=='calibration_measurements':sql(f'update {t} set id=id','authenticated',uid,fail=True)
   else:check(sql(f'with c as(update {t} set id=id returning *) select count(*) from c','authenticated',uid)=='0','zero updates')
   check(sql(f'with c as(delete from {t} returning *) select count(*) from c','authenticated',uid)=='0','zero deletes')
  check(sql(f'select count(*) from {t}','authenticated',ids[0])=='1','admin read')
  check(sql(f'select count(*) from {t}','service_role')=='1','service bypass')
  for priv in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
   check(sql(f"select has_table_privilege('service_role','{t}','{priv}')")=='t','service '+priv)
  for priv in ['TRUNCATE','REFERENCES','TRIGGER']:check(sql(f"select has_table_privilege('authenticated','{t}','{priv}')")=='f','schema denial')
 for uid in ids[1:]:check(sql('select count(*) from calibration_session_stats','authenticated',uid)=='0','view no bypass')
 check(sql('select count(*) from calibration_session_stats','authenticated',ids[0])=='1','admin view')
 sql('select * from calibration_session_stats','anon',fail=True)
matrix();check(contents()==data,'forward data intact');check(structure()==definitions,'forward definitions intact')
apply('supabase/rollback/20261017173149_contain_calibration_admin_access_rollback.sql');check(state()==before,'exact rollback metadata');check(contents()==data,'rollback data intact');check(structure()==definitions,'rollback definitions intact')
apply('supabase/migrations/20261017173149_contain_calibration_admin_access.sql');matrix();check(contents()==data,'reapply data intact');check(structure()==definitions,'reapply definitions intact')
print(f'{count} isolated role/ACL/rollback assertions passed')
open(os.environ['CALIBRATION_TEST_RESULTS']+'/roles.json','w').write(json.dumps({'assertions':count,'baseline':json.loads(before),'fingerprints':data},indent=2))
