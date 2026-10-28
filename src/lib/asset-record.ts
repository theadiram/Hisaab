import type {AssetDetail} from './asset-geography';

// A single archived asset as a standalone GeoJSON file. Source archives are
// state-wide shapefile bundles; this keeps one record's original geometry and
// attributes together with the provenance needed to trace it back.
export const assetRecordNote='Archived source location only. Coordinates are unreviewed source coordinates and have not been independently verified. This record does not establish sanctioned funds, contracts, payments or completion.';
export function assetRecordGeoJson(asset:AssetDetail):GeoJSON.FeatureCollection{
 // Provenance is written after the original attributes so a source column can never overwrite it.
 const properties={...asset.sourceFields,hisaab_id:asset.id,hisaab_title:asset.title,hisaab_kind:asset.kind,hisaab_state:asset.state,source_file:asset.sourceFile??null,source_record:asset.sourceRow??null,source_identity:asset.sourceIdentity??null,source_url:asset.sourceUrl??null,source_sha256:asset.sourceHash??null,source_edition:asset.edition??null,source_delivery:asset.delivery??null,location_verification:'unreviewed_source_coordinate',spending_linked:false,hisaab_note:assetRecordNote};
 return {type:'FeatureCollection',features:[{type:'Feature',id:asset.id,geometry:asset.geometry??{type:'Point',coordinates:asset.location},properties}]};
}
export function assetRecordFile(asset:AssetDetail){return {name:'hisaab-asset-'+(asset.id.replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'record')+'.geojson',type:'application/geo+json',body:JSON.stringify(assetRecordGeoJson(asset),null,2)+'\n'};}
// Browser-only: saves the file locally without contacting any server.
export function saveAssetRecord(asset:AssetDetail){const file=assetRecordFile(asset),url=URL.createObjectURL(new Blob([file.body],{type:file.type})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
