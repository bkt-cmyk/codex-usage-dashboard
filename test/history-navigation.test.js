import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInteraction} from '../src/interactions.js';
import {HistoryController} from '../src/history-controller.js';
const day=86400000,anchor=Date.parse('2026-10-15T16:59Z'),account='a'.repeat(64);
const usage={provider:'openai-codex',accountFingerprint:account,fetchedAt:new Date(anchor).toISOString(),windows:[{name:'Weekly Limit',used:21,resetsAt:new Date(anchor+day).toISOString()}]};
function interaction(customId='codex_usage:history',message='main'){
 const events=[];return {events,isButton:()=>true,customId,user:{id:'owner'},channelId:'channel',message:{id:message},
 reply:async p=>events.push(['reply',p]),deferReply:async p=>events.push(['deferReply',p]),deferUpdate:async()=>events.push(['deferUpdate']),
 editReply:async p=>{events.push(['edit',p]);return {id:'private'};},followUp:async p=>events.push(['followUp',p])};
}
function fixture(samples=[{at:anchor-20*day,reset:anchor,used:10}]){
 let now=anchor,current=usage,reads=0;
 const history=new HistoryController({list:(provider,id)=>{assert.equal(provider,'openai-codex');assert.equal(id,account);reads++;return samples;}},()=>current,()=>now);
 const ctx={allowed:new Set(['owner']),channelId:'channel',messageId:'main',history,refresh:async()=>{throw Error('No usage API');}};
 return {history,ctx,get reads(){return reads;},set current(v){current=v;},set now(v){now=v;}};
}
const buttons=i=>{const rows=i.events.find(e=>e[0]==='edit')[1].components;assert.equal(rows.length,1,'one navigation row');return rows[0].components;};
async function open(f){const i=interaction();await handleInteraction(i,f.ctx);return i;}
async function click(f,id){const i=interaction(id,'private');await handleInteraction(i,f.ctx);return i;}
test('private controls page seven days across empty weeks on the same reply and return frozen current image',async()=>{
 const f=fixture(),i=await open(f),[previous,next]=buttons(i);
 assert.equal(previous.label,'← Previous 7 days');assert.equal(next.label,'Next 7 days →');assert.equal(previous.disabled,false);assert.equal(next.disabled,true);
 assert.match(previous.custom_id,/^codex_usage:history_nav:[a-f0-9]{32}:1$/);
 f.now=anchor+2*60000; // cross Bangkok midnight without moving the session anchor
 const old=await click(f,previous.custom_id);assert.deepEqual(old.events.map(e=>e[0]),['deferUpdate','edit']);
 const p=old.events[1][1];assert.equal(p.content,'');assert.deepEqual(p.embeds,[]);assert.deepEqual(p.attachments,[]);assert.deepEqual(p.allowedMentions,{parse:[]});assert.equal(p.files.length,1);
 assert.equal(buttons(old)[0].disabled,false);assert.equal(buttons(old)[1].disabled,false);
 const current=await click(f,buttons(old)[1].custom_id);assert.deepEqual(current.events.map(e=>e[0]),['deferUpdate','edit']);
 assert.deepEqual(current.events[1][1].files[0].attachment,i.events[1][1].files[0].attachment);assert.equal(buttons(current)[1].disabled,true);
 const second=await click(f,buttons(current)[0].custom_id),third=await click(f,buttons(second)[0].custom_id);
 assert.equal(buttons(third)[0].disabled,true);assert.equal(f.reads,5);
});
test('sessions expire before or during acknowledgement and bounded cleanup includes pending opens',async()=>{
 const f=fixture(),first=await open(f),id=buttons(first)[0].custom_id;
 f.now=anchor+10*60000;
 const expired=await click(f,id);assert.deepEqual(expired.events.map(e=>e[0]),['reply']);assert.equal(f.reads,1);assert.equal(f.history.sessions.size,0);
 const g=fixture(),active=await open(g),i=interaction(buttons(active)[0].custom_id,'private');
 i.deferUpdate=async()=>{i.events.push(['deferUpdate']);g.now=anchor+10*60000;};
 await handleInteraction(i,g.ctx);assert.equal(g.reads,1);assert.deepEqual(i.events.map(e=>e[0]),['deferUpdate','followUp']);assert.equal(g.history.sessions.size,0);
 const h=fixture(),pending=[];let release;const wait=new Promise(r=>release=r);
 for(let n=0;n<101;n++){const x=interaction();x.deferReply=async()=>wait;pending.push({x,p:handleInteraction(x,h.ctx)});}
 assert.equal(h.history.sessions.size,100);assert.deepEqual(pending[100].x.events.map(e=>e[0]),['reply']);
 h.now=anchor+10*60000;release();await Promise.all(pending.map(x=>x.p));assert.equal(h.reads,0);assert.equal(h.history.sessions.size,0);
});
test('concurrent clicks cannot race offsets and ambiguous Discord edits invalidate the session',async()=>{
 const f=fixture(),opened=await open(f),id=buttons(opened)[0].custom_id;
 let release;const gate=new Promise(r=>release=r),i=interaction(id,'private');
 i.editReply=async p=>{i.events.push(['edit',p]);await gate;return {id:'private'};};
 const pending=handleInteraction(i,f.ctx);await new Promise(r=>setImmediate(r));
 const duplicate=await click(f,id);assert.deepEqual(duplicate.events.map(e=>e[0]),['reply']);assert.equal(f.reads,2);
 release();await pending;
 const next=interaction(buttons(i)[0].custom_id,'private');next.editReply=async()=>{throw Error('TOKEN SECRET');};
 await handleInteraction(next,f.ctx);assert.deepEqual(next.events.map(e=>e[0]),['deferUpdate','followUp']);assert.equal(f.history.sessions.size,0);assert.ok(!JSON.stringify(next.events).includes('TOKEN'));
 const stale=await click(f,id);assert.deepEqual(stale.events.map(e=>e[0]),['reply']);assert.equal(f.reads,3);
});
test('changed account invalidates controls permanently before acknowledgement and never reads another account',async()=>{
 const f=fixture(),opened=await open(f),id=buttons(opened)[0].custom_id;
 f.current={...usage,accountFingerprint:'b'.repeat(64)};
 const rejected=await click(f,id);assert.deepEqual(rejected.events.map(e=>e[0]),['reply']);assert.equal(f.reads,1);assert.equal(f.history.sessions.size,0);
 f.current=usage;await click(f,id);assert.equal(f.reads,1);
});
test('history reads are provider-scoped and a provider switch invalidates the session',async()=>{
 let current={...usage,provider:'openai-codex'},reads=[];
 const history=new HistoryController({list:(...args)=>{reads.push(args);return [];}},()=>current,()=>anchor);
 const ctx={allowed:new Set(['owner']),channelId:'channel',messageId:'main',history};
 const opened=interaction();await handleInteraction(opened,ctx);
 assert.deepEqual(reads,[['openai-codex',account]]);
 const id=buttons(opened)[0].custom_id;current={...current,provider:'anthropic'};
 const rejected=interaction(id,'private');await handleInteraction(rejected,ctx);
 assert.deepEqual(rejected.events.map(e=>e[0]),['reply']);assert.equal(reads.length,1);assert.equal(history.sessions.size,0);
});
test('navigation enforces current allowlist, owner, channel, exact reply, strict IDs and adjacent offsets before disk access',async()=>{
 const f=fixture(),opened=await open(f),id=buttons(opened)[0].custom_id;
 f.ctx.allowed.add('other');
 for(const change of [i=>i.user.id='other',i=>i.channelId='wrong',i=>i.message.id='main',i=>i.message.id='copy',i=>f.ctx.allowed.delete('owner')]){
  const i=interaction(id,'private');change(i);await handleInteraction(i,f.ctx);
  assert.deepEqual(i.events.map(e=>e[0]),['reply']);assert.equal(i.events[0][1].flags,64);assert.equal(f.reads,1);f.ctx.allowed.add('owner');
 }
 for(const target of ['0','2','13','-1','01','1.0','1:extra','999999999999999999999']){
  const i=await click(f,id.replace(/:1$/,`:${target}`));assert.deepEqual(i.events.map(e=>e[0]),['reply']);assert.equal(f.reads,1);
 }
 const unknown=await click(f,id.replace(/[a-f0-9]{32}/,'0'.repeat(32)));assert.deepEqual(unknown.events.map(e=>e[0]),['reply']);assert.equal(f.reads,1);
 const second=await open(f);assert.notEqual(buttons(second)[0].custom_id,id);
});
test('acknowledgement rechecks account, allowlist and channel before navigation storage access',async()=>{
 for(const change of [f=>f.current={...usage,accountFingerprint:'b'.repeat(64)},f=>f.current={...usage,unavailable:true},f=>f.ctx.allowed.clear(),f=>f.ctx.channelId='changed']){
  const f=fixture(),opened=await open(f),i=interaction(buttons(opened)[0].custom_id,'private');
  i.deferUpdate=async()=>{i.events.push(['deferUpdate']);change(f);};await handleInteraction(i,f.ctx);
  assert.equal(f.reads,1);assert.deepEqual(i.events.map(e=>e[0]),['deferUpdate','followUp']);assert.equal(i.events[1][1].flags,64);assert.equal(f.history.sessions.size,0);
 }
});
test('account is rechecked after local storage and immediately before editing the private image',async()=>{
 const f=fixture(),opened=await open(f),id=buttons(opened)[0].custom_id;
 f.history.store.list=()=>{f.current={...usage,accountFingerprint:'b'.repeat(64)};return [];};
 const i=await click(f,id);assert.deepEqual(i.events.map(e=>e[0]),['deferUpdate','followUp']);assert.equal(f.history.sessions.size,0);
});
test('retention clips untrusted old samples, permits sparse intermediate windows and bounds paging to offsets 0 through 12',async()=>{
 const f=fixture([{at:anchor-89*day,reset:anchor,used:20},{at:anchor-100*day,reset:anchor,used:30}]);
 let i=await open(f);for(let n=1;n<=12;n++){assert.equal(buttons(i)[0].disabled,false);i=await click(f,buttons(i)[0].custom_id);}
 assert.equal(buttons(i)[0].disabled,true);assert.equal(buttons(i)[1].disabled,false);const reads=f.reads;
 const forged=await click(f,buttons(i)[0].custom_id);assert.deepEqual(forged.events.map(e=>e[0]),['reply']);assert.equal(f.reads,reads);
 const empty=fixture([{at:anchor-100*day,reset:anchor,used:30}]),o=await open(empty);assert.equal(buttons(o)[0].disabled,true);
 const noOlder=await click(empty,buttons(o)[0].custom_id);assert.deepEqual(noOlder.events.map(e=>e[0]),['deferUpdate','followUp']);assert.equal(empty.history.sessions.size,0);
});
