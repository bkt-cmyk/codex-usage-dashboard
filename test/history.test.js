import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {HistoryStore} from '../src/history-store.js';
import {historyWeek,renderHistoryPng} from '../src/history-chart.js';
import {inflateSync,crc32} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
const account='a'.repeat(64),now=Date.parse('2026-10-13T12:00:00Z'),day=86400000;
const usage=(used=21,at=now,reset=now+day)=>({provider:'openai-codex',accountFingerprint:account,fetchedAt:new Date(at).toISOString(),windows:[{name:'Weekly Limit',used,resetsAt:new Date(reset).toISOString()}]});
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'history-test-'));try{await fn(join(dir,'history.sqlite'));}finally{rmSync(dir,{recursive:true,force:true});}}
test('account isolation fails closed, cached observations deduplicate, and 90-day retention prunes',async()=>{
 await fixture(async path=>{const s=new HistoryStore(path,()=>now);s.record(usage(10,now-91*day));s.record(usage());s.record(usage());s.record({...usage(),accountFingerprint:'b'.repeat(64)});for(const bad of [null,'wrong'])assert.equal(s.record({...usage(),accountFingerprint:bad}),false);assert.equal(s.record({...usage(),unavailable:true}),false);assert.equal(s.record(usage(NaN)),false);assert.equal(s.list('openai-codex',account).length,1);assert.equal(s.list('openai-codex','b'.repeat(64)).length,1);assert.deepEqual(s.list('openai-codex',null),[]);s.close();});
});
test('local deterministic PNG has valid CRCs and leaves missing time ranges blank',()=>{
 const start=Date.parse('2026-10-06T17:00Z'),reset=now+day;
 const week=historyWeek([{at:start,reset,used:50},{at:start+3.5*day,reset,used:50}],now);
 const png=renderHistoryPng(week);assert.deepEqual(png,renderHistoryPng(week));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 let pos=8,idat=[];while(pos<png.length){const n=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8),data=png.subarray(pos+8,pos+8+n);assert.equal(png.readUInt32BE(pos+8+n),crc32(png.subarray(pos+4,pos+8+n)));if(type==='IDAT')idat.push(data);pos+=n+12;}
 const raw=inflateSync(Buffer.concat(idat));assert.equal(raw.length,5761*1080);const pixel=(x,y)=>[...raw.subarray(y*5761+1+x*3,y*5761+4+x*3)];
 assert.deepEqual(pixel(100,516),[255,0,0]);assert.notDeepEqual(pixel(500,516),[255,0,0]);assert.ok(png.length<100000);
});
test('one missed scheduled sample leaves a visible gap rather than interpolation',()=>{
 const reset=now+day;assert.equal(historyWeek([{at:now-600000,reset,used:1},{at:now,reset,used:2}],now).segments.length,2);
});
test('real SQLite snapshots survive reopening with raw percentage and private permissions',async()=>{
 await fixture(async path=>{let store=new HistoryStore(path,()=>now);store.record(usage(21.125));store.close();store=new HistoryStore(path,()=>now);assert.equal(store.list('openai-codex',account)[0].used,21.125);assert.equal(statSync(path).mode&0o777,0o600);store.close();});
});
test('history storage isolates identical account snapshots by provider',async()=>{
 await fixture(async path=>{const store=new HistoryStore(path,()=>now);const sample=usage();assert.equal(store.record({...sample,provider:'openai-codex'}),true);assert.equal(store.record({...sample,provider:'anthropic'}),true);assert.equal(store.list('openai-codex',account).length,1);assert.equal(store.list('anthropic',account).length,1);store.close();});
});
test('legacy providerless history migrates to OpenAI Codex without data loss',async()=>{
 await fixture(async path=>{const legacy=new DatabaseSync(path);legacy.exec('CREATE TABLE snapshots(account TEXT NOT NULL, at INTEGER NOT NULL, reset INTEGER NOT NULL, used REAL NOT NULL, PRIMARY KEY(account,at,reset));');legacy.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run(account,now,now+day,21.125);legacy.close();const store=new HistoryStore(path,()=>now);assert.equal(store.list('openai-codex',account)[0].used,21.125);assert.ok(store.db.prepare('PRAGMA table_info(snapshots)').all().some(c=>c.name==='provider'));store.close();});
});