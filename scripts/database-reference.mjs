import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const index = process.argv.indexOf('--container');
const container = index >= 0 ? process.argv[index + 1] : undefined;
if (!container || !/^supabase_db_[A-Za-z0-9_-]+$/.test(container)) {
  throw new Error('Pass --container supabase_db_<disposable-project>. No hosted connection is accepted.');
}
// Catalog metadata only: no application rows, user identities or stored payloads.
const query = `select jsonb_build_object(
 'tables', (select jsonb_agg(to_jsonb(t) order by t.schema,t.name) from (
 select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid) as constraints,
 (select jsonb_agg(indexdef order by indexname) from pg_indexes i where i.schemaname=n.nspname and i.tablename=c.relname) as indexes
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r') t),
 'views',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true),'options',c.reloptions) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='v'),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'securityDefiner',p.prosecdef,'settings',p.proconfig,'acl',p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname) from pg_policies p where p.schemaname in ('public','private'))
);`;
const raw = execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: query, encoding: 'utf8' });
const reference = JSON.parse(raw);
writeFileSync('docs/database-reference.json', JSON.stringify(reference, null, 2) + '\n');
console.log(`Generated schema-only reference: ${reference.tables.length} tables, ${reference.functions.length} functions. No application rows exported.`);
