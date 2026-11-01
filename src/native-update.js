import {MessageFlags} from 'discord.js';
import {dashboardPayload} from './core.js';
const shape=c=>{
 const result={type:c.type};
 for(const k of ['content','accent_color','divider','spacing','custom_id','label','style','disabled','placeholder','value','description','default'])if(c[k]!==undefined)result[k]=c[k];
 if(c.components)result.components=c.components.map(shape);
 if(c.options)result.options=c.options.map(shape);
 if(c.accessory)result.accessory=shape(c.accessory);
 return result;
};
export async function updateNativeDashboard(rest,route,usage) {
 const payload=dashboardPayload(usage);
 await rest.patch(route,{body:payload});
 const message=await rest.get(route);
 if(!(message.flags&MessageFlags.IsComponentsV2) || message.attachments?.length || message.embeds?.length || JSON.stringify(message.components?.map(shape))!==JSON.stringify(payload.components.map(shape)))throw new Error('Native Components V2 verification failed');
 return message;
}
