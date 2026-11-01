import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Routes, PermissionFlagsBits } from 'discord.js';
import { dashboardPayload, unavailableUsage } from './core.js';
import { updateNativeDashboard } from './native-update.js';
import { loadUsage } from './usage-source.js';
import { fileURLToPath } from 'node:url';
import { UsageCache } from './cache.js';
import {registerInteractions, assertBootstrapReady, checkReport, fetchAndWriteDashboard} from './service-safety.js';
import {SerialGate} from './serial-gate.js';
import {HistoryStore} from './history-store.js';
import {HistoryCapture} from './history-capture.js';
import {HistoryController} from './history-controller.js';

process.umask(0o077);
const exec=promisify(execFile);
let client, timer;
const log=(event)=>console.log(`${new Date().toISOString()} ${event}`);
// Never print Discord errors, HTTP request bodies, CLI stderr or environment values.
const safeError=(e)=> typeof e.code==='number' ? `Discord/API code ${e.code}` : 'operation failed (details suppressed)';
async function loadEnv(path) {
  try { return dotenv.parse(await readFile(path)); } catch(e) { if(e.code==='ENOENT') return {}; throw e; }
}
async function main() {
  const local=await loadEnv(process.env.DASHBOARD_ENV || resolve('.env'));
  const cfg={...local,...process.env};
  if (!/^\d{17,20}$/.test(cfg.DASHBOARD_CHANNEL_ID || '')) throw new Error('Missing DASHBOARD_CHANNEL_ID');
  const hermesHome=cfg.HERMES_HOME || resolve(process.env.HOME || '.', '.hermes');
  const shared=await loadEnv(cfg.HERMES_ENV || resolve(hermesHome,'.env'));
  const token=cfg.DISCORD_BOT_TOKEN || shared.DISCORD_BOT_TOKEN;
  if(!token) throw new Error('Missing DISCORD_BOT_TOKEN');
  const allowed=new Set((cfg.DASHBOARD_ALLOWED_USERS || shared.DISCORD_ALLOWED_USERS || '').split(/[\s,]+/).filter(Boolean));
  if(!allowed.size || [...allowed].some(id=>!/^\d{17,20}$/.test(id))) throw new Error('Missing or invalid allowed User IDs');
  const statePath=resolve(cfg.DASHBOARD_STATE_FILE || 'data/state.json');
  let state=null;
  try { state=JSON.parse(await readFile(statePath,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; }
  if(state && state.channelId!==cfg.DASHBOARD_CHANNEL_ID) throw new Error('State channel mismatch; refusing publication');
  async function save(next) {
    await mkdir(dirname(statePath),{recursive:true,mode:0o700});
    await writeFile(statePath+'.tmp',JSON.stringify(next,null,2)+'\n',{mode:0o600});
    await rename(statePath+'.tmp',statePath); state=next;
  }
  let historyStore=null;
  if(!process.argv.includes('--check'))try{historyStore=new HistoryStore(resolve(cfg.DASHBOARD_HISTORY_FILE || resolve(dirname(statePath),'usage-history.sqlite')));}catch{log('history storage unavailable (details suppressed)');}
  const capture=new HistoryCapture(historyStore,()=>loadUsage(exec,cfg.HERMES_BIN || 'hermes',{...process.env,HERMES_HOME:hermesHome},fileURLToPath(new URL('./usage_adapter.py',import.meta.url)),false),()=>log('history sample not saved (details suppressed)'));
  const cache=new UsageCache(()=>capture.fetch(),45000);
  const history=new HistoryController(historyStore,()=>capture.latest);
  client=new Client({intents:[GatewayIntentBits.Guilds]});
  client.on('error',()=>log('gateway error (details suppressed)'));
  const ready=once(client,'clientReady');
  await client.login(token); await ready;
  const channel=await client.channels.fetch(cfg.DASHBOARD_CHANNEL_ID);
  if(!channel || channel.type!==0) throw new Error('Dashboard requires a normal guild text channel');
  await channel.guild.members.fetchMe();
  const perms=channel.permissionsFor(client.user);
  for(const [name,bit] of [['ViewChannel',PermissionFlagsBits.ViewChannel],['SendMessages',PermissionFlagsBits.SendMessages],['ReadMessageHistory',PermissionFlagsBits.ReadMessageHistory]]) {
    if(!perms?.has(bit)) throw new Error(`Missing Discord permission: ${name}`);
  }
  const pinBit=PermissionFlagsBits.PinMessages;
  const canPin=pinBit ? perms.has(pinBit) : perms.has(PermissionFlagsBits.ManageMessages);
  const app=await client.rest.get(Routes.currentApplication());
  if(app.interactions_endpoint_url) throw new Error('Existing app uses HTTP interactions; a separate bot is required');
  const usage=await cache.get().catch(()=>unavailableUsage());
  const isCheck=process.argv.includes('--check');
  const isPublish=process.argv.includes('--publish');
  if(isCheck||isPublish) assertBootstrapReady({usage,canPin});
  const everyone=channel.permissionsFor(channel.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel);
  if(isCheck) {
    console.log(JSON.stringify(checkReport({canPin,everyoneCanView:everyone,allowedUserCount:allowed.size,usage,state}),null,2));
    client.destroy(); return;
  }
  let message;
  if(state?.messageId) {
    message=await channel.messages.fetch(state.messageId);
    if(message.author.id!==client.user.id || !message.components.some(c=>c.type===17)) throw new Error('Saved message is not this bot dashboard');
  } else {
    if(!isPublish) throw new Error('No dashboard state; use --publish only after publication approval');
    if(state?.publishing) throw new Error('Prior publication incomplete; reconcile message ID before retrying to avoid duplicates');
    if(!canPin) throw new Error('Missing Discord permission to pin messages');
    await save({channelId:channel.id,publishing:true});
    // Only this explicit bootstrap path can create a message. Normal service never recreates deleted messages.
    const sent=await client.rest.post(Routes.channelMessages(channel.id),{body:dashboardPayload(usage)});
    await save({channelId:channel.id,messageId:sent.id,guildId:channel.guild.id,createdAt:new Date().toISOString()});
    message=await channel.messages.fetch(sent.id);
    if(!message.flags.has(32768)) throw new Error('Components V2 verification failed');
  }
  const gate=new SerialGate();
  let updatePending=null;

  async function refresh(force=false,requireAvailable=false) {
    if(force && updatePending) await updatePending.catch(()=>{});
    if(updatePending) return updatePending;
    updatePending=gate.run(async()=>{
      const fresh=await fetchAndWriteDashboard({
        getUsage:()=>force?cache.fresh():cache.get(),
        fallback:unavailableUsage,
        requireAvailable,
        write:value=>updateNativeDashboard(client.rest,Routes.channelMessage(channel.id,state.messageId),value),
      });

      const latestUsagePath=resolve(dirname(statePath),'latest-usage.json');
      await writeFile(latestUsagePath,JSON.stringify(fresh,null,2)+'\n',{mode:0o600});
      await chmod(latestUsagePath,0o600);
      log('Native V2 dashboard updated');
      if(fresh.unavailable) throw new Error('Usage unavailable; dashboard shows Unavailable');
    });
    try { await updatePending; } finally { updatePending=null; }
  }
  const ctx={allowed,channelId:channel.id,messageId:state.messageId,history,refresh};
  if(isPublish) await refresh(false,true);
  else await refresh().catch(e=>log(`initial refresh failed; ${safeError(e)}`));
  if(isPublish) {
    if(!message.pinned) await message.pin('Codex usage dashboard (approved publication)');
    const verified=await client.rest.get(Routes.channelMessage(channel.id,state.messageId));
    if(!verified.pinned) throw new Error('Pin verification failed');
    log('published and pin verified');
    client.destroy(); return;
  }
  registerInteractions(client,ctx,'service',e=>log(`interaction failed ${safeError(e)}`));
  timer=setInterval(()=>refresh().catch(e=>log(`auto-refresh failed; previous message retained; ${safeError(e)}`)),300000);
  log('service ready auto_refresh=300s cache=45s');
}
function stop() {clearInterval(timer);client?.destroy();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
main().catch(e=>{
  const known=/^(Missing |Usage unavailable|No dashboard state|Dashboard requires|State channel mismatch|Saved message|Prior publication incomplete|Existing app uses|Components V2|Pin verification)/;
  console.error(known.test(e.message)?e.message:safeError(e));
  client?.destroy(); process.exitCode=1;
});
