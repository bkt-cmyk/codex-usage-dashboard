import test from 'node:test';
import assert from 'node:assert/strict';
import {decode} from '../test-support/history-pixels.js';
import {historyWeek,renderHistoryPng} from '../src/history-chart.js';
const pixels=png=>decode(png).pixel;
const now=Date.parse('2026-10-15T01:00Z'),red=[255,0,0];
test('confirmed reset metadata retains connected real observations without guide or label',()=>{
 const start=Date.parse('2026-10-08T17:00Z'),reset=start+3.5*86400000;
 const week=historyWeek([{at:reset-150000,reset,used:90},{at:reset+150000,reset:reset+7*86400000,used:10}],now);
 const pixel=pixels(renderHistoryPng(week));
 assert.equal(week.resets.length,1);assert.equal(week.segments.length,1);
 assert.deepEqual(pixel(960,516),red);assert.deepEqual(pixel(960,100),[24,24,35]);
});
test('missing reset bridge keeps dashed red usage and leaves future today blank',()=>{
 const start=Date.parse('2026-10-08T17:00Z'),reset=start+3.5*86400000;
 const week=historyWeek([{at:reset-86400000,reset,used:50},{at:reset+86400000,reset:reset+7*86400000,used:50}],now);
 const pixel=pixels(renderHistoryPng(week));
 let drawn=0,blank=0;for(let x=800;x<900;x++)pixel(x,516).join()==red.join()?drawn++:blank++;
 assert.ok(drawn>0&&blank>0,'long unobserved reset bridge must be dashed, not solid');
 assert.notDeepEqual(pixel(1800,516),red);
 for(const s of week.segments.flat())assert.deepEqual(pixel(100+(s.at-week.start)/(week.end-week.start)*1720,516),red);
});
test('intraday points use real timestamps and leave the entire future region inside today blank',()=>{
 const week=historyWeek([{at:now-300000,used:43},{at:now,used:44},{at:now+1,used:99}],now);
 const {pixel}=decode(renderHistoryPng(week));
 const x=100+(now-week.start)/(week.end-week.start)*1720;
 assert.equal(week.latest.at,now);assert.equal(week.segments.flat().length,2);
 assert.deepEqual(pixel(x,1000-0.44*968),red);
 for(let a=Math.round(x)+2;a<=1820;a++)for(let y=31;y<=1001;y++)assert.notDeepEqual(pixel(a,y),red,'future is blank inside the plot');
});
