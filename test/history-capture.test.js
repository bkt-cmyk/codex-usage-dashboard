import test from 'node:test';
import assert from 'node:assert/strict';
import {UsageCache} from '../src/cache.js';
test('existing cached refresh fetch records once without extra requests, even if local DB fails',async()=>{
 const {HistoryCapture}=await import('../src/history-capture.js');let fetches=0,records=0,errors=0;
 const sample={accountFingerprint:'a'.repeat(64),windows:[],fetchedAt:'2026-10-13T12:00Z'};
 const capture=new HistoryCapture({record:value=>{assert.equal(value,sample);records++;throw Error('TOPSECRET');}},async()=>{fetches++;return sample;},()=>errors++);
 const cache=new UsageCache(()=>capture.fetch());assert.equal(await cache.get(),sample);assert.equal(await cache.get(),sample);assert.equal(fetches,1);assert.equal(records,1);assert.equal(errors,1);assert.equal(capture.latest,sample);
 await cache.fresh();assert.equal(fetches,2);capture.fetcher=async()=>{throw Error('fail');};await assert.rejects(()=>capture.fetch());assert.equal(capture.latest.unavailable,true);
});
test('service wires history to existing fetch only and check mode skips database creation',async()=>{
 const {readFile}=await import('node:fs/promises');const src=await readFile(new URL('../src/main.js',import.meta.url),'utf8');assert.match(src,/new HistoryCapture/);assert.match(src,/new HistoryController/);assert.match(src,/history,refresh/);assert.match(src,/!process.argv.includes\('--check'\)/);assert.match(src,/capture.fetch\(\)/);
});
