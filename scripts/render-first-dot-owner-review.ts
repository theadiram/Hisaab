/** Build a private offline review document. No network, staging or approval. */
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstDotOwnerReviewPlan } from '../src/lib/first-dot-owner-review-plan';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputFolder = path.resolve(
  process.argv[2] ?? path.join(root, 'data/acquisition/first-dots/intake'),
);
const outputFolder = path.join(root, 'output/first-dots-owner-review');
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const plans = [];
for (const file of (await readdir(inputFolder)).filter((file) => file.endsWith('.json')).sort()) {
  const data = JSON.parse(await readFile(path.join(inputFolder, file), 'utf8'));
  if (data.version === 'hisaab-intake/1') plans.push(firstDotOwnerReviewPlan(data));
}
if (!plans.length) throw new Error('No validated first-dot intake packages found.');
const projects = plans
  .flatMap((plan) => plan.projects.map((project) => ({ ...project, batchId: plan.batchId })))
  .sort(
    (a, b) =>
      Number(a.sourceDocuments.some((s) => s.suggestedReuseBasis.startsWith('UNRESOLVED:'))) -
        Number(b.sourceDocuments.some((s) => s.suggestedReuseBasis.startsWith('UNRESOLVED:'))) ||
      a.state.localeCompare(b.state),
  );
const sourceHashes = new Set(
  projects.flatMap((project) => project.sourceDocuments.map((source) => source.hash)),
);
const roadFindings = JSON.parse(
  await readFile(path.join(root, 'data/acquisition/first-dots/roads-reviewed-claims.json'), 'utf8'),
);
const odishaFindings = JSON.parse(
  await readFile(
    path.join(root, 'data/acquisition/first-dots/odisha-reviewed-claims.json'),
    'utf8',
  ),
);
function investigation(project: (typeof projects)[number]) {
  const road = roadFindings.records.find(
    (r: { candidateId: string }) => r.candidateId === project.id,
  );
  const odisha = odishaFindings.records.find((r: { projectCode: string }) =>
    project.officialIds.includes(r.projectCode),
  );
  const checks: string[] = [];
  if (road?.checks.officialWorkIdentity.exactOriginalRowMatched)
    checks.push('Exact official road record checked against the preserved original.');
  if (
    road?.checks.archivedProposalRoute.fullRouteCoordinatesMatched &&
    road.checks.archivedProposalRoute.markerExactlyMatchesOriginalVertex
  )
    checks.push(
      'Full archived route checked against the original feature; proposed point is an exact source vertex.',
    );
  if (road?.checks.financialYear.result === 'supported_as_derived_sanction_event_year')
    checks.push(
      'Displayed financial year derived from the dated sanction event; original year code retained separately.',
    );
  if (odisha)
    checks.push(
      ...odisha.claims.map(
        (claim: { claim: string; result: string }) => `${claim.claim}: ${claim.result}`,
      ),
    );
  return checks.length
    ? `<section class="investigation"><h3>Source investigation completed</h3><ul>${checks.map((check) => `<li>${escape(check)}</li>`).join('')}</ul><p>These checks support the narrow documentary claims. They do not record owner publication approval or independent physical verification.</p></section>`
    : '';
}
function routePreview(geometry: Record<string, unknown> | null) {
  if (!geometry || !['LineString', 'MultiLineString'].includes(String(geometry.type))) return '';
  const lines = (
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
  ) as number[][][];
  if (
    !Array.isArray(lines) ||
    !lines.every(
      (line) =>
        Array.isArray(line) &&
        line.every((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])),
    )
  )
    return '';
  const points = lines.flat();
  if (!points.length) return '';
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const west = Math.min(...xs),
    east = Math.max(...xs),
    south = Math.min(...ys),
    north = Math.max(...ys);
  const scale = Math.max(east - west, north - south, 0.000001);
  const paths = lines.map((line) =>
    line
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${(20 + ((p[0] - west) / scale) * 300).toFixed(2)},${(180 - ((p[1] - south) / scale) * 150).toFixed(2)}`,
      )
      .join(' '),
  );
  return `<figure><svg viewBox="0 0 340 200" role="img" aria-label="Archived source proposal route, without basemap"><rect width="340" height="200" fill="#f5f7fa"/>${paths.map((d) => `<path d="${d}" fill="none" stroke="#31665b" stroke-width="3"/>`).join('')}</svg><figcaption>Archived proposal geometry · no basemap · actual site unverified</figcaption></figure>`;
}
const cards = projects
  .map(
    (project, index) => `<article class="project" id="project-${index + 1}">
  <div class="overline">${escape(project.state)} · ${escape(project.district)} · ${escape(project.financialYear)}</div>
  <h2>${escape(project.title)}</h2><p class="identifier">${escape(project.officialIds.join(' · '))}</p>
  <p>${escape(project.summary)}</p><p><strong>Proposed source point:</strong> ${escape(project.proposedCoordinate?.join(', ') ?? 'Unavailable')} (longitude, latitude). ${escape(project.locationMeaning)}</p>
  ${routePreview(project.proposedGeometry)}
  ${investigation(project)}
  ${project.sourceDocuments.some((s) => s.suggestedReuseBasis.startsWith('UNRESOLVED:')) ? '<p class="rights">Publication hold: this project’s source reuse basis is unresolved. The private packet is available for investigation; it is not cleared for public release.</p>' : ''}
  <p class="notice">Private candidate. Publication is blocked until individual owner decisions are recorded. Documentary route/site association is separate from independent physical verification.</p>
  <div class="stages">${project.stageChoices.map((stage) => `<div><strong>${escape(stage.label)}</strong><span>${escape(stage.currentState)}</span>${stage.date ? `<span>${escape(stage.date)}</span>` : ''}<small>${escape(stage.description)} ${stage.amountUnknown ? 'Amount unknown.' : ''}</small></div>`).join('')}</div>
  <h3>Owner decisions required</h3><ul><li>Confirm official project identity and approved district ${escape(project.areaId)}.</li><li>${project.hasCandidateMapCoordinate ? 'Check documentary association for the exact proposed map coordinate or route; do not infer an actual verified site.' : 'No precise map coordinate is proposed; keep this as an unlocated project receipt.'}</li><li>Inspect every original and its exact source locator; record rights for each document separately.</li><li>Verify only supported stages and monetary entries. Leave unavailable payment/completion evidence unknown.</li><li>Review public redaction and record the final decision in the protected owner console.</li></ul>
  <h3>Source documents · ${project.sourceDocuments.length}</h3>
  ${project.sourceDocuments.map((source) => `<details><summary>${escape(source.name)}</summary><p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a></p><p class="hash">SHA-256 ${escape(source.hash)}</p><ul>${source.locators.map((locator) => `<li>${escape(locator)}</li>`).join('')}</ul><p><strong>Proposed reuse basis — not approved:</strong> ${escape(source.suggestedReuseBasis)}</p><p>Private original upload/checksum and document-specific rights decision required.</p></details>`).join('')}
  <footer>Batch ${escape(project.batchId)} · Candidate ${escape(project.id)}</footer>
  </article>`,
  )
  .join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Hisaab · Private first-dot review</title><style>
  :root{font-family:system-ui,-apple-system,sans-serif;color:#20242b;background:#f3f4f6}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:48px 24px}h1{font-size:clamp(32px,5vw,52px);line-height:1.1;letter-spacing:-.04em;margin:16px 0}h2{font-size:25px;line-height:1.25;margin:12px 0}h3{font-size:16px;margin-top:28px}.overline{color:#626b78;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.intro{max-width:850px;font-size:18px;line-height:1.6}.stats{display:flex;gap:14px;flex-wrap:wrap;margin:28px 0}.stats div{background:white;border:1px solid #dce0e7;border-radius:12px;padding:18px 24px;min-width:160px}.stats strong{display:block;font-size:30px}.stats span{font-size:13px;color:#626b78}.project{background:white;border:1px solid #dce0e7;border-radius:16px;padding:32px;margin:26px 0;break-inside:avoid}.identifier,footer,.hash{color:#68717e;font-size:12px;overflow-wrap:anywhere}.notice{background:#f5f1e9;border-radius:8px;padding:14px;font-size:14px;line-height:1.6}.stages{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:22px}.stages div{background:#f6f7f9;border-radius:8px;padding:12px}.stages strong,.stages span,.stages small{display:block}.stages span{margin:8px 0;font-size:13px}.stages small{font-size:11px;line-height:1.5;color:#68717e}li,p{line-height:1.65}li{margin:6px 0}details{border-top:1px solid #e3e6eb;padding:16px 0}summary{cursor:pointer;font-weight:600}a{color:#345393;overflow-wrap:anywhere}footer{border-top:1px solid #e3e6eb;padding-top:18px;margin-top:24px}input{font:inherit;width:100%;padding:14px;border:1px solid #cfd5df;border-radius:9px;margin-top:16px}@media(max-width:700px){main{padding:28px 16px}.project{padding:22px}.stages{grid-template-columns:repeat(2,1fr)}}@media print{body{background:white}main{padding:0}.project{box-shadow:none}input{display:none}}
  </style></head><body><main><div class="overline">Hisaab / Private owner review / 25 October 2026</div><h1>First project evidence.<br>Ready for careful decisions.</h1><p class="intro">These are source-backed candidate packets prepared for review. This document does not upload originals, record evidence decisions, or publish map dots. Source-reported approvals, payments and completion must keep their exact meanings.</p><div class="stats"><div><strong>${projects.length}</strong><span>Candidate packets</span></div><div><strong>${plans.length}</strong><span>Validated intake batches</span></div><div><strong>${sourceHashes.size}</strong><span>Distinct cited originals</span></div><div><strong>0</strong><span>Approvals made here</span></div></div><p>Use the protected Hisaab owner console: upload every source original → stage the matching package → prepare pending candidates → review source rights, identity, geography and supported stages → record an explicit publication decision.</p><label for="filter">Find a project, state, district or official reference</label><input id="filter" type="search" placeholder="Search these private packets" autocomplete="off"><div id="projects">${cards}</div><p>Offline review document. No raw beneficiary tables, banking details or private citizen uploads are included. Source links open only when selected.</p></main><script>document.getElementById('filter').addEventListener('input',function(){const q=this.value.toLocaleLowerCase();for(const article of document.querySelectorAll('.project'))article.hidden=!article.textContent.toLocaleLowerCase().includes(q)});</script></body></html>`;
await mkdir(outputFolder, { recursive: true });
const destination = path.join(outputFolder, 'index.html');
const finalHtml = html
  .replace(
    '</style>',
    'figure{max-width:420px;margin:20px 0}figure svg{display:block;width:100%;height:180px}figcaption{font-size:12px;color:#68717e}.rights{border-left:4px solid #b35e31;background:#fff4e9;padding:14px}</style>',
  )
  .replace('<main>', '<main id="top">');
await writeFile(destination, finalHtml);
console.log(
  JSON.stringify({
    output: destination,
    projects: projects.length,
    batches: plans.length,
    distinctSourceDocuments: sourceHashes.size,
    publicationApproved: false,
  }),
);
