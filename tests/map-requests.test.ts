import {expect,it} from 'vitest';
import {assetTileUrl,isStyleFailure,latestRequest} from '../src/lib/map-requests';

it('cancels the previous selection request whenever a newer one starts',()=>{
  const requests=latestRequest();
  const first=requests.next(),second=requests.next();
  expect(first.aborted).toBe(true);expect(second.aborted).toBe(false);
  requests.cancel();expect(second.aborted).toBe(true);
  expect(requests.next().aborted).toBe(false);
});

it('puts the search in origin-fallback tile URLs only',()=>{
  const base={origin:'http://127.0.0.1:3020',shard:'education',edition:'3c86',kind:'education'};
  expect(assetTileUrl({...base,tileBase:null,query:'panchayat'})).toBe('http://127.0.0.1:3020/api/v1/map/asset-tiles/{z}/{x}/{y}.pbf?q=panchayat&v=3c86&kind=education&shard=education');
  expect(assetTileUrl({...base,tileBase:null,query:'',edition:'',kind:null,shard:'all'})).toBe('http://127.0.0.1:3020/api/v1/map/asset-tiles/{z}/{x}/{y}.pbf?q=');
  expect(assetTileUrl({...base,tileBase:'https://maps.example.com/e1',query:'panchayat'})).toBe('https://maps.example.com/e1/tiles/education/{z}/{x}/{y}.pbf');
});

it('treats only style and style-import failures as fatal before the map loads',()=>{
  expect(isStyleFailure({status:500,url:'https://api.mapbox.com/styles/v1/mapbox/standard-satellite?access_token=pk.x'})).toBe(true);
  for(const url of ['https://api.mapbox.com/fonts/v1/mapbox/DIN Pro Medium/0-255.pbf','https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1.json','http://127.0.0.1:3020/api/v1/map/asset-tiles/7/91/53.pbf'])expect(isStyleFailure({status:500,url})).toBe(false);
  for(const error of [undefined,null,new Error('boom'),{url:42}])expect(isStyleFailure(error)).toBe(false);
});
