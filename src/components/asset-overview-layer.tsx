'use client';

import {useEffect,useRef} from 'react';
import type mapboxgl from 'mapbox-gl';
import {detailZoom,loadMapOverview,overviewForKind,overviewZoom} from '@/lib/map-overview';

const source='hisaab-asset-overview',circles=source+'-circles',labels=source+'-counts';
export function AssetOverviewLayer({map,visible,kind,query,onStatus}:{map:mapboxgl.Map;visible:boolean;kind:string|null;query:string;onStatus?:(status:string)=>void}) {
  const status=useRef(onStatus);status.current=onStatus;
  useEffect(()=>{
    if(!visible||kind==='unavailable')return;
    let disposed=false,request=0;
    const draw=async()=>{
      const version=++request;
      if(map.getZoom()>=detailZoom)return;
      if(query.trim()){status.current?.('Zoom in to see archived locations matching your search.');return;}
      try{
        const data=overviewForKind(await loadMapOverview(map.getZoom()),kind);
        if(disposed||version!==request||!map.getStyle()||map.getZoom()>=detailZoom)return;
        const existing=map.getSource(source) as mapboxgl.GeoJSONSource|undefined;
        if(existing)existing.setData(data);else map.addSource(source,{type:'geojson',data});
        if(!map.getLayer(circles))map.addLayer({id:circles,type:'circle',source,maxzoom:detailZoom,paint:{'circle-radius':['step',['get','count'],13,100,17,1000,21,10000,26],'circle-color':'#b7ec73','circle-opacity':.92,'circle-stroke-color':'#142c32','circle-stroke-width':1.5,'circle-emissive-strength':1}},'hisaab-outside-india');
        if(!map.getLayer(labels))map.addLayer({id:labels,type:'symbol',source,maxzoom:detailZoom,layout:{'text-field':['case',['>=',['get','count'],1000],['concat',['to-string',['round',['/',['get','count'],1000]]],'k'],['to-string',['get','count']]],'text-font':['DIN Pro Medium','Arial Unicode MS Regular'],'text-size':12,'text-allow-overlap':true},paint:{'text-color':'#142c32','text-emissive-strength':1}},'hisaab-outside-india');
        const total=data.features.reduce((n,feature)=>n+feature.properties.count,0);
        if(total===0){
          status.current?.('No archived locations in this map view · zoom or pan to explore other areas');
        }else{
          status.current?.(`${total.toLocaleString('en-IN')} archived locations in grouped summaries · click or tap a number to zoom in`);
        }
      }catch{if(!disposed&&version===request)status.current?.('Map summaries currently loading or unavailable. Zoom in for detailed tiles or use the location list.');}
    };
    const click=(event:mapboxgl.MapMouseEvent)=>{
      if(!map.getLayer(circles)||map.getZoom()>=detailZoom||query.trim())return;
      const feature=map.queryRenderedFeatures(event.point,{layers:[circles]})[0];
      if(!feature)return;
      let bounds:number[];try{bounds=typeof feature.properties?.bounds==='string'?JSON.parse(feature.properties.bounds):feature.properties?.bounds;}catch{return;}
      if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))return;
      map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:80,maxZoom:Math.max(detailZoom,overviewZoom(map.getZoom())+2),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:600});
    };
    const canvas=map.getCanvas();
    const enter=()=>{if(canvas)canvas.style.cursor='pointer';};
    const leave=()=>{if(canvas)canvas.style.cursor='';};
    map.on('mouseenter',circles,enter);
    map.on('mouseleave',circles,leave);
    if(!query.trim())void draw();else status.current?.('Zoom in to see archived locations matching your search.');
    map.on('zoomend',draw);map.on('style.load',draw);map.on('click',click);
    return()=>{
      disposed=true;request++;map.off('zoomend',draw);map.off('style.load',draw);map.off('click',click);
      map.off('mouseenter',circles,enter);map.off('mouseleave',circles,leave);leave();
      if(!map.getStyle())return;
      for(const id of [labels,circles])if(map.getLayer(id))map.removeLayer(id);
      if(map.getSource(source))map.removeSource(source);
    };
  },[map,visible,kind,query]);
  return null;
}
