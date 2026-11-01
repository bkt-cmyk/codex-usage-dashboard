import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleInteraction} from '../src/interactions.js';
test('obsolete Reset and confirmations are ignored without acknowledgement or backend access',async()=>{
 for(const customId of ['codex_usage:reset','codex_usage:confirm:n','codex_usage:cancel:n']) {
  const events=[];
  const action=async()=>events.push('called');
  const i={customId,isButton:()=>true,user:{id:'u'},channelId:'c',message:{id:'m'},deferReply:action,deferUpdate:action,editReply:action,reply:action};
  const ctx={allowed:new Set(['u']),channelId:'c',messageId:'m',refresh:action,reset:{begin:action,confirm:action,cancel:action,bind:action}};
  await handleInteraction(i,ctx);
  assert.deepEqual(events,[],customId);
 }
});
test('service has no reset-capable imports, context or adapter construction',async()=>{
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(main,/ResetFlow|resetRequest|reset_adapter\.py|refresh,reset/);
});