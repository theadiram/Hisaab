import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});

it('reuses one published client instead of building one per read',async()=>{
 vi.stubEnv('SUPABASE_URL','https://project.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_first');
 const {publicDb}=await import('../src/lib/public-db');
 expect(publicDb()).toBe(publicDb());
});

it('builds a new client when the configured credentials change',async()=>{
 vi.stubEnv('SUPABASE_URL','https://project.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_first');
 const {publicDb}=await import('../src/lib/public-db');
 const first=publicDb();
 vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_second');
 expect(publicDb()).not.toBe(first);
 vi.stubEnv('SUPABASE_URL','https://other.supabase.co');
 expect(publicDb()).not.toBe(first);
});

it('refuses to connect when the published credentials are missing',async()=>{
 vi.stubEnv('SUPABASE_URL','');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','');
 const {publicDb}=await import('../src/lib/public-db');
 expect(()=>publicDb()).toThrow('Published catalogue connection unavailable');
});
