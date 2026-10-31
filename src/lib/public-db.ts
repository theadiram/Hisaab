import 'server-only';
import {createClient} from '@supabase/supabase-js';
// Request-scoped server clients must not retain themselves through refresh timers.
export function publicDb(){
 const dedicated=process.env.HISAAB_CATALOGUE_API_URL;
 const url=dedicated??process.env.SUPABASE_URL,key=dedicated?process.env.HISAAB_CATALOGUE_API_KEY:process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('Published catalogue connection unavailable');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
