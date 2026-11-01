import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {glyphs} from '../src/history-font.js';
export const bg=[24,24,35],ink=[210,210,225],red=[255,0,0];
export function decode(png){
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),stride=width*3+1,parts=[];
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')parts.push(png.subarray(p+8,p+8+n));p+=n+12;}
 const raw=inflateSync(Buffer.concat(parts));
 return {width,height,stride,raw,pixel:(x,y)=>{x=Math.round(x);y=Math.round(y);return [...raw.subarray(y*stride+1+x*3,y*stride+4+x*3)];}};
}
export function label(pixel,s,x,y,scale=3){
 for(const ch of s){assert.ok(glyphs[ch],`Missing glyph ${ch}`);const g=glyphs[ch].replaceAll('/','');
 for(let p=0;p<35;p++)for(let a=0;a<scale;a++)for(let b=0;b<scale;b++)assert.deepEqual(pixel(x+p%5*scale+a,y+Math.floor(p/5)*scale+b),g[p]==='1'?ink:bg,`${s}: ${ch} pixel ${p}`);
 x+=6*scale;}
}
