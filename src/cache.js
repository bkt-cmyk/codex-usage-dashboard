export class UsageCache {
  constructor(fetcher, ttl=45000, clock=Date.now) {
    this.fetcher=fetcher; this.ttl=ttl; this.clock=clock; this.last=null; this.at=0; this.pending=null;
  }
  async fresh() {
    if(this.pending) await this.pending.catch(()=>{});
    this.last=null;this.at=0;
    return this.get();
  }
  async get() {
    if (this.last && this.clock()-this.at<this.ttl) return this.last;
    if (this.pending) return this.pending;
    this.pending=Promise.resolve().then(()=>this.fetcher()).then(value=>{this.last=value;this.at=this.clock();return value;});
    try { return await this.pending; } finally { this.pending=null; }
  }
}
