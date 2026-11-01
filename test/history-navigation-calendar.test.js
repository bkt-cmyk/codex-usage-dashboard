import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,label,bg} from '../test-support/history-pixels.js';
import {historyWeek,renderHistoryPng} from '../src/history-chart.js';

const pixels=png=>decode(png).pixel;

test('historical weeks shift seven Thai calendar days and keep the centered Weekly Usage title',()=>{
 const anchor=Date.parse('2027-01-05T16:59Z');
 const current=historyWeek([],anchor),old=historyWeek([],anchor,1);
 assert.equal(current.start-old.start,7*86400000);assert.equal(current.end-old.end,7*86400000);
 assert.equal(old.days.at(-1).label,'29/12');assert.equal(old.boundaries.at(-1).label,'30/12');assert.ok(!old.days.some(d=>d.label==='Today'));
 assert.equal(current.range,'Dec 30, 2026 - Jan 5, 2027');assert.equal(old.range,'Dec 23, 2026 - Dec 29, 2026');
 assert.deepEqual(current.boundaries.map(d=>d.label),['30/12','31/12','1/1','2/1','3/1','4/1','5/1','6/1']);
 assert.deepEqual(old.boundaries.map(d=>d.label),['23/12','24/12','25/12','26/12','27/12','28/12','29/12','30/12']);
 const title='Weekly Usage',titleLeft=Math.round((1920-(title.length*6-1)*3)/2);
 for(const week of [current,old]){const pixel=pixels(renderHistoryPng(week));label(pixel,title,titleLeft,4);for(const [i,d] of week.boundaries.entries())label(pixel,d.label,Math.round(100+i*1720/7-(d.label.length*6-1)*3/2),1032);}
 for(const bad of [-1,0.5,13,Infinity,'1'])assert.throws(()=>historyWeek([],anchor,bad));
});
test('five-character edge dates are complete at both margins including historical month rollover',()=>{
 for(const [anchor,offset,expected] of [
  ['2027-01-06T01:00Z',0,['31/12','1/1','2/1','3/1','4/1','5/1','6/1','7/1']],
  ['2027-01-06T01:00Z',1,['24/12','25/12','26/12','27/12','28/12','29/12','30/12','31/12']],
  ['2026-11-03T01:00Z',0,['28/10','29/10','30/10','31/10','1/11','2/11','3/11','4/11']],
 ]){
  const week=historyWeek([],Date.parse(anchor),offset),pixel=pixels(renderHistoryPng(week));
  assert.equal(week.days.length,7);assert.deepEqual(week.boundaries.map(d=>d.label),expected);
  for(const [i,s] of expected.entries()){
   const center=100+i*1720/7,x=Math.round(center-(s.length*6-1)*3/2);
   assert.ok(x>=0&&x+(s.length*6-1)*3<1920);
   assert.deepEqual(pixel(center,100),[45,45,60]);label(pixel,s,x,1032);
  }
 }
});
