import {beforeEach,describe,expect,it,vi} from 'vitest';
const jar={get:vi.fn(),set:vi.fn()};
vi.mock('next/headers',()=>({cookies:vi.fn(async()=>jar)}));
vi.mock('../src/lib/admin',()=>({adminCookie:'hisaab_admin',requireAdmin:vi.fn(),verifyAdmin:vi.fn()}));
vi.mock('../src/lib/reports',()=>({reportClient:vi.fn()}));
import {verifyAdmin} from '../src/lib/admin';
import {reportClient} from '../src/lib/reports';
import {DELETE,POST} from '../src/app/api/v1/admin/session/route';

const request=(method:string,body?:unknown)=>new Request('http://localhost/api/v1/admin/session',{method,headers:{origin:'http://localhost','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const signOut=vi.fn();
beforeEach(()=>{vi.resetAllMocks();vi.mocked(reportClient).mockReturnValue({auth:{admin:{signOut}}} as unknown as ReturnType<typeof reportClient>);});

describe('administrator session cookie',()=>{
 it('scopes the cookie to the whole site so admin pages can read it',async()=>{vi.mocked(verifyAdmin).mockResolvedValue({} as Awaited<ReturnType<typeof verifyAdmin>>);const response=await POST(request('POST',{token:'synthetic-token'}));expect(response.status).toBe(200);expect(jar.set).toHaveBeenCalledWith('hisaab_admin','synthetic-token',{httpOnly:true,secure:false,sameSite:'strict',path:'/',maxAge:900});});
 it('does not set the cookie when MFA verification fails',async()=>{vi.mocked(verifyAdmin).mockRejectedValue(new Error('MFA required'));expect((await POST(request('POST',{token:'synthetic-token'}))).status).toBe(401);expect(jar.set).not.toHaveBeenCalled();});
 it('clears the cookie at the same path on sign out',async()=>{jar.get.mockReturnValue({value:'synthetic-token'});signOut.mockResolvedValue({error:null});const response=await DELETE(request('DELETE'));expect(response.status).toBe(200);expect(signOut).toHaveBeenCalledWith('synthetic-token','local');expect(jar.set).toHaveBeenCalledWith('hisaab_admin','',expect.objectContaining({path:'/',maxAge:0,httpOnly:true,sameSite:'strict'}));});
});
