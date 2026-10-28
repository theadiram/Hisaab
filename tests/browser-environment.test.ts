import {expect,it} from 'vitest';
import {browserDataMode,testDatabaseUrl} from './browser/test-environment';
it('keeps synthetic private evidence uploads on loopback services',()=>{
 expect(testDatabaseUrl('http://127.0.0.1:55321')).toBe('http://127.0.0.1:55321');
 expect(testDatabaseUrl('http://localhost:54321/')).toBe('http://localhost:54321');
 for(const address of ['https://example.supabase.co','http://127.0.0.1.attacker.example:54321','http://localhost:54321/private','http://secret@localhost:54321','http://localhost:54321/?redirect=remote'])expect(()=>testDatabaseUrl(address)).toThrow('loopback');
});
it('runs browser specs against the test database unless local data is explicitly requested',()=>{
 expect(browserDataMode('local')).toBe('local');
 for(const value of ['','supabase','LOCAL',' local','local,supabase'])expect(browserDataMode(value)).toBe('supabase');
});
