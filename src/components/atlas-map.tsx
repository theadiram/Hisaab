'use client';
import {useEffect,useRef,useState} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type {Work} from '@/lib/model';
import type {AssetDetail} from '@/lib/asset-geography';
import type {FundingOverview} from '@/lib/funding';
import {FundingMapLayer} from './funding-map-layer';
import {AssetMapLayer} from './asset-map-layer';
import {Selection3D} from './selection-3d';
import {AssetMapConnection} from './asset-map-connection';
import {useLocationPreview} from './use-location-preview';
import type {MapPreview} from './asset-visual';
import {silhouettePath} from '@/lib/map-silhouette';
import {loadMapBoundary} from '@/lib/map-boundaries';

export type MapAction={sequence:number;type:'in'|'out'|'north'|'india'|'terrain'|'satellite'|'streets'|'day'|'dusk'|'night'|'perspective'};
export function AtlasMap({exploring,states,state,year,purpose,query,layers,onState,onAsset,onWork,onExplore,onViewport,action,asset,work,locationSelected=false,theme='dark',onPreview,onMapReady,onProjectStatus,onAssetStatus,cameraControlled=false,contentMode=false,contentFrame='screen'}:{exploring:boolean;states:FundingOverview['states'];state:string|null;year:string;purpose:string;query:string;layers:{funding:boolean;projects:boolean;historical:boolean};onState:(code:string)=>void;onAsset:(asset:AssetDetail)=>void;onWork:(work:Work)=>void;onExplore:()=>void;onViewport:(bounds:number[])=>void;action:MapAction|null;asset:AssetDetail|null;work:Work|null;locationSelected?:boolean;theme?:'light'|'dark';onPreview:(p:MapPreview|null)=>void;onMapReady?:(m:mapboxgl.Map|null)=>void;onProjectStatus?:(status:string)=>void;onAssetStatus?:(status:string)=>void;cameraControlled?:boolean;contentMode?:boolean;contentFrame?:string}) {
 const node=useRef<HTMLDivElement>(null),map=useRef<mapboxgl.Map|null>(null),callbacks=useRef({onExplore,onWork,onState,onViewport}),projectStatus=useRef(onProjectStatus);projectStatus.current=onProjectStatus;const reportProjectStatus=(value:string)=>{setStatus(value);projectStatus.current?.(value);};const [ready,setReady]=useState(false),[error,setError]=useState(''),[viewport,setViewport]=useState<number[]|null>(null),[status,setStatus]=useState(''),[style,setStyle]=useState('satellite'),[requestedStyle,setRequestedStyle]=useState<'satellite'|'streets'>('satellite'),[projectChoices,setProjectChoices]=useState<{id:string;title:string}[]>([]);
 const controlled=useRef(cameraControlled);controlled.current=cameraControlled;const cinematic=useRef(contentMode);cinematic.current=contentMode;const notify=useRef(onMapReady);notify.current=onMapReady;
 const lighting=useRef<'day'|'dusk'|'night'>(theme==='dark'?'dusk':'day');
 useLocationPreview(map.current,ready,work?.id??asset?.id??null,work?.location??asset?.location??null,onPreview);
 callbacks.current={onExplore,onWork,onState,onViewport};
 const viewportKey=useRef('');const exploringRef=useRef(exploring);exploringRef.current=exploring;
 useEffect(()=>{
  if(!node.current)return;const token=process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;if(!token?.startsWith('pk.')){setError('Map imagery is unavailable. Explore states and projects using the list.');return;}
  try{const m=new mapboxgl.Map({container:node.current,accessToken:token,style:{version:8,glyphs:'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',sources:{},layers:[],imports:[{id:'basemap',url:'mapbox://styles/mapbox/standard-satellite',config:{lightPreset:lighting.current,showPointOfInterestLabels:false}}]},language:'en',worldview:'IN',projection:'mercator',center:[79,23],zoom:3.5,maxZoom:19,maxPitch:55,renderWorldCopies:false,antialias:true,logoPosition:'bottom-right'});map.current=m;
   m.getCanvas().style.clipPath='inset(100%)';const resize=new ResizeObserver(()=>{m.resize();const z=m.cameraForBounds([[67.8,6.5],[97.5,37.2]],{padding:55})?.zoom;if(z!==undefined)m.setMinZoom(Math.max(0,Math.min(3,z-.4)));});resize.observe(node.current!);
   const bounds=()=>{if(node.current){node.current.dataset.zoom=String(m.getZoom());node.current.dataset.center=m.getCenter().toArray().join(',');node.current.dataset.pitch=String(m.getPitch());}const b=m.getBounds();if(!b)return;const bounds=[Math.max(-180,b.getWest()),Math.max(-90,b.getSouth()),Math.min(180,b.getEast()),Math.min(90,b.getNorth())];const key=bounds.join(',');if(key!==viewportKey.current){viewportKey.current=key;setViewport(bounds);callbacks.current.onViewport(bounds);}if(m.getZoom()>=6&&!exploringRef.current)callbacks.current.onExplore();};m.on('moveend',bounds);
   m.on('load',()=>{
    // Clip imagery to India while the photographic backdrop stays screen-fixed.
    // Map controls and attribution remain outside the clipped canvas.
    void loadMapBoundary('india').then((geo)=>{
     if(map.current!==m)return;
     (m.getSource('hisaab-india-display') as mapboxgl.GeoJSONSource).setData(geo);
     const outline=geo.features.find(f=>f.properties?.role==='outline');
     if(outline?.geometry.type!=='MultiPolygon')throw new Error('India outline unavailable');
     // Project the boundary with the exact matrix used for this frame. Clip
     // behind-camera vertices before perspective division, including at borders.
     const polygons=outline.geometry.coordinates.map(p=>p.map(r=>r.map(c=>{const v=mapboxgl.MercatorCoordinate.fromLngLat([c[0],c[1]]);return [v.x,v.y,0] as [number,number,number];})));
     let previous='';
     m.addLayer({id:'hisaab-screen-silhouette',type:'custom',renderingMode:'2d',render(_gl,matrix){
      const canvas=m.getCanvas(),container=m.getContainer();
      const path=silhouettePath(polygons,matrix,container.clientWidth,container.clientHeight);
      if(path!==previous){canvas.style.clipPath=path?`path(evenodd, "${path}")`:'inset(100%)';previous=path;}
     }});

    }).catch(()=>{if(map.current===m)setError('The India boundary could not load. Reload the map or use the state and project lists.');});
    m.addSource('hisaab-india-display',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'<a href="https://surveyofindia.gov.in/pages/outline-maps-of-india">India outline: Survey of India</a>'});
    m.addSource('hisaab-dem',{type:'raster-dem',url:'mapbox://mapbox.mapbox-terrain-dem-v1',tileSize:512,maxzoom:14});m.setTerrain({source:'hisaab-dem',exaggeration:1});
    m.addLayer({id:'hisaab-india-clip',type:'clip',source:'hisaab-india-display',filter:['==',['get','role'],'outside'],layout:{'clip-layer-types':['model','symbol'],'clip-layer-scope':['basemap']}});
    m.addLayer({id:'hisaab-outside-india',type:'fill',source:'hisaab-india-display',filter:['==',['get','role'],'outside'],paint:{'fill-color':'#081923','fill-opacity':0,'fill-emissive-strength':1}});
    m.addLayer({id:'hisaab-india-outline',type:'line',source:'hisaab-india-display',filter:['==',['get','role'],'outline'],paint:{'line-color':'#d5e4cd','line-width':1,'line-opacity':.6,'line-emissive-strength':1}});
    m.setMinZoom(0);m.fitBounds([[67.8,6.5],[97.5,37.2]],{padding:{top:90,bottom:60,left:80,right:80},duration:0,pitch:0});m.setMinZoom(Math.min(m.getZoom(),3));m.setMaxBounds([[35,-25],[125,60]]);bounds();setReady(true);notify.current?.(m);
   });
   m.on('error',e=>{if((e.error as Error&{status?:number}).status===401||(e.error as Error&{status?:number}).status===403)setError('The map provider rejected access. The state and project lists remain available.');});
   const lost='The map graphics connection was lost. Use the evidence list or reload.';m.on('webglcontextlost',()=>setError(lost));m.on('webglcontextrestored',()=>setError(current=>current===lost?'':current));
   return()=>{resize.disconnect();notify.current?.(null);m.remove();map.current=null;};
  }catch{setError('This device cannot render the 3D map. The evidence list remains available.');}
 },[]);
 useEffect(()=>{lighting.current=theme==='dark'?'dusk':'day';if(ready&&map.current)map.current.setConfigProperty('basemap','lightPreset',lighting.current);},[theme,ready]);
 useEffect(()=>{if(!ready||!map.current||!action)return;const m=map.current,duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:550;
  if(action.type==='in')m.zoomIn();else if(action.type==='out')m.zoomOut();else if(action.type==='north')m.resetNorth({duration});else if(action.type==='india')m.fitBounds([[67.8,6.5],[97.5,37.2]],{padding:{top:90,bottom:60,left:80,right:80},pitch:0,bearing:0,duration});else if(action.type==='perspective')m.easeTo({pitch:m.getPitch()>25?0:55,duration});else if(action.type==='terrain')m.setTerrain(m.getTerrain()?null:{source:'hisaab-dem',exaggeration:1});else if(['day','dusk','night'].includes(action.type)){lighting.current=action.type as 'day'|'dusk'|'night';m.setConfigProperty('basemap','lightPreset',action.type);}else setRequestedStyle(action.type as 'satellite'|'streets');
 },[action,ready]);
 // An import change must not race in-flight sprite/image-atlas jobs. Queue
 // the latest requested style until the current camera and tile work is idle.
 useEffect(()=>{if(!ready||!map.current)return;const m=map.current;
  const apply=()=>{if(!m.isStyleLoaded()||!m.areTilesLoaded()||m.isMoving())return;m.off('idle',apply);
   const url=requestedStyle==='satellite'?'mapbox://styles/mapbox/standard-satellite':'mapbox://styles/mapbox/standard';
   if(m.getStyle()?.imports?.find(i=>i.id==='basemap')?.url!==url)m.updateImport('basemap',{id:'basemap',url,config:{lightPreset:lighting.current,showPointOfInterestLabels:false}});
   setStyle(requestedStyle);
  };m.on('idle',apply);apply();return()=>{m.off('idle',apply);};
 },[ready,requestedStyle]);
 const previousFrame=useRef(contentFrame);
 useEffect(()=>{const changed=previousFrame.current!==contentFrame;previousFrame.current=contentFrame;if(changed&&contentMode&&ready&&map.current&&!controlled.current&&!asset&&!work&&!state)map.current.fitBounds([[67.8,6.5],[97.5,37.2]],{padding:55,pitch:0,bearing:0,duration:0});},[contentFrame,contentMode,ready,asset,work,state]);
 useEffect(()=>{if(!ready||!state||!map.current||asset||work||locationSelected||controlled.current)return;const c=new AbortController();void loadMapBoundary('states').then((geo)=>{if(c.signal.aborted||!map.current)return;const feature=geo.features.find(f=>f.properties?.code===state);if(!feature)return;const bounds=[Infinity,Infinity,-Infinity,-Infinity];const walk=(v:unknown)=>{if(Array.isArray(v)){if(typeof v[0]==='number'&&typeof v[1]==='number'){bounds[0]=Math.min(bounds[0],v[0]);bounds[1]=Math.min(bounds[1],v[1]);bounds[2]=Math.max(bounds[2],v[0]);bounds[3]=Math.max(bounds[3],v[1]);}else v.forEach(walk);}};if('coordinates' in feature.geometry)walk(feature.geometry.coordinates);if(!bounds.every(Number.isFinite))return;map.current.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:{left:innerWidth>900?470:70,right:80,top:120,bottom:innerWidth<760?Math.min(innerHeight*.38,300):80},pitch:25,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:cinematic.current?2200:850});}).catch(()=>setStatus('State boundary focus is unavailable; select a project from the list.'));return()=>c.abort();},[state,ready,asset,work,locationSelected]);
 useEffect(()=>{if(!ready||!map.current||controlled.current)return;const location=work?.location??asset?.location;if(!location)return;map.current.flyTo({center:location,zoom:16.5,pitch:55,padding:{left:innerWidth>760?80:30,right:innerWidth>1050?550:innerWidth>760?440:30,top:innerWidth<760?190:100,bottom:innerWidth<760?Math.min(innerHeight*.52,470):70},duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:cinematic.current?2200:850});},[asset,work,ready,contentFrame]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;const geometry=asset?.buildingFootprint??asset?.geometry??(work?.location?{type:'Point' as const,coordinates:work.location}:null);if(!geometry)return;
  const install=()=>{if(!m.getStyle())return;if(m.getSource('atlas-selected-geometry'))(m.getSource('atlas-selected-geometry') as mapboxgl.GeoJSONSource).setData({type:'Feature',properties:{},geometry});else m.addSource('atlas-selected-geometry',{type:'geojson',data:{type:'Feature',properties:{},geometry}});
   if(!m.getLayer('atlas-selected-line'))m.addLayer({id:'atlas-selected-line',type:'line',source:'atlas-selected-geometry',filter:['in',['geometry-type'],['literal',['LineString','Polygon']]],paint:{'line-color':'#cafa70','line-width':5,'line-emissive-strength':1}},'hisaab-outside-india');
   if(!m.getLayer('atlas-selected-area'))m.addLayer({id:'atlas-selected-area',type:'fill',source:'atlas-selected-geometry',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#cafa70','fill-opacity':.15,'fill-emissive-strength':1}},'atlas-selected-line');
   if(!m.getLayer('atlas-selected-point'))m.addLayer({id:'atlas-selected-point',type:'circle',source:'atlas-selected-geometry',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#b3ef52','circle-radius':9,'circle-stroke-width':3,'circle-stroke-color':'#fff','circle-emissive-strength':1}},'hisaab-outside-india');
  };install();m.on('style.load',install);return()=>{m.off('style.load',install);if(!m.getStyle())return;for(const id of ['atlas-selected-area','atlas-selected-line','atlas-selected-point'])if(m.getLayer(id))m.removeLayer(id);if(m.getSource('atlas-selected-geometry'))m.removeSource('atlas-selected-geometry');};
 },[asset,work,ready]);
 useEffect(()=>{const m=map.current;if(!m||!ready||!viewport||!exploring||!layers.projects){projectStatus.current?.('');return;}const c=new AbortController();let features:GeoJSON.Feature[]=[];
  const install=()=>{if(c.signal.aborted||!m.getStyle())return;const data:GeoJSON.FeatureCollection={type:'FeatureCollection',features};if(m.getSource('hisaab-reviewed-projects'))(m.getSource('hisaab-reviewed-projects') as mapboxgl.GeoJSONSource).setData(data);else {m.addSource('hisaab-reviewed-projects',{type:'geojson',data});m.addLayer({id:'hisaab-reviewed-projects-dots',type:'circle',source:'hisaab-reviewed-projects',paint:{'circle-color':'#3977ff','circle-radius':['interpolate',['linear'],['zoom'],3,2,12,6],'circle-stroke-color':'#fff','circle-stroke-width':1.4,'circle-emissive-strength':1}},'hisaab-outside-india');}};
  async function load(){reportProjectStatus('Loading reviewed project locations…');let offset=0;while(!c.signal.aborted){const p=new URLSearchParams({mode:'points',bbox:viewport!.join(','),year,q:query,offset:String(offset)});if(purpose!=='All')p.set('purpose',purpose);if(state)p.set('state',state);const r=await fetch('/api/v1/map/works?'+p,{signal:c.signal});if(!r.ok)throw new Error('Project locations are unavailable. Historical dots remain separate.');const result=await r.json();features.push(...result.features);install();if(result.nextOffset===null){reportProjectStatus(`${result.total.toLocaleString('en-IN')} reviewed project locations in view`);break;}offset=result.nextOffset;}}
  const click=(e:mapboxgl.MapMouseEvent)=>{if(!m.getLayer('hisaab-reviewed-projects-dots'))return;const hits=m.queryRenderedFeatures([[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]],{layers:['hisaab-reviewed-projects-dots']});const choices=[...new Map(hits.map(h=>[String(h.properties?.id),{id:String(h.properties?.id),title:String(h.properties?.title??h.properties?.id)}])).values()];if(choices.length>1){setProjectChoices(choices);return;}const id=choices[0]?.id;if(!id)return;setProjectChoices([]);void fetch('/api/v1/works/'+encodeURIComponent(id),{signal:c.signal}).then(async r=>{if(!r.ok)throw new Error('The project receipt is unavailable.');const data=await r.json();if(!c.signal.aborted)callbacks.current.onWork(data.work);}).catch(e=>{if(e.name!=='AbortError')reportProjectStatus(e.message);});};
  const timer=setTimeout(()=>{void load().catch(e=>{if(e.name!=='AbortError')reportProjectStatus(e.message);});},250);m.on('click',click);
  return()=>{clearTimeout(timer);c.abort();m.off('click',click);if(!m.getStyle())return;if(m.getLayer('hisaab-reviewed-projects-dots'))m.removeLayer('hisaab-reviewed-projects-dots');if(m.getSource('hisaab-reviewed-projects'))m.removeSource('hisaab-reviewed-projects');};
 },[ready,viewport,exploring,layers.projects,year,purpose,query,state]);
 return <div className="atlas-map" data-map-provider="mapbox" data-map-style={style}><div className="map-canvas" ref={node}/><div className="atlas-art" aria-hidden="true"><div className="atlas-orbit orbit-one"/><div className="atlas-orbit orbit-two"/><div className="atlas-orbit orbit-three"/></div>{ready&&map.current&&<><FundingMapLayer map={map.current} active states={states} selected={state} onSelect={onState} showAmounts={exploring&&layers.funding}/>{viewport&&exploring&&<AssetMapLayer map={map.current} viewport={viewport} visible={layers.historical&&purpose!=='No matching project category'} query={query} purpose={purpose==='No matching project category'?'Unclassified funding purpose':purpose} workSelected={!!work} onSelectAsset={onAsset} onStatus={onAssetStatus} hideDetails/>}<AssetMapConnection map={map.current} location={work?.location??asset?.location??null}/><Selection3D map={map.current} location={work?.location??asset?.location??null}/></>}{!ready&&!error&&<p className="atlas-map-loading" role="status">Preparing India’s landscape…</p>}{error&&<div className="atlas-map-error" role="status">{error}</div>}{projectChoices.length>1&&<aside className="atlas-pick-list" aria-label="Choose an overlapping project"><button aria-label="Close project chooser" onClick={()=>setProjectChoices([])}>Close</button><h3>Projects at this point</h3><p>These records retain their separate identities.</p>{projectChoices.map(p=><button key={p.id} onClick={()=>{void fetch('/api/v1/works/'+encodeURIComponent(p.id)).then(async r=>{if(!r.ok)throw new Error('Project unavailable');callbacks.current.onWork((await r.json()).work);setProjectChoices([]);}).catch(e=>setStatus(e.message));}}>{p.title}</button>)}</aside>}</div>;
}
