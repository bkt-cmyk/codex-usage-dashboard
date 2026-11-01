import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageFlags} from 'discord.js';
import {normalizeUsage,unavailableUsage,dashboardPayload} from '../src/core.js';
const usage=normalizeUsage({plan:'Plus',fetched_at:'2026-10-10T18:02:11Z',windows:[{label:'5-hour window',used_percent:1.25,resets_at:'2026-10-10T21:54:14Z'},{label:'Weekly',used_percent:21,resets_at:'2026-10-16T22:07:05Z'}]});
test('native dashboard uses validated purple ContainerBuilder, provider selector, Sections, Separators and only Refresh and History buttons',async()=>{
 const {dashboardPayload,buildDashboardContainer}=await import('../src/core.js');
 const builder=buildDashboardContainer(usage);assert.equal(builder.constructor.name,'ContainerBuilder');
 const p=dashboardPayload(usage);assert.equal(p.flags,MessageFlags.IsComponentsV2);assert.deepEqual(p.attachments,[]);assert.deepEqual(p.embeds,[]);
 const container=p.components[0];assert.equal(container.type,17);assert.equal(container.accent_color,0x8b5cf6);
 const sections=container.components.filter(c=>c.type===9);assert.equal(sections.length,2);
 assert.ok(sections.every(c=>c.accessory.type===2&&c.accessory.disabled===true));
 assert.ok(container.components.filter(c=>c.type===14).length>=3);
 const text=[...container.components.filter(c=>c.type===10),...sections.flatMap(c=>c.components)].map(c=>c.content).join('\n');
 for(const v of ['Usage Dashboard','5-Hour Limit','Weekly Limit','1.25% used','98.75% remaining','Last Updated','Plan','Usage Limit Resets','░'])assert.ok(text.includes(v),v);
 const rows=container.components.filter(c=>c.type===1);
 assert.equal(rows.length,2);
 const provider=rows[0].components[0];
 assert.equal(provider.type,3);assert.equal(provider.custom_id,'usage_dashboard:provider');
 assert.equal(provider.placeholder,'Provider: OpenAI Codex');
 assert.deepEqual(provider.options.map(o=>[o.value,o.label,o.description,o.default]),[
  ['openai-codex','OpenAI Codex','Connected',true],
  ['anthropic','Anthropic Claude','Coming soon',undefined],
  ['google-gemini','Google Gemini','Coming soon',undefined]
 ]);
 assert.deepEqual(rows[1].components.map(b=>b.custom_id),['codex_usage:refresh','codex_usage:history']);
 assert.ok(!JSON.stringify(p).includes('attachment://'));assert.deepEqual(p.allowed_mentions,{parse:[]});
 const unknown=JSON.stringify(dashboardPayload(unavailableUsage()));assert.ok(unknown.includes('Unavailable'));assert.ok(!unknown.includes('NaN'));assert.ok(!unknown.includes('0% used'));
});
test('dashboard uses colored-square labels, short subtitle and no reset Status or Model',()=>{
 for(const u of [usage,unavailableUsage()]) {
  const container=dashboardPayload(u).components[0];
  assert.equal(container.components[0].content,'## Usage Dashboard\n-# Auto refresh every 5 min');
  const sections=container.components.filter(c=>c.type===9);
  assert.equal(sections[0].components[0].content,'### 🟥 5-Hour Limit');
  assert.equal(sections[1].components[0].content,'### 🟨 Weekly Limit');
  const reset=container.components.find(c=>c.type===10&&c.content.includes('Usage Limit Resets'));
  assert.equal(reset.content,'**🟩 Usage Limit Resets**\nAvailable: Unavailable');
  const text=JSON.stringify(container);
  for(const removed of ['⏱️','📅','🔄','Status:','Model:','Account limits','read-only'])assert.ok(!text.includes(removed),removed);
  const footer=container.components.filter(c=>c.type===10).at(-1).content;
  assert.equal(footer.split('\n').length,2);assert.ok(footer.startsWith('**Plan:**'));assert.ok(footer.includes('\n**Last Updated:**'));
 }
});
