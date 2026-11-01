// Documentation-only synthetic fixture. Never reads account state or credentials.
import {writeFileSync} from 'node:fs';
import {historyWeek,renderHistoryPng} from '../../src/history-chart.js';
const now=Date.parse('2026-11-02T10:00:00Z');
const day=86400000,start=Date.parse('2026-10-26T17:00:00Z');
const reset=start+3*day;
const samples=[];
for(let at=start;at<=now;at+=300000){
 const hour=(at-start)/3600000;
 // Ordinary missing observations produce an intentional blank gap.
 if(hour>30&&hour<34)continue;
 // A confirmed reset across a missing interval demonstrates dashed interpolation.
 if(at>reset-900000&&at<reset+900000)continue;
 const before=at<reset;
 const used=before?18+hour*0.95:5+(hour-72)*0.65;
 samples.push({at,reset:before?reset:reset+7*day,used:Number(used.toFixed(2))});
}
const week=historyWeek(samples,now);
writeFileSync(new URL('./history-example.png',import.meta.url),renderHistoryPng(week));
console.log(JSON.stringify({synthetic:true,samples:samples.length,confirmedResets:week.resets.length,boundaries:week.boundaries.map(b=>b.label)}));
