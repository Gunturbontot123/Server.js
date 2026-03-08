const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// prefer DB_Obat.xlsx if present
let excelPath = path.resolve(__dirname, '..', 'DB_Obat.xlsx');
if (!require('fs').existsSync(excelPath)) {
  excelPath = path.resolve(__dirname, '..', 'database db_obat.xlsx');
}
const outDbPath = path.resolve(__dirname, '..', 'DB_Obat.sqlite');

console.log('Reading Excel:', excelPath);
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.SheetNames[0];
const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);

console.log(`Rows in sheet: ${data.length}`);

const db = new sqlite3.Database(outDbPath, (err) => {
  if (err) { console.error('Failed to open output DB', err); process.exit(1); }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS obat (
    id_stok INTEGER,
    nama_barang TEXT,
    distributor TEXT,
    tgl_masuk TEXT,
    batch TEXT,
    ed TEXT,
    stok_awal INTEGER,
    stok_masuk INTEGER,
    jenis_obat TEXT,
    kategori_v TEXT
  )`);

  const stmt = db.prepare(`INSERT INTO obat (id_stok,nama_barang,distributor,tgl_masuk,batch,ed,stok_awal,stok_masuk,jenis_obat,kategori_v) VALUES (?,?,?,?,?,?,?,?,?,?)`);

  let added = 0;
  data.forEach(row => {
    const id_stok = row.id_stok || null;
    const nama_barang = row.nama_barang || row.Nama || '';
    const distributor = row.distributor || '';
    const tgl_masuk = typeof row.tgl_masuk === 'number' ? new Date((row.tgl_masuk - 25569)*86400*1000).toISOString().split('T')[0] : (row.tgl_masuk || '');
    const batch = row.batch || '';
    const ed = row.ed || '';
    const stok_awal = Number(row.stok_awal || row.stok_masuk || 0) || 0;
    const stok_masuk = Number(row.stok_masuk || row.stok_awal || 0) || 0;
    const jenis_obat = row.jenis_obat || row.jenis || '';
    const kategori_v = row.kategori_v || row.kategori || '';

    stmt.run([id_stok, nama_barang, distributor, tgl_masuk, batch, ed, stok_awal, stok_masuk, jenis_obat, kategori_v]);
    added++;
  });

  stmt.finalize(() => {
    console.log(`Inserted ${added} rows into ${outDbPath}`);
    db.close();
  });
});
