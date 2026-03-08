const db = require('./database/database');

db.serialize(() => {
  db.all("SELECT id, nama, jumlah, kadaluarsa FROM obat WHERE batch IS NULL OR batch = '' ORDER BY nama ASC", (err, rows) => {
    if (err) { console.error('ERR', err); process.exit(1); }
    console.log(`Found ${rows.length} obat rows without batch:`);
    rows.forEach((r, i) => {
      console.log(`${i+1}. ${r.nama} | Qty: ${r.jumlah} | Exp: ${r.kadaluarsa} | id=${r.id}`);
    });
    process.exit(0);
  });
});
