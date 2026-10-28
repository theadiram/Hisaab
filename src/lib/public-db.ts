import 'server-only';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
// createClient builds auth, realtime, storage and postgrest clients every time, and
// every published read called this. Reuse one client per credential pair so a changed
// environment, including a stubbed one in tests, still gets a fresh client.
let client:SupabaseClient|null=null,credentials='';
export function publicDb(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('Published catalogue connection unavailable');const current=`${url}\n${key}`;if(!client||credentials!==current){client=createClient(url,key,{auth:{persistSession:false}});credentials=current;}return client;}
