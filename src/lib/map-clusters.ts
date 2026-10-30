import type {Work} from './model';
export type MapPoint={type:'Feature';geometry:{type:'Point';coordinates:[number,number]};properties:{cluster:boolean;count:number;id?:string;title?:string;purpose?:string;bounds?:[number,number,number,number]}};
export type MapPoints={type:'FeatureCollection';features:MapPoint[];total:number;truncated:boolean};
// Only these two precisions carry a coordinate a reader may treat as the work's place.
const drawable=new Set(['source_point','address']);
export function clusterWorks(works:Work[],bounds:number[]):MapPoints{
 const [west,south,east,north]=bounds;const cells=new Map<string,Work[]>();let total=0;
 for(const w of works){if(!w.location||!drawable.has(w.locationPrecision))continue;const [lng,lat]=w.location;if(lng<west||lng>east||lat<south||lat>north)continue;const key=`${Math.min(15,Math.floor((lng-west)/(east-west)*16))}:${Math.min(15,Math.floor((lat-south)/(north-south)*16))}`;const cell=cells.get(key);if(cell)cell.push(w);else cells.set(key,[w]);total++;}
 // One pass per cell for the centre and the bounds, rather than six over copied arrays.
 const features:MapPoint[]=[];
 for(const rows of cells.values()){
  let sumLng=0,sumLat=0,minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity;
  for(const w of rows){const [lng,lat]=w.location!;sumLng+=lng;sumLat+=lat;if(lng<minLng)minLng=lng;if(lng>maxLng)maxLng=lng;if(lat<minLat)minLat=lat;if(lat>maxLat)maxLat=lat;}
  features.push({type:'Feature',geometry:{type:'Point',coordinates:[sumLng/rows.length,sumLat/rows.length]},properties:rows.length===1?{cluster:false,count:1,id:rows[0].id,title:rows[0].title,purpose:rows[0].purpose}:{cluster:true,count:rows.length,bounds:[minLng,minLat,maxLng,maxLat]}});
 }
 return {type:'FeatureCollection',features,total,truncated:false};
}
