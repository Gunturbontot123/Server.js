const db = require('./database/database');

db.serialize(() => {
  db.get("SELECT COUNT(*) AS total, SUM(CASE WHEN batch IS NOT NULL AND batch != '' THEN 1 ELSE 0 END) AS nonempty FROM obat", (err, row) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('Totals:', row);
    process.exit(0);
  });
});
