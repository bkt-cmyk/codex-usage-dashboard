import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHistoryPng} from '../src/history-chart.js';
import {decode,label,bg,ink,red} from '../test-support/history-pixels.js';
test('usage line and square observations share exactly three-pixel width and exact red with no purple or orange',()=>{
 const {pixel,raw,stride}=decode(renderHistoryPng({start:0,end:1720,segments:[[{at:200,used:50},{at:400,used:50}],[{at:700,used:25}]]}));
 for(const x of [300,400,500])for(let dy=-4;dy<=4;dy++)assert.equal(pixel(x,516+dy).join()===red.join(),Math.abs(dy)<=1,`line/endpoint width ${x},${dy}`);
 const dotY=Math.round(1000-0.25*968);
 for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++)assert.equal(pixel(800+dx,dotY+dy).join()===red.join(),Math.abs(dx)<=1&&Math.abs(dy)<=1,'isolated dot is 3x3');
 for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){const i=y*stride+1+x*3;assert.ok(!(raw[i]===167&&raw[i+1]===139&&raw[i+2]===250),'old purple');assert.ok(!(raw[i]===245&&raw[i+1]===183&&raw[i+2]===85),'old orange');}
});
import {historyWeek} from '../src/history-chart.js';
const now=Date.parse('2026-10-15T01:00Z');
test('full-HD plot centers Weekly Usage at the top and keeps reset guides hidden',()=>{
 const day=24*60*60*1000;
 const week=historyWeek([{at:now,used:21,reset:now+day}],now);week.resets=[week.start+3.5*day];
 const {pixel,width,height}=decode(renderHistoryPng(week));
 const title='Weekly Usage',titleLeft=Math.round((1920-(title.length*6-1)*3)/2);
 label(pixel,title,titleLeft,4);
 for(const [i,d] of week.boundaries.entries())label(pixel,d.label,Math.round(100+i*1720/7-(d.label.length*6-1)*3/2),1032);
 const allowed=new Set([bg.join(),ink.join(),red.join(),'55,55,70','45,45,60']);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=pixel(x,y).join();assert.ok(allowed.has(color),`unexpected plot color at ${x},${y}`);if(color===ink.join()){
  const titleInk=x>=titleLeft&&x<titleLeft+(title.length*6-1)*3&&y>=4&&y<25;
  const tick=x>=20&&x<74&&Array.from({length:11},(_,n)=>Math.round(1000-n/10*968)-10).some(top=>y>=top&&y<top+21);
  const date=week.boundaries.some((d,i)=>{const left=Math.round(100+i*1720/7-(d.label.length*6-1)*3/2);return x>=left&&x<left+(d.label.length*6-1)*3&&y>=1032&&y<1053;});
  assert.ok(titleInk||tick||date,`unexpected reset/footer ink at ${x},${y}`);
 }
 }
 assert.deepEqual(pixel(960,100),bg,'no vertical reset guide');
 assert.deepEqual(pixel(100,32),[45,45,60]);assert.deepEqual(pixel(1820,1000),[45,45,60]);
});
test('empty-state fallback stays readable beneath the centered title',()=>{
 const {pixel}=decode(renderHistoryPng(historyWeek([],now)));
 const title='Weekly Usage',titleLeft=Math.round((1920-(title.length*6-1)*3)/2);
 label(pixel,title,titleLeft,4,3);
 label(pixel,'No recorded observations',704,480,3);
 for(let x=0;x<1920;x++)assert.deepEqual(pixel(x,1070),bg);
});
test('History is a genuine 1920x1080 RGB raster, not a resized PNG header',()=>{
 const image=decode(renderHistoryPng({start:0,end:1,segments:[]}));
 assert.equal(image.width,1920);assert.equal(image.height,1080);
 assert.equal(image.raw.length,(1920*3+1)*1080);
 for(let y=0;y<image.height;y++)assert.equal(image.raw[y*image.stride],0);
});
