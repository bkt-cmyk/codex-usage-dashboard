import {randomBytes} from 'node:crypto';
import {historyWeek,renderHistoryPng} from './history-chart.js';

const ERROR='Usage history unavailable. Open History again from the dashboard.';
const privateError={content:ERROR,flags:64,allowedMentions:{parse:[]}};
const SESSION_TTL=10*60000,SESSION_LIMIT=100;

export class HistoryController {
 constructor(store,getUsage,clock=Date.now){
  this.store=store;
  this.getUsage=getUsage;
  this.clock=clock;
  this.sessions=new Map();
 }
 current(){
  const u=this.getUsage(),w=u?.windows?.find(w=>w.name==='Weekly Limit');
  if(u?.unavailable || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(u?.provider||'') || !/^[a-f0-9]{64}$/.test(u?.accountFingerprint||'') ||
     !Number.isFinite(w?.used) || !Number.isFinite(Date.parse(u?.fetchedAt)) ||
     !Number.isFinite(Date.parse(w?.resetsAt)))throw Error(ERROR);
  return u;
 }
 cleanup(){
  for(const [id,s] of this.sessions)if(this.clock()>=s.expires)this.sessions.delete(id);
 }
 authorized(i,ctx){
  if(!ctx.allowed.has(i.user.id)||i.channelId!==ctx.channelId)throw Error(ERROR);
 }
 validate(i,ctx,s){
  this.cleanup();
  this.authorized(i,ctx);
  if(this.sessions.get(s.id)!==s || i.user.id!==s.owner || i.channelId!==s.channel ||
     (s.reply?i.message.id!==s.reply:i.message.id!==ctx.messageId))throw Error(ERROR);
  try{const current=this.current();if(current.provider!==s.provider||current.accountFingerprint!==s.account)throw Error(ERROR);}
  catch{this.sessions.delete(s.id);throw Error(ERROR);}
 }
 samples(i,ctx,s){
  this.validate(i,ctx,s);
  return this.store.list(s.provider,s.account).filter(p=>p.at>=this.clock()-90*86400000&&p.at<=s.anchor);
 }
 payload(s,samples,offset){
  const week=historyWeek(samples,s.anchor,offset);
  const older=offset<12&&samples.some(p=>p.at<week.start);
  const button=(label,target,disabled)=>({
   type:2,style:2,label,custom_id:`codex_usage:history_nav:${s.id}:${target}`,disabled
  });
  return {
   content:'',allowedMentions:{parse:[]},attachments:[],embeds:[],
   components:[{type:1,components:[
    button('← Previous 7 days',offset+1,!older),
    button('Next 7 days →',Math.max(0,offset-1),offset===0)
   ]}],
   files:[{attachment:renderHistoryPng(week),name:'weekly-history.png'}]
  };
 }
 async open(i,ctx){
  let s;
  this.cleanup();
  try{
   this.authorized(i,ctx);
   if(i.message.id!==ctx.messageId||this.sessions.size>=SESSION_LIMIT)throw Error(ERROR);
   s={
    id:randomBytes(16).toString('hex'),provider:this.current().provider,account:this.current().accountFingerprint,
    owner:i.user.id,channel:i.channelId,anchor:this.clock(),
    expires:this.clock()+SESSION_TTL,offset:0
   };
   // Reserve capacity before acknowledgement, including pending opens.
   this.sessions.set(s.id,s);
  }catch{return i.reply(privateError);}
  try{
   await i.deferReply({flags:64});
   const samples=this.samples(i,ctx,s),payload=this.payload(s,samples,0);
   this.validate(i,ctx,s);
   const reply=await i.editReply(payload);
   this.validate(i,ctx,s);
   if(!reply?.id)throw Error(ERROR);
   s.reply=reply.id;
   this.sessions.set(s.id,s);
  }catch{
   this.sessions.delete(s.id);
   await i.editReply({content:ERROR,allowedMentions:{parse:[]},components:[],embeds:[],attachments:[]});
  }
 }
 async navigate(i,ctx){
  const match=/^codex_usage:history_nav:([a-f0-9]{32}):(0|[1-9]|1[0-2])$/.exec(i.customId);
  const s=match&&this.sessions.get(match[1]),offset=match&&Number(match[2]);
  try{
   if(!s||!s.reply||s.busy)throw Error(ERROR);
   this.validate(i,ctx,s);
   if(Math.abs(offset-s.offset)!==1)throw Error(ERROR);
  }catch{return i.reply(privateError);}
  // Reject overlapping clicks rather than queueing unbounded interaction tokens.
  s.busy=true;
  try{
   await i.deferUpdate();
   const samples=this.samples(i,ctx,s);
   if(offset>s.offset&&!samples.some(p=>p.at<historyWeek([],s.anchor,s.offset).start))throw Error(ERROR);
   const payload=this.payload(s,samples,offset);
   this.validate(i,ctx,s);
   await i.editReply(payload);
   this.validate(i,ctx,s);
   s.offset=offset;
  }catch{
   // A failed edit can have reached Discord: never reuse an uncertain offset.
   this.sessions.delete(s.id);
   await i.followUp(privateError);
  }finally{s.busy=false;}
 }
}
