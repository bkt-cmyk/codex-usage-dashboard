import test from 'node:test';
import assert from 'node:assert/strict';
import {historyWeek} from '../src/history-chart.js';
const day=86400000, now=Date.parse('2026-10-15T01:00:00Z');
test('confirmed reset transition connects actual samples without fabricating zero',()=>{
 const reset=now-300000,samples=[{at:reset-300000,reset,used:96},{at:reset+300000,reset:reset+7*day,used:4}];
 const week=historyWeek(samples,now);
 assert.deepEqual(week.segments,[samples]);assert.deepEqual(week.resets,[reset]);
});
test('usage drops and future or corrected reset metadata do not establish a reset',()=>{
 const samples=[{at:now-900000,reset:now+day,used:80},{at:now-600000,reset:now+day+1,used:3},{at:now-300000,reset:now+day,used:4},{at:now,reset:now+2*day,used:5}];
 const week=historyWeek(samples,now);assert.deepEqual(week.resets,[]);assert.deepEqual(week.segments,[samples]);
});
test('missing observations remain separate unless bridging a metadata-confirmed reset',()=>{
 const samples=[{at:now-600000,reset:now+day,used:80},{at:now,reset:now+day,used:3}];
 assert.deepEqual(historyWeek(samples,now).segments,samples.map(s=>[s]));
});
test('seven Bangkok calendar days include full today but exclude future observations',()=>{
 const start=Date.parse('2026-10-08T17:00:00Z'),end=Date.parse('2026-10-15T17:00:00Z');
 const samples=[{at:start-1,used:1},{at:start,used:2},{at:now,used:3},{at:now+1,used:4},{at:end,used:5}];
 const week=historyWeek(samples,now);
 assert.equal(week.start,start);assert.equal(week.end,end);assert.equal(week.latest.at,now);
 assert.deepEqual(week.days.map(d=>d.label),['9/10','10/10','11/10','12/10','13/10','14/10','15/10']);
 assert.deepEqual(week.boundaries.map(d=>d.label),['9/10','10/10','11/10','12/10','13/10','14/10','15/10','16/10']);
 assert.deepEqual(week.boundaries.map(d=>d.at),Array.from({length:8},(_,i)=>start+i*day));
 assert.deepEqual(week.days.map(d=>d.at),Array.from({length:7},(_,i)=>start+i*day));
 assert.deepEqual(week.segments.flat().map(s=>s.used),[2,3]);
});
