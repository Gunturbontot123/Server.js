const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// lokasi file database
const dbPath = path.resolve(__dirname, '../data.db');

// buat / buka database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error membuka database', err);
  } else {
    console.log('✅ Database terhubung');
  }
});

module.exports = db;
