import {adapterCommand} from './adapter-runner.js';
import {normalizeUsage} from './core.js';
export async function loadUsage(exec, hermesBin, env, adapterPath, allowCliFallback=true, provider='openai-codex') {
  const options={timeout:60000,maxBuffer:1048576,env};
  try {
    const {stdout:launcher}=await exec(hermesBin,['--print-runtime-command'],options);
    const [bin,...args]=adapterCommand(JSON.parse(launcher),adapterPath);
    const {stdout}=await exec(bin,args,options);
    return {...normalizeUsage(JSON.parse(stdout)),provider};
  } catch {
    if(!allowCliFallback)throw Error('Read-only usage unavailable');
    // No stale credits or guessed zero when the adapter/API/runtime is unavailable.
    const {stdout}=await exec(hermesBin,['usage','--provider',provider,'--json'],options);
    const raw=JSON.parse(stdout);
    delete raw.reset_credits;
    return {...normalizeUsage(raw),provider};
  }
}
