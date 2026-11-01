import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('entrypoint rejects missing dashboard channel without leaking credentials',async()=>{
 try {await exec(process.execPath,['src/main.js','--check'],{env:{PATH:process.env.PATH,DASHBOARD_ENV:'/nonexistent',HERMES_ENV:'/nonexistent',DISCORD_BOT_TOKEN:'TOPSECRET'}}); assert.fail('should reject');}
 catch(e) { assert.equal(e.code,1);assert.match(e.stderr,/Missing DASHBOARD_CHANNEL_ID/);assert.ok(!e.stderr.includes('TOPSECRET')); }
});

test('public defaults are portable and contain no machine-specific home path',async()=>{
 const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/main.js',import.meta.url),'utf8'));
 assert.doesNotMatch(source,/\/home\/pi\//);
 assert.match(source,/process\.env\.HOME/);
 assert.match(source,/cfg\.HERMES_BIN \|\| 'hermes'/);
 assert.match(source,/chmod\(latestUsagePath,0o600\)/);
});
