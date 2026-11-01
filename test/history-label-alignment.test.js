import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,label,ink,bg} from '../test-support/history-pixels.js';
import {historyWeek,renderHistoryPng} from '../src/history-chart.js';

const scale=3,textWidth=s=>(s.length*6-1)*scale;
test('all eight midnight lines center unpadded D/M glyphs at the same scale as percent ticks and fallback',()=>{
 const week=historyWeek([],Date.parse('2026-10-15T01:00Z'));
 const {pixel,width}=decode(renderHistoryPng(week));
 const lines=[];for(let x=0;x<width;x++)if(pixel(x,100).join()==='45,45,60')lines.push(x);
 assert.equal(lines.length,8);
 const expected=['9/10','10/10','11/10','12/10','13/10','14/10','15/10','16/10'];
 const regions=[];
 for(const [i,s] of expected.entries()){
  const center=100+i*1720/7,x=Math.round(center-textWidth(s)/2);
  assert.equal(lines[i],Math.round(center));
  assert.ok(x>=0&&x+textWidth(s)<=width,'centered edge date must fit');
  label(pixel,s,x,1032,scale);regions.push([x,x+textWidth(s)]);
 }
 // No Today, month names or a ninth date anywhere in the entire date band.
 for(let y=1020;y<1080;y++)for(let x=0;x<width;x++)if(pixel(x,y).join()===ink.join())assert.ok(y>=1032&&y<1053&&regions.some(([a,b])=>x>=a&&x<b));
 for(let n=0;n<=100;n+=10)label(pixel,String(n),20,Math.round(1000-n/100*968)-10,scale);
 label(pixel,'No recorded observations',704,480,scale);
 // The diagonal separator must be visible, not an unsupported blank glyph.
 const slash=['00001','00001','00010','00100','01000','10000','10000'].join('');
 const slashX=Math.round(100-textWidth('9/10')/2)+18;
 for(let p=0;p<35;p++)assert.deepEqual(pixel(slashX+p%5*scale,1032+Math.floor(p/5)*scale),slash[p]==='1'?ink:bg);
});
