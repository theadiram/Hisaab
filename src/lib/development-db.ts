import 'server-only';
import {publicDb} from './public-db';
import {publishedFunding} from './funding-db';
import {developmentSchema,developmentOverview,legacyDevelopment,type DevelopmentSelection} from './development';
export async function readDevelopment(selection:DevelopmentSelection){
 const db=publicDb();const [legacy,extra]=await Promise.all([publishedFunding(selection),db.rpc('development_records',{p_year:selection.year,p_measure:selection.measure})]);
 if(extra.error)throw new Error('Development publication service is unavailable');
 return developmentOverview([...legacyDevelopment(legacy,selection),...(extra.data??[]).map((r:unknown)=>developmentSchema.parse(r))],selection);
}
