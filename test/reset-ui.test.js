import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardPayload,unavailableUsage} from '../src/core.js';
test('Reset action is absent for all credit and account states; credit display remains',()=>{
 for(const [count,fingerprint] of [[0,'a'.repeat(64)],[null,'a'.repeat(64)],[1,null],[1,'a'.repeat(64)]]) {
  const p=dashboardPayload({...unavailableUsage(),resetCredits:{available:count},accountFingerprint:fingerprint});
  const c=p.components[0];
  const buttons=c.components.find(c=>c.type===1&&c.components.every(x=>x.type===2)).components;
  assert.deepEqual(buttons.map(b=>b.custom_id),['codex_usage:refresh','codex_usage:history']);
  assert.ok(c.components.some(c=>c.type===10&&c.content.includes('Usage Limit Resets')));
  assert.ok(!JSON.stringify(p).includes('a'.repeat(64)));
 }
});