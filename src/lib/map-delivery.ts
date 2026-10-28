export function mapDeliveryBase(value=process.env.NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL??'') {
  if(!value)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return null;
    return url.toString().replace(/\/$/,'');
  }catch{return null;}
}

// Mapbox never re-requests a failed tile, so a server or network blip leaves a permanent hole.
// Retry those with backoff; missing (404) and rejected (4xx) tiles stay as they are.
export function tileRetryDelay(status:number|undefined,attempt:number) {
  if(attempt>=3||status&&status<500&&status!==408&&status!==429)return null;
  return 1000*2**attempt;
}
