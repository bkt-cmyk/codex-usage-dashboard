import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,label} from '../test-support/history-pixels.js';
import {renderHistoryPng} from '../src/history-chart.js';
const pixels=png=>decode(png).pixel;
test('vertical axis preserves 10-percent divisions when raw usage exceeds 100',()=>{
 const pixel=pixels(renderHistoryPng({start:0,end:1,segments:[[{at:0,used:101}]]}));
 for(let n=0;n<=110;n+=10){const y=Math.round(1000-n/110*968);assert.deepEqual(pixel(123,y),[55,55,70],`grid at ${n}%`);label(pixel,String(n),20,y-10,3);}
 assert.deepEqual(pixel(100,Math.round(1000-101/110*968)),[255,0,0],"raw 101% position");
});
test('vertical axis has labels every 10 percent and no intermediate 5-percent lines',()=>{
 const pixel=pixels(renderHistoryPng({start:0,end:1,segments:[]}));
 for(let n=0;n<=100;n+=10){const y=Math.round(1000-n/100*968);assert.deepEqual(pixel(123,y),[55,55,70],`grid at ${n}%`);label(pixel,String(n),20,y-10,3);}
 for(let n=5;n<100;n+=10)assert.deepEqual(pixel(123,1000-n/100*968),[24,24,35],`no intermediate line at ${n}%`);
});
