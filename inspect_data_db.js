const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dstPath = path.resolve(process.cwd(), '..', 'data.db');
console.log('Checking target path:', dstPath, 'exists=', fs.existsSync(dstPath));

const db = new sqlite3.Database(dstPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error('Open error', err); process.exit(1); }
  db.all("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')", (e, rows) => {
    if (e) { console.error('List error', e); process.exit(1); }
    console.log('sqlite_master rows:', rows);
    db.all("PRAGMA table_info('obat')", (pe, cols) => {
      if (pe) { console.error('PRAGMA error', pe); process.exit(1); }
      console.log('obat columns:', cols);
      process.exit(0);
    });
  });
});
