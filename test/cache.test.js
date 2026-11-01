import test from 'node:test';
import assert from 'node:assert/strict';

test('usage cache coalesces concurrent calls, expires, and keeps last good value on errors',async()=>{
 const { UsageCache }=await import('../src/cache.js');
 let now=0,calls=0,fail=false;
 const cache=new UsageCache(async()=>{calls++; if(fail) throw Error('failure'); return {calls};},45000,()=>now);
 const [a,b]=await Promise.all([cache.get(),cache.get()]);
 assert.equal(calls,1); assert.equal(a,b);
 now=44000; assert.equal(await cache.get(),a);
 now=45001; const c=await cache.get(); assert.equal(calls,2);
 now=90002; fail=true; await assert.rejects(cache.get()); assert.equal(cache.last,c);
 fail=false; await cache.get(); assert.equal(calls,4);
});
