import {readFile} from 'node:fs/promises';
import {test,expect} from './preview-fixture';
import {archivedFixture} from './map-fixtures';
test.use({channel:process.env.HISAAB_BROWSER_CHANNEL});
test('source photos take priority, failed photos fall back, and demo figures stay outside the real catalogue',async({page})=>{
 const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect fill="#285c45" width="300" height="160"/><text x="20" y="80" fill="white">Browser test source image</text></svg>');
 const receipt={id:'browser-evidence',title:'Browser fixture only',url:'https://example.invalid/test-source',documentHash:'',locator:'Synthetic browser fixture',retrievedAt:'2026-10-18',rawText:'Not a government record',permission:'Test only'};
 let broken=false;
 await page.route('**/api/v1/works/browser-visual-test',route=>route.fulfill({json:{work:{id:'browser-visual-test',title:'Browser fixture only',purpose:'Water',state:'Karnataka',district:'Test',areaId:'test',financialYear:'2025–26',officialIds:[],location:[77.101,13.34],locationPrecision:'unknown',authority:null,authorityReceipt:null,stages:[],money:[],physicalVerification:'Not independently verified',summary:'Synthetic browser-only fixture',demo:true,roles:[],media:[{id:'test-photo',url:broken?'data:image/png;base64,invalid':photo,kind:'photo',caption:'Browser fixture source photo',date:null,receipt}]}}}));
 await page.goto('/?work=browser-visual-test&explore=1');
 const card=page.getByLabel('Project receipt',{exact:true});
 await expect(card.getByRole('heading',{name:'Browser fixture only',exact:true})).toBeVisible();
 await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis','source_photo');
 await expect(card.locator('.atlas-receipt-money strong')).toHaveText(['—','—','—']);
 const theme=page.locator('.atlas-shell');const initial=await theme.getAttribute('data-theme');
 await page.getByRole('button',{name:initial==='dark'?'Switch to day mode':'Switch to dark mode',exact:true}).click();
 await page.reload();await expect(theme).toHaveAttribute('data-theme',initial==='dark'?'light':'dark');
 broken=true;await page.reload();await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis','map_context',{timeout:45000});
 await card.getByRole('button',{name:'Report an issue',exact:true}).click();
 await expect(page.getByText('Design demonstration only. Do not file fictional work facts.')).toBeVisible();
});

test('recorded locations get a map context preview and a moving connection without a fabricated footprint',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/asset/browser-historical-fixture?explore=1');
 const card=page.getByLabel('Project receipt',{exact:true});await expect(card.getByRole('heading',{name:'Browser archived facility',exact:true})).toBeVisible();
 await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis','map_context',{timeout:45000});
 await expect(card.getByText('Funding not linked',{exact:true})).toBeVisible();
 const link=page.locator('.asset-map-connection');await expect(link).toHaveCSS('opacity','1');
 const before=await link.locator('path').getAttribute('d');
 // A small pan must move the leader's geographic endpoint while preserving the receipt.
 await page.mouse.move(160,270);await page.mouse.down();await page.mouse.move(185,295,{steps:8});await page.mouse.up();
 await expect.poll(()=>link.locator('path').getAttribute('d')).not.toBe(before);
 await expect(card).toBeVisible();expect(errors).toEqual([]);
});

test('View source explains the archived record in the card and downloads only that record',async({page},info)=>{
 const popups:string[]=[],downloads:string[]=[],archive:string[]=[];page.on('popup',p=>popups.push(p.url()));page.on('download',d=>downloads.push(d.suggestedFilename()));
 await page.context().route('https://example.invalid/**',route=>{archive.push(route.request().url());return route.abort();});
 await page.goto('/asset/browser-historical-fixture?explore=1');
 const card=page.getByLabel('Project receipt',{exact:true});await expect(card.getByRole('heading',{name:'Browser archived facility',exact:true})).toBeVisible();
 const source=card.locator('details.atlas-location-source');await expect(source).not.toHaveAttribute('open');
 // The state-wide shapefile archive must never be fetched or opened by the primary action.
 await card.getByRole('button',{name:'View source',exact:true}).click();
 await expect(source).toHaveAttribute('open','');await expect(source.locator('summary')).toBeFocused();await expect.poll(()=>card.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 for(const text of ['Source file','synthetic-browser-fixture','Shapefile record 1','Synthetic browser response','Browser fixture only','a'.repeat(64),'Unreviewed source coordinate','does not show sanctioned funds, contracts or payments'])await expect(source).toContainText(text);
 await expect(source.getByRole('link',{name:'Full Test state source archive (.zip shapefile — opens in GIS software such as QGIS)'})).toHaveAttribute('href',archivedFixture.sourceUrl);
 expect(popups).toEqual([]);expect(downloads).toEqual([]);expect(archive).toEqual([]);
 await card.evaluate(el=>new Promise(done=>{let last=-1;const settle=()=>{if(el.scrollTop===last)return done(null);last=el.scrollTop;setTimeout(settle,150);};settle();}));
 await expect(source.locator('summary')).toBeInViewport();await page.screenshot({path:`tmp/screenshots/asset-source-view-${info.project.name}.png`});
 const [download]=await Promise.all([page.waitForEvent('download'),source.getByRole('button',{name:'Download this record (GeoJSON)',exact:true}).click()]);
 expect(download.suggestedFilename()).toBe('hisaab-asset-browser-historical-fixture.geojson');
 const record=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(record).toMatchObject({type:'FeatureCollection',features:[{type:'Feature',id:archivedFixture.id,geometry:archivedFixture.geometry,properties:{...archivedFixture.sourceFields,hisaab_id:archivedFixture.id,hisaab_title:archivedFixture.title,hisaab_kind:archivedFixture.kind,hisaab_state:archivedFixture.state,source_file:archivedFixture.sourceFile,source_record:1,source_url:archivedFixture.sourceUrl,source_sha256:archivedFixture.sourceHash,location_verification:'unreviewed_source_coordinate',spending_linked:false,hisaab_note:expect.stringContaining('unreviewed source coordinates')}}]});
 expect(record.features).toHaveLength(1);expect(popups).toEqual([]);expect(archive).toEqual([]);
});
