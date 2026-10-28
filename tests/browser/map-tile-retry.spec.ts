import {test,expect} from './preview-fixture';
import sharp from 'sharp';
import encoder from 'vt-pbf';

// A 16×16 grid of synthetic public-facility points covering the whole tile.
const tile=Buffer.from(encoder.fromGeojsonVt({assets:{features:Array.from({length:256},(_,i)=>({id:i,type:1,geometry:[[128+256*(i%16),128+256*Math.floor(i/16)]],tags:{assetId:'browser-retry-'+i,kind:'public'}}))}},{version:2,extent:4096}));

test('individual locations recover after a transient tile failure instead of leaving a hole',async({page},testInfo)=>{
 const attempts=new Map<string,number>(),pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/api/v1/geography',route=>route.fulfill({json:{count:812976,maxzoom:9}}));
 await page.route('**/api/v1/map/assets?**',route=>route.fulfill({json:{total:812976,assets:[]}}));
 // Every tile fails once, as a cold or overloaded tile server would, then succeeds.
 await page.route('**/api/v1/map/asset-tiles/**',route=>{
  const key=new URL(route.request().url()).pathname,n=(attempts.get(key)??0)+1;attempts.set(key,n);
  return n===1?route.fulfill({status:503,json:{error:'Asset geography unavailable'}}):route.fulfill({contentType:'application/vnd.mapbox-vector-tile',body:tile});
 });
 await page.goto('/?explore=1');
 const canvas=page.locator('.map-canvas');
 await expect(canvas).toHaveAttribute('data-zoom',/\d/,{timeout:20000});
 for(let i=0;i<8&&Number(await canvas.getAttribute('data-zoom'))<6.5;i++){
  const before=Number(await canvas.getAttribute('data-zoom'));
  await page.getByRole('button',{name:'Zoom in',exact:true}).first().click();
  await expect.poll(async()=>Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(before+.5);
 }
 await expect.poll(()=>[...attempts.values()].some(n=>n>1),{timeout:15000}).toBe(true);
 const box=(await canvas.boundingBox())!;
 await expect.poll(async()=>{
  const {data,info}=await sharp(await page.screenshot({clip:{x:box.x+box.width/2-150,y:box.y+box.height/2-150,width:300,height:300}})).raw().toBuffer({resolveWithObject:true});
  let dots=0;for(let i=0;i<data.length;i+=info.channels)if(data[i]>140&&data[i]<190&&data[i+1]>225&&data[i+2]<100)dots++;return dots;
 },{timeout:15000}).toBeGreaterThan(40);
 await page.screenshot({path:`tmp/screenshots/map-tile-retry-${testInfo.project.name}.png`});
 expect(pageErrors).toEqual([]);
});
