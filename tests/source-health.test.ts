import {it,expect,vi} from 'vitest';
import {classifyResponse,classifyDnsError,classifyError,checkUrl,checkSources} from '../scripts/check-sources.mjs';
const coded=(code:string,message=code)=>Object.assign(new Error(message),{code});
const fetchFailed=(cause:unknown)=>new TypeError('fetch failed',{cause});
const resolver=(code?:string):any=>({resolve4:vi.fn(async()=>{if(code)throw coded(code);return ['164.100.1.1'];}),resolve6:vi.fn(async()=>{if(code)throw coded(code);return [];})});
const answering=(status:number,url?:string):any=>vi.fn(async(requested:string)=>({status,url:url??requested,body:{cancel:vi.fn(async()=>{})}}));
const failing=(error:unknown):any=>vi.fn(async()=>{throw error;});
it('treats only not-found and gone responses as definitive HTTP failures',()=>{
 expect(classifyResponse(200)).toMatchObject({result:'ok'});
 expect(classifyResponse(404)).toEqual({result:'http-error',definitive:true,detail:'HTTP 404'});
 expect(classifyResponse(410).definitive).toBe(true);
 for(const status of [401,403,429,500,503])expect(classifyResponse(status)).toMatchObject({result:'http-error',definitive:false});
});
it('separates authoritative DNS answers from resolver trouble',()=>{
 expect(classifyDnsError(coded('ENOTFOUND'))).toEqual({result:'dns',definitive:true,detail:'NXDOMAIN'});
 expect(classifyDnsError(coded('ENODATA'))).toMatchObject({result:'dns',definitive:true});
 expect(classifyDnsError(coded('ESERVFAIL'))).toEqual({result:'dns',definitive:false,detail:'SERVFAIL'});
 for(const code of ['ETIMEOUT','ECONNREFUSED','EREFUSED'])expect(classifyDnsError(coded(code))).toMatchObject({result:'unreachable',definitive:false});
});
it('reports certificate failures as definitive TLS errors',()=>{
 expect(classifyError(fetchFailed(coded('CERT_HAS_EXPIRED','certificate has expired')),15)).toEqual({result:'tls',definitive:true,detail:'certificate expired (CERT_HAS_EXPIRED)'});
 for(const code of ['ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])expect(classifyError(fetchFailed(coded(code)),15)).toMatchObject({result:'tls',definitive:true});
});
it('keeps timeouts, refusals, resets and handshake failures inconclusive',()=>{
 expect(classifyError(new DOMException('The operation was aborted due to timeout','TimeoutError'),15)).toEqual({result:'unreachable',definitive:false,detail:'no response within 15s'});
 expect(classifyError(fetchFailed(coded('UND_ERR_CONNECT_TIMEOUT')),15).detail).toBe('connect timeout');
 expect(classifyError(fetchFailed(new AggregateError([coded('ECONNREFUSED'),coded('ECONNREFUSED')])),15).detail).toBe('connection refused');
 expect(classifyError(fetchFailed(coded('ECONNRESET')),15).detail).toBe('connection reset');
 expect(classifyError(fetchFailed(coded('ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED')),15)).toMatchObject({result:'unreachable',definitive:false});
 expect(classifyError(fetchFailed(new Error('redirect count exceeded')),15).detail).toMatch(/redirect loop/);
 // getaddrinfo can report "not found" when the machine is offline, so only the explicit resolver's NXDOMAIN is definitive.
 expect(classifyError(fetchFailed(coded('ENOTFOUND','getaddrinfo ENOTFOUND example.gov.in')),15)).toMatchObject({result:'unreachable',definitive:false});
 expect(classifyError(new Error('something unexpected'),15)).toMatchObject({result:'unreachable',definitive:false,detail:'something unexpected'});
});
it('stops at NXDOMAIN without contacting the host',async()=>{
 const fetcher=answering(200);
 expect(await checkUrl('https://pmayg.nic.in/',{fetcher,resolver:resolver('ENOTFOUND')})).toEqual({result:'dns',definitive:true,detail:'NXDOMAIN'});
 expect(fetcher).not.toHaveBeenCalled();
});
it('rechecks SERVFAIL hosts over HTTP instead of failing them',async()=>{
 expect(await checkUrl('https://hppwd.hp.gov.in/pmgsy',{fetcher:answering(200),resolver:resolver('ESERVFAIL'),retries:0})).toEqual({result:'ok',definitive:false,detail:'HTTP 200; resolver reported SERVFAIL'});
 expect(await checkUrl('https://hppwd.hp.gov.in/pmgsy',{fetcher:failing(fetchFailed(coded('EAI_AGAIN'))),resolver:resolver('ESERVFAIL'),retries:0})).toEqual({result:'dns',definitive:false,detail:'SERVFAIL'});
});
it('retries only inconclusive failures, at most twice',async()=>{
 const timeouts=failing(fetchFailed(coded('UND_ERR_CONNECT_TIMEOUT')));
 expect(await checkUrl('https://pfms.nic.in/',{fetcher:timeouts,resolver:resolver(),retries:50})).toMatchObject({result:'unreachable'});
 expect(timeouts).toHaveBeenCalledTimes(3);
 const expired=failing(fetchFailed(coded('CERT_HAS_EXPIRED')));
 expect(await checkUrl('https://mplads.mospi.gov.in/',{fetcher:expired,resolver:resolver(),retries:2})).toMatchObject({result:'tls',definitive:true});
 expect(expired).toHaveBeenCalledTimes(1);
});
it('never disables certificate checks and records redirects without reading the body',async()=>{
 const fetcher=answering(404,'https://eprocure.gov.in/cppp/missing');
 const result=await checkUrl('https://eprocure.gov.in/cppp/relatedlinks',{fetcher,resolver:resolver()});
 expect(result).toEqual({result:'http-error',definitive:true,detail:'HTTP 404',finalUrl:'https://eprocure.gov.in/cppp/missing'});
 const [,init]=fetcher.mock.calls[0];expect(init.redirect).toBe('follow');expect(init.signal).toBeInstanceOf(AbortSignal);expect(init).not.toHaveProperty('dispatcher');
 // GePNIC procurement portals return 500 to fetch's default accept-language: *.
 expect(init.headers['accept-language']).toMatch(/^en/);
 expect((await fetcher.mock.results[0].value).body.cancel).toHaveBeenCalled();
});
it('checks each distinct URL once with bounded concurrency',async()=>{
 let active=0,peak=0;
 const fetcher:any=vi.fn(async(url:string)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return {status:200,url,body:null};});
 const sources=[{id:'jjm',url:'https://ejalshakti.gov.in/a'},{id:'jjm-financial',url:'https://ejalshakti.gov.in/a'},...Array.from({length:6},(_,i)=>({id:`s${i}`,url:`https://example.gov.in/${i}`}))];
 const rows:{id:string,result:string}[]=await checkSources(sources,{fetcher,resolver:resolver(),concurrency:2});
 expect(fetcher).toHaveBeenCalledTimes(7);expect(peak).toBeLessThanOrEqual(2);
 expect(rows.map(row=>row.id)).toEqual(sources.map(source=>source.id));
 expect(rows[1]).toMatchObject({id:'jjm-financial',result:'ok'});
});
