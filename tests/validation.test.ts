import { it, expect } from 'vitest';
import { workSchema } from '../src/lib/validation';
import { demoWorks } from '../src/lib/demo';
it('cannot publish fictional works as government data', () => {
  expect(workSchema.safeParse(demoWorks[0]).success).toBe(false);
});
it('cannot publish a found stage without a receipt', () => {
  const work = {
    ...demoWorks[0],
    demo: false,
    authorityReceipt: null,
    stages: [{ ...demoWorks[0].stages[0], receipts: [] }],
    money: [],
  };
  expect(workSchema.safeParse(work).success).toBe(false);
});
