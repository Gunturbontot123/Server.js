const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const srcPath = path.resolve(__dirname, '..', 'DB_Obat.sqlite');
// target data.db used by the app lives in the Server.js folder
const dstPath = path.resolve(__dirname, 'data.db');

console.log('Source DB:', srcPath);
console.log('Target DB:', dstPath);

const src = new sqlite3.Database(srcPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) { console.error('Failed to open source DB', err); process.exit(1); }
});
const dst = new sqlite3.Database(dstPath, (err) => {
  if (err) { console.error('Failed to open target DB', err); process.exit(1); }
});

let total = 0;
let updated = 0;
let inserted = 0;

src.serialize(() => {
  src.all('SELECT * FROM obat', (err, rows) => {
    if (err) { console.error('Read src error', err); process.exit(1); }
    total = rows.length;
    console.log('Rows to merge from source:', total);

    rows.forEach(r => {
      const name = (r.nama_barang || r.nama || '').toString().trim();
      const batch = (r.batch || '').toString().trim();
      const ed = (r.ed || r.kadaluarsa || '').toString().trim();
      const stok = Number(r.stok_masuk || r.stok_awal || r.stok || 0) || 0;
      const kategori = (r.kategori_v || r.jenis_obat || r.kategori || '').toString().trim().toUpperCase() || null;

      if (!name) return;

      // find by exact name first
      dst.get('SELECT id, nama, batch, jumlah, kadaluarsa FROM obat WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?))', [name], (err2, existing) => {
        if (err2) return console.error('Query error', err2);
        if (existing) {
          // update only missing fields: batch, kadaluarsa, jumlah (if 0)
          const toBatch = (!existing.batch || existing.batch === '') && batch ? batch : existing.batch;
          const toKadaluarsa = (!existing.kadaluarsa || existing.kadaluarsa === '') && ed ? ed : existing.kadaluarsa;
          const toJumlah = (existing.jumlah == null || Number(existing.jumlah) === 0) && stok ? stok : existing.jumlah;
          const toKategori = kategori ? kategori : undefined;

          const params = [name, toJumlah, toKadaluarsa, toBatch, toKategori === undefined ? existing.kategori : toKategori, existing.id];
          dst.run('UPDATE obat SET nama=? , jumlah=?, kadaluarsa=?, batch=?, kategori=? WHERE id=?', params, function (uerr) {
            if (uerr) return console.error('Update error', uerr);
            if (this.changes && this.changes > 0) updated += this.changes;
          });
        } else {
          // insert new record into app DB
          const id = require('uuid').v4();
          dst.run('INSERT INTO obat (id, nama, jumlah, kadaluarsa, ved, batch, kategori) VALUES (?,?,?,?,?,?,?)',
            [id, name, stok, ed, (stok<=2? 'V': (stok<=10? 'E' : 'D')), batch || null, kategori], function (ierr) {
              if (ierr) return console.error('Insert error', ierr);
              inserted += 1;
          });
        }
      });
    });

    // wait then summarize
    setTimeout(() => {
      console.log(`Merge complete. Source rows: ${total}, inserted: ${inserted}, updated: ${updated}`);
      src.close(); dst.close();
      process.exit(0);
    }, 3000);
  });
});
