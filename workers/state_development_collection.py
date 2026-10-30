"""Bounded, checkpointed two-year public-source collection; never publishes facts.

Sources are supplied from observed official links, not guessed API routes. Extracted
lines/tables preserve original headers and are evidence candidates, not paid totals.
"""
import argparse
import hashlib
import io
import json
import re
import subprocess
import tempfile
import fcntl
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/acquisition/state-development'
YEARS = ['2025-2026', '2026-2027']
STATES = [('28','Andhra Pradesh'),('12','Arunachal Pradesh'),('18','Assam'),('10','Bihar'),('22','Chhattisgarh'),('30','Goa'),('24','Gujarat'),('6','Haryana'),('2','Himachal Pradesh'),('20','Jharkhand'),('29','Karnataka'),('32','Kerala'),('23','Madhya Pradesh'),('27','Maharashtra'),('14','Manipur'),('17','Meghalaya'),('15','Mizoram'),('13','Nagaland'),('21','Odisha'),('3','Punjab'),('8','Rajasthan'),('11','Sikkim'),('33','Tamil Nadu'),('36','Telangana'),('16','Tripura'),('9','Uttar Pradesh'),('5','Uttarakhand'),('19','West Bengal')]
VERSION = 'state-development-evidence/1'

def now():
    return datetime.now(timezone.utc).isoformat()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Each writer gets its own temporary file; concurrent state checkpoints
    # cannot remove another writer's pending summary.
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,prefix=path.name+'.',suffix='.new',delete=False) as handle:
        temporary=Path(handle.name)
        handle.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    try:
        temporary.chmod(0o600)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)

def read_plan():
    private=BASE/'plan.json'
    return json.loads((private if private.exists() else ROOT/'data/state-development-sources.json').read_text())

class DocumentHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.text=[]; self.tables=[]
        self.anchor=None; self.anchor_text=[]; self.row=None; self.cell=None; self.table=None; self.hidden=0; self.table_stack=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='meta' and a.get('http-equiv','').lower()=='refresh':
            redirect=re.search(r'\burl\s*=\s*(.+)',a.get('content',''),re.I)
            if redirect: self.links.append({'label':'Explicit page redirect','href':redirect[1].strip().strip('\"\'')})
        if tag in ('script','style'): self.hidden += 1
        if tag=='a': self.anchor=a.get('href'); self.anchor_text=[]
        if tag=='table':
            self.table_stack.append((self.table,self.row,self.cell)); self.table=[];self.row=None;self.cell=None
        if tag=='tr' and self.table is not None: self.row=[]
        if tag in ('td','th') and self.row is not None: self.cell=[]
    def handle_data(self, data):
        if self.hidden: return
        if data.strip(): self.text.append(data.strip())
        if self.anchor is not None: self.anchor_text.append(data)
        if self.cell is not None: self.cell.append(data)
        for _,_,parent_cell in self.table_stack:
            if parent_cell is not None: parent_cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
        if tag=='a' and self.anchor is not None:
            self.links.append({'label':' '.join(''.join(self.anchor_text).split()),'href':self.anchor}); self.anchor=None
        if tag in ('td','th') and self.cell is not None and self.row is not None:
            self.row.append(' '.join(''.join(self.cell).split())); self.cell=None
        if tag=='tr' and self.row is not None and self.table is not None:
            if self.row: self.table.append(self.row)
            self.row=None
        if tag=='table' and self.table is not None:
            if self.table: self.tables.append(self.table)
            self.table,self.row,self.cell=self.table_stack.pop() if self.table_stack else (None,None,None)

def blocked(text):
    # A normal procurement page mentioning CAPTCHA is usable public context.
    # Only explicit access/challenge/error responses are rejected here.
    s=text.lower()
    return any(x in s for x in ['access denied','request rejected','enable javascript and cookies to continue','checking your browser before accessing','this request has been blocked'])

def expects_pdf(url):
    return re.search(r'\.pdf(?:$|/)',urlparse(url).path,re.I) is not None

def fetch(source, state, refresh=False):
    url=source['url']; parsed=urlparse(url)
    hosts=set(source.get('allowedHosts',[])) | {parsed.hostname}
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('HTTPS public source required')
    key=hashlib.sha256(url.encode()).hexdigest()
    checkpoint=BASE / 'checkpoints' / (key+'.json')
    if checkpoint.exists() and not refresh:
        receipt=json.loads(checkpoint.read_text()); raw=(ROOT/receipt['original']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=receipt['sha256']: raise ValueError('Original checksum changed')
        if not (expects_pdf(url) and receipt['contentType']!='application/pdf'):
            return raw,receipt
    BASE.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=BASE) as folder:
        target=Path(folder)/'response'
        # Redirects are inspected before following so access never silently moves
        # onto a private network or a different unapproved host.
        current=url; context=source.get('contextUrl')
        for _ in range(5):
            headers=Path(folder)/'headers'
            # A report taken from an index page carries that page as Referer, as a
            # browser click would; same host only. Maharashtra BEAMS answers a bare
            # request for its budget books with an HTML "Page Not Found" 404.
            referer=context if context and urlparse(context).scheme=='https' and urlparse(context).hostname==urlparse(current).hostname else None
            run=subprocess.run(['curl','--silent','--show-error','--fail','--proto','=https','--max-time','35','--connect-timeout','12','--max-filesize','40000000','--dump-header',str(headers),*(['--referer',referer] if referer else []),quote(current,safe=":/?&=%#@+!$'()*,-._~;"),'-o',str(target)],capture_output=True,text=True)
            if run.returncode: raise ValueError('Download unavailable: '+run.stderr.strip()[:160])
            hs=headers.read_text(errors='replace')
            location=re.search(r'^location:\s*(.+)$',hs,re.I|re.M)
            if not location: break
            current=urljoin(current,location[1].strip()); p=urlparse(current)
            if p.scheme!='https' or p.hostname not in hosts or p.username or p.password: raise ValueError('Redirect needs source-host review')
        else: raise ValueError('Redirect limit')
        raw=target.read_bytes()
        if not raw: raise ValueError('Empty original')
        if expects_pdf(url) and not raw.lstrip().startswith(b'%PDF-'):
            raise ValueError('Expected original PDF; server returned an HTML/other response. Not financial evidence.')
        if not raw.lstrip().startswith(b'%PDF-') and blocked(raw.decode(errors='replace')): raise ValueError('Access restriction: retained as blocker, not evidence')
        digest=hashlib.sha256(raw).hexdigest()
        original=ROOT/'data/originals/state-development'/digest
        original.parent.mkdir(parents=True,exist_ok=True); original.parent.chmod(0o700)
        original.write_bytes(raw); original.chmod(0o600)
        receipt={'version':VERSION,'stateCode':state['code'],'state':state['name'],'sourceId':source['id'],'sourceKind':source['kind'],'label':source['label'],'url':url,'effectiveUrl':current,'contextUrl':source.get('contextUrl',url),'requestReferer':referer,'sha256':digest,'original':str(original.relative_to(ROOT)),'bytes':len(raw),'retrievedAt':now(),'financialYearHints':source.get('years',YEARS),'permissionStatus':'review_pending','publication':'private_only','contentType':'application/pdf' if raw.lstrip().startswith(b'%PDF-') else 'text/html','intakeObjectFits':len(raw)<=10000000}
        write(checkpoint,receipt)
        return raw,receipt

def extract(raw, receipt):
    out={'source':receipt,'pages':[],'tables':[],'links':[],'numericLines':0,'completeExtraction':True,'normalizedFinancialFacts':0,'reviewStatus':'unreviewed','warnings':['Amounts, year columns and table hierarchy require review before aggregation.','A budget or tender amount is not actual spending or a payment.']}
    if receipt['contentType']=='application/pdf':
        from pypdf import PdfReader
        try:
            reader=PdfReader(io.BytesIO(raw)); out['totalPages']=len(reader.pages)
            pages=reader.pages[:150]
        except Exception:
            out['completeExtraction']=False
            out['warnings'].append('Original PDF preserved; alternate parser or visual review required before extraction.')
            return out
        for i,page in enumerate(pages,1):
            try: text=page.extract_text(extraction_mode='layout') or ''
            except Exception as e:
                text=''; out['completeExtraction']=False
                out['warnings'].append('Page '+str(i)+' needs visual/OCR review: '+str(e)[:80])
            rows=[{'line':j,'text':l} for j,l in enumerate(text.splitlines(),1) if l.strip()]
            out['pages'].append({'page':i,'lines':rows})
            out['numericLines']+=sum(bool(re.search(r'\d+[,.]\d+',r['text'])) for r in rows)
        out['completeExtraction']=out['completeExtraction'] and len(reader.pages)<=150
        if len(reader.pages)>150: out['warnings'].append('First 150 pages extracted; full unchanged original preserved.')
        if not any(p['lines'] for p in out['pages']):
            out['completeExtraction']=False
            out['warnings'].append('Scanned original; OCR and visual review needed.')
    else:
        parser=DocumentHTML(); parser.feed(raw.decode(errors='replace'))
        out['pages']=[{'page':1,'lines':[{'line':i,'text':t} for i,t in enumerate(parser.text,1)]}]
        out['tables']=[{'table':i,'rows':rows} for i,rows in enumerate(parser.tables,1)]
        out['links']=[{'label':a['label'],'url':urljoin(receipt['effectiveUrl'],a['href'])} for a in parser.links if not a['href'].startswith(('javascript:','#','mailto:','tel:'))]
        out['numericLines']=sum(bool(re.search(r'\d+[,.]\d+',t)) for t in parser.text)
    return out

def linked_report_window(links, source):
    limit=max(1,min(20,int(source.get('maxLinkedReports',4))))
    offset=source.get('linkedReportOffset',0)
    if isinstance(offset,bool) or not isinstance(offset,int) or not 0<=offset<=2000:
        raise ValueError('Linked report offset must be an integer from 0 to 2000')
    return list(enumerate(links[offset:offset+limit],start=offset))


def collect(state, kind=None, retry=False, refresh_indexes=False):
    folder=BASE/state['code'];folder.mkdir(parents=True,exist_ok=True)
    with (folder/'.collection.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _collect(state,kind,retry,refresh_indexes)

def _collect(state, kind=None, retry=False, refresh_indexes=False):
    folder=BASE/state['code']; folder.mkdir(parents=True,exist_ok=True)
    path=folder/'checkpoint.json'
    result=json.loads(path.read_text()) if path.exists() else {'code':state['code'],'state':state['name'],'documents':[],'failures':[]}
    queue=[s for s in state['sources'] if kind is None or s['kind']==kind]; observed=set(s['url'] for s in queue)
    for source in queue:
        if not retry and any(f['url']==source['url'] for f in result['failures']): continue
        existing=next((d for d in result['documents'] if d['url']==source['url']),None)
        invalid_pdf=existing is not None and expects_pdf(source['url']) and existing['contentType']!='application/pdf'
        if invalid_pdf:
            rejected={**existing,'rejectionReason':'Expected original PDF but preserved server response was HTML/other content'}
            result.setdefault('rejectedResponses',[])
            if not any(d['sha256']==existing['sha256'] and d['url']==existing['url'] for d in result['rejectedResponses']):result['rejectedResponses'].append(rejected)
            result['documents']=[d for d in result['documents'] if d is not existing]
        if existing and not invalid_pdf and source['kind'] not in ('budget_index','monthly_expenditure_index','procurement_index'): continue
        try:
            raw,receipt=fetch(source,state,refresh_indexes and source['kind'] in ('budget_index','monthly_expenditure_index','procurement_index'))
            extraction=extract(raw,receipt)
            ep=folder/(receipt['sha256']+'.json'); write(ep,extraction)
            for prior in result['documents']:
                if prior['url']==source['url'] and prior['sha256']!=receipt['sha256']:
                    history=result.setdefault('previousEditions',[])
                    if not any(p['url']==prior['url'] and p['sha256']==prior['sha256'] for p in history): history.append(prior)
            result['documents']=[d for d in result['documents'] if d['url']!=source['url']]+[{**receipt,'extraction':str(ep.relative_to(ROOT)),'numericLines':extraction['numericLines'],'sourceTables':len(extraction['tables']),'extractedPages':len(extraction['pages']),'completeExtraction':extraction['completeExtraction']}]
            result['failures']=[f for f in result['failures'] if f['url']!=source['url']]
            if source['kind']=='procurement_index':
                for link in extraction['links']:
                    if link['label']=='Explicit page redirect' and link['url'] not in observed and urlparse(link['url']).hostname==urlparse(receipt['effectiveUrl']).hostname:
                        observed.add(link['url']); queue.append({'id':source['id']+'-home','kind':'procurement_report','label':'Official procurement public homepage following its explicit redirect','url':link['url'],'contextUrl':source['url']})
            if source['kind'] in ('budget_index','monthly_expenditure_index'):
                def priority(link):
                    text=(link['url']+' '+link['label']).lower()
                    terms=['glance','brief','summary','highlight','financial_statement','afs','expenditure','budget'] if source['kind']=='budget_index' else ['march','sup','aug','jul','jun','2026']
                    return sum((len(terms)-i)*10 for i,t in enumerate(terms) if t in text)+(80 if re.search(r'202[56][-_]?202[67]|202[56][-_]2[67]|202[56]2[67]',text) else 0)
                links=list({a['url']:a for a in extraction['links'] if re.search(r'\.pdf(?:$|[?#])',a['url'],re.I) and (urlparse(a['url']).hostname==urlparse(receipt['effectiveUrl']).hostname or (urlparse(a['url']).hostname or '').endswith('.s3waas.gov.in') or urlparse(a['url']).hostname=='d7i5wg8xwe4hf.cloudfront.net')}.values())
                # Only source-observed links; year membership remains a heading
                # review, especially where an index filename is stale.
                links=sorted(links,key=priority,reverse=True)
                if source['kind']=='monthly_expenditure_index': links=[a for a in links if '2026' in a['url']]
                for n,link in linked_report_window(links,source):
                    if link['url'] in observed: continue
                    observed.add(link['url']); queue.append({'id':source['id']+'-linked-'+str(n+1),'kind':'budget' if source['kind']=='budget_index' else 'reported_expenditure','label':link['label'] or 'Observed official linked report','url':link['url'],'contextUrl':source['url'],'years':source.get('years',YEARS)})
        except Exception as e:
            result['failures']=[f for f in result['failures'] if f['url']!=source['url']]+[{'sourceId':source['id'],'url':source['url'],'error':str(e)[:240],'checkedAt':now()}]
        result['updatedAt']=now(); result['completeCoverage']=False
        write(path,result); update_summary()
    print(json.dumps({'state':state['name'],'documents':len(result['documents']),'numericLines':sum(d['numericLines'] for d in result['documents']),'failures':len(result['failures'])}),flush=True)

def update_summary():
    plan=read_plan()
    states=[];all_documents=[]
    for n,(code,name) in enumerate(STATES,1):
        p=BASE/code/'checkpoint.json'; d=json.loads(p.read_text()) if p.exists() else {'documents':[],'failures':[]}
        planned=next((s for s in plan['states'] if s['code']==code),{})
        documents=d['documents']+d.get('previousEditions',[])
        all_documents.extend(documents)
        candidate_file=BASE/code/'candidates.json'
        candidates=json.loads(candidate_file.read_text()) if candidate_file.exists() else {}
        counts={key:len(candidates.get(key,[])) for key in ('budgetCandidates','expenditureCandidates','projectCandidates')}
        fiscalCoverage=[]
        for fy in YEARS:
            budget=[r for r in candidates.get('budgetCandidates',[]) if r.get('financialYear')==fy]
            spend=[r for r in candidates.get('expenditureCandidates',[]) if r.get('financialYear')==fy]
            fiscalCoverage.append({'financialYear':fy,'budgetCandidates':len(budget),
                                  'reportedExpenditureCandidates':len(spend),
                                  'latestExpenditureCutoff':max((r['periodEnd'] for r in spend),default=None),
                                  'completeCoverage':False})
        counts['financialYearCoverage']=fiscalCoverage
        budget_rows=candidates.get('budgetCandidates',[])
        counts['budgetContextCandidates']=sum(r.get('budgetTableScope')=='cag_overview_budget_context' for r in budget_rows)
        counts['namedBudgetCandidates']=len(budget_rows)-counts['budgetContextCandidates']
        states.append({'order':n,'code':code,'name':name,'status':'partial_collected' if d['documents'] else 'source_assessed' if planned.get('sources') else 'pending','originals':len(documents),'pdfs':len({x['sha256'] for x in documents if x['contentType']=='application/pdf'}),'sourceTables':sum(x['sourceTables'] for x in documents),'numericEvidenceLines':sum(x['numericLines'] for x in documents),'blockedSources':len(d['failures']),'reviewedFinancialFacts':0,'publishedFacts':0,'completeCoverage':False,'nextAction':planned.get('nextAction','Inspect official budgets, monthly expenditure and departmental project/procurement reports.'),'sourceKinds':sorted(set(x['sourceKind'] for x in documents)),**counts})
    write(ROOT/'data/state-development-acquisition.json',{'version':VERSION,'updatedAt':now(),'financialYears':YEARS,'scope':'28 states in owner order; broad evidence acquisition; not a complete payment ledger','states':states,'originals':sum(s['originals'] for s in states),'pdfs':len({x['sha256'] for x in all_documents if x['contentType']=='application/pdf'}),'sourceTables':sum(s['sourceTables'] for s in states),'numericEvidenceLines':sum(s['numericEvidenceLines'] for s in states),'reviewedFinancialFacts':0,'publication':'private_collection_only','completeCoverage':False,'completeStates':0,'statesWithNamedBudgetCandidates':sum(s['namedBudgetCandidates']>0 for s in states),'statesWithBudgetCandidates':sum(s['budgetCandidates']>0 for s in states),**{key:sum(s[key] for s in states) for key in ('budgetCandidates','expenditureCandidates','projectCandidates')}})

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--state'); parser.add_argument('--all',action='store_true'); parser.add_argument('--summary',action='store_true'); parser.add_argument('--kind'); parser.add_argument('--retry-failed',action='store_true'); parser.add_argument('--refresh-indexes',action='store_true'); args=parser.parse_args()
    if args.summary: update_summary(); return
    plan=read_plan()
    for code,name in STATES:
        if args.all or args.state==code:
            s=next((s for s in plan['states'] if s['code']==code),None)
            if s: collect(s,args.kind,args.retry_failed,args.refresh_indexes)

if __name__=='__main__': main()
