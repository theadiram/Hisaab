import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {notFutureDate,localToday} from '../src/lib/dates';
import {reportInput} from '../src/lib/reports';
const report=(observedDate:string)=>reportInput.safeParse({workId:null,description:'Road surface broken near the school gate',observedDate,consent:true});
describe('citizen calendar dates',()=>{
 it('accepts today in India between midnight and 05:30 IST',()=>{const now=Date.parse('2026-10-26T19:30:00Z');expect(notFutureDate('2026-10-27',now)).toBe(true);expect(notFutureDate('2026-10-29',now)).toBe(false);});
 it('rejects impossible and future observation dates',()=>{expect(report('2025-01-15').success).toBe(true);for(const v of ['2026-02-31','2025-13-01','2999-01-01'])expect(report(v).success).toBe(false);});
 it('uses the browser time zone for date input limits',()=>{expect(localToday(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);});
});
