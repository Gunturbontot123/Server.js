const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'apotek.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error('OPEN ERR', err.message); process.exit(1); }
});

db.serialize(() => {
  db.get("SELECT COUNT(*) AS c FROM obat", (err, row) => {
    if (err) { console.error('ERR', err.message); process.exit(1); }
    console.log('apotek.db obat count:', row.c);
    process.exit(0);
  });
});
