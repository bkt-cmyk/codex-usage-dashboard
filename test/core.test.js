import test from 'node:test';
import assert from 'node:assert/strict';

test('maps Hermes windows, preserves raw percent and rejects unavailable data', async () => {
  const { normalizeUsage } = await import('../src/core.js');
  const raw = {plan:'Plus', fetched_at:'2026-10-10T18:02:11Z', windows:[{label:'Session',used_percent:1,resets_at:'2026-10-10T21:54:14Z'},{label:'Weekly',used_percent:21,resets_at:'2026-10-16T22:07:05Z'}]};
  const usage = normalizeUsage(raw);
  assert.equal(usage.windows[0].name,'5-Hour Limit');
  assert.equal(usage.windows[1].name,'Weekly Limit');
  assert.equal(usage.windows[1].remaining,79);
  assert.equal(usage.windows[0].used,1);
  assert.throws(()=>normalizeUsage({...raw,windows:[]}),/windows/);
  assert.throws(()=>normalizeUsage({...raw,unavailable_reason:'no auth'}),/unavailable/);
  assert.throws(()=>normalizeUsage({...raw,windows:[{label:'Session',used_percent:null}]}),/percent/);
});
