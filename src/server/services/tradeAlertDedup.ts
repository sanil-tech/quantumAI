import * as fs from 'fs';
import * as path from 'path';
export const ENTRY_ALERT_COOLDOWN_MS = 30 * 60 * 1000;
export function entryAlertKey(p: {pair:string;direction:string;timeframe?:string}) {
  return [p.pair.replace(/[^A-Za-z0-9]/g,'').toUpperCase(),p.direction,p.timeframe || 'UNKNOWN'].join(':');
}
// Claim before sending: concurrent scans and restarts cannot reset the entry cooldown.
// A failed send remains claimed to avoid repeated delivery after ambiguous network errors.
export function claimEntryAlert(p: {pair:string;direction:string;timeframe?:string}, file: string, now=Date.now()): boolean {
  const entries: Record<string,number> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('INVALID_ALERT_LEDGER');
  const key = entryAlertKey(p);
  if (Number.isFinite(entries[key]) && now - entries[key] < ENTRY_ALERT_COOLDOWN_MS) return false;
  for (const k of Object.keys(entries)) if (now - entries[k] >= ENTRY_ALERT_COOLDOWN_MS) delete entries[k];
  entries[key] = now;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(entries),'utf8');
  return true;
}
