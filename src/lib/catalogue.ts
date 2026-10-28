import 'server-only';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {publicDb} from './public-db';
import {workSchema} from './validation';
import type {Catalogue,Work,SourceRoute} from './model';
// The source register ships with the build and does not change while the server runs,
// unlike published.json, which publication rewrites. Parse it once and keep it.
let register:Promise<SourceRoute[]>|null=null;
function sourceRegister(){return register??=readFile(path.join(process.cwd(),'data/source-register.json'),'utf8').then(text=>JSON.parse(text) as SourceRoute[]).catch(error=>{register=null;throw error;});}
export async function readCatalogue():Promise<Catalogue>{
 const sources=await sourceRegister();
 let works:Work[]=[],mode:Catalogue['mode']='empty',totalWorks=0,districtsCovered=0,districtsExpected:number|null=null,publishedAt:string|null=null;
 if(process.env.HISAAB_DATA_MODE==='supabase'){
  const db=publicDb();const [page,summary]=await Promise.all([db.rpc('catalogue_page',{p_limit:100}),db.rpc('catalogue_summary')]);if(page.error||summary.error)throw new Error('The published catalogue could not be retrieved');
  works=(page.data.works??[]).map((w:unknown)=>workSchema.parse(w));mode='supabase';totalWorks=summary.data.works;districtsCovered=summary.data.districtsCovered;districtsExpected=summary.data.districtsExpected;publishedAt=summary.data.publishedAt;
 }else{try{const parsed=JSON.parse(await readFile(path.join(process.cwd(),'data/published.json'),'utf8'));works=(parsed.works??[]).filter((w:Work)=>!w.demo);mode='local';}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}totalWorks=works.length;districtsCovered=new Set(works.map(w=>w.areaId)).size;}
 return {mode,cutoff:'2026-10-06',works,sources,totalWorks,districtsExpected,districtsCovered,publishedAt};
}
export async function readPublishedWork(id:string){
 if(process.env.HISAAB_DATA_MODE!=='supabase')return (await readCatalogue()).works.find(w=>w.id===id)??null;
 const result=await publicDb().from('published_work_receipts').select('payload').eq('payload->>id',id).maybeSingle();if(result.error)throw new Error('Work receipt unavailable');return result.data?workSchema.parse(result.data.payload):null;
}
