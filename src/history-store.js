import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
export class HistoryStore {
 constructor(path,clock=Date.now){
  this.clock=clock;mkdirSync(dirname(path),{recursive:true,mode:0o700});
  closeSync(openSync(path,'a',0o600));chmodSync(path,0o600);
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA journal_mode=DELETE;');
  const columns=this.db.prepare('PRAGMA table_info(snapshots)').all();
  if(columns.length===0)this.db.exec('CREATE TABLE snapshots(provider TEXT NOT NULL, account TEXT NOT NULL, at INTEGER NOT NULL, reset INTEGER NOT NULL, used REAL NOT NULL, PRIMARY KEY(provider,account,at,reset));');
  else if(!columns.some(c=>c.name==='provider'))this.db.exec("BEGIN IMMEDIATE; CREATE TABLE snapshots_v2(provider TEXT NOT NULL, account TEXT NOT NULL, at INTEGER NOT NULL, reset INTEGER NOT NULL, used REAL NOT NULL, PRIMARY KEY(provider,account,at,reset)); INSERT INTO snapshots_v2 SELECT 'openai-codex',account,at,reset,used FROM snapshots; DROP TABLE snapshots; ALTER TABLE snapshots_v2 RENAME TO snapshots; COMMIT;");
 }
 prune(){this.db.prepare('DELETE FROM snapshots WHERE at < ?').run(this.clock()-90*86400000);}
 record(usage){
  this.prune();const w=usage?.windows?.find(w=>w.name==='Weekly Limit');
  const provider=usage?.provider,at=Date.parse(usage?.fetchedAt),reset=Date.parse(w?.resetsAt);
  if(usage?.unavailable || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(provider||'') || !/^[a-f0-9]{64}$/.test(usage?.accountFingerprint||'') || !Number.isFinite(at) || !Number.isFinite(reset) || !Number.isFinite(w?.used) || at<this.clock()-90*86400000 || at>this.clock()+60000 || reset<=at)return false;
  this.db.prepare('INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?,?)').run(provider,usage.accountFingerprint,at,reset,w.used);return true;
 }
 list(provider,account){this.prune();if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(provider||'')||!/^[a-f0-9]{64}$/.test(account||''))return [];return this.db.prepare('SELECT at,reset,used FROM snapshots WHERE provider=? AND account=? ORDER BY at').all(provider,account);}
 close(){this.db.close();}
}
