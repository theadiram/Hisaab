import {readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {fundingRecordSchema} from '../src/lib/funding-schema.ts';
process.loadEnvFile('.env.hosted');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const facts=JSON.parse(await readFile('data/acquisition/funding-records.json','utf8')).records.map(r=>fundingRecordSchema.parse(r));
const inventories=[];for(const name of (await readdir('data/acquisition/funding-inventory')).sort()){const item=JSON.parse(await readFile('data/acquisition/funding-inventory/'+name,'utf8'));if(item.demands.length)inventories.push(item);}
const hashes=new Set([...facts.map(f=>f.source.hash),...inventories.map(i=>i.source.sha256)]);
// The acceptance memorandum is supporting evidence for the 2026 disaster allocations.
for(const file of await readdir('data/acquisition/documents')){const m=JSON.parse(await readFile('data/acquisition/documents/'+file,'utf8'));if(m.url==='https://www.indiabudget.gov.in/doc/16fc.pdf')hashes.add(m.sha256);}
for(const hash of hashes){const result=spawnSync(process.execPath,['scripts/stage-source.mjs',hash,'--original-only'],{stdio:'pipe'});if(result.status!==0)throw new Error('Private original preservation failed for '+hash);console.log(JSON.stringify({originalVerified:hash}));}
let inserted=0;for(let i=0;i<facts.length;i+=200){const {data,error}=await client.rpc('stage_funding',{p_records:facts.slice(i,i+200)});if(error)throw new Error('Private funding stage rejected: '+error.message);inserted+=data;}
let rows=0;for(const inventory of inventories){for(let i=0;i<inventory.rows.length;i+=200){const {data,error}=await client.rpc('stage_funding_inventory',{p_hash:inventory.source.sha256,p_year:inventory.edition,p_rows:inventory.rows.slice(i,i+200)});if(error)throw new Error('Private inventory stage rejected: '+error.message);rows+=data;}console.log(JSON.stringify({inventoryStaged:inventory.edition,rows:inventory.rows.length}));}
const ledger=JSON.parse(await readFile('data/funding-acquisition.json','utf8'));ledger.hosted={originalsVerified:hashes.size,privateFacts: facts.length,inventoryRows:inventories.reduce((n,i)=>n+i.rows.length,0),publishedFacts:0,verifiedAt:new Date().toISOString()};await writeFile('data/funding-acquisition.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({insertedFacts:inserted,insertedRows:rows,publication:'private_review_pending'}));
