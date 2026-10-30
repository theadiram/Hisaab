import Decimal from 'decimal.js';
import {z} from 'zod';
import {fundingRecordSchema} from './funding-schema';
import {fundingStates,fundingYears,fundingMeasures,fundingPurposes,selectedFunding,type FundingRecord,type FundingSelection} from './funding';

export const origins=['union','state','joint','local'] as const;
const {share:_share,accountingBasis:_basis,...fundingShape}=fundingRecordSchema.shape;
export const developmentSchema=z.object({...fundingShape,
 origin:z.enum(origins),scope:z.enum(['within_area','received']),
 accountingBasis:z.enum(['budget','release','booked_expenditure','recipient_utilisation']),
 reconciliationKey:z.string().min(1).max(240),disjointEvidence:z.string().trim().min(20).max(1200).nullable(),
 shares:z.array(z.object({origin:z.enum(['union','state','local']),amountRupees:z.string().regex(/^-?\d+\.\d{2}$/),sourceLocator:z.string().min(1)})).default([])
}).strict().superRefine((r,c)=>{
 if(r.periodStart>r.periodEnd||(r.measure!=='allocated'&&r.periodEnd>r.cutoff))c.addIssue({code:'custom',message:'Invalid reporting period'});
 if(r.measure==='allocated'&&(r.accountingBasis!=='budget'||r.estimate==='not_applicable')||r.measure==='released'&&(r.accountingBasis!=='release'||r.estimate!=='not_applicable')||r.measure==='reported_spent'&&(!['booked_expenditure','recipient_utilisation'].includes(r.accountingBasis)||r.estimate!=='not_applicable'))c.addIssue({code:'custom',message:'Measure and accounting basis disagree'});
 if(r.origin==='joint'&&r.shares.length===0)c.addIssue({code:'custom',message:'Joint funding needs documented component shares'});
 if(r.shares.length&&r.amountRupees!==null&&!r.shares.reduce((n,s)=>n.plus(s.amountRupees),new Decimal(0)).eq(r.amountRupees))c.addIssue({code:'custom',message:'Funding shares must reconcile exactly'});
});
export type DevelopmentRecord=z.infer<typeof developmentSchema>;
export type DevelopmentSelection=FundingSelection&{origin:'all'|typeof origins[number]};
export function developmentSelection(params:URLSearchParams):DevelopmentSelection {
 const allowed=['year','measure','purpose','origin','estimate','basis'];
 for(const k of params.keys())if(!allowed.includes(k)||params.getAll(k).length!==1)throw new Error('Unknown or repeated filter');
 const year=params.get('year')??'2026-2027',measure=params.get('measure')??'allocated',purpose=params.get('purpose')??'all',origin=params.get('origin')??'all',estimate=params.get('estimate')??'original',basis=params.get('basis')??'union';
 if(!fundingYears.includes(year)||!fundingMeasures.includes(measure as DevelopmentSelection['measure'])||purpose!=='all'&&!Object.hasOwn(fundingPurposes,purpose)||origin!=='all'&&!origins.includes(origin as typeof origins[number])||!['original','revised'].includes(estimate)||!['union','recipient'].includes(basis)||estimate==='revised'&&measure!=='allocated'||basis==='recipient'&&measure!=='reported_spent')throw new Error('Invalid development filter');
 return {year,measure:measure as DevelopmentSelection['measure'],purpose,origin:origin as DevelopmentSelection['origin'],estimate:estimate as DevelopmentSelection['estimate'],basis:basis as DevelopmentSelection['basis']};
}
export function legacyDevelopment(records:FundingRecord[],selection:DevelopmentSelection):DevelopmentRecord[] {
 // Legacy transfers establish funding received, not the geography of downstream works.
 return selectedFunding(records,selection).records.map(({share:_,accountingBasis,...r})=>({...r,origin:'union',scope:'received',accountingBasis:accountingBasis==='union_budget'?'budget':accountingBasis==='union_release'?'release':accountingBasis==='recipient_utilisation'?'recipient_utilisation':'booked_expenditure',reconciliationKey:r.coverageKey,disjointEvidence:null,shares:[]}));
}
export function developmentOverview(input:DevelopmentRecord[],selection:DevelopmentSelection) {
 const matching=input.filter(r=>r.financialYear===selection.year&&r.measure===selection.measure&&(selection.purpose==='all'||r.purpose===selection.purpose)&&(selection.origin==='all'||r.origin===selection.origin)&&r.classification==='included'&&!r.conflict&&r.aggregation==='leaf'&&r.instrument!=='unresolved'&&r.amountRupees!==null&&(selection.measure!=='allocated'||r.estimate===selection.estimate)&&(selection.basis==='recipient'?r.accountingBasis==='recipient_utilisation':r.accountingBasis!=='recipient_utilisation'));
 const groups=new Map<string,DevelopmentRecord[]>();
 for(const r of matching){const k=[r.reconciliationKey,r.jurisdiction,r.scope,r.accountingBasis].join('|');const group=groups.get(k)??[];if(!group.some(x=>x.id===r.id))group.push(r);groups.set(k,group);}
 const conflicts:string[]=[],accepted:DevelopmentRecord[]=[];
 for(const [key,group] of groups){if(group.some((a,i)=>group.some((b,j)=>i<j&&a.periodStart<=b.periodEnd&&b.periodStart<=a.periodEnd))){conflicts.push(key);continue;}accepted.push(...group);}
 const parents=new Set(accepted.map(r=>r.parentKey).filter(Boolean));const records=accepted.filter(r=>!parents.has(r.coverageKey));
 const total=(rs:DevelopmentRecord[])=>({amountRupees:rs.length?rs.reduce((n,r)=>n.plus(r.amountRupees!),new Decimal(0)).toFixed(2):null,records:rs.length,coverage:rs.length?'partial':'unavailable',cutoff:rs.length?rs.map(r=>r.cutoff).sort()[0]:null});
 const area=(code:string,name:string)=>{const rs=records.filter(r=>r.jurisdiction===code),within=rs.filter(r=>r.scope==='within_area'),received=rs.filter(r=>r.scope==='received');const combinedSafe=within.length>0&&within.every(r=>r.disjointEvidence!==null);return {code,name,development:{...total(within),combinedAmountRupees:combinedSafe?total(within).amountRupees:null,combinedAvailable:combinedSafe,origins:origins.map(origin=>({origin,...total(within.filter(r=>r.origin===origin))}))},received:total(received),purposes:Object.entries(fundingPurposes).map(([id,name])=>({id,name,...total(within.filter(r=>r.purpose===id))})),records:rs};};
 return {selection,supportedYears:fundingYears,scope:'Recorded development and funding received',national:area('national','Nationwide / state breakdown unavailable'),states:fundingStates.map(s=>area(s.code,s.name)),coverage:{complete:false,withheldConflictingScopes:conflicts.length,reviewedRecords:records.length,gaps:['Funding received is separate from development within an area.','A combined development headline requires documented non-overlap.','Missing state and local programme records remain unknown.']}};
}
export type DevelopmentOverview=ReturnType<typeof developmentOverview>;
