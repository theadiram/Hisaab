import {afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {proxy} from '../src/proxy';
afterEach(()=>vi.unstubAllEnvs());
it('pauses every write during the split database move, including authorized owner requests',()=>{
 vi.stubEnv('HISAAB_MIGRATION_READ_ONLY','true');vi.stubEnv('HISAAB_ADMIN_TOKEN','owner-test-token');vi.stubEnv('HISAAB_PUBLIC_PREVIEW','true');
 for(const path of ['/api/v1/admin/intake','/api/v1/admin/review','/api/v1/reports','/api/v1/corrections']){
  const r=proxy(new NextRequest('https://example.invalid'+path,{method:'POST',headers:{Authorization:'Bearer owner-test-token'}}));expect(r.status).toBe(503);expect(r.headers.get('cache-control')).toBe('no-store');
 }
 expect(proxy(new NextRequest('https://example.invalid/api/v1/coverage')).status).toBe(200);
});
