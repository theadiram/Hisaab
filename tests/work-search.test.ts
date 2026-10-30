import {expect,it} from 'vitest';
import {workMatcher} from '../src/lib/work-search';
import {clusterWorks} from '../src/lib/map-clusters';
import type {Work} from '../src/lib/model';

const work=(over:Partial<Work>)=>({id:'w',title:'Rural road',state:'Karnataka',district:'Belagavi',officialIds:['PMGSY-1'],purpose:'infrastructure',financialYear:'2026-2027',locationPrecision:'source_point',location:[75.1,15.9],money:[],stages:[],...over} as unknown as Work);

it('matches on title, state, district and official identifiers, ignoring case',()=>{
 const w=work({});
 for(const query of ['rural','KARNATAKA','belagavi','pmgsy-1',''])expect(workMatcher(query)(w)).toBe(true);
 for(const query of ['kerala','PMGSY-2'])expect(workMatcher(query)(w)).toBe(false);
});

it('keeps every work when no query is given, as the joined search did',()=>{
 const works=[work({}),work({title:'Bridge',state:'Bihar',district:'Patna',officialIds:[]})];
 expect(works.filter(workMatcher(''))).toHaveLength(2);
 // A query of only spaces still searched for spaces before, so it still does.
 expect(workMatcher(' ')(work({title:'Rural road'}))).toBe(true);
 expect(workMatcher(' ')(work({title:'Bridge',state:'Bihar',district:'Patna',officialIds:[]}))).toBe(true);
});

it('clusters co-located works and reports the exact enclosing bounds',()=>{
 // a and b share grid cell 3:4 of the 16x16 split of this view; c falls in 11:9.
 const works=[
  work({id:'a',location:[75.0,15.0]}),
  work({id:'b',location:[75.2,15.1]}),
  work({id:'c',location:[90.0,25.0]}),
  work({id:'d',location:[75.1,15.05],locationPrecision:'district'}), // not drawable
  work({id:'e',location:[120.0,15.0]}),                              // outside the view
 ];
 const result=clusterWorks(works,[68,5,98,38]);
 expect(result.total).toBe(3);
 const clustered=result.features.find(f=>f.properties.cluster)!;
 expect(clustered.properties.count).toBe(2);
 expect(clustered.properties.bounds).toEqual([75.0,15.0,75.2,15.1]);
 // The centre is the mean of its members, not the cell centre.
 expect(clustered.geometry.coordinates[0]).toBeCloseTo(75.1,10);
 expect(clustered.geometry.coordinates[1]).toBeCloseTo(15.05,10);
 const single=result.features.find(f=>!f.properties.cluster)!;
 expect(single.properties).toMatchObject({cluster:false,count:1,id:'c'});
});

it('counts every drawable work in view even when one cell holds them all',()=>{
 const works=Array.from({length:50},(_,i)=>work({id:`w${i}`,location:[75.0,15.0]}));
 const result=clusterWorks(works,[68,5,98,38]);
 expect(result.total).toBe(50);
 expect(result.features).toHaveLength(1);
 expect(result.features[0].properties.bounds).toEqual([75.0,15.0,75.0,15.0]);
});
