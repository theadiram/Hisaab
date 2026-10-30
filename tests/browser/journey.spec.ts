import {test,expect} from './preview-fixture';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {createHash} from 'node:crypto';
test('private observation can be tracked and deleted; cross-origin creation fails',async({page,request})=>{await page.goto('/asset/browser-historical-fixture');await page.getByRole('button',{name:'Report an issue',exact:true}).click();await page.getByLabel('What did you observe?').fill('Demonstration observation, no actual road claim.');await page.getByLabel('Observation date').fill('2026-10-04');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save private observation'}).click();await expect(page.getByRole('heading',{name:'Saved privately'})).toBeVisible();await page.getByRole('button',{name:'Open tracking'}).click();await expect(page.getByText('Observation saved privately')).toBeVisible();await expect(page.getByText('Official submission not recorded')).toBeVisible();await page.getByRole('button',{name:'Delete this private report'}).click();await expect(page.getByText('Private report deleted.')).toBeVisible();const r=await request.post('/api/v1/reports',{headers:{Origin:'https://attacker.example'},data:{}});expect(r.status()).toBe(403);});
test('private session survives refresh and deletion clears its cookie',async({page,request})=>{
 await page.goto('/?preview=design');
 const created=await page.request.post('/api/v1/reports',{headers:{Origin:'http://127.0.0.1:3000'},data:{workId:null,description:'Disposable session persistence verification.',observedDate:'2026-10-04',consent:true,demo:true}});
 expect(created.status()).toBe(201);const data=await created.json();
 await page.goto(data.trackingUrl);await expect(page.getByText('Observation saved privately')).toBeVisible();
 expect(page.url()).not.toContain('#track=');await page.reload();await page.getByRole('button',{name:'My private reports',exact:true}).click();await expect(page.getByText('Observation saved privately')).toBeVisible();
 expect((await request.get('/api/v1/reports/session')).status()).toBe(401);
 await page.getByRole('button',{name:'Delete this private report'}).click();await expect(page.getByText('Private report deleted.')).toBeVisible();
 expect((await page.request.get('/api/v1/reports/session')).status()).toBe(401);
 expect((await page.context().cookies()).some(c=>c.name==='hisaab_case')).toBe(false);
});

test('private photographs can be viewed only by their own case and are removed on deletion',async({page,request})=>{
 const origin={Origin:'http://127.0.0.1:3000'};
 const create=async(client:typeof request)=>{const r=await client.post('/api/v1/reports',{headers:origin,data:{workId:null,description:'Disposable photograph privacy verification.',observedDate:'2026-10-04',consent:true,demo:true}});expect(r.status()).toBe(201);return (await r.json()).trackingUrl.split('#track=')[1] as string;};
 const token=await create(page.request);const other=await create(request);
 try{
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'#1475dd'}}).png().toBuffer();
  const uploaded=await page.request.post('/api/v1/reports/media',{headers:{...origin,'X-Hisaab-Capability':token},multipart:{file:{name:'disposable.png',mimeType:'image/png',buffer:photo}}});expect(uploaded.status()).toBe(201);const metadata=await uploaded.json();expect(metadata.public).toBe(false);
  const rejected=await page.request.post('/api/v1/reports/media',{headers:{...origin,'X-Hisaab-Capability':token},multipart:{file:{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('not an image')}}});expect(rejected.status()).toBe(400);
  await page.request.post('/api/v1/reports/session',{headers:origin,data:{token}});
  const preview=await page.request.get(`/api/v1/reports/media/${metadata.id}`);expect(preview.status()).toBe(200);expect(preview.headers()['content-type']).toBe('image/webp');expect(preview.headers()['cache-control']).toContain('no-store');
  expect((await request.get(`/api/v1/reports/media/${metadata.id}`)).status()).toBe(401);
  await request.post('/api/v1/reports/session',{headers:origin,data:{token:other}});
  expect((await request.get(`/api/v1/reports/media/${metadata.id}`)).status()).toBe(404);
  await page.goto('/?preview=design');await page.getByRole('button',{name:'My private reports',exact:true}).click();await expect(page.getByRole('img',{name:'Your observation photograph 1'})).toBeVisible();
  await page.request.delete('/api/v1/reports/session',{headers:origin});
  expect((await page.request.get(`/api/v1/reports/media/${metadata.id}`)).status()).toBe(401);
 }finally{await page.request.post('/api/v1/reports/session',{headers:origin,data:{token}});await page.request.delete('/api/v1/reports/session',{headers:origin});await request.post('/api/v1/reports/session',{headers:origin,data:{token:other}});await request.delete('/api/v1/reports/session',{headers:origin});}
});
test('dialogs contain keyboard focus and return it to the opening control',async({page})=>{
 await page.goto('/?preview=design');const opener=page.getByRole('button',{name:'About the data'});await opener.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:'Close dialog'})).toBeFocused();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close dialog'})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();expect(await page.locator('.atlas-header').evaluate(element=>(element as HTMLElement).inert)).toBe(false);
});

test('private case updates survive refresh and cannot be read or forged by another visitor',async({page,request})=>{
 const headers={Origin:'http://127.0.0.1:3000'};const created=await page.request.post('/api/v1/reports',{headers,data:{workId:null,description:'Disposable follow-up test, no actual claim.',observedDate:'2026-10-04',consent:true,demo:true}});expect(created.status()).toBe(201);const data=await created.json();
 try{await page.goto(data.trackingUrl);await expect(page.getByText('Observation saved privately')).toBeVisible();await page.getByText('Add a private update',{exact:true}).click();await page.getByLabel('Update type').selectOption('citizen_reported_submission');await page.getByLabel('Date',{exact:true}).fill('2026-10-04');await page.getByLabel('Details',{exact:true}).fill('Disposable claimed submission for privacy testing.');await page.getByLabel('Authority reference, if any').fill('TEST-PRIVATE');await page.getByRole('button',{name:'Save private update'}).click();await expect(page.getByText('Private update saved.')).toBeVisible();await page.reload();await page.getByRole('button',{name:'My private reports',exact:true}).click();await expect(page.getByText('Disposable claimed submission for privacy testing.')).toBeVisible({timeout:20000});expect((await request.get('/api/v1/reports/events')).status()).toBe(401);const forged=await page.request.post('/api/v1/reports/events',{headers,data:{type:'independently_verified',description:'Forged verification must never be accepted.',date:'2026-10-04'}});expect(forged.status()).toBe(400);
 }finally{await page.request.delete('/api/v1/reports/session',{headers});}
});
test('administrator reviews require MFA even in the local preview',async({page,request})=>{await page.goto('/admin');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();expect((await request.get('/api/v1/admin/review')).status()).toBe(401);expect((await request.get('/api/v1/admin/corrections')).status()).toBe(401);expect((await request.post('/api/v1/admin/review',{headers:{Origin:'http://127.0.0.1:3000'},data:{id:'fake',reason:'Cannot publish with only preview access.',confirmed:true}})).status()).toBe(401);});

test('reviewed draft exports as a paginated PDF and rejects cross-origin export',async({request})=>{
 const data={draft:'Reviewed citizen draft with amount ₹1,234.50.\n'+('This is a fictional record for layout verification. '.repeat(220)),kind:'rti',demo:true};
 const result=await request.post('/api/v1/packets',{headers:{Origin:'http://127.0.0.1:3000'},data});expect(result.status()).toBe(200);expect(result.headers()['content-type']).toBe('application/pdf');expect(result.headers()['cache-control']).toContain('no-store');
 const pdf=await PDFDocument.load(await result.body());expect(pdf.getPageCount()).toBeGreaterThan(1);expect(pdf.getTitle()).toBe('Hisaab citizen draft');
 expect((await request.post('/api/v1/packets',{headers:{Origin:'https://attacker.example'},data})).status()).toBe(403);
});
test('acknowledgement PDFs preserve original bytes and remain private to their case',async({page,request})=>{
 const headers={Origin:'http://127.0.0.1:3000'};const create=async(client:typeof request)=>{const r=await client.post('/api/v1/reports',{headers,data:{workId:null,description:'Disposable acknowledgement privacy test.',observedDate:'2026-10-04',consent:true,demo:true}});expect(r.status()).toBe(201);return (await r.json()).trackingUrl.split('#track=')[1] as string;};
 const token=await create(page.request),other=await create(request);
 try{
  await page.request.post('/api/v1/reports/session',{headers,data:{token}});const doc=await PDFDocument.create();doc.addPage().drawText('Disposable acknowledgement: unverified citizen evidence.');const bytes=Buffer.from(await doc.save());
  const upload=await page.request.post('/api/v1/reports/attachments',{headers,multipart:{acknowledgement:'true',file:{name:'test-acknowledgement.pdf',mimeType:'application/pdf',buffer:bytes}}});expect(upload.status()).toBe(201);const item=await upload.json();expect(item.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  const url=`/api/v1/reports/attachments/${item.id}`;const own=await page.request.get(url);expect(own.status()).toBe(200);expect(await own.body()).toEqual(bytes);expect(own.headers()['content-disposition']).toContain('attachment');expect(own.headers()['content-security-policy']).toContain('sandbox');
  const events=await (await page.request.get('/api/v1/reports/events')).json();expect(JSON.stringify(events)).toContain('acknowledgement_uploaded');expect(JSON.stringify(events)).toContain('not been independently verified');
  expect((await request.get(url)).status()).toBe(401);await request.post('/api/v1/reports/session',{headers,data:{token:other}});expect((await request.get(url)).status()).toBe(404);
  const bad=await page.request.post('/api/v1/reports/attachments',{headers,multipart:{file:{name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid PDF')}}});expect(bad.status()).toBe(400);
  expect((await page.request.delete('/api/v1/reports/session',{headers})).status()).toBe(200);expect((await page.request.get(url)).status()).toBe(401);expect((await page.request.post('/api/v1/reports/session',{headers,data:{token}})).status()).toBe(404);
 }finally{await page.request.post('/api/v1/reports/session',{headers,data:{token}});await page.request.delete('/api/v1/reports/session',{headers});await request.post('/api/v1/reports/session',{headers,data:{token:other}});await request.delete('/api/v1/reports/session',{headers});}
});
