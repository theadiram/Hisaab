'use client';
import {useEffect,useRef} from 'react';
import type mapboxgl from 'mapbox-gl';
import type {MapPreview} from './asset-visual';
export function useLocationPreview(map:mapboxgl.Map|null,ready:boolean,id:string|null,location:[number,number]|null,onPreview:(p:MapPreview|null)=>void){
 const callback=useRef(onPreview);callback.current=onPreview;
 const lng=location?.[0],lat=location?.[1];
 useEffect(()=>{
  callback.current(null);if(!map||!ready||!id||lng===undefined||lat===undefined)return;
  let done=false,queued=false,nextAttempt=0;
  const capture=()=>{
   queued=false;if(done||map.isMoving()||!map.areTilesLoaded())return;
   const canvas=map.getCanvas(),point=map.project([lng,lat]),size=map.getContainer();
   if(!Number.isFinite(point.x)||point.x<0||point.x>size.clientWidth||point.y<0||point.y>size.clientHeight)return;
   try{
    // Read only on a rendered frame. This avoids preserving the drawing buffer
    // continuously (which would penalise every pan and zoom).
    const image=document.createElement('canvas');image.width=720;image.height=400;
    const context=image.getContext('2d');if(!context)throw new Error('Canvas unavailable');
    const ratio=canvas.width/size.clientWidth,w=Math.min(canvas.width,420*ratio),h=Math.min(canvas.height,w*400/720);
    const x=Math.max(0,Math.min(canvas.width-w,point.x*ratio-w/2)),y=Math.max(0,Math.min(canvas.height-h,point.y*ratio-h/2));
    context.drawImage(canvas,x,y,w,h,0,0,720,400);
    // A DEM/placeholder frame can contain the halo but no satellite imagery.
    // Do not freeze that blank surface into the card during a fast camera move.
    const pixels=context.getImageData(0,0,720,400).data,colours=new Set<string>();
    for(let y=40;y<400;y+=80)for(let x=40;x<720;x+=80){const i=(y*720+x)*4;if(pixels[i+3])colours.add(`${pixels[i]>>3}:${pixels[i+1]>>3}:${pixels[i+2]>>3}`);}
    if(colours.size<6)return;
    const attribution=(size.querySelector('.mapboxgl-ctrl-attrib-inner')?.textContent??'© Mapbox © Maxar © OpenStreetMap').replace(/Improve this map/g,'').trim();
    callback.current({id,url:image.toDataURL('image/jpeg',.85),attribution});done=true;stop();
   }catch{callback.current({id,url:'',attribution:'Map preview unavailable'});done=true;stop();}
  };
  const request=()=>{if(done||queued||map.isMoving()||!map.areTilesLoaded()||performance.now()<nextAttempt)return;nextAttempt=performance.now()+500;queued=true;map.once('render',capture);map.triggerRepaint();};
  const stop=()=>{map.off('idle',request);map.off('moveend',request);map.off('render',capture);clearTimeout(timer);clearTimeout(deadline);};
  // Allow base imagery to settle; idle wins, with a bounded render fallback.
  // After the deadline the card says the preview is unavailable, but a slow
  // renderer that settles later still replaces that notice with the capture.
  const timer=setTimeout(request,6000),deadline=setTimeout(()=>{if(!done)callback.current({id,url:'',attribution:'Map preview unavailable'});},20000);map.on('idle',request);map.on('moveend',request);
  return()=>{done=true;stop();};
 },[map,ready,id,lng,lat]);
}
