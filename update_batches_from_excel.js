const XLSX = require('xlsx');
const path = require('path');
const db = require('./database/database');

const excelPath = path.resolve(__dirname, '..', 'database db_obat.xlsx');
console.log('Reading Excel:', excelPath);

const workbook = XLSX.readFile(excelPath);
const sheet = workbook.SheetNames[0];
const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);

let total = 0;
let updated = 0;
let skipped = 0;

db.serialize(() => {
  data.forEach(row => {
    const nama = (row.nama_barang || row.Nama || '').toString().trim();
    const batch = (row.batch || row.Batch || row.batch_no || row.no_batch || '').toString().trim();
    if (!nama || !batch) { skipped++; return; }
    total++;
    // update any existing obat rows where nama matches and batch is null/empty
    db.run("UPDATE obat SET batch = ? WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?)) AND (batch IS NULL OR batch = '')", [batch, nama], function (err) {
      if (err) console.error('Update error for', nama, err);
      else if (this.changes && this.changes > 0) {
        updated += this.changes;
        console.log(`Updated ${this.changes} rows for '${nama}' -> batch='${batch}'`);
      } else {
        // try partial match: name contains
        db.run("UPDATE obat SET batch = ? WHERE LOWER(nama) LIKE '%' || LOWER(?) || '%' AND (batch IS NULL OR batch = '')", [batch, nama], function (err2) {
          if (err2) console.error('Fuzzy update error for', nama, err2);
          else if (this.changes && this.changes > 0) {
            updated += this.changes;
            console.log(`Fuzzy-updated ${this.changes} rows for '${nama}' -> batch='${batch}'`);
          } else {
            console.log(`No match to update for '${nama}'`);
          }
        });
      }
    });
  });

  // wait then close
  setTimeout(() => {
    console.log(`Done. Total rows processed: ${total}, updated: ${updated}, skipped: ${skipped}`);
    db.close();
  }, 2000);
});
