// Starting a request cancels the one before it, so a slow older response can never land after a newer one.
export function latestRequest() {
  let current:AbortController|null=null;
  return {
    next(){current?.abort();current=new AbortController();return current.signal;},
    cancel(){current?.abort();current=null;},
  };
}

// Origin-fallback tiles carry the search in their URL. Waiting for a pause in typing
// keeps each keystroke from re-requesting every visible tile.
export const tileSearchDelay=300;

export function assetTileUrl({origin,tileBase,shard,query,edition,kind}:{origin:string;tileBase:string|null;shard:string;query:string;edition:string;kind:string|null}) {
  if(tileBase)return `${tileBase}/tiles/${shard}/{z}/{x}/{y}.pbf`;
  const params=new URLSearchParams({q:query});if(edition)params.set('v',edition);if(kind)params.set('kind',kind);if(shard!=='all')params.set('shard',shard);
  return origin+'/api/v1/map/asset-tiles/{z}/{x}/{y}.pbf?'+params;
}

// Before 'load', a failed style or style import leaves nothing to replace the loader.
// Glyph, sprite and tile failures still let the map load, so they are only logged.
export function isStyleFailure(error:unknown) {
  const url=(error as {url?:unknown}|null)?.url;
  return typeof url==='string'&&/\/styles\/v1\//.test(url);
}
export const mapLoadTimeout=20000;
