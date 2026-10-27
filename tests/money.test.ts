import {describe,it,expect} from 'vitest';
import {aggregateMoney,formatMoney,normalizeAmount} from '../src/lib/money';
import type {MoneyEvent} from '../src/lib/model';
const event=(overrides:Partial<MoneyEvent>={}):MoneyEvent=>({id:'p1',measure:'payment',amount:'100.10',kind:'transaction',canonicalId:'p1',date:'2025-04-01',receiptId:'receipt',approved:true,...overrides});
describe('evidence-backed money',()=>{
 it('uses exact decimals and normalizes units',()=>{expect(normalizeAmount('1,20,000')).toBe('120000.00');expect(normalizeAmount('1.25','crore')).toBe('12500000.00');expect(aggregateMoney([event(),event({id:'p2',canonicalId:'p2',amount:'0.20'})],'payment').amount).toBe('100.30');});
 it('excludes cumulative balances and repeated canonical events',()=>{const r=aggregateMoney([event(),event({id:'mirror'}),event({id:'snapshot',kind:'cumulative',canonicalId:'snapshot',amount:'200'})],'payment');expect(r.amount).toBe('100.10');expect(r.excluded).toEqual(['mirror','snapshot']);});
 it('applies reversals and date windows',()=>{expect(aggregateMoney([event(),event({id:'r',canonicalId:'r',amount:'-20.00',kind:'reversal'})],'payment').amount).toBe('80.10');expect(aggregateMoney([event()],'payment','2026-01-01').eventCount).toBe(0);});
 it('never counts unapproved or uncited facts',()=>{expect(aggregateMoney([event({approved:false}),event({receiptId:''})],'payment').eventCount).toBe(0);});
 it('quarantines conflicting mirrors regardless of order or date filter',()=>{const a=event();const b=event({id:'mirror',amount:'200.00',date:'2025-05-01'});for(const records of [[a,b],[b,a]]){expect(aggregateMoney(records,'payment').eventCount).toBe(0);expect(aggregateMoney(records,'payment',undefined,'2025-04-30').eventCount).toBe(0);}});
 it('picks the display unit after rounding',()=>{expect(formatMoney('9999999.99')).toBe('₹1 crore');expect(formatMoney('-9999999.99')).toBe('₹-1 crore');expect(formatMoney('99999.99')).toBe('₹99,999.99');expect(formatMoney('9999499.99')).toBe('₹99.99 lakh');expect(formatMoney('12500000.00')).toBe('₹1.25 crore');expect(formatMoney('250000.00')).toBe('₹2.50 lakh');expect(formatMoney('99994.99')).toBe('₹99,994.99');});
 it('rejects invalid money and positive reversals',()=>{expect(()=>normalizeAmount('unknown')).toThrow();expect(()=>aggregateMoney([event({kind:'reversal'})],'payment')).toThrow();});
});
