const XLSX = require('xlsx');
const path = require('path');
const db = require('./database/database');
const { v4: uuidv4 } = require('uuid');

const excelPath = path.resolve(__dirname, '..', 'database db_obat.xlsx');
console.log('Importing full obat dataset from:', excelPath);

function parseExcelDate(excelDate) {
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  if (!excelDate) return '';
  return String(excelDate).trim();
}

function classifyVED(n) {
  const v = parseInt(n || 0, 10);
  if (v <= 2) return 'V';
  if (v <= 10) return 'E';
  return 'D';
}

function normalizeKategori(k) {
  if (!k) return null;
  const s = String(k).trim().toUpperCase();
  return s;
}

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

let added = 0;
let updated = 0;
let skipped = 0;

db.serialize(() => {
  rows.forEach(row => {
    const nama = (row.nama_barang || row.Nama || '').toString().trim();
    if (!nama) { skipped++; return; }

    const jumlah = Number(row.stok_masuk || row.stok_awal || row.stok || 0) || 0;
    const kadaluarsa = parseExcelDate(row.ed || row.tgl_masuk || row.kadaluarsa || '');
    const batch = (row.batch || row.Batch || row.batch_no || row.no_batch || row.lot || '').toString().trim() || null;
    const kategori = normalizeKategori(row.kategori_v || row.jenis_obat || row.jenis || row.jenis_obat || '');
    const ved = classifyVED(jumlah);

    // try find by exact name
    db.get("SELECT id, jumlah FROM obat WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?))", [nama], (err, existing) => {
      if (err) { console.error('DB get error', err); return; }
      if (existing) {
        // update existing: set jumlah from Excel (overwrite), update batch/kategori if provided
        db.run("UPDATE obat SET nama=?, jumlah=?, kadaluarsa=?, ved=?, batch=COALESCE(?, batch), kategori=COALESCE(NULLIF(?,''), kategori) WHERE id=?",
          [nama, jumlah, kadaluarsa, ved, batch, kategori || '', existing.id], function(uerr) {
            if (uerr) console.error('Update err', uerr);
            else { updated++; }
        });
      } else {
        // insert new
        const id = uuidv4();
        db.run("INSERT INTO obat (id, nama, jumlah, kadaluarsa, ved, batch, kategori) VALUES (?,?,?,?,?,?,?)",
          [id, nama, jumlah, kadaluarsa, ved, batch, kategori], function (ierr) {
            if (ierr) console.error('Insert err', ierr);
            else { added++; }
        });
      }
    });
  });

  setTimeout(() => {
    console.log(`Import finished. Total rows in sheet: ${rows.length}. Added: ${added}. Updated: ${updated}. Skipped: ${skipped}`);
    db.close();
  }, 3000);
});
