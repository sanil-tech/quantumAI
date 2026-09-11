import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'data', 'scanner_discovered_setups.json');
if (fs.existsSync(file)) {
  const setups = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cleaned = setups.filter((s: any) => {
    if (s.pair === 'XAU/USD' && s.entryPrice < 4000) {
      return false; // Purge outdated 2300s Gold setups
    }
    if (s.pair === 'EUR/JPY' && s.entryPrice < 170) {
      return false; // Purge mismatched EUR/JPY setups
    }
    return true;
  });
  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2), 'utf8');
  console.log(`Cleaned scanner_discovered_setups.json: kept ${cleaned.length} / ${setups.length} setups.`);
}
