import {unavailableUsage} from './core.js';
export class HistoryCapture {
 constructor(store,fetcher,onError=()=>{}){this.store=store;this.fetcher=fetcher;this.onError=onError;this.latest=unavailableUsage();}
 async fetch(){
  try{const value=await this.fetcher();this.latest=value;try{this.store?.record(value);}catch{this.onError();}return value;}
  catch(e){this.latest=unavailableUsage();throw e;}
 }
}
