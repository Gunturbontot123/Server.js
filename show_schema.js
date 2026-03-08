const db = require('./database/database');

db.serialize(() => {
  db.all("PRAGMA table_info('obat')", (err, cols) => {
    if (err) { console.error('ERR', err); process.exit(1); }
    console.log('obat columns:');
    console.log(cols);
    process.exit(0);
  });
});
