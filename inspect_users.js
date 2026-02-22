const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('apotek.db', sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error('OPEN ERR', err.message); process.exit(1); }
});

db.all('SELECT id,username,password,role FROM users', (err, rows) => {
  if (err) { console.error('QUERY ERR', err.message); process.exit(1); }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
