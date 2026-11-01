import test from 'node:test';
import assert from 'node:assert/strict';
import {registerInteractions, assertBootstrapReady, checkReport, fetchAndWriteDashboard} from '../src/service-safety.js';
import {UsageCache} from '../src/cache.js';

test('deployment and check modes do not register interaction handlers',()=>{
 for(const mode of ['publish','check']){
  let registered=0;
  registerInteractions({on:()=>registered++},{},mode,()=>{});
  assert.equal(registered,0);
 }
 let registered=0;
 registerInteractions({on:()=>registered++},{},'service',()=>{});
 assert.equal(registered,1);
});

test('check and publication fail closed when usage or pin permission is unavailable',()=>{
 assert.throws(()=>assertBootstrapReady({usage:{unavailable:true},canPin:true}),/Usage unavailable/);
 assert.throws(()=>assertBootstrapReady({usage:{unavailable:false},canPin:false}),/PinMessages/);
 assert.doesNotThrow(()=>assertBootstrapReady({usage:{unavailable:false},canPin:true}));
});

test('check report exposes readiness without IDs or quota values',()=>{
 const usage={unavailable:false,windows:[{used:42}],resetCredits:{available:3}};
 const report=checkReport({canPin:true,everyoneCanView:true,allowedUserCount:2,usage,state:{messageId:'sensitive-message-id'}});
 assert.deepEqual(report,{ok:true,canPin:true,everyoneCanView:true,allowedUserCount:2,usageAvailable:true,windowCount:1,resetCreditsConfirmed:true,stateConfigured:true});
 assert.doesNotMatch(JSON.stringify(report),/sensitive-message-id|42/);
});

test('publication refuses an unavailable second fetch before any Discord write',async()=>{
 let now=0,fetches=0,writes=0;
 const cache=new UsageCache(async()=>{fetches++;if(fetches===1)return {unavailable:false};throw new Error('usage failed');},45000,()=>now);
 await cache.get();
 now=45001;
 await assert.rejects(
  ()=>fetchAndWriteDashboard({getUsage:()=>cache.get(),fallback:()=>({unavailable:true}),write:async()=>{writes++;},requireAvailable:true}),
  /Usage unavailable/
 );
 assert.equal(fetches,2);
 assert.equal(writes,0);
});
