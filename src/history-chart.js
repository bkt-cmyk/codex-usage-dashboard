import {deflateSync,crc32} from 'node:zlib';
import {glyphs} from './history-font.js';
const WEEK=7*86400000;
// Local technical raster plot only: no image-generation API or remote chart service.
export function renderHistoryPng(week){
 const width=1920,height=1080,stride=width*3+1,raw=Buffer.alloc(stride*height);
 const pixel=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x<0||x>=width||y<0||y>=height)return;raw.set(c,y*stride+1+x*3);};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(x,y,[24,24,35]);
 const ink=[210,210,225],red=[255,0,0],usageSize=3;
 // Shared square brush keeps observations the same width as the usage stroke.
 const mark=(x,y,c,size)=>{const radius=(size-1)/2;for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)pixel(x+a,y+b,c);};
 const line=(x1,y1,x2,y2,c,dashed=false,size=1)=>{const steps=Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1));for(let i=0;i<=steps;i++)if(!dashed||i%10<5)mark(x1+(x2-x1)*i/steps,y1+(y2-y1)*i/steps,c,size);};
 const textScale=3,textWidth=s=>(s.length*6-1)*textScale;
 const text=(s,x,y,color=ink)=>{for(const ch of s){const glyph=(glyphs[ch]||glyphs[' ']).replaceAll('/','');for(let i=0;i<35;i++)if(glyph[i]==='1')for(let a=0;a<textScale;a++)for(let b=0;b<textScale;b++)pixel(x+(i%5)*textScale+a,y+Math.floor(i/5)*textScale+b,color);x+=6*textScale;}};
 // Reflow at native 1080p: reserve only compact tick and calendar margins.
 // Both edges reserve space for a centered five-character date (e.g. 31/12).
 const left=100,right=1820,top=32,bottom=1000,plotWidth=right-left,plotHeight=bottom-top;
 const title='Weekly Usage';
 text(title,Math.round((width-textWidth(title))/2),4);
 // Round the axis ceiling up to a 10-percent tick without changing raw observations.
 const upper=Math.ceil(Math.max(100,...week.segments.flatMap(s=>s.map(p=>p.used)))/10)*10;
 for(let n=0;n<=upper;n+=10){const y=bottom-n/upper*plotHeight;line(left,y,right,y,[55,55,70]);text(String(n),20,Math.round(y)-10);}
 for(let d=0;d<=7;d++){const x=left+d*plotWidth/7;line(x,top,x,bottom,[45,45,60]);}
 for(const d of week.boundaries||[])text(d.label,Math.round(left+(d.at-week.start)/(week.end-week.start)*plotWidth-textWidth(d.label)/2),1032);
 for(const segment of week.segments){let prev;for(const s of segment){const p=[left+(s.at-week.start)/(week.end-week.start)*plotWidth,bottom-Math.max(0,s.used)/upper*plotHeight];if(prev)line(...prev.p,...p,red,s.at-prev.at>450000,usageSize);mark(...p,red,usageSize);prev={p,at:s.at};}}
 if(!week.segments.length){for(let y=476;y<505;y++)for(let x=700;x<1140;x++)pixel(x,y,[24,24,35]);text('No recorded observations',704,480);}
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export function historyWeek(samples,now=Date.now(),offset=0){
 if(!Number.isInteger(offset)||offset<0||offset>12)throw Error('Invalid history window');
 const day=86400000,thaiOffset=7*3600000;
 const today=Math.floor((now+thaiOffset)/day)*day-thaiOffset;
 const end=today+day-offset*WEEK,start=end-WEEK;
 const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',month:'numeric',day:'numeric'});
 const fullDate=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',month:'short',day:'numeric',year:'numeric'});
 const range=`${fullDate.format(start)} - ${fullDate.format(end-1)}`;
 const boundaries=Array.from({length:8},(_,i)=>({at:start+i*day,label:date.format(start+i*day).split('/').map(Number).join('/')}));
 const days=boundaries.slice(0,7);
 const selected=samples.filter(s=>s.at>=start&&s.at<end&&s.at<=now).sort((a,b)=>a.at-b.at);
 const segments=[],resets=[];let previous;
 for(const s of selected){
  // A drop alone proves nothing: require an observed advance across the prior scheduled reset.
  const reset=previous && Number.isFinite(previous.reset) && previous.at<previous.reset && previous.reset<=s.at && s.reset>previous.reset;
  if(reset)resets.push(previous.reset);
  if(!previous || (s.at-previous.at>450000 && !reset))segments.push([]);
  segments.at(-1).push(s);previous=s;
 }
 return {start,end,range,days,boundaries,resets,segments,latest:selected.at(-1)||null};
}
