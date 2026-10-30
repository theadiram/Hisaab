import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readDevelopment} from '../src/lib/development-db';
import {developmentSelection} from '../src/lib/development';
import {GET as programmeHistory} from '../src/app/api/v1/development/programmes/[id]/route';

// Without a configured catalogue every request must fail closed, and no started read may be left rejecting unobserved.
const unhandled:unknown[]=[],record=(reason:unknown)=>{unhandled.push(reason);};
beforeEach(()=>{unhandled.length=0;process.on('unhandledRejection',record);vi.stubEnv('SUPABASE_URL','');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','');});
afterEach(()=>{process.off('unhandledRejection',record);vi.unstubAllEnvs();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

it('rejects development reads without leaving an unhandled rejection',async()=>{
  await expect(readDevelopment(developmentSelection(new URLSearchParams('year=2026-2027&measure=allocated')))).rejects.toThrow('Published catalogue connection unavailable');
  await settle();expect(unhandled).toEqual([]);
});

it('returns unavailable programme history without leaving an unhandled rejection',async()=>{
  const r=await programmeHistory(new Request('http://localhost/api/v1/development/programmes/x?scope=national'),{params:Promise.resolve({id:'x'})});
  expect(r.status).toBe(503);
  await settle();expect(unhandled).toEqual([]);
});
