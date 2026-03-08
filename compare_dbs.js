const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const srcPath = path.resolve(__dirname, '..', 'DB_Obat.sqlite');
const dstPath = path.resolve(__dirname, 'data.db');

const src = new sqlite3.Database(srcPath, sqlite3.OPEN_READONLY, (e) => { if (e) { console.error('Open src err', e); process.exit(1); }});
const dst = new sqlite3.Database(dstPath, sqlite3.OPEN_READONLY, (e) => { if (e) { console.error('Open dst err', e); process.exit(1); }});

function getNames(db, table, cb) {
  db.all(`SELECT nama_barang as nama FROM obat UNION SELECT nama as nama FROM obat LIMIT 100000`, (err, rows) => {
    if (err) return cb(err);
    const names = rows.map(r => (r.nama || '').toString().trim()).filter(s => s).map(s => s.toLowerCase());
    cb(null, names);
  });
}

// get names from source (DB_Obat) and target (data.db)
src.all("SELECT nama_barang as nama FROM obat", (err, srows) => {
  if (err) { console.error('src read err', err); process.exit(1); }
  const snames = srows.map(r => (r.nama || '').toString().trim()).filter(s => s).map(s => s.toLowerCase());

  dst.all("SELECT nama FROM obat", (err2, drows) => {
    if (err2) { console.error('dst read err', err2); process.exit(1); }
    const dnames = drows.map(r => (r.nama || '').toString().trim()).filter(s => s).map(s => s.toLowerCase());

    const sSet = new Set(snames);
    const dSet = new Set(dnames);

    const inSrcNotDst = snames.filter(n => !dSet.has(n));
    const inDstNotSrc = dnames.filter(n => !sSet.has(n));
    const intersect = snames.filter(n => dSet.has(n));

    console.log('Counts:');
    console.log('  source (DB_Obat) rows:', snames.length);
    console.log('  target (data.db) rows:', dnames.length);
    console.log('Matches (by lowercase name):', intersect.length);
    console.log('In source not in target (sample 20):', inSrcNotDst.slice(0,20));
    console.log('In target not in source (sample 20):', inDstNotSrc.slice(0,20));

    src.close(); dst.close();
  });
});
