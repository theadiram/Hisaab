import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from decimal import Decimal
import state_development_collection as collection
from state_development_collection import DocumentHTML, blocked
from state_development_normalize import rupees, source_projects,monthly_accounts,assam_sector_expenditure,telangana_budget,monthly_budget_context
from state_development_budget_tables import goa_glance,manipur_glance,haryana_sectors,nagaland_major_heads,assam_major_heads,maharashtra_rural_heads
from state_development_reconcile import table_check,rounding_context

from state_development_inspected_accounts import inspected_accounts,SOURCES
from state_development_programme_tables import ap_programmes,hp_current_heads,assam_current_heads,cg_afs_heads,haryana_programmes,tamil_inspected_revenue_heads,karnataka_regional_programmes,goa_current_heads,goa_demand_major_heads,jharkhand_crossreferenced_june_actuals,goa_demand_budget_summaries,sikkim_sic_budget_heads
from state_development_inventory import observed_reports
from state_development_classification import suggest
from state_development_remaining_tables import meghalaya_current_heads,gujarat_outcome_schemes

class StateEvidenceRules(unittest.TestCase):
    def test_goa_demand_details_reconcile_all_97_codes_to_independent_control(self):
        import sys,tempfile
        from pathlib import Path
        from unittest.mock import patch
        from state_development_collection import BASE
        codes=[f'{n:02}' for n in range(1,95)]+['A1','A2','A3']
        pages=[]
        for pn in range(1,5):
            lines=[]
            if pn==1:lines=[{'line':1,'text':'Rs. in lakhs Revenue Exp Capital Exp Total 2026-2027'}]
            for i,code in enumerate(codes[(pn-1)*25:pn*25],1):
                lines.append({'line':i+1,'text':f'{code} Department {code} 1.00 0.00 1.00'})
            pages.append({'page':pn,'lines':lines})
        doc={'sourceId':'goa-budget-alternative-linked-10','stateCode':'30','sha256':'372133495751984cd0213737652672afa4bb29d9c298107c676d09f599db5007','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);folder=base/'30';folder.mkdir();
            (folder/'checkpoint.json').write_text(json.dumps({'documents':[{'sourceId':'goa-budget-alternative-linked-8','sha256':'controlhash','url':'https://example.invalid/control','retrievedAt':'2026-10-15'}]}))
            (folder/'controlhash.json').write_text(json.dumps({'pages':[{'page':1,'lines':[{'line':1,'text':'Total 97.00 0.00 97.00'}]}]}))
            with patch('state_development_collection.BASE',base):rows=goa_demand_budget_summaries(doc,{'pages':pages})
        self.assertEqual(len(rows),97);self.assertEqual(rows[0]['amountRupees'],'100000.00')
        self.assertEqual(rows[-1]['unit'],'lakh');self.assertEqual(rows[0]['sourceControl']['totalLakhs'],'97.00')
        self.assertEqual(rows[0]['budgetTableScope'],'goa_demand_total')
        self.assertFalse(any(r['publicationApproved'] for r in rows))
        with self.assertRaisesRegex(ValueError,'edition changed'):
            goa_demand_budget_summaries({**doc,'sha256':'different'}, {'pages':pages})

    @unittest.skipUnless((collection.BASE/'30'/'checkpoint.json').exists(), 'Private source-acquisition fixtures are not included in the public checkout')
    def test_goa_full_volume_one_major_head_rows_reconcile_each_demand_control(self):
        checkpoint=json.loads((collection.BASE/'30'/'checkpoint.json').read_text())
        doc=next(d for d in checkpoint['documents'] if d['sourceId']=='goa-demands-volume-i-full-alt-host-2026')
        extraction=json.loads((collection.BASE/'30'/(doc['sha256']+'.json')).read_text())
        rows=goa_demand_major_heads(doc,extraction)
        self.assertEqual(len(rows),1077)
        self.assertEqual(len({r['sourceDemandNumber'] for r in rows}),97)
        self.assertEqual({(r['financialYear'],r['estimate']) for r in rows},
                         {('2025-2026','original'),('2025-2026','revised'),('2026-2027','original')})
        self.assertTrue(all(r['unit']=='lakh' and r['reviewStatus']=='awaiting_review' for r in rows))
        self.assertEqual(rows[0]['sourceDemandNumber'],'01')
        self.assertEqual(rows[0]['sourceMajorHead'],'2011')
        self.assertEqual(rows[0]['sourceTotal'],'5421.50')
        self.assertEqual(rows[1]['sourceTotal'],'5421.50')
        self.assertEqual(rows[2]['sourceTotal'],'5619.00')
        from copy import deepcopy
        changed = deepcopy(extraction)
        first_total = next(r for r in changed['pages'][0]['lines'] if 'Total      Demand' in r['text'])
        first_total['text'] = first_total['text'].replace('6000.01', '6001.01')
        with self.assertRaisesRegex(ValueError, 'fails FY2025-26'):
            goa_demand_major_heads(doc, changed)
        with self.assertRaisesRegex(ValueError, 'source edition changed'):
            goa_demand_major_heads({**doc, 'sha256': 'unexpected'}, extraction)

    def test_jharkhand_crossreferenced_trend_unit_captures_cumulative_actuals(self):
        doc={'sourceId':'cag-monthly-20-linked-2','stateCode':'20','sha256':'cfb37fda2a7b1b29890adb677d5b2804143e9dc9df1e6641a8294edebb64daeb','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        pages=[]
        for page in range(1,18):
            text=[]
            if page in [10,11,12,13,14,15,16,17]:
                item={10:'4(a)',11:'4(b)',12:'4(c)',13:'4(d)',14:'4(e)',15:'5(a)',16:'5(b)',17:'8'}[page]
                text=[f'Refer to Item No. {item} of Monthly Accounts at a Glance','(in Crores)','Monthly Trend','June 1,00.00 2,00.00 3,00.00 4,00.00']
            pages.append({'page':page,'lines':[{'line':i,'text':t} for i,t in enumerate(text,1)]})
        rows=jharkhand_crossreferenced_june_actuals(doc,{'pages':pages})
        self.assertEqual(len(rows),16)
        self.assertEqual(rows[0]['amountRupees'],'2000000000.00')
        self.assertEqual(rows[1]['amountRupees'],'4000000000.00')
        self.assertEqual(rows[0]['periodEnd'],'2026-06-30')
        self.assertEqual(rows[1]['periodEnd'],'2025-06-30')
        self.assertEqual(rows[0]['measure'],'reported_spent')
        self.assertFalse(any(r['publicationApproved'] for r in rows))
        pages[9]['lines'][1]['text']='(in Rupees)'
        with self.assertRaisesRegex(ValueError,'unit/cross-reference changed'):
            jharkhand_crossreferenced_june_actuals(doc,{'pages':pages})

    def test_sikkim_sic_department_rows_reconcile_parent_children_and_total(self):
        doc={'sourceId':'sikkim-sic-budget-2026-observed','stateCode':'11','sha256':'caf4221c3fe914634e3dab7d35e4df630edff023a228b97c5a1222dc5077f905','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        details=[]
        for n in range(1,19):
            row=[f'45.00.{n:02}',f'Item {n}','2','1','1','1']
            details.append((['',*row] if n==1 else row))
        rows=[['Major/Sub-Major/Minor/Sub/Detailed Heads','Actuals 2024-25','Budget Estimates 2025-26','Revised Estimate 2025-2026','Budget Estimate 2026-27'],
              ['45 ChiefInformationCommission','5','10','20','30'],*details,
              ['Total','45 ChiefInformationCommission','25','28','38','48']]
        pages=[{'page':1,'lines':[{'line':i,'text':v} for i,v in enumerate(['BUDGET OF SIC - 2026-2027','BUDGET OF SIKKIM INFORMATION COMMISSION','Demand No. 28','(In Thousands of Rupees)','Major/Sub-Major/Minor/Sub/Detailed Heads','Actuals','2024-25','Budget Estimates 2025-26','Revised','Estimate','2025-2026','Budget Estimate','2026-27'],1)]}]
        facts=sikkim_sic_budget_heads(doc,{'pages':pages,'tables':[{'table':1,'rows':rows}]})
        self.assertEqual(len(facts),57)
        self.assertEqual(facts[0]['amountRupees'],'10000.00')
        self.assertEqual(facts[-1]['amountRupees'],'1000.00')
        self.assertEqual(facts[0]['hierarchyRole'],'parent')
        self.assertEqual(facts[3]['hierarchyRole'],'object_head_detail')
        self.assertTrue(all(x['classification']=='administrative_context' and not x['publicationApproved'] for x in facts))
        rows[-1][-1]='49'
        with self.assertRaisesRegex(ValueError,'components do not match'):
            sikkim_sic_budget_heads(doc,{'pages':pages,'tables':[{'table':1,'rows':rows}]})

    def test_goa_head_budgets_exclude_prior_actuals_and_keep_negative_recoveries(self):
        doc={'sourceId':'goa-budget-alternative-linked-17','stateCode':'30','sha256':'fixture','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        text=['DISBURSEMENT Rs. in lakhs 2024-2025 2025-2026 2026-2027',
              '4425 Capital Outlay on Cooperation  -18.15 -17.80 -17.80 14.11']
        rows=goa_current_heads(doc,{'pages':[{'page':1,'lines':[{'line':i,'text':t} for i,t in enumerate(text,1)]}]})
        self.assertEqual([r['amountRupees'] for r in rows],['-1780000.00','-1780000.00','1411000.00'])
        self.assertTrue(all(r['measure']=='allocated' for r in rows))

    def test_haryana_uses_absolute_rupees_and_preserves_unknown_revised_cell(self):
        doc={'sourceId':'haryana-budget-2026-linked-3','stateCode':'6','sha256':'fixture','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        text=['Expenditure(In ₹) 2024-25 2025-26 2026-27 Major-Head : 4059',
              'Total : [70] Construction of Office Building  81,737 5,00,00,000 ... 1,00,00,000']
        rows=haryana_programmes(doc,{'pages':[{'page':20,'lines':[{'line':i,'text':t} for i,t in enumerate(text,1)]}]})
        self.assertEqual([r['amountRupees'] for r in rows],['50000000.00',None,'10000000.00'])
        self.assertTrue(all(r['unit']=='rupee' and r['measure']=='allocated' for r in rows))
        self.assertEqual(rows[-1]['sourceMajorHead'],'4059')

    def test_tamil_transcription_uses_document_year_not_index_year(self):
        doc={'sourceId':'tn-treasury-afs-observed-2025','stateCode':'33','sha256':'d7945e16a4f47f3e706a483ea66a33287da8866328466c487bfbd9f831ea08fa','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        rows=tamil_inspected_revenue_heads(doc,{})
        self.assertEqual(len(rows),9)
        self.assertEqual(rows[0]['amountRupees'],'7227411000.00')
        self.assertTrue(all(r['financialYear']=='2025-2026' and r['unit']=='thousand' and r['reviewStatus']=='awaiting_review' for r in rows))
        with self.assertRaises(ValueError):tamil_inspected_revenue_heads({**doc,'sha256':'new-edition'},{})

    def test_karnataka_regional_subset_is_not_a_payment_or_department_total(self):
        import sys
        def word(t,x,y=300):return {'text':t,'x0':x,'x1':x+35,'top':y,'bottom':y+10}
        class Page:
            width=1000;height=1000
            def extract_words(self):return [word('Regional Imbalance Redressal Program',0,0),word('2026-27',0,10),word('Crores',0,20),word('4210-01-110-1-01',260),word('Hospital',500),word('200.00',880)]
        class PDF:
            pages=[Page() for _ in range(31)]
            def __enter__(self):return self
            def __exit__(self,*args):pass
        doc={'sourceId':'ka-budget-volumes-observed-2026-linked-4','stateCode':'29','sha256':'fixture','original':'unused','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        with patch.dict(sys.modules,{'pdfplumber':SimpleNamespace(open=lambda _:PDF())}):rows=karnataka_regional_programmes(doc,{})
        self.assertEqual(len(rows),3);self.assertEqual(rows[0]['amountRupees'],'2000000000.00')
        self.assertEqual(rows[0]['budgetTableScope'],'karnataka_regional_imbalance_programme')
        self.assertTrue(all(r['measure']=='allocated' for r in rows))

    def test_pdf_download_routes_are_not_accepted_as_html_budget_evidence(self):
        self.assertTrue(collection.expects_pdf('https://example.invalid/documents/AFS.pdf/uuid?t=10'))
        self.assertTrue(collection.expects_pdf('https://example.invalid/AFS.PDF?year=2026'))
        self.assertFalse(collection.expects_pdf('https://example.invalid/financial.html'))

    def test_rounding_compatibility_never_changes_or_approves_money(self):
        check=table_check([{'amountRupees':'999800000.00'}],'100.00','crore','Printed control')
        reviewed=rounding_context(check,'crore',2)
        self.assertFalse(reviewed['compatibleWithDisplayRounding'])
        self.assertEqual(reviewed['differenceRupees'],'-200000.00')
        self.assertEqual(reviewed['status'],'difference_requires_review')
        self.assertFalse(reviewed['publicationApproved'])
        wider=rounding_context({**check,'rows':21},'crore',2)
        self.assertTrue(wider['compatibleWithDisplayRounding'])
        self.assertEqual(wider['status'],'difference_requires_review')

    def test_hp_bilingual_head_follows_printed_english_line_and_uses_lakh(self):
        doc={'sourceId':'hp-form-capital-2026','sha256':'fixture','stateCode':'2','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        lines=['Annual Financial Statement Rs. In Lacs 2024-25 2025-26 2026-27',
          '4055 source Hindi name    10.00 20.00 30.00 40.00','CAPITAL OUTLAY ON POLICE']
        rows=hp_current_heads(doc,{'pages':[{'page':1,'lines':[{'line':n,'text':t} for n,t in enumerate(lines,1)]}]})
        self.assertEqual(len(rows),3);self.assertEqual(rows[2]['amountRupees'],'4000000.00')
        self.assertEqual(rows[2]['purposeLabel'],'CAPITAL OUTLAY ON POLICE')
        self.assertEqual(rows[2]['financialYear'],'2026-2027')
        self.assertTrue(all(r['measure']=='allocated' for r in rows))

    def test_assam_fourteen_columns_use_total_not_general_or_prior_actual(self):
        import sys
        def word(t,x,top=300):return {'text':t,'x0':x,'x1':x+20,'top':top,'bottom':top+10}
        class Page:
            width=1122.72
            def extract_words(self):return [word('2011',711),word('Legislature',741),word('1',680),word('1.00',100),word('5.00',440),word('6.00',640),word('7.00',1000)]
        class PDF:
            pages=[Page()]
            def __enter__(self):return self
            def __exit__(self,*args):pass
        doc={'sourceId':'assam-afs-observed-54-2026','stateCode':'18','sha256':'fixture','original':'unused','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        extraction={'pages':[{'lines':[{'text':'STATEMENT OF EXPENDITURE 2026-27 2024-25 Rupees in Lakhs'}]}]}
        with patch.dict(sys.modules,{'pdfplumber':SimpleNamespace(open=lambda _:PDF())}):rows=assam_current_heads(doc,extraction)
        self.assertEqual([r['amountRupees'] for r in rows],['500000.00','600000.00','700000.00'])
        self.assertIsNone(rows[-1]['sourceSixthScheduleComponent'])
        self.assertEqual(rows[-1]['sourceGrant'],'1')

    def test_ap_subheads_keep_editions_unknowns_and_do_not_carry_labels_across_groups(self):
        doc={'stateCode':'28','sha256':'fixture','url':'https://example.invalid/Volume-III-7.pdf','retrievedAt':'2026-10-15'}
        lines=['XII DEMAND SCHOOL EDUCATION Rupees in Lakhs 2024-25 2025-26 2026-27',
               'M.J.H. 2202 S.M.J.H 01','M.H. 112 PROGRAMME',
               'G.H. 12 CENTRALLY ASSISTED','S.H. (19) School nutrition',
               '310 Grants-in-Aid','Total S.H. (19)    1.00 2.00 3.00 4.00',
               'G.H. 27 DIFFERENT GROUP','Total S.H. (19)    .. .. .. 0.01']
        rows=ap_programmes(doc,{'pages':[{'page':1,'lines':[{'line':n,'text':t} for n,t in enumerate(lines,1)]}]})
        self.assertEqual(len(rows),6)
        self.assertEqual([r['amountRupees'] for r in rows[:3]],['200000.00','300000.00','400000.00'])
        self.assertIsNone(rows[3]['amountRupees'])
        self.assertEqual(rows[5]['amountRupees'],'1000.00')
        self.assertNotEqual(rows[0]['overlapGroup'],rows[3]['overlapGroup'])
        self.assertEqual(rows[3]['purposeLabel'],'Source subhead (19)')
        self.assertTrue(all(r['measure']=='allocated' for r in rows))

    def test_source_inventory_preserves_failure_and_unknown_fiscal_membership(self):
        rows=observed_reports({'effectiveUrl':'https://example.invalid/index'},
           {'links':[{'url':'https://example.invalid/a.pdf','label':'A'}, {'url':'https://example.invalid/b.pdf','label':'B'}, {'url':'https://example.invalid/c.pdf','label':'C'}]},
           [{'url':'https://example.invalid/a.pdf','contentType':'application/pdf','sha256':'a'}],
           [{'url':'https://example.invalid/b.pdf','error':'Unavailable'}])
        self.assertEqual([r['status'] for r in rows],['original_preserved','source_failed','awaiting_collection'])
        self.assertTrue(all(not r['completePaymentCoverage'] for r in rows))
        self.assertTrue(all(r['fiscalEditionStatus']=='requires_original_heading_review' for r in rows))

    def test_linked_windows_preserve_source_ordinals_without_repeating_first_batch(self):
        links=list(range(45))
        self.assertEqual(collection.linked_report_window(links,{'maxLinkedReports':20,'linkedReportOffset':20}),list(enumerate(range(20,40),20)))
        self.assertEqual(collection.linked_report_window(links,{'maxLinkedReports':20,'linkedReportOffset':40}),list(enumerate(range(40,45),40)))
        self.assertEqual(collection.linked_report_window(links,{'maxLinkedReports':100}),list(enumerate(range(20))))
        for offset in [-1,True,'20',2001]:
            with self.assertRaises(ValueError):collection.linked_report_window(links,{'linkedReportOffset':offset})

    def test_gujarat_outcome_keeps_targets_out_of_money_and_skips_merged_names(self):
        doc={'sha256':'fixture','stateCode':'24','sourceId':'fixture','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        source={'sourceSha256':'fixture','completeInspection':True,'pages':[{'page':10,'tables':[
            [['Type of Scheme','Name of Scheme','Financial Provision 2026-27 Crore','Physical Target',None,None,None],
             [None,None,None,'Unit','2026-27','2027-28','2028-29'],
             ['General','002 2401 00 105 44 School construction','1.25','Schools','10','20','30'],
             ['SCSP',None,'2.00','Schools','1','2','3']]]}]}
        with patch.object(Path,'read_text',return_value=json.dumps(source)):
            rows=gujarat_outcome_schemes(doc,{})
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['amountRupees'],'12500000.00')
        self.assertEqual(rows[0]['sourcePhysicalTargetNextYear'],'20')
        self.assertEqual(rows[0]['sourceBudgetHeads'],['002 2401 00 105 44'])
        self.assertEqual(rows[0]['measure'],'allocated')
        self.assertEqual(rows[0]['reviewStatus'],'awaiting_review')
        source['completeInspection']=False
        with patch.object(Path,'read_text',return_value=json.dumps(source)):
            with self.assertRaisesRegex(ValueError,'incomplete'):gujarat_outcome_schemes(doc,{})

    def test_inspected_monthly_accounts_keep_actual_cutoff_and_explicit_zero(self):
        for ident,(code,sha,_) in SOURCES.items():
            doc={'sourceId':ident,'stateCode':code,'sha256':sha,'url':'https://example.invalid','retrievedAt':'2026-10-15'}
            budgets,actuals=inspected_accounts(doc)
            self.assertEqual(len(budgets),8);self.assertEqual(len(actuals),8)
            self.assertTrue(all(r['periodEnd']=='2026-06-30' and r['measure']=='reported_spent' for r in actuals))
            self.assertTrue(all(r['periodEnd']=='2027-03-31' and r['measure']=='allocated' for r in budgets))
            self.assertTrue(all(not r['publicationApproved'] for r in budgets+actuals))
            if code=='17':self.assertEqual(actuals[-1]['amountRupees'],'0.00')
            else:self.assertEqual(budgets[0]['estimate'],'original')
            with self.assertRaisesRegex(ValueError,'edition changed'):inspected_accounts({**doc,'sha256':'new edition'})

    def test_meghalaya_named_cells_preserve_thousands_and_missing_not_charge_guess(self):
        import sys
        header='thousand 2024-2025 2025-2026 2026-2027'
        class Page:
            def extract_text(self):return header
            def extract_tables(self):return [[['Actuals','BE25','RE25','Head','BE26'],
                ['10','20','30','2210-Medical and Public Health','40'],
                ['','1','2','(Charged)','3'],['1','','4','2211-Family Welfare','5']]]
        class PDF:
            pages=[Page() for _ in range(36)]
            def __enter__(self):return self
            def __exit__(self,*args):pass
        doc={'sha256':'fixture','stateCode':'17','sourceId':'fixture','original':'example','url':'https://example.invalid','retrievedAt':'2026-10-15'}
        with patch.dict(sys.modules,{'pdfplumber':SimpleNamespace(open=lambda _:PDF())}):
            result=meghalaya_current_heads(doc,{})
        self.assertEqual(len(result),120)
        self.assertEqual(result[0]['amountRupees'],'20000.00')
        self.assertEqual(result[2]['amountRupees'],'40000.00')
        self.assertIsNone(result[3]['amountRupees'])
        self.assertTrue(all(r['sourceMajorHead'] in ['2210','2211'] for r in result))

    def test_budget_column_is_not_monthly_actual_and_missing_is_not_zero(self):
        doc={'sha256':'a'*64,'stateCode':'10','url':'https://example.invalid/accounts','retrievedAt':'2026-10-12'}
        extraction={'pages':[{'lines':[{'line':1,'text':'ACCOUNTS AT A GLANCE At the end of April 2026 (in crore) Budget Estimates 2026-27'},
                   {'line':2,'text':'5. Capital Expenditure (a+b)      100.00 20.00 20.00 15.00'}]}]}
        row=monthly_budget_context(doc,extraction)[0]
        self.assertEqual(row['amountRupees'],'1000000000.00')
        self.assertEqual(row['estimate'],'source_reported_budget_edition_unspecified')
        self.assertEqual(row['periodEnd'],'2027-03-31')
        self.assertEqual(row['sourceReportCutoff'],'2026-04-30')
        self.assertIn('Budget Estimates column',row['source']['locator'])
        self.assertEqual(row['measure'],'allocated')

    def test_private_classification_never_approves_or_confuses_medical_college(self):
        def candidate(label,classification='mixed_or_unresolved',amount='100.00'):
            return {'id':'test','financialYear':'2026-2027','purposeLabel':label,'classification':classification,'amountRupees':amount}
        medical=suggest(candidate('Medical college construction'))
        self.assertEqual(medical['suggestedPurpose'],'health')
        self.assertEqual(medical['decision'],'included_candidate')
        mixed=suggest(candidate('Road construction and maintenance'))
        self.assertEqual(mixed['decision'],'mixed_unresolved')
        social=suggest(candidate('Old age pension scheme'))
        self.assertEqual(social['decision'],'mixed_unresolved')
        debt=suggest(candidate('Debt repayment','debt_servicing_context',None))
        self.assertEqual(debt['decision'],'excluded_context')
        self.assertTrue(debt['amountMissing'])
        for row in [medical,mixed,social,debt]:
            self.assertFalse(row['publicationApproved'])
            self.assertFalse(row['sourceRightsApproved'])
            self.assertFalse(row['overlapResolved'])

    def test_nagaland_accounts_are_not_current_budget_and_receipts_not_imported(self):
        doc={'sha256':'fixture','stateCode':'13','sourceId':'nagaland-afs-2026',
             'url':'https://finance.nagaland.gov.in/example.pdf','retrievedAt':'2026-10-12'}
        header='DISBURSEMENT Lakhs of Rupees Accounts 2024-2025 Budget 2025-2026 Revised 2025-2026 Budget 2026-2027'
        pages=[{'page':n,'lines':[{'line':1,'text':header}]} for n in range(6,12)]
        pages[0]['lines'].extend([{'line':2,'text':'2202 General Education    1.00 2.00 3.00 4.00'},
                                  {'line':3,'text':'0202 Receipt tax context    50.00 60.00 70.00 80.00'}])
        rows=nagaland_major_heads(doc,{'pages':pages})
        self.assertEqual([(r['financialYear'],r['estimate'],r['amountRupees']) for r in rows],
                         [('2025-2026','original','200000.00'),('2025-2026','revised','300000.00'),
                          ('2026-2027','original','400000.00')])
        self.assertTrue(all(r['reviewStatus']=='awaiting_review' for r in rows))
        pages[0]['lines'].append({'line':4,'text':'2202 General Education    1.00 2.00 3.00 4.00'})
        with self.assertRaisesRegex(ValueError,'duplicate'):
            nagaland_major_heads(doc,{'pages':pages})

    def test_maharashtra_thousand_unit_and_dots_remain_unknown(self):
        doc={'sha256':'fixture','stateCode':'27','sourceId':'mh-rural-budget-linked-1',
             'url':'https://rdd.maharashtra.gov.in/example.pdf','retrievedAt':'2026-10-12'}
        header='Rural Development Department Rs. in Thousands 2024-2025 2025-2026 2026-2027 Revised Estimates'
        pages=[{'page':p,'lines':[{'line':1,'text':header}]} for p in [3,4]]
        pages[0]['lines'].append({'line':2,'text':'2810, New and Renewable Energy    Voted .. 1,00 1 .. other language'})
        rows=maharashtra_rural_heads(doc,{'pages':pages})
        self.assertEqual(rows[0]['amountRupees'],'100000.00')
        self.assertEqual(rows[1]['amountRupees'],'1000.00')
        self.assertIsNone(rows[2]['amountRupees'])
        self.assertEqual(rows[2]['sourceTotal'],'--')

    def test_assam_wrong_fiscal_edition_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'edition/unit'):
            assam_major_heads({}, {'pages':[{'page':1,'lines':[{'line':1,'text':'STATEMENT OF EXPENDITURE 2024-25 Rupees in Lakhs'}]}]})

    def test_explicit_index_refresh_preserves_both_originals_and_earlier_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);base=root/'data/acquisition/state-development'
            state={'code':'28','name':'Andhra Pradesh','sources':[{'id':'budget-index','kind':'budget_index','label':'Official budget index','url':'https://example.invalid/budget'}]}
            (base/'plan.json').parent.mkdir(parents=True);(base/'plan.json').write_text(json.dumps({'states':[state]}))
            originals=[b'<p>First official edition</p>',b'<p>Revised official edition</p>']
            def download(command,**kwargs):
                Path(command[command.index('--dump-header')+1]).write_text('HTTP/1.1 200 OK\n')
                Path(command[command.index('-o')+1]).write_bytes(originals.pop(0))
                return SimpleNamespace(returncode=0,stderr='')
            with patch.object(collection,'ROOT',root),patch.object(collection,'BASE',base),patch.object(collection.subprocess,'run',side_effect=download) as request:
                collection.collect(state)
                collection.collect(state)
                self.assertEqual(request.call_count,1)
                collection.collect(state,refresh_indexes=True)
                self.assertEqual(request.call_count,2)
                cp=json.loads((base/'28/checkpoint.json').read_text())
                self.assertEqual(len(cp['documents']),1)
                self.assertEqual(len(cp['previousEditions']),1)
                prior=cp['previousEditions'][0];current=cp['documents'][0]
                self.assertNotEqual(prior['sha256'],current['sha256'])
                self.assertEqual((root/prior['original']).read_bytes(),b'<p>First official edition</p>')
                self.assertEqual((root/current['original']).read_bytes(),b'<p>Revised official edition</p>')
                self.assertFalse(cp['completeCoverage'])

    def test_linked_report_sends_its_same_host_index_as_referer(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);base=root/'data/acquisition/state-development';sent=[]
            def download(command,**kwargs):
                sent.append(command[command.index('--referer')+1] if '--referer' in command else None)
                Path(command[command.index('--dump-header')+1]).write_text('HTTP/1.1 200 OK\n')
                Path(command[command.index('-o')+1]).write_bytes(b'%PDF-1.4 department book')
                return SimpleNamespace(returncode=0,stderr='')
            index='https://beams.example.invalid/MISRPT/dept.html'
            with patch.object(collection,'ROOT',root),patch.object(collection,'BASE',base),patch.object(collection.subprocess,'run',side_effect=download):
                _,receipt=collection.fetch({'id':'book','kind':'budget','label':'Department book','url':'https://beams.example.invalid/Books/A-Dept.pdf','contextUrl':index},{'code':'27','name':'Maharashtra'})
                self.assertEqual(sent,[index]);self.assertEqual(receipt['requestReferer'],index)
                for n,other in enumerate(['https://other.example.invalid/sources',None]):
                    source={'id':f'book-{n}','kind':'budget','label':'Department book','url':f'https://beams.example.invalid/Books/{n}-Dept.pdf'}
                    if other:source['contextUrl']=other
                    sent.clear();_,receipt=collection.fetch(source,{'code':'27','name':'Maharashtra'})
                    self.assertEqual(sent,[None]);self.assertIsNone(receipt['requestReferer'])

    def test_html_soft_error_at_pdf_url_is_not_accepted_as_financial_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);base=root/'data/acquisition/state-development'
            def download(command,**kwargs):
                Path(command[command.index('--dump-header')+1]).write_text('HTTP/1.1 200 OK\n')
                Path(command[command.index('-o')+1]).write_text('<html>Budget homepage; requested file not found</html>')
                return SimpleNamespace(returncode=0,stderr='')
            with patch.object(collection,'ROOT',root),patch.object(collection,'BASE',base),patch.object(collection.subprocess,'run',side_effect=download):
                with self.assertRaisesRegex(ValueError,'Expected original PDF'):
                    collection.fetch({'id':'budget','kind':'budget','label':'Original','url':'https://example.invalid/budget.pdf'}, {'code':'28','name':'Andhra Pradesh'})
                self.assertFalse((root/'data/originals/state-development').exists())

    def test_exact_amounts_and_missing_not_zero(self):
        self.assertEqual(rupees('34,978.14','crore'),'349781400000.00')
        self.assertEqual(rupees('-0.01','crore'),'-100000.00')
        self.assertIsNone(rupees('-','crore'))
        self.assertEqual(rupees('0.00','lakh'),'0.00')
        with self.assertRaises(ValueError): rupees('0.001','rupee')
        self.assertEqual(rupees('29,662,705','thousand'),'29662705000.00')

    def test_goa_lakhs_and_debt_context_do_not_become_development_or_payments(self):
        labels={6:'Revenue Expenditure (7 to 8)',7:'Interest Payment',8:'Other Revenue Spending',
                15:'Capital Expenditure',16:'Capital Spending',17:'Repayment of Debt',18:'Lending'}
        lines=[{'line':1,'text':'FIGURES AT A GLANCE Rs. in lakhs 2024-2025 2025-2026 2026-2027 Revised Estimates'}]
        lines += [{'line':n+1,'text':f'{n} {labels.get(n,"Context receipt")}    10.00 20.00 30.00 40.00'} for n in range(1,22)]
        doc={'stateCode':'30','sha256':'c'*64,'url':'https://example.invalid/budget','retrievedAt':'2026-10-12T00:00:00Z'}
        rows=goa_glance(doc,{'pages':[{'page':2,'lines':lines}]})
        self.assertEqual(len(rows),21)
        latest=next(r for r in rows if r['sourceRow']==16 and r['financialYear']=='2026-2027')
        self.assertEqual(latest['amountRupees'],'4000000.00')
        self.assertEqual(latest['parentSourceRow'],15)
        self.assertEqual(next(r for r in rows if r['sourceRow']==17)['classification'],'debt_servicing_context')
        lines[0]['text']=lines[0]['text'].replace('lakhs','crores')
        with self.assertRaises(ValueError):goa_glance(doc,{'pages':[{'page':2,'lines':lines}]})

    def test_manipur_rejects_previous_year_actual_and_later_repeated_row_number(self):
        lines=[{'line':1,'text':'CONSOLIDATED STATEMENT Rs in crore 2024-25 2025-26 2026-27 Actual BE RE'}]
        for group,label in [('2','REVENUE EXPENDITURE'),('5','CAPITAL EXPENDITURE')]:
            lines.append({'line':len(lines)+1,'text':f'{group}. {label}    1.00 2.00 30.00 40.00 50.00'})
            lines += [{'line':len(lines)+n,'text':f'{group}.{n} Subcategory    1.00 2.00 3.00 4.00 5.00'} for n in range(1,6)]
            if group=='2':lines.append({'line':20,'text':'3. CAPITAL RECEIPTS'})
        lines += [{'line':30,'text':'A. TOTAL RECEIPTS'}, {'line':31,'text':'2. Loans and Advances from GOI    1.00 2.00 900.00 999.00 1000.00'}]
        doc={'stateCode':'14','sha256':'d'*64,'url':'https://example.invalid/budget','retrievedAt':'2026-10-12T00:00:00Z'}
        rows=manipur_glance(doc,{'pages':[{'page':3,'lines':lines}]})
        self.assertEqual(len(rows),36)
        self.assertEqual(len({r['id'] for r in rows}),36)
        first=next(r for r in rows if r['sourceRow']=='2.' and r['financialYear']=='2025-2026' and r['estimate']=='original')
        self.assertEqual(first['amountRupees'],'300000000.00')
        self.assertFalse(any('GOI' in r['purposeLabel'] for r in rows))

    def test_arithmetic_matches_and_differences_do_not_approve_publication(self):
        rows=[{'amountRupees':'100.00'},{'amountRupees':'200.00'}]
        matched=table_check(rows,'300.00','rupee','Scoped control')
        self.assertEqual(matched['status'],'matched')
        self.assertFalse(matched['publicationApproved'])
        self.assertFalse(matched['isDevelopmentTotal'])
        conflict=table_check(rows,'301.00','rupee','Scoped control')
        self.assertEqual(conflict['differenceRupees'],'-1.00')
        self.assertEqual(conflict['status'],'difference_requires_review')
        self.assertIsNone(table_check([{'amountRupees':None}],'0','rupee','Missing')['calculatedRupees'])

    def test_awarded_work_is_not_assigned_a_payment_or_year(self):
        doc={'sha256':'a'*64,'stateCode':'28','url':'https://example.invalid/awards','retrievedAt':'2026-10-12T00:00:00Z'}
        rows=source_projects(doc,{'tables':[{'table':1,'rows':[['S.No','Tender ID','Description','Successful Bidder'],['1','1234','School construction','Documented Contractor Ltd']]}]})
        self.assertEqual(rows[0]['sourceProjectId'],'1234')
        self.assertIsNone(rows[0]['paymentAmountRupees'])
        self.assertIsNone(rows[0]['financialYear'])
        self.assertIsNone(rows[0]['awardDate'])

    def test_html_preserves_separate_financial_rows_without_scripts(self):
        p=DocumentHTML();p.feed('<script>secret()</script><table><tr><th>Measure</th><th>Amount</th></tr><tr><td>Budget</td><td>20.00</td></tr><tr><td>Expenditure</td><td>5.00</td></tr></table><a href="a.pdf">Annual report</a>')
        self.assertNotIn('secret()',p.text)
        self.assertEqual(len(p.tables[0]),3)
        self.assertEqual(p.links[0]['href'],'a.pdf')
        self.assertFalse(blocked('Enter CAPTCHA to search tenders'))
        self.assertTrue(blocked('Request rejected. Access denied.'))

    def test_nested_procurement_layout_retains_the_actual_tender_grid(self):
        p=DocumentHTML();p.feed('<table><tr><td>Page layout<table><tr><th>Tender Title</th><th>Reference No</th></tr><tr><td>School construction</td><td>WORK-2026-1</td></tr></table></td></tr></table>')
        grid=next(t for t in p.tables if t[0]==['Tender Title','Reference No'])
        self.assertEqual(grid[1],['School construction','WORK-2026-1'])

    def test_monthly_actuals_keep_their_cutoff_and_reject_column_misalignment(self):
        doc={'sha256':'a'*64,'stateCode':'10','url':'https://example.invalid/accounts','retrievedAt':'2026-10-12T00:00:00Z'}
        rows=[{'line':1,'text':'ACCOUNTS AT A GLANCE (At the end of March 2026) (₹ in Crores)'},{'line':2,'text':'5. Capital Expenditure (a+b)      100.00    80.00    80.00    70.00'}]
        result=monthly_accounts(doc,{'pages':[{'lines':rows}]})
        self.assertEqual(result[0]['financialYear'],'2025-2026')
        self.assertEqual(result[0]['periodEnd'],'2026-03-31')
        self.assertEqual(result[0]['amountRupees'],'800000000.00')
        self.assertEqual(result[0]['classification'],'broad_financial_context')
        rows[1]['text']='5. Capital Expenditure (a+b)      100.00    80.00    5.00    70.00'
        self.assertEqual(monthly_accounts(doc,{'pages':[{'lines':rows}]}),[])

    def test_assam_actual_column_is_requested_year_lakhs_with_production_caveat(self):
        doc={'sha256':'a'*64,'url':'https://testfin.assam.gov.in/report','retrievedAt':'2026-10-12T00:00:00Z'}
        lines=[{'line':1,'text':'ABSTRACT REPORT OF STATE EXPENDITURE - 2025-26 Amounts in Lakhs 2025-04-01 to 2026-03-31'},
               {'line':2,'text':'REVENUE ACCOUNT'},{'line':3,'text':'B. SOCIAL SERVICES'},
               {'line':4,'text':'(a) Education      100.00 110.00 90.00 95.25 95.25 86.59 5.83 90.00'}]
        result=assam_sector_expenditure(doc,{'pages':[{'page':1,'lines':lines}]})
        self.assertEqual(result[0]['amountRupees'],'9525000.00')
        self.assertEqual(result[0]['sourceOriginalBudget'],'100.00')
        self.assertEqual(result[0]['reviewStatus'],'awaiting_production_source_confirmation')
        lines[0]['text']=lines[0]['text'].replace('Lakhs','Crores')
        with self.assertRaises(ValueError): assam_sector_expenditure(doc,{'pages':[{'page':1,'lines':lines}]})

    def test_monthly_supplementary_and_split_headers_preserve_fiscal_cutoff(self):
        doc={'sha256':'b'*64,'stateCode':'12','url':'https://example.invalid/mki','retrievedAt':'2026-10-12T00:00:00Z'}
        for title,scope,end in [
            ('At the end of March (S), 2026','Budget Estimates 2025-26','2026-03-31'),
            ('At the end of March-2026','Budget Estimates 2025-26','2026-03-31'),
            ('As at the end of March (P)','Budget Estimates 2025-26 Actuals up to March (P) 2026','2026-03-31'),
            ('At the end of 4, 2026','Budget Estimates 2026-27','2026-04-30')]:
            lines=[{'line':1,'text':f'ACCOUNTS AT A GLANCE ({title}) (in crore) {scope}'},
                   {'line':2,'text':'(5) CAPITAL EXPENDITURE     100.00 20.00 20.00 15.00'}]
            result=monthly_accounts(doc,{'pages':[{'page':1,'lines':lines}]})
            self.assertEqual(result[0]['periodEnd'],end)
            self.assertEqual(result[0]['amountRupees'],'200000000.00')
        lines[0]['text']='ACCOUNTS AT A GLANCE At the end of March (P) (in crore) Budget Estimates 2025-26 and 2026-27'
        self.assertEqual(monthly_accounts(doc,{'pages':[{'page':1,'lines':lines}]}),[])

    def test_telangana_overlapping_tables_are_not_relabelled_as_payments(self):
        def line(n,text): return {'line':n,'text':text}
        pages=[{'page':1,'lines':[line(1,'Budget 2026-27')]},
               {'page':12,'lines':[line(1,'TABLE -7 in Crores Accounts 2023-24 Accounts 2024-25 R.E 2025-26 B.E 2026-27')]+[line(i+2,f'Sector {i}      10.00 20.00 30.00 40.00') for i in range(4)]}]
        for page,start,end in [(15,1,21),(16,21,46),(17,46,70)]:
            pages.append({'page':page,'lines':[line(1,'Table - 10 (Rs.in crore) 2026-27 B.E.')]+[line(i+2,f'{i} Maintenance of Roads      500') for i in range(start,end)]})
        pages.append({'page':18,'lines':[line(1,'Table - 11 (Rs.in crore) Establishment Scheme Grand Total')]+[line(i+2,f'{i} Department {i}      100 200 301') for i in range(1,31)]})
        pages.append({'page':19,'lines':[line(1,'Table - 12 in Crores 2026-27 B.E.')]+[line(i+2,f'{i} Department {i}      50') for i in range(1,29)]})
        doc={'sha256':'a'*64,'url':'https://example.invalid/budget','retrievedAt':'2026-10-12T00:00:00Z'}
        records=telangana_budget(doc,{'pages':pages})
        self.assertEqual(len(records),135)
        self.assertTrue(all(r['measure']=='allocated' for r in records))
        self.assertEqual(records[0]['classification'],'maintenance_or_mixed_requires_review')
        department=next(r for r in records if r['budgetTableScope']=='department_total')
        self.assertEqual(department['printedArithmeticDifferenceCrore'],'1')
        self.assertEqual(department['components'][0]['label'],'Establishment')
        revised=next(r for r in records if r['financialYear']=='2025-2026')
        self.assertEqual(revised['amountRupees'],'300000000.00')
        pages[1]['lines'][0]['text']=pages[1]['lines'][0]['text'].replace('R.E 2025-26','Accounts 2025-26')
        with self.assertRaises(ValueError): telangana_budget(doc,{'pages':pages})

if __name__=='__main__': unittest.main()
