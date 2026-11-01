import {handleInteraction} from './interactions.js';
export function registerInteractions(client,ctx,mode,onError){if(mode!=='service')return;client.on('interactionCreate',i=>handleInteraction(i,ctx).catch(onError));}
export function assertBootstrapReady({usage,canPin}){
 if(usage?.unavailable) throw new Error('Usage unavailable; refusing check or publication');
 if(!canPin) throw new Error('Missing Discord permission: PinMessages');
}
export function checkReport({canPin,everyoneCanView,allowedUserCount,usage,state}){
 return {
  ok:true,
  canPin:Boolean(canPin),
  everyoneCanView:Boolean(everyoneCanView),
  allowedUserCount,
  usageAvailable:!usage?.unavailable,
  windowCount:Array.isArray(usage?.windows)?usage.windows.length:0,
  resetCreditsConfirmed:Number.isInteger(usage?.resetCredits?.available),
  stateConfigured:Boolean(state?.messageId),
 };
}
export async function fetchAndWriteDashboard({getUsage,fallback,write,requireAvailable=false}){
 const usage=await getUsage().catch(()=>fallback());
 if(requireAvailable&&usage?.unavailable) throw new Error('Usage unavailable; refusing publication update');
 await write(usage);
 return usage;
}
