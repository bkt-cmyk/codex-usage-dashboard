import test from 'node:test';
import assert from 'node:assert/strict';

test('Refresh silently defers before I/O and sends only ephemeral errors',async()=>{
 const { handleInteraction }=await import('../src/interactions.js');
 const events=[];
 const i={isButton:()=>true,customId:'codex_usage:refresh',user:{id:'7'},channelId:'10',message:{id:'20'},deferUpdate:async()=>events.push(['ack']),followUp:async p=>events.push(['error',p])};
 const ctx={allowed:new Set(['7']),channelId:'10',messageId:'20',refresh:async()=>events.push(['refresh'])};
 await handleInteraction(i,ctx);
 assert.deepEqual(events.map(e=>e[0]),['ack','refresh']);
 ctx.refresh=async()=>{throw Error('TOPSECRET')};events.length=0;
 await handleInteraction(i,ctx);
 assert.deepEqual(events.map(e=>e[0]),['ack','error']);assert.equal(events[1][1].flags,64);assert.match(events[1][1].content,/failed/);assert.ok(!JSON.stringify(events).includes('TOPSECRET'));
});
test('unauthorized and wrong-target presses cannot refresh',async()=>{
 const { handleInteraction }=await import('../src/interactions.js');
 let calls=0;const events=[];
 const i={isButton:()=>true,customId:'codex_usage:refresh',user:{id:'8'},channelId:'10',message:{id:'20'},reply:async p=>events.push(p)};
 const ctx={allowed:new Set(['7']),channelId:'10',messageId:'20',refresh:async()=>calls++};
 await handleInteraction(i,ctx);assert.equal(events.at(-1).flags,64);assert.match(events.at(-1).content,/authorized/);
 i.user.id='7';i.message.id='different';await handleInteraction(i,ctx);assert.match(events.at(-1).content,/active dashboard/);assert.equal(calls,0);
});
test('removed Details action is ignored without acknowledging or accessing usage',async()=>{
 const {handleInteraction}=await import('../src/interactions.js');const events=[];
 const i={isButton:()=>true,customId:'codex_usage:details',user:{id:'7'},channelId:'10',message:{id:'20'},deferReply:async()=>events.push('ack'),editReply:async()=>events.push('details'),reply:async()=>events.push('reject')};
 const ctx={allowed:new Set(['7']),channelId:'10',messageId:'20',refresh:async()=>events.push('refresh'),details:()=>{events.push('read');return 'obsolete';}};
 await handleInteraction(i,ctx);assert.deepEqual(events,[]);
});
test('provider selector silently keeps connected Codex without fetching usage',async()=>{
 const {handleInteraction}=await import('../src/interactions.js');const events=[];
 const i={isButton:()=>false,isStringSelectMenu:()=>true,customId:'usage_dashboard:provider',values:['openai-codex'],user:{id:'7'},channelId:'10',message:{id:'20'},deferUpdate:async()=>events.push('ack'),reply:async p=>events.push(p)};
 const ctx={allowed:new Set(['7']),channelId:'10',messageId:'20',refresh:async()=>events.push('refresh')};
 await handleInteraction(i,ctx);assert.deepEqual(events,['ack']);
});
test('provider selector reports coming-soon choices privately without changing dashboard',async()=>{
 const {handleInteraction}=await import('../src/interactions.js');const events=[];
 const i={isButton:()=>false,isStringSelectMenu:()=>true,customId:'usage_dashboard:provider',values:['anthropic'],user:{id:'7'},channelId:'10',message:{id:'20'},deferUpdate:async()=>events.push('ack'),reply:async p=>events.push(p)};
 const ctx={allowed:new Set(['7']),channelId:'10',messageId:'20',refresh:async()=>events.push('refresh')};
 await handleInteraction(i,ctx);
 assert.equal(events.length,1);assert.equal(events[0].flags,64);assert.match(events[0].content,/coming soon/);assert.ok(!events.includes('refresh'));
});
