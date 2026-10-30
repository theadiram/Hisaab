import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {publicDb} from '../src/lib/public-db';
import {reportClient} from '../src/lib/reports';
import {adminClient} from '../src/lib/admin';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('does not leave background refresh timers behind for request-scoped database clients',async()=>{
 vi.stubEnv('SUPABASE_URL','http://127.0.0.1:59999');
 vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','test-public-key');vi.stubEnv('SUPABASE_SECRET_KEY','test-private-key');
 const timer=vi.spyOn(globalThis,'setInterval');
 const clients=Array.from({length:20},()=>[publicDb(),reportClient(),adminClient('test-admin-token')]).flat();
 try{
  await Promise.all(clients.map(c=>c.auth.getSession()));
  expect(timer).not.toHaveBeenCalled();
 }finally{await Promise.all(clients.map(c=>c.auth.stopAutoRefresh()));}
});
