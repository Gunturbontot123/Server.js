const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'apotek.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) { console.error('OPEN ERR', err.message); process.exit(1); }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS obat (
      id TEXT PRIMARY KEY,
      nama TEXT,
      jumlah INTEGER,
      kadaluarsa TEXT,
      ved TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      type TEXT,
      message TEXT,
      time TEXT
    )
  `);

  db.run("DELETE FROM users WHERE username != ?", ['admin'], (err) => {
    db.get("SELECT * FROM users WHERE username = ?", ['admin'], (err2, row) => {
      if (err2) { console.error('GET ERR', err2.message); }
      if (!row) {
        db.run("INSERT INTO users (username,password,role) VALUES (?,?,?)", ['admin','admin','APJ'], (er) => {
          if (er) console.error('INSERT ERR', er.message);
        });
      } else {
        db.run("UPDATE users SET password = ?, role = ? WHERE username = ?", ['admin','APJ','admin']);
      }
    });
  });
});

db.close((err) => { if (err) console.error('CLOSE ERR', err.message); else console.log('DB seeded'); });
