import {createClient} from '@supabase/supabase-js';
import {removeExpiredCases} from '../../scripts/retention-worker.mjs';
export default async()=>{
 if(process.env.HISAAB_RETENTION_ENABLED!=='true'){console.log(JSON.stringify({retention:'disabled'}));return;}
 if(process.env.HISAAB_MIGRATION_READ_ONLY==='true'){console.log(JSON.stringify({retention:'paused'}));return;}
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Retention configuration missing');
 const deadline=AbortSignal.timeout(22000);
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([deadline,init.signal]):deadline})}});
 const result=await removeExpiredCases(client,{enabled:true});
 console.log(JSON.stringify({retention:'completed',deleted:result.deleted}));
};
export const config={schedule:'@hourly'};
