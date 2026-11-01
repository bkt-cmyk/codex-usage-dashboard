import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInteraction} from '../src/interactions.js';
import {HistoryController} from '../src/history-controller.js';
const account='a'.repeat(64),now=Date.parse('2026-10-13T12:00Z'),reset=now+86400000;
const usage={provider:'openai-codex',accountFingerprint:account,fetchedAt:new Date(now).toISOString(),windows:[{name:'Weekly Limit',used:21,resetsAt:new Date(reset).toISOString()}]};
function interaction(customId='codex_usage:history'){const events=[];return {events,isButton:()=>true,customId,user:{id:'7'},channelId:'10',message:{id:'20'},reply:async p=>events.push(['reply',p]),deferReply:async p=>events.push(['defer',p]),editReply:async p=>{events.push(['edit',p]);return {id:'private'};},deferUpdate:async()=>events.push(['update']),followUp:async p=>events.push(['error',p])};}
const context=history=>({allowed:new Set(['7']),channelId:'10',messageId:'20',history,refresh:async()=>{throw Error('History must not fetch');}});
test('History rejects unauthorized, copied targets, unknown accounts and safe local storage errors',async()=>{
 let reads=0,current=usage;
 const h=new HistoryController({list:()=>{reads++;throw Error('TOPSECRET');}},()=>current,()=>now),ctx=context(h);
 for(const modify of [i=>i.user.id='8',i=>i.message.id='copy',i=>i.channelId='wrong']){const i=interaction();modify(i);await handleInteraction(i,ctx);assert.equal(i.events[0][0],'reply');assert.equal(i.events[0][1].flags,64);}assert.equal(reads,0);
 current={...usage,accountFingerprint:null};const unknown=interaction();await handleInteraction(unknown,ctx);assert.equal(reads,0);assert.match(unknown.events.at(-1)[1].content,/unavailable/i);
 current=usage;const failed=interaction();await handleInteraction(failed,ctx);assert.equal(reads,1);assert.match(failed.events.at(-1)[1].content,/unavailable/i);assert.ok(!JSON.stringify(failed.events).includes('TOPSECRET'));
});
test('obsolete history navigation IDs are ignored without acknowledgement or disk access',async()=>{
 let reads=0;const h=new HistoryController({list:()=>{reads++;return [];}},()=>usage,()=>now);
 for(const id of ['codex_usage:history:'+ 'a'.repeat(32)+':1','codex_usage:history:bad:13']){const i=interaction(id);await handleInteraction(i,context(h));assert.deepEqual(i.events,[]);}
 assert.equal(reads,0);
});
test('account change during acknowledgement fails closed before reading storage',async()=>{
 let current=usage,reads=0;const h=new HistoryController({list:()=>{reads++;return [];}},()=>current,()=>now),i=interaction();
 i.deferReply=async p=>{i.events.push(['defer',p]);current={...usage,accountFingerprint:'b'.repeat(64)};};
 await handleInteraction(i,context(h));assert.equal(reads,0);assert.match(i.events.at(-1)[1].content,/unavailable/i);
});
test('successful History is a PNG attachment with only the approved private navigation row',async()=>{
 const i=interaction();let reads=0;
 const h=new HistoryController({list:(provider,id)=>{assert.equal(i.events[0][0],'defer');assert.equal(provider,'openai-codex');assert.equal(id,account);reads++;return [{at:now,reset,used:21}];}},()=>usage,()=>now);
 await handleInteraction(i,context(h));assert.deepEqual(i.events.map(e=>e[0]),['defer','edit']);assert.equal(i.events[0][1].flags,64);const p=i.events[1][1];
 assert.equal(reads,1);assert.equal(p.content,'');assert.deepEqual(p.embeds,[]);assert.equal(p.components.length,1);assert.equal(p.components[0].type,1);assert.deepEqual(p.components[0].components.map(b=>[b.label,b.disabled]),[['← Previous 7 days',true],['Next 7 days →',true]]);assert.deepEqual(p.attachments,[]);
 assert.equal(p.files.length,1);assert.ok(Buffer.isBuffer(p.files[0].attachment));assert.equal(p.files[0].name,'weekly-history.png');assert.deepEqual(p.allowedMentions,{parse:[]});
});
