import {ContainerBuilder,TextDisplayBuilder,SectionBuilder,SeparatorBuilder,SeparatorSpacingSize,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,MessageFlags} from 'discord.js';
const clean = value => String(value).replace(/[@`*_~<>]/g, '').slice(0,100);
const stamp = (iso, style='F') => iso && Number.isFinite(Date.parse(iso)) ? `<t:${Math.floor(Date.parse(iso)/1000)}:${style}>` : 'Unavailable';
const bar = used => { const n=Math.round(Math.max(0,Math.min(100,used))*15/100); return '█'.repeat(n)+'░'.repeat(15-n); };
const resetText = usage => {
  const count=usage.resetCredits?.available;
  if (count===null || count===undefined) return '**🟩 Usage Limit Resets**\nAvailable: Unavailable';
  return `**🟩 Usage Limit Resets**\nAvailable: ${count} resets`;
};
export function buildDashboardContainer(usage) {
  const display=content=>new TextDisplayBuilder().setContent(content);
  const separator=()=>new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
  const container=new ContainerBuilder().setAccentColor(0x8b5cf6)
    .addTextDisplayComponents(display('## Usage Dashboard\n-# Auto refresh every 5 min'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('usage_dashboard:provider').setPlaceholder('Provider: OpenAI Codex').addOptions(
        {label:'OpenAI Codex',value:'openai-codex',description:'Connected',default:true},
        {label:'Anthropic Claude',value:'anthropic',description:'Coming soon'},
        {label:'Google Gemini',value:'google-gemini',description:'Coming soon'}
      )
    ))
    .addSeparatorComponents(separator());
  usage.windows.forEach((w,index)=>{
    const known=typeof w.used==='number' && Number.isFinite(w.used);
    const section=new SectionBuilder().addTextDisplayComponents(
      display(`### ${index===0?'🟥':'🟨'} ${w.name}`),
      display(known?`\`${bar(w.used)}\`\n**${w.used}% used** · **${w.remaining}% remaining**`:'**Unavailable**'),
      display(`-# Resets ${stamp(w.resetsAt)} · ${stamp(w.resetsAt,'R')}`)
    ).setButtonAccessory(new ButtonBuilder().setCustomId(`codex_usage:window:${index}`).setLabel(index===0?'5H':'7D').setStyle(ButtonStyle.Secondary).setDisabled(true));
    container.addSectionComponents(section).addSeparatorComponents(separator());
  });
  container.addTextDisplayComponents(display(resetText(usage)))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(display(`**Plan:** ${clean(usage.plan)}\n**Last Updated:** ${stamp(usage.fetchedAt,'f')}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('codex_usage:refresh').setLabel('Refresh').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('codex_usage:history').setLabel('History').setStyle(ButtonStyle.Secondary)
    ));
  return container;
}
export function dashboardPayload(usage) {
  return {flags:MessageFlags.IsComponentsV2,allowed_mentions:{parse:[]},attachments:[],embeds:[],components:[buildDashboardContainer(usage).toJSON()]};
}


export function unavailableUsage() {
  return {unavailable:true,plan:'Unavailable',fetchedAt:null,resetCredits:{available:null},windows:['5-Hour Limit','Weekly Limit'].map(name=>({name,used:null,remaining:null,resetsAt:null}))};
}

export function normalizeUsage(raw) {
  if (raw?.unavailable_reason) throw new Error('Usage unavailable');
  if (!Array.isArray(raw?.windows)) throw new Error('Missing windows');
  const find = (name, match) => {
    const w = raw.windows.find(w => match.test(String(w.label)));
    if (!w) throw new Error('Missing required windows');
    if (typeof w.used_percent !== 'number' || !Number.isFinite(w.used_percent)) throw new Error('Invalid percent');
    if (!Number.isFinite(Date.parse(w.resets_at))) throw new Error('Invalid reset time');
    return {name, used:w.used_percent, remaining:Math.max(0, Math.min(100,100-w.used_percent)), resetsAt:w.resets_at};
  };
  if (!Number.isFinite(Date.parse(raw.fetched_at))) throw new Error('Invalid fetched_at');
  const credits=raw.reset_credits;
  const count=credits?.available_count;
  const available=credits?.same_usage_response===true && Number.isSafeInteger(count) && count>=0 ? count : null;
  return {accountFingerprint:/^[a-f0-9]{64}$/.test(raw.account_fingerprint || '')?raw.account_fingerprint:null, plan:String(raw.plan ?? 'Unknown'), fetchedAt:raw.fetched_at, resetCredits:{available}, windows:[find('5-Hour Limit',/session|5[ -]?hour/i),find('Weekly Limit',/weekly/i)]};
}
