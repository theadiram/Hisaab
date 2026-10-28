// Checks that each data/source-register.json route still answers. Reads response headers only; never downloads, stores or retries indefinitely.
// Only an authoritative NXDOMAIN, a certificate failure or HTTP 404/410 is definitive. Timeouts, resets, refusals, SERVFAIL and 401/403/5xx can depend on where the check runs.
import {readFile} from 'node:fs/promises';
import {promises as dns} from 'node:dns';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
const agent='Hisaab source health check (headers only; https://github.com/theadiram/Hisaab)';
const certificate={CERT_HAS_EXPIRED:'certificate expired',CERT_NOT_YET_VALID:'certificate not yet valid',CERT_REVOKED:'certificate revoked',ERR_TLS_CERT_ALTNAME_INVALID:'certificate does not match host',DEPTH_ZERO_SELF_SIGNED_CERT:'self-signed certificate',SELF_SIGNED_CERT_IN_CHAIN:'self-signed certificate in chain',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'incomplete certificate chain',UNABLE_TO_GET_ISSUER_CERT:'incomplete certificate chain',UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'untrusted or incomplete certificate chain',CERT_UNTRUSTED:'untrusted certificate',CERT_SIGNATURE_FAILURE:'invalid certificate signature'};
const network={ETIMEDOUT:'timeout',UND_ERR_CONNECT_TIMEOUT:'connect timeout',UND_ERR_HEADERS_TIMEOUT:'response timeout',ECONNREFUSED:'connection refused',ECONNRESET:'connection reset',UND_ERR_SOCKET:'connection closed',EPIPE:'connection closed',EHOSTUNREACH:'host unreachable',ENETUNREACH:'network unreachable',EAI_AGAIN:'temporary DNS failure'};
const codes=error=>{const found=[];for(let item=error,depth=0;item&&depth<8;item=item.cause,depth++){if(item.code)found.push(item.code);for(const nested of item.errors??[])if(nested?.code)found.push(nested.code);}return found;};
export function classifyResponse(status){
 if(status>=200&&status<400)return {result:'ok',definitive:false,detail:`HTTP ${status}`};
 // 401/403/429/5xx often mean a session, WAF, geo-filter or a passing outage; only "not found" and "gone" say the route has moved.
 return {result:'http-error',definitive:status===404||status===410,detail:`HTTP ${status}`};
}
export function classifyDnsError(error){
 if(error?.code==='ENOTFOUND')return {result:'dns',definitive:true,detail:'NXDOMAIN'};
 if(error?.code==='ENODATA')return {result:'dns',definitive:true,detail:'no address records'};
 // SERVFAIL is a resolver-side failure (broken delegation or DNSSEC) and can clear within hours; recheck before reporting it.
 if(error?.code==='ESERVFAIL')return {result:'dns',definitive:false,detail:'SERVFAIL'};
 return {result:'unreachable',definitive:false,detail:`DNS ${error?.code??'lookup failed'}`};
}
export function classifyError(error,timeoutSeconds){
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return {result:'unreachable',definitive:false,detail:`no response within ${timeoutSeconds}s`};
 const found=codes(error);
 const cert=found.find(code=>certificate[code]);if(cert)return {result:'tls',definitive:true,detail:`${certificate[cert]} (${cert})`};
 const handshake=found.find(code=>code.startsWith('ERR_SSL_')||code==='EPROTO');if(handshake)return {result:'unreachable',definitive:false,detail:`TLS handshake failed (${handshake})`};
 if(found.includes('ENOTFOUND'))return {result:'unreachable',definitive:false,detail:'system resolver found no address'};
 const known=found.find(code=>network[code]);if(known)return {result:'unreachable',definitive:false,detail:network[known]};
 if(/redirect count exceeded/i.test(String(error?.cause?.message??error?.message)))return {result:'unreachable',definitive:false,detail:'redirect loop (no cookies are kept)'};
 return {result:'unreachable',definitive:false,detail:found[0]??String(error?.cause?.message??error?.message??error)};
}
async function lookup(host,resolver){
 try{await resolver.resolve4(host);return null;}catch(error){
  if(error?.code!=='ENODATA')return classifyDnsError(error);
  try{await resolver.resolve6(host);return null;}catch(v6){return classifyDnsError(v6);}
 }
}
export async function checkUrl(url,{fetcher=fetch,resolver=new dns.Resolver({timeout:5000,tries:2}),timeoutSeconds=15,retries=1}={}){
 let host;try{host=new URL(url).hostname;}catch{return {result:'unreachable',definitive:false,detail:'invalid URL'};}
 const failedLookup=isIP(host.replace(/^\[|\]$/g,''))?null:await lookup(host,resolver);if(failedLookup?.definitive)return failedLookup;
 let outcome;
 for(let attempt=0,limit=Math.min(Math.max(Math.trunc(retries)||0,0),2);attempt<=limit;attempt++){
  try{
   // Node's fetch otherwise sends accept-language: *, which NIC GePNIC portals (CPPP and state eProcurement) answer with HTTP 500.
   const response=await fetcher(url,{redirect:'follow',headers:{'user-agent':agent,accept:'text/html,application/pdf;q=0.9,*/*;q=0.8','accept-language':'en-IN,en;q=0.9'},signal:AbortSignal.timeout(timeoutSeconds*1000)});
   await response.body?.cancel().catch(()=>{});
   outcome=classifyResponse(response.status);if(response.url&&response.url!==url)outcome.finalUrl=response.url;
  }catch(error){outcome=classifyError(error,timeoutSeconds);}
  if(outcome.result!=='unreachable')break;
 }
 // A SERVFAIL lookup that the system resolver still got past is worth a recheck, not a failure.
 if(failedLookup&&outcome.result==='ok')outcome.detail+=`; resolver reported ${failedLookup.detail}`;
 return failedLookup&&outcome.result==='unreachable'?failedLookup:outcome;
}
export async function checkSources(sources,options={}){
 const concurrency=options.concurrency??4;
 const pending=new Map();for(const source of sources)if(!pending.has(source.url))pending.set(source.url,null);
 const urls=[...pending.keys()];let next=0;
 await Promise.all(Array.from({length:Math.min(Math.max(Math.trunc(concurrency)||1,1),8,urls.length)},async()=>{while(next<urls.length){const url=urls[next++];pending.set(url,await checkUrl(url,options));}}));
 return sources.map(source=>({id:source.id,url:source.url,...pending.get(source.url)}));
}
const option=(name,fallback)=>{const index=process.argv.indexOf(name);return index>0&&process.argv[index+1]!==undefined?process.argv[index+1]:fallback;};
const integer=(name,fallback,min,max)=>{const value=Number(option(name,fallback));if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be a whole number from ${min} to ${max}`);return value;};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const only=[...new Set(option('--only','').split(',').filter(Boolean))];
 const register=JSON.parse(await readFile(new URL('../data/source-register.json',import.meta.url),'utf8')).filter(source=>!only.length||only.includes(source.id));
 if(only.length&&register.length!==only.length)throw new Error('Unknown source id in --only');
 const resolver=new dns.Resolver({timeout:5000,tries:2});const server=option('--resolver');if(server)resolver.setServers([server]);
 const checkedAt=new Date().toISOString();
 const rows=await checkSources(register,{resolver,concurrency:integer('--concurrency',4,1,8),timeoutSeconds:integer('--timeout',15,1,60),retries:integer('--retries',1,0,2)});
 const definitive=rows.filter(row=>row.definitive).length,inconclusive=rows.filter(row=>row.result!=='ok'&&!row.definitive).length;
 if(process.argv.includes('--json'))console.log(JSON.stringify({checkedAt,resolver:server??'system',note:'Unreachable, SERVFAIL and 401/403/429/5xx results can depend on where the check runs (for example outside India). Recheck them from India before treating a source as moved.',summary:{sources:rows.length,urls:new Set(rows.map(row=>row.url)).size,ok:rows.length-definitive-inconclusive,definitive,inconclusive},sources:rows},null,2));
 else{
  const width=Math.max('source'.length,...rows.map(row=>row.id.length));
  console.log(`${'source'.padEnd(width)}  ${'result'.padEnd(11)}  definitive  detail`);
  for(const row of rows)console.log(`${row.id.padEnd(width)}  ${row.result.padEnd(11)}  ${(row.result==='ok'?'':row.definitive?'yes':'no').padEnd(10)}  ${row.detail}${row.finalUrl?` -> ${row.finalUrl}`:''}`);
  console.log(`\n${rows.length} sources checked ${checkedAt}: ${rows.length-definitive-inconclusive} ok, ${definitive} definitive failure${definitive===1?'':'s'}, ${inconclusive} inconclusive. Inconclusive results can depend on location; recheck them from India before treating a source as moved.`);
 }
 if(definitive)process.exitCode=1;
}
