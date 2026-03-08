const XLSX = require('xlsx');
const path = require('path');
const db = require('./database/database');

const excelPath = path.resolve(__dirname, '..', 'database db_obat.xlsx');
console.log('Reading Excel for fuzzy updates:', excelPath);

function levenshtein(a, b) {
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;
  a = a.toLowerCase(); b = b.toLowerCase();
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

const workbook = XLSX.readFile(excelPath);
const sheet = workbook.SheetNames[0];
const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);

// Build map from excel name -> batch
const excelMap = data.reduce((acc, row) => {
  const name = (row.nama_barang || row.Nama || '').toString().trim();
  const batch = (row.batch || row.Batch || row.batch_no || row.no_batch || row.lot || '').toString().trim();
  if (name && batch) acc.push({ name, batch });
  return acc;
}, []);

if (excelMap.length === 0) {
  console.log('No excel rows with batch found. Exiting.');
  process.exit(0);
}

// Load DB obat rows with empty batch
db.serialize(() => {
  db.all("SELECT id, nama, batch FROM obat WHERE batch IS NULL OR batch = ''", (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('DB rows needing batch:', rows.length);

    let updates = 0;
    let attempts = 0;

    rows.forEach(dbRow => {
      let best = { score: -1, excelName: null, batch: null };
      excelMap.forEach(ex => {
        const dist = levenshtein(dbRow.nama || '', ex.name || '');
        const maxLen = Math.max((dbRow.nama || '').length, (ex.name || '').length, 1);
        const similarity = 1 - (dist / maxLen); // 0..1
        if (similarity > best.score) {
          best = { score: similarity, excelName: ex.name, batch: ex.batch };
        }
      });

      attempts++;
      // threshold: require fairly close match
      if (best.score >= 0.65) {
        db.run("UPDATE obat SET batch = ? WHERE id = ?", [best.batch, dbRow.id], function(err2) {
          if (err2) console.error('Update error', err2);
          else if (this.changes && this.changes > 0) {
            updates += this.changes;
            console.log(`Fuzzy-updated id=${dbRow.id} name="${dbRow.nama}" -> batch='${best.batch}' (sim=${best.score.toFixed(2)}) matched to "${best.excelName}")`);
          }
        });
      }
    });

    // close after a small delay
    setTimeout(() => {
      console.log(`Fuzzy matching done. Attempts: ${attempts}, Updates: ${updates}`);
      db.close();
    }, 2000);
  });
});
