import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';
import {ownerConnection} from './server-config';
export const adminCookie='hisaab_admin';
export function adminClient(token:string){
 const {url,key}=ownerConnection();
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}});
}
export async function verifyAdmin(token:string){
 if(!token||token.length>8192)throw new Error('MFA administrator required');
 const client=adminClient(token);
 const user=await client.auth.getUser(token);if(user.error||!user.data.user)throw new Error('Administrator session expired');
 const context=await client.rpc('admin_context');if(context.error||context.data!==user.data.user.id)throw new Error('MFA and protected administrator membership required');
 return {client,user:user.data.user};
}
export async function requireAdmin(){return verifyAdmin((await cookies()).get(adminCookie)?.value??'');}
