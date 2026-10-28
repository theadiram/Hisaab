import {describe,it,expect} from 'vitest';
import {assetRecordGeoJson,assetRecordFile,assetRecordNote} from '../src/lib/asset-record';
import type {AssetDetail} from '../src/lib/asset-geography';
const facility:AssetDetail={id:'393f3d1edd43010ed2c8:726',kind:'public',title:'Fuel station',category:'Transport/Admin',state:'Karnataka',location:[75.060055218637,15.53869325202],sourceIdentity:'446567',sourceRow:726,sourceHash:'393f3d1edd43010ed2c81fe1da56f9b2851373ef0e229f4e2430a77a538df46d',sourceUrl:'https://raw.githubusercontent.com/datameet/pmgsy-geosadak/ae9940c94ea61ebb1503952622b990aa1f0ec9d6/data/Facilities/Karnataka.zip',sourceFile:'data/Facilities/Karnataka.zip',geometry:{type:'Point',coordinates:[75.060055218637,15.53869325202]},sourceFields:{HAB_ID:34161,STATE_ID:17,DISTRICT_I:149,BLOCK_ID:1600,FACILITY_I:446567,FAC_DESC:'Fuel station',FAC_CATEGO:'Transport/Admin'},edition:'2022 archived mirror',delivery:'DataMeet mirror; not a live government download',textReview:false,locationVerification:'unreviewed_source_coordinate',spendingLinked:false,photos:[],buildingFootprint:null};
describe('single asset record export',()=>{
 it('keeps one record with its exact geometry, original attributes and provenance',()=>{
  const collection=assetRecordGeoJson(facility),[feature]=collection.features;
  expect(collection.type).toBe('FeatureCollection');expect(collection.features).toHaveLength(1);
  expect(feature.id).toBe(facility.id);expect(feature.geometry).toEqual({type:'Point',coordinates:[75.060055218637,15.53869325202]});
  expect(feature.properties).toMatchObject({...facility.sourceFields,hisaab_id:facility.id,hisaab_title:'Fuel station',hisaab_kind:'public',hisaab_state:'Karnataka',source_file:'data/Facilities/Karnataka.zip',source_record:726,source_identity:'446567',source_url:facility.sourceUrl,source_sha256:facility.sourceHash,source_edition:'2022 archived mirror',source_delivery:facility.delivery});
 });
 it('states that the coordinate is unreviewed and that nothing implies spending',()=>{
  const {properties}=assetRecordGeoJson(facility).features[0];
  expect(properties).toMatchObject({location_verification:'unreviewed_source_coordinate',spending_linked:false,hisaab_note:assetRecordNote});
  expect(assetRecordNote).toMatch(/unreviewed source coordinates/);expect(assetRecordNote).toMatch(/does not establish sanctioned funds, contracts, payments/);
 });
 it('preserves road lines and never lets a source column overwrite provenance',()=>{
  const line:GeoJSON.LineString={type:'LineString',coordinates:[[77.1,13.3],[77.2,13.31],[77.25,13.4]]};
  const road={...facility,id:'road:1',kind:'road',geometry:line,sourceFields:{PMGSY_ID:'KA-1',note:'Original remark',source_file:'forged.zip',spending_linked:'yes'}};
  const {geometry,properties}=assetRecordGeoJson(road).features[0];
  expect(geometry).toEqual(line);expect(properties).toMatchObject({PMGSY_ID:'KA-1',note:'Original remark',source_file:'data/Facilities/Karnataka.zip',spending_linked:false});
 });
 it('falls back to the source point and fills missing provenance with null instead of dropping columns',()=>{
  const partial={...facility,geometry:undefined,delivery:undefined,sourceFile:undefined} as unknown as AssetDetail;
  const {geometry,properties}=assetRecordGeoJson(partial).features[0];
  expect(geometry).toEqual({type:'Point',coordinates:facility.location});expect(properties).toHaveProperty('source_delivery',null);expect(properties).toHaveProperty('source_file',null);
 });
 it('names a safe GeoJSON file whose body parses back to the same collection',()=>{
  const file=assetRecordFile(facility);
  expect(file).toMatchObject({name:'hisaab-asset-393f3d1edd43010ed2c8-726.geojson',type:'application/geo+json'});
  expect(JSON.parse(file.body)).toEqual(assetRecordGeoJson(facility));
  expect(assetRecordFile({...facility,id:'../a b/:'}).name).toBe('hisaab-asset-a-b.geojson');expect(assetRecordFile({...facility,id:'::'}).name).toBe('hisaab-asset-record.geojson');
 });
});
