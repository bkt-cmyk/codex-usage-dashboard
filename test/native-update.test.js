import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsage,dashboardPayload} from '../src/core.js';
const usage=normalizeUsage({plan:'Plus',fetched_at:'2026-10-10T18:02:11Z',windows:[{label:'Session',used_percent:10,resets_at:'2026-10-10T21:54:14Z'},{label:'Weekly',used_percent:20,resets_at:'2026-10-16T22:07:05Z'}]});
test('native update PATCH clears media and verifies builders, texts and button IDs on same route',async()=>{
 const {updateNativeDashboard}=await import('../src/native-update.js');let sent,route;
 const rest={patch:async(r,p)=>{route=r;sent=p;},get:async()=>({...sent.body,attachments:[],embeds:[]})};
 await updateNativeDashboard(rest,'/channels/10/messages/20',usage);assert.equal(route,'/channels/10/messages/20');assert.deepEqual(sent.body.attachments,[]);assert.equal(sent.files,undefined);
 rest.get=async()=>({...sent.body,attachments:[{id:'old-image'}]});await assert.rejects(updateNativeDashboard(rest,route,usage),/verification/);
 rest.get=async()=>{const p=dashboardPayload(usage);p.components[0].components.find(c=>c.type===9).components[1].content='wrong quota';return p;};await assert.rejects(updateNativeDashboard(rest,route,usage),/verification/);
 rest.get=async()=>{const p=dashboardPayload(usage);const row=p.components[0].components.find(c=>c.type===1&&c.components[0]?.type===3);row.components[0].options[0].label='Wrong provider';return p;};await assert.rejects(updateNativeDashboard(rest,route,usage),/verification/);
});
