import {MessageFlags} from 'discord.js';
export async function handleInteraction(i,ctx){
 const button=i.isButton();
 const provider=i.isStringSelectMenu?.()===true&&i.customId==='usage_dashboard:provider';
 if(!button&&!provider)return;
 if(button&&i.customId.startsWith('codex_usage:history_nav:'))return ctx.history.navigate(i,ctx);
 if(!provider&&!['codex_usage:refresh','codex_usage:history'].includes(i.customId))return;
 if(!ctx.allowed.has(i.user.id))return i.reply({content:'Not authorized to use this dashboard.',flags:MessageFlags.Ephemeral});

 if(i.channelId!==ctx.channelId||i.message.id!==ctx.messageId)return i.reply({content:'This is not the active dashboard.',flags:MessageFlags.Ephemeral});
 if(provider){
  if(i.values[0]==='openai-codex')return i.deferUpdate();
  return i.reply({content:'This provider is coming soon and is not connected yet.',flags:MessageFlags.Ephemeral});
 }
 if(i.customId==='codex_usage:history')return ctx.history.open(i,ctx);
 await i.deferUpdate();
 try{await ctx.refresh();}catch{await i.followUp({content:'Usage refresh failed. Try again shortly.',flags:MessageFlags.Ephemeral});}
}
