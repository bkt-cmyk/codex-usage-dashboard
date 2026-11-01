import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsage,dashboardPayload} from '../src/core.js';
const base={plan:'Plus',fetched_at:'2026-10-10T18:02:11Z',windows:[{label:'Session',used_percent:1,resets_at:'2026-10-10T21:54:14Z'},{label:'Weekly',used_percent:21,resets_at:'2026-10-16T22:07:05Z'}],details:[]};
test('banked resets renders confirmed zero, positive or unknown from the same snapshot below quota bars',()=>{
 for(const [count,label] of [[0,'0 resets'],[2,'2 resets'],[null,'Unavailable']]) {
  const usage=normalizeUsage({...base,reset_credits:{available_count:count,same_usage_response:true}});
  assert.equal(usage.resetCredits.available,count);
  const children=dashboardPayload(usage).components[0].components;
  const text=children.flatMap(c=>c.type===9?c.components:c.type===10?[c]:[]).map(c=>c.content).join('\n');
  assert.ok(text.includes('🟩 Usage Limit Resets'));assert.ok(text.includes(`Available: ${label}`));assert.ok(!text.includes('Status:'));
  assert.ok(text.indexOf('Usage Limit Resets')>text.indexOf('Weekly Limit'));

 }
 const absent=normalizeUsage(base);assert.equal(absent.resetCredits.available,null);
 const mismatched=normalizeUsage({...base,reset_credits:{available_count:9,same_usage_response:false}});assert.equal(mismatched.resetCredits.available,null);
 for(const count of [-1,1.5,'2',true,Infinity]) assert.equal(normalizeUsage({...base,reset_credits:{available_count:count,same_usage_response:true}}).resetCredits.available,null);
});
