import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('service schedules dashboard refresh every 300000 milliseconds',async()=>{
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/timer=setInterval\([^\n]+,300000\);/);
 assert.match(main,/auto_refresh=300s/);
});
