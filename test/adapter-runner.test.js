import test from 'node:test';
import assert from 'node:assert/strict';
test('adapter runner keeps Hermes runtime bootstrap, runs only local adapter and rejects changed launcher shape',async()=>{
 const { adapterCommand }=await import('../src/adapter-runner.js');
 const runtime=['/runtime/python','-I','-c',"import hermes_bootstrap; runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)"];
 const command=adapterCommand(runtime,'/local/usage_adapter.py');
 assert.equal(command[0],'/runtime/python');assert.equal(command[1],'-I');
 assert.ok(command[3].includes('import hermes_bootstrap; '));
 assert.ok(command[3].endsWith("runpy.run_path(sys.argv[1], run_name='__main__')"));
 assert.equal(command[4],'/local/usage_adapter.py');
 assert.throws(()=>adapterCommand(['/runtime/python','-c','unknown'], '/local/usage_adapter.py'),/Unsupported/);
});
