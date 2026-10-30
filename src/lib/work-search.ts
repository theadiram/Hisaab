import type {Work} from './model';
// Catalogue filtering ran [title,state,district,...ids].join(' ').toLowerCase() and
// re-lowercased the query for every work, including when no query was given. Build the
// match once per request instead, and skip the work entirely for an empty query.
// An empty needle matched everything before, because ''.includes('') is true.
export function workMatcher(query:string):(work:Work)=>boolean{
 const needle=query.toLowerCase();
 if(!needle)return ()=>true;
 return work=>[work.title,work.state,work.district,...work.officialIds].join(' ').toLowerCase().includes(needle);
}
