export type NationalCoverage = {
  statesAssessed: number;
  statePartitions: number;
  sourceRows: number;
  scope: string;
  gaps: string[];
  states: {
    name: string;
    lokSabha: { status: string; rows: number | null };
    rajyaSabha: { status: string; rows: number | null };
  }[];
};
const count = (n: number | null) => (n === null ? 'Not assessed' : n.toLocaleString('en-IN'));
export function NationalEvidenceCoverage({ data }: { data: NationalCoverage }) {
  return (
    <section className="national-evidence-coverage" aria-labelledby="national-coverage-title">
      <h3 id="national-coverage-title">State-by-state collection</h3>
      <div className="spending-summary">
        <div>
          <strong>
            {data.statesAssessed} / {data.statePartitions}
          </strong>
          <span>States and union territories with both MPLADS reports collected</span>
        </div>
        <div>
          <strong>{count(data.sourceRows)}</strong>
          <span>Source expenditure rows collected</span>
        </div>
      </div>
      <p>{data.scope}</p>
      <p>
        Collected reports still need payment and location review before they can become spending
        dots.
      </p>
      <details>
        <summary>See every state and union territory</summary>
        <div className="national-coverage-scroll">
          <table>
            <caption>
              MPLADS source expenditure rows by house; zero means the collected report returned no
              rows.
            </caption>
            <thead>
              <tr>
                <th scope="col">State / union territory</th>
                <th scope="col">Lok Sabha</th>
                <th scope="col">Rajya Sabha</th>
                <th scope="col">Payment cards</th>
              </tr>
            </thead>
            <tbody>
              {data.states.map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  <td>{count(s.lokSabha.rows)}</td>
                  <td>{count(s.rajyaSabha.rows)}</td>
                  <td>Review pending</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>What is needed for payment cards</summary>
        <ul>
          {data.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
