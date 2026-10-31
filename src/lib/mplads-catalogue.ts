import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import path from 'node:path';
const filename = path.join(
  process.cwd(),
  'data/acquisition/mplads/review-catalogue/catalogue.sqlite',
);
let connection: DatabaseSync | null = null,
  modified = 0;
function db() {
  const stamp = statSync(filename).mtimeMs;
  if (!connection || modified !== stamp) {
    connection?.close();
    connection = new DatabaseSync(filename, { readOnly: true });
    modified = stamp;
  }
  return connection;
}
export function catalogue(
  query: string,
  state: string,
  house: string,
  page: number,
  project: string | null,
) {
  const database = db(),
    pageSize = 25;
  if (project) {
    const p = database.prepare('select * from projects where id=?').get(project);
    if (!p) return null;
    const total = Number(
      database.prepare('select count(*) n from source_rows where project_id=?').get(project)!.n,
    );
    const rows = database
      .prepare(
        'select payload from source_rows where project_id=? order by rowid limit 25 offset ?',
      )
      .all(project, (page - 1) * pageSize)
      .map((r) => {
        const s = JSON.parse(String(r.payload));
        return {
          amount: s.amount,
          date: s.date,
          recipient: s.recipient,
          status: s.status,
          encodingIssue: s.encodingIssue,
          sourceHash: s.sourceHash,
          sourceRow: s.sourceRow,
          transactionId: null,
          settlementVerified: false,
          approved: false,
        };
      });
    return {
      project: {
        id: p.id,
        workId: p.work_id,
        state: p.state,
        house: p.house,
        textReview: !!p.text_review,
        titles: JSON.parse(String(p.titles)),
        agencies: JSON.parse(String(p.agencies)),
      },
      rows,
      total,
      page,
      pageSize,
      coordinates: null,
      approved: false,
    };
  }
  const condition =
    "where instr(lower(work_id||' '||titles||' '||agencies),lower(?))>0 and (?='' or state=?) and (?='' or house=cast(? as integer))";
  const args = [query, state, state, house, house];
  const total = Number(
    database.prepare('select count(*) n from projects ' + condition).get(...args)!.n,
  );
  const projects = database
    .prepare(
      'select id,work_id,state,house,titles,text_review from projects ' +
        condition +
        ' order by state,work_id,house limit 25 offset ?',
    )
    .all(...args, (page - 1) * pageSize)
    .map((r) => ({
      id: r.id,
      workId: r.work_id,
      state: r.state,
      house: r.house,
      textReview: !!r.text_review,
      title: JSON.parse(String(r.titles))[0],
      approved: false,
      coordinates: null,
    }));
  const states = database
    .prepare('select distinct state from projects order by state')
    .all()
    .map((r) => String(r.state));
  return {
    projects,
    states,
    total,
    page,
    pageSize,
    scope: 'Default MPLADS house filters; unpublished source records',
  };
}
