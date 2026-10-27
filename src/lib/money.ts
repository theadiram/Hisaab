import Decimal from 'decimal.js';
import type { MoneyEvent, Measure } from './model';
export function normalizeAmount(raw:string, unit:'rupees'|'lakh'|'crore'='rupees'):string {
  const cleaned=raw.trim().replace(/^₹\s*/, '').replace(/,/g,'');
  if(!/^-?\d+(\.\d{1,9})?$/.test(cleaned)) throw new Error('Invalid money amount');
  const normalized=new Decimal(cleaned).mul(unit==='crore'?10000000:unit==='lakh'?100000:1);
  if(normalized.decimalPlaces()>2)throw new Error('Amount contains fractional paise');
  return normalized.toFixed(2);
}
export function aggregateMoney(events:MoneyEvent[], measure:Measure, from?:string,to?:string) {
  const seen=new Set<string>(); let total=new Decimal(0); const excluded:string[]=[];
  const identities=new Map<string,string>(); const conflicts=new Set<string>();
  for(const e of events){
    if(e.measure!==measure||!e.approved||!e.receiptId||e.flow==='government_transfer'||e.flow==='unclassified'||e.reviewStatus==='conflicting'||e.kind==='cumulative')continue;
    const identity=JSON.stringify([new Decimal(e.amount).toFixed(2),e.kind,e.date]);
    if(identities.has(e.canonicalId)&&identities.get(e.canonicalId)!==identity)conflicts.add(e.canonicalId);
    identities.set(e.canonicalId,identity);
  }
  for(const e of events){
    if(e.measure!==measure || (from&&(!e.date||e.date<from))||(to&&(!e.date||e.date>to))) continue;
    if(!e.approved||!e.receiptId||e.flow==='government_transfer'||e.flow==='unclassified'||e.reviewStatus==='conflicting'||e.kind==='cumulative'||conflicts.has(e.canonicalId)||seen.has(e.canonicalId)){excluded.push(e.id);continue;}
    const amount=new Decimal(e.amount);
    if(e.kind==='reversal' && amount.greaterThan(0)) throw new Error('Reversal must be negative');
    seen.add(e.canonicalId); total=total.plus(amount);
  }
  return {amount:total.toFixed(2),excluded,eventCount:seen.size};
}
export function formatMoney(value:string|null):string {
  if(value===null) return 'Not available';
  const amount=new Decimal(value);
  // Promote to crore when rounding to lakh would read "₹100 lakh" (e.g. ₹99,99,999.99).
  const absolute=amount.abs(),lakh=amount.div(100000).toDecimalPlaces(2);
  if(absolute.gte(10000000)||lakh.abs().gte(100)) return `₹${amount.div(10000000).toFixed(2).replace(/\.00$/,'')} crore`;
  if(absolute.gte(100000)) return `₹${lakh.toFixed(2).replace(/\.00$/,'')} lakh`;
  return `₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(amount.toNumber())}`;
}
// Keep every paise visible in evidence cards without passing large INR values through Number.
export function formatExactMoney(value:string|null):string {
  if(value===null)return 'Not available';
  const amount=new Decimal(value);
  if(!amount.isFinite()||!amount.eq(amount.toDecimalPlaces(2)))throw new Error('Amount must be exact to paise');
  const [integer,fraction]=amount.abs().toFixed(2).split('.');
  const last=integer.slice(-3),prefix=integer.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,',');
  return `₹${amount.isNegative()?'-':''}${prefix?prefix+',':''}${last}.${fraction}`;
}
