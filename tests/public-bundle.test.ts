import {expect,it} from 'vitest';
import {existsSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';

// Packages a public visitor must never download to read the atlas. Each is needed only by
// server code, by the owner console or by a creator tool, so each must sit behind
// next/dynamic or an `import type`. A plain `import` from the atlas graph puts it back on
// every visitor's critical path, which this guards against.
const forbidden={'zod':'validation schemas are server-side','three':'only the selection halo draws in 3D','@supabase/supabase-js':'only private case uploads talk to storage'};
// Both load for everyone who opens the atlas: the shell, and the map it mounts straight away.
const entries=['src/components/atlas-app.tsx','src/components/atlas-map.tsx'];

// Static imports only: `import type` is erased, and `import(...)` becomes its own chunk.
function staticImports(file:string){
 const source=readFileSync(file,'utf8'),specifiers:string[]=[];
 for(const m of source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+([^'"();]*?)\s*from\s*['"]([^'"]+)['"]/g))if(!/^type\s/.test(m[1].trim()))specifiers.push(m[2]);
 for(const m of source.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g))specifiers.push(m[1]);
 return specifiers;
}

// Paths stay POSIX-shaped so the graph reads the same on Windows and CI.
const posix=(value:string)=>value.split(path.sep).join('/');
function resolve(specifier:string,from:string){
 if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return null;
 const base=posix(specifier.startsWith('@/')?path.join('src',specifier.slice(2)):path.join(path.dirname(from),specifier));
 for(const candidate of [base,base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'])if(existsSync(candidate)&&statSync(candidate).isFile())return candidate;
 return null;
}

function packageOf(specifier:string){const parts=specifier.split('/');return specifier.startsWith('@')?parts.slice(0,2).join('/'):parts[0];}

it('keeps server-only and creator-only packages out of the public atlas graph',()=>{
 const seen=new Set(entries),queue=[...entries],parent=new Map<string,string>(),offenders:string[]=[];
 while(queue.length){
  const file=queue.shift()!;
  for(const specifier of staticImports(file)){
   const resolved=resolve(specifier,file);
   if(resolved){if(!seen.has(resolved)){seen.add(resolved);parent.set(resolved,file);queue.push(resolved);}continue;}
   const name=packageOf(specifier);
   if(!(name in forbidden))continue;
   const chain=[file];for(let at=file;parent.has(at);at=parent.get(at)!)chain.push(parent.get(at)!);
   offenders.push(`${name} (${forbidden[name as keyof typeof forbidden]}) via ${chain.reverse().join(' -> ')}`);
  }
 }
 expect(offenders,`statically imported from the public atlas:\n${offenders.join('\n')}`).toEqual([]);
 // Guard the walker itself: a broken resolver would pass this test vacuously.
 expect(seen.size).toBeGreaterThan(20);
 expect(seen.has('src/lib/funding.ts')).toBe(true);
});
