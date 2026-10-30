import {z} from 'zod';
import {fundingYears,fundingMeasures,fundingPurposes,fundingStates} from './funding';
const money=z.string().regex(/^-?\d{1,18}\.\d{2}$/);
export const fundingRecordSchema=z.object({
 id:z.string().min(1).max(240),identity:z.string().min(1).max(240),edition:z.string().min(1).max(120),
 financialYear:z.enum(fundingYears as [string,...string[]]),programmeId:z.string().min(1).max(200),programme:z.string().min(1).max(400),budgetHead:z.string().max(240),ministry:z.string().min(1).max(240),
 jurisdiction:z.string().refine(v=>v==='national'||fundingStates.some(s=>s.code===v)||/^historical:[a-z0-9_-]+$/.test(v)),jurisdictionLabel:z.string().max(150),
 purpose:z.enum(Object.keys(fundingPurposes) as [keyof typeof fundingPurposes,...(keyof typeof fundingPurposes)[]]),
 channel:z.enum(['central_sector','centrally_sponsored','development_grant','capital_loan','finance_commission','disaster_grant','other']),
 instrument:z.enum(['grant','loan','direct_expenditure','unresolved']),measure:z.enum(fundingMeasures),
 estimate:z.enum(['original','revised','not_applicable']),accountingBasis:z.enum(['union_budget','union_release','union_booked_expenditure','recipient_utilisation']),share:z.enum(['union','combined','unresolved']),
 amountRupees:money.nullable(),periodStart:z.iso.date(),periodEnd:z.iso.date(),cutoff:z.iso.date(),publicationDate:z.iso.date().nullable(),
 coverageKey:z.string().min(1).max(240),aggregation:z.enum(['leaf','context']),parentKey:z.string().max(240).nullable(),
 classification:z.enum(['included','excluded','mixed_unresolved','awaiting_review']),conflict:z.boolean(),
 source:z.object({hash:z.string().regex(/^[a-f0-9]{64}$/),url:z.url().refine(v=>v.startsWith('https://')),locator:z.string().min(1).max(1200),retrievedAt:z.iso.datetime({offset:true}),page:z.number().int().positive().nullable()}),
 notes:z.string().max(3000)
}).strict().superRefine((r,ctx)=>{
 if((r.measure==='allocated'&&(r.estimate==='not_applicable'||r.accountingBasis!=='union_budget'))||(r.measure==='released'&&(r.estimate!=='not_applicable'||r.accountingBasis!=='union_release'))||(r.measure==='reported_spent'&&(r.estimate!=='not_applicable'||!['union_booked_expenditure','recipient_utilisation'].includes(r.accountingBasis))))ctx.addIssue({code:'custom',message:'Measure and accounting basis disagree'});
 if(r.periodStart>r.periodEnd||(r.measure!=='allocated'&&r.periodEnd>r.cutoff))ctx.addIssue({code:'custom',message:'Invalid reporting period'});
});
export type FundingRecord=z.infer<typeof fundingRecordSchema>;
