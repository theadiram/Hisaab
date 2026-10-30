import {boundedBody} from '@/lib/request-body';
import {cookies} from 'next/headers';
import {adminCookie,requireAdmin,verifyAdmin} from '@/lib/admin';
import {requireOrigin} from '@/lib/security';
import {reportClient} from '@/lib/reports';
const headers={'Cache-Control':'private, no-store'};
const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:900};
export async function GET(){try{const {user}=await requireAdmin();return Response.json({authenticated:true,email:user.email},{headers});}catch{return Response.json({authenticated:false},{status:401,headers});}}
export async function POST(request:Request){if(!requireOrigin(request))return Response.json({error:'Same-origin request required'},{status:403,headers});try{
 const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,12000)));const token=body.token;if(typeof token!=='string')throw new Error('Authentication required');
 await verifyAdmin(token);(await cookies()).set(adminCookie,token,options);return Response.json({authenticated:true},{headers});
}catch{return Response.json({error:'MFA and protected administrator membership required'},{status:401,headers});}}
export async function DELETE(request:Request){if(!requireOrigin(request))return Response.json({error:'Same-origin request required'},{status:403,headers});const jar=await cookies();const token=jar.get(adminCookie)?.value;
 if(token){const {error}=await reportClient().auth.admin.signOut(token,'local');if(error)return Response.json({error:'Session revocation unavailable; retry sign out'},{status:503,headers});}
 jar.set(adminCookie,'',{...options,maxAge:0});return Response.json({authenticated:false},{headers});}
