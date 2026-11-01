import test from 'node:test';
import assert from 'node:assert/strict';
const base={plan:'Plus',fetched_at:'2026-10-10T18:02:11Z',windows:[{label:'Session',used_percent:1,resets_at:'2026-10-10T21:54:14Z'},{label:'Weekly',used_percent:21,resets_at:'2026-10-16T22:07:05Z'}]};
test('strict service loading never falls back to potentially mutating CLI credential resolver',async()=>{const {loadUsage}=await import('../src/usage-source.js');let calls=0;await assert.rejects(()=>loadUsage(async()=>{calls++;throw Error('secret');},'/hermes',{},'/adapter.py',false),/Read-only usage unavailable/);assert.equal(calls,1);});
test('data loader uses one adapter snapshot for every value and CLI fallback never infers zero',async()=>{
 const {loadUsage}=await import('../src/usage-source.js');
 const calls=[];
 const runtime=['/python','-I','-c',"import hermes_bootstrap; runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)"];
 const io=async(bin,args)=>{calls.push([bin,args]);return {stdout:JSON.stringify(bin==='/hermes'?runtime:{...base,reset_credits:{available_count:0,same_usage_response:true}})};};
 const first=await loadUsage(io,'/hermes',{},'/adapter.py'); assert.equal(first.provider,'openai-codex');assert.equal(first.resetCredits.available,0);assert.equal(calls.length,2);assert.equal(calls[1][0],'/python');
 const fallback=async(bin,args)=>{if(args[0]==='--print-runtime-command')throw Error('SECRET');return {stdout:JSON.stringify({...base,details:[]})};};
 const second=await loadUsage(fallback,'/hermes',{},'/adapter.py');assert.equal(second.resetCredits.available,null);assert.equal(second.windows[0].used,1);
});
