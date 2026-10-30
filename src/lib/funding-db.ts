import 'server-only';
import {publicDb} from './public-db';
import {fundingRecordSchema} from './funding-schema';
import type {FundingRecord,FundingSelection} from './funding';
export async function publishedFunding(selection:FundingSelection):Promise<FundingRecord[]>{
 const {data,error}=await publicDb().rpc('funding_records',{p_year:selection.year,p_measure:selection.measure});
 if(error||!Array.isArray(data))throw new Error('Reviewed funding records unavailable');
 return data.map(r=>fundingRecordSchema.parse(r));
}
export async function publishedFundingHistory(state:string,programme:string){
 const {data,error}=await publicDb().rpc('funding_history',{p_state:state,p_programme:programme});if(error||!Array.isArray(data))throw new Error('Programme history unavailable');return data.map(r=>fundingRecordSchema.parse(r));
}
