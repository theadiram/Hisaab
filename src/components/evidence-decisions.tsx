'use client';
import { useState } from 'react';
import type { Work } from '@/lib/model';
export function EvidenceDecisions({ work, onSaved }: { work: Work; onSaved: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  return (
    <details>
      <summary>Review individual stages and amounts</summary>
      <p>
        Approve only the evidence you checked. Individual payments also need an official project
        allocation, recipient and amount definition.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const value = (key: string) => String(form.get(key) ?? '').trim();
          const revised = {
            ...work,
            stages: work.stages.map((s) =>
              form.get('stage:' + s.id) === 'on'
                ? {
                    ...s,
                    state: 'found',
                    reviewStatus: 'verified',
                    ...(s.id === 'completion' ? { completionBasis: value('completionBasis') } : {}),
                  }
                : {
                    ...s,
                    reviewStatus: s.state === 'conflicting' ? 'conflicting' : 'pending',
                    state: s.state === 'found' ? 'pending' : s.state,
                  },
            ),
            money: work.money.map((m) => {
              const approved = form.get('money:' + m.id) === 'on';
              return {
                ...m,
                approved,
                reviewStatus: approved ? 'verified' : 'pending',
                ...(m.measure === 'payment' && m.kind !== 'cumulative'
                  ? {
                      sourcePaymentId: value('payment:' + m.id),
                      payee: value('payee:' + m.id),
                      flow: value('flow:' + m.id),
                      amountBasis: value('basis:' + m.id),
                      allocation: {
                        projectId: work.id,
                        amount: m.amount,
                        receiptId: value('allocation:' + m.id),
                      },
                    }
                  : {}),
              };
            }),
          };
          try {
            const r = await fetch('/api/v1/admin/reconcile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ work: revised, reason: form.get('reason'), confirmed: true }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            await onSaved();
            setMessage('Individual decisions saved. Publication still checks their evidence.');
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        {work.stages.map((s) => (
          <label className="consent" key={s.id}>
            <input
              type="checkbox"
              name={'stage:' + s.id}
              defaultChecked={s.state === 'found' && s.reviewStatus === 'verified'}
            />
            {s.label}: I verified the attached evidence
          </label>
        ))}
        <label className="field">
          Completion evidence type
          <select
            name="completionBasis"
            defaultValue={
              work.stages.find((s) => s.id === 'completion')?.completionBasis ?? 'reported'
            }
          >
            <option value="reported">Officially reported completion</option>
            <option value="certificate">Completion certificate acquired and checked</option>
          </select>
        </label>
        {work.money.map((m) => (
          <fieldset key={m.id}>
            <legend>
              {m.measure} · ₹{m.amount}
            </legend>
            <label className="consent">
              <input
                type="checkbox"
                name={'money:' + m.id}
                defaultChecked={m.approved && m.reviewStatus === 'verified'}
              />
              I verified this amount and its source
            </label>
            {m.measure === 'payment' && m.kind !== 'cumulative' && (
              <>
                <label className="field">
                  Official payment identifier
                  <input name={'payment:' + m.id} defaultValue={m.sourcePaymentId ?? ''} />
                </label>
                <label className="field">
                  Recipient business
                  <input name={'payee:' + m.id} defaultValue={m.payee ?? ''} />
                </label>
                <label className="field">
                  Amount definition
                  <select name={'basis:' + m.id} defaultValue={m.amountBasis ?? 'unknown'}>
                    <option value="unknown">Not established</option>
                    <option value="gross">Gross payment</option>
                    <option value="net">Net payment</option>
                  </select>
                </label>
                <label className="field">
                  Payment type
                  <select name={'flow:' + m.id} defaultValue={m.flow ?? 'unclassified'}>
                    <option value="unclassified">Not established</option>
                    <option value="contractor_payment">Contractor payment</option>
                    <option value="government_transfer">Government transfer</option>
                  </select>
                </label>
                <label className="field">
                  Receipt proving allocation of this amount to this project
                  <select name={'allocation:' + m.id} defaultValue={m.allocation?.receiptId ?? ''}>
                    <option value="">No allocation evidence</option>
                    {work.stages
                      .flatMap((s) => s.receipts)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} · {r.locator}
                        </option>
                      ))}
                  </select>
                </label>
                <small>
                  The allocation must explicitly cover this project and ₹{m.amount}. Selecting a
                  department payment receipt alone does not establish an allocation.
                </small>
              </>
            )}
          </fieldset>
        ))}
        <label className="field">
          Documented review decision
          <textarea name="reason" minLength={20} required />
        </label>
        <button className="secondary">Save individual evidence decisions</button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
