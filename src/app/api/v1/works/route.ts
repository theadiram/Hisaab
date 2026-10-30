import {fundingStates} from '@/lib/funding';
import {workMatcher} from '@/lib/work-search';
import {readCatalogue} from '@/lib/catalogue';
import {publicDb} from '@/lib/public-db';
export async function GET(request:Request){const p=new URL(request.url).searchParams;const q=(p.get('q')||'').slice(0,200);const purpose=p.get('purpose');const year=p.get('year');const offset=Math.trunc(Math.max(0,Math.min(10000000,Number(p.get('offset'))||0)));const limit=Math.trunc(Math.max(1,Math.min(100,Number(p.get('limit'))||25)));
 const stateCode=p.get('state'),state=stateCode?fundingStates.find(s=>s.code===stateCode)?.name:null;if(stateCode&&!state)return Response.json({error:'Invalid state'},{status:400});
 if(process.env.HISAAB_DATA_MODE==='supabase'){const result=await publicDb().rpc(state?'catalogue_projects_page':'catalogue_page',{p_query:q,p_purpose:purpose,p_year:year,p_offset:offset,p_limit:limit,...(state?{p_state:state}:{})});if(result.error)return Response.json({error:'Published catalogue unavailable'},{status:503});return Response.json({...result.data,offset,limit,coverage:'Imported approved records only',demo:false});}
 const matches=workMatcher(q);const {works}=await readCatalogue();const filtered=works.filter(w=>(!state||w.state===state)&&(!purpose||w.purpose===purpose)&&(!year||w.financialYear===year)&&matches(w));return Response.json({works:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit,coverage:'Imported approved records only',demo:false});}
