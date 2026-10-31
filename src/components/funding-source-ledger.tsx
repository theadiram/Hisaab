'use client';
type Ledger = {
  note: string;
  rows: {
    programmeOrChannel: string;
    label: string;
    financialYear: string;
    sourceRoute: string;
    status: string;
    gap: string;
    nextAction: string;
    stages: {
      [key: string]: {
        candidateRecords: number;
        unionShareRecords: number;
        reviewedRecords: number | null;
        conflictingRecords?: number;
        missingAmounts?: number;
        status: string;
      };
    };
  }[];
};
export function FundingSourceLedger({ ledger, year }: { ledger: Ledger; year: string }) {
  return (
    <details>
      <summary>Source and year queue</summary>
      <p>{ledger.note}</p>
      {ledger.rows
        .filter((r) => r.financialYear === year)
        .map((r) => (
          <details key={r.programmeOrChannel}>
            <summary>
              {r.label} · {r.status.replaceAll('_', ' ')}
            </summary>
            <p>{r.financialYear}</p>
            {Object.entries(r.stages).map(([m, s]) => (
              <p key={m}>
                {m.replaceAll('_', ' ')}: {s.candidateRecords} candidates · {s.unionShareRecords}{' '}
                Union-share records · {s.reviewedRecords ?? 'Unknown'} reviewed ·{' '}
                {s.conflictingRecords ?? 0} source conflicts · {s.missingAmounts ?? 0} missing
                amounts. {s.status.replaceAll('_', ' ')}.
              </p>
            ))}
            <p>{r.gap}</p>
            <p>Next: {r.nextAction}</p>
            <a href={r.sourceRoute} target="_blank" rel="noopener noreferrer">
              Official acquisition route ↗
            </a>
          </details>
        ))}
    </details>
  );
}
export type FundingSourceLedgerData = Ledger;
