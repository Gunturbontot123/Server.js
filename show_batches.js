const db = require('./database/database');

db.serialize(() => {
  db.all("SELECT id, nama, batch, jumlah, kadaluarsa FROM obat LIMIT 30", (err, rows) => {
    if (err) { console.error('ERR', err); process.exit(1); }
    console.log('Sample obat rows with batch:');
    rows.forEach(r => console.log(r));
    process.exit(0);
  });
});
