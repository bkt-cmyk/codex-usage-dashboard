import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardPayload,unavailableUsage} from '../src/core.js';
test('both progress bars have fifteen cells with clamped proportional fill',()=>{
 for(const used of [-10,0,20,50,100,120]) {
  const u={...unavailableUsage(),windows:unavailableUsage().windows.map(w=>({...w,used,remaining:Math.max(0,100-used)}))};
  const sections=dashboardPayload(u).components[0].components.filter(c=>c.type===9);
  assert.equal(sections.length,2);
  for(const section of sections) {
   const bar=section.components[1].content.match(/`([█░]+)`/)[1];
   assert.equal(bar.length,15);
   assert.equal([...bar].filter(c=>c==='█').length,Math.round(Math.max(0,Math.min(100,used))*15/100));
  }
 }
});
