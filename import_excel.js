const XLSX = require('xlsx');
const path = require('path');
const db = require('./database/database');

// Path ke file Excel
const excelPath = 'C:\\Users\\user\\OneDrive\\Documents\\Tugas Akhir Guntur\\DATABASE FINAL.xlsx';

console.log('📂 Membaca file Excel:', excelPath);

try {
  const workbook = XLSX.readFile(excelPath);
  console.log('📋 Sheet yang tersedia:', workbook.SheetNames);

  // Proses setiap sheet
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`\n📄 Sheet: "${sheetName}"`);
    console.log(`📊 Jumlah baris: ${data.length}`);
    
    if (data.length > 0) {
      console.log('📌 Kolom:', Object.keys(data[0]));
      console.log('✅ Sample data (1 baris pertama):', JSON.stringify(data[0], null, 2));

      // Tentukan tabel dan mapping kolom berdasarkan sheet name atau struktur
      if (sheetName.toLowerCase().includes('user') || sheetName.toLowerCase().includes('pengguna')) {
        importUsers(data);
      } else if (sheetName.toLowerCase().includes('obat') || sheetName.toLowerCase().includes('medicine') || 
                 data[0]?.nama_barang || data[0]?.kategori_v) {
        // Auto-detect obat sheet by struktur (ada nama_barang & kategori_v)
        importObatFromExcel(data);
      } else if (sheetName.toLowerCase().includes('log')) {
        importLogs(data);
      } else {
        console.log('⚠️  Sheet tidak dikenali. Abaikan atau define mapping manual.');
      }
    }
  });

} catch (err) {
  console.error('❌ Error membaca Excel:', err.message);
  process.exit(1);
}

// Import users
function importUsers(data) {
  console.log('\n👤 Mengimport Users...');
  
  db.serialize(() => {
    data.forEach(row => {
      const username = row.username || row.Username || row.user;
      const email = row.email || row.Email || '';
      const password = row.password || row.Password || 'default123';
      const role = row.role || row.Role || 'USER';

      if (!username) return; // Skip jika username kosong

      const sql = `INSERT OR IGNORE INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`;
      db.run(sql, [username, email, password, role], (err) => {
        if (err) console.error('  ❌ Error:', err.message);
        else console.log(`  ✅ User "${username}" imported`);
      });
    });
  });
}

// Import obat dari Excel (mapping columns)
function importObatFromExcel(data) {
  console.log('\n💊 Mengimport Obat dari Excel...');

  const { v4: uuid } = require('uuid');

  function classifyVED(vedCategory) {
    // Ambil kategori dari Excel jika ada
    if (vedCategory) {
      const cat = String(vedCategory).trim().toUpperCase();
      if (cat === 'V' || cat === 'E' || cat === 'D') return cat;
    }
    return 'E'; // default
  }

  function parseExcelDate(excelDate) {
    // Excel stores dates as numbers (days since 1900-01-01)
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    return excelDate || '';
  }

  db.serialize(() => {
    data.forEach(row => {
      const nama = row.nama_barang || row.Nama || '';
      const jumlah = parseInt(row.stok_masuk || row.stok_awal || 0);
      const kadaluarsa = row.ed || row.tgl_masuk || '';
      const ved = classifyVED(row.kategori_v);

      if (!nama) return; // Skip jika nama kosong

      const id = uuid();
      const sql = `INSERT INTO obat (id, nama, jumlah, kadaluarsa, ved) VALUES (?, ?, ?, ?, ?)`;
      db.run(sql, [id, nama, jumlah, kadaluarsa, ved], (err) => {
        if (err) console.error(`  ❌ Error "${nama}":`, err.message);
        else console.log(`  ✅ Obat "${nama}" (qty: ${jumlah}, ved: ${ved}) imported`);
      });
    });
  });
}

// Import obat (old function - removed, using importObatFromExcel instead)
function importObat(data) {
  importObatFromExcel(data);
}

// Import logs
function importLogs(data) {
  console.log('\n📝 Mengimport Logs...');

  const { v4: uuid } = require('uuid');

  db.serialize(() => {
    data.forEach(row => {
      const type = row.type || row.Type || 'general';
      const message = row.message || row.Message || '';
      const time = row.time || row.Time || new Date().toISOString();

      if (!message) return; // Skip jika message kosong

      const id = uuid();
      const sql = `INSERT INTO logs (id, type, message, time) VALUES (?, ?, ?, ?)`;
      db.run(sql, [id, type, message, time], (err) => {
        if (err) console.error('  ❌ Error:', err.message);
        else console.log(`  ✅ Log "${type}" imported`);
      });
    });
  });
}

db.on('close', () => {
  console.log('\n✨ Import selesai!');
  process.exit(0);
});

setTimeout(() => {
  db.close();
}, 2000);
