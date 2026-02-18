const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const { sendMail } = require('./utils/email');

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { users: [{ username: 'admin', password: 'admin' }], obat: [], logs: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const db = readData();

const app = express();
app.use(express.json());
app.use(session({
  secret: 'obatqu-secret-demo',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 3600 * 1000 }
}));

const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ message: 'Unauthorized' });
};

function addLog(type, message) {
  const entry = { id: uuidv4(), type, message, time: new Date().toISOString() };
  db.logs.unshift(entry);
  if (db.logs.length > 200) db.logs.pop();
  writeData(db);
}

function classifyVED(jumlah) {
  // simple heuristic: very low => V, low => E, otherwise D
  if (jumlah <= 2) return 'V';
  if (jumlah <= 10) return 'E';
  return 'D';
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  req.session.user = { username: user.username };
  addLog('auth', `${user.username} logged in`);
  res.json({ message: 'Logged in', user: { username: user.username } });
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    const user = req.session.user && req.session.user.username;
    req.session.destroy(err => {
      if (err) return res.status(500).json({ message: 'Logout failed' });
      if (user) addLog('auth', `${user} logged out`);
      res.json({ message: 'Logged out' });
    });
  } else {
    res.json({ message: 'No session' });
  }
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  return res.status(401).json({ message: 'Not authenticated' });
});

// Medicines CRUD
app.get('/api/obat', authMiddleware, (req, res) => {
  res.json(db.obat);
});

app.post('/api/obat', authMiddleware, (req, res) => {
  const { nama, jumlah, kadaluarsa } = req.body;
  if (!nama || typeof jumlah !== 'number' || !kadaluarsa) return res.status(400).json({ message: 'Invalid data' });

  const newObat = { id: uuidv4(), nama, jumlah, kadaluarsa, ved: classifyVED(jumlah) };
  db.obat.push(newObat);
  addLog('obat', `Ditambahkan: ${nama} (${jumlah}) exp ${kadaluarsa}`);
  writeData(db);
  checkNotificationsAndSend();
  res.json({ message: 'Obat ditambahkan', obat: newObat });
});

// update obat
app.put('/api/obat/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const idx = db.obat.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const { nama, jumlah, kadaluarsa } = req.body;
  db.obat[idx] = { ...db.obat[idx], nama, jumlah, kadaluarsa, ved: classifyVED(Number(jumlah)) };
  addLog('obat', `Diubah: ${db.obat[idx].nama} (${db.obat[idx].jumlah})`);
  writeData(db);
  checkNotificationsAndSend();
  res.json({ message: 'Updated', obat: db.obat[idx] });
});

// delete obat
app.delete('/api/obat/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const idx = db.obat.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const removed = db.obat.splice(idx,1)[0];
  addLog('obat', `Dihapus: ${removed.nama}`);
  writeData(db);
  res.json({ message: 'Deleted' });
});
// FEFO keluarkan satu unit (dapat disesuaikan)
app.post('/api/keluar', authMiddleware, (req, res) => {
  // find earliest kadaluarsa obat with jumlah > 0
  const available = db.obat.filter(o => o.jumlah > 0).sort((a, b) => new Date(a.kadaluarsa) - new Date(b.kadaluarsa));
  if (!available.length) return res.status(400).json({ message: 'Tidak ada stok' });
  const keluarkan = available[0];
  keluarkan.jumlah -= 1;
  keluarkan.ved = classifyVED(keluarkan.jumlah);
  addLog('fefo', `FEFO: ${keluarkan.nama} dikurangi 1 (sisa ${keluarkan.jumlah})`);
  // remove if jumlah 0
  if (keluarkan.jumlah <= 0) {
    // keep the record but jumlah = 0
  }
  writeData(db);
  checkNotificationsAndSend();
  res.json({ message: `FEFO: ${keluarkan.nama} dikeluarkan`, obat: keluarkan });
});

app.get('/api/logs', authMiddleware, (req, res) => {
  res.json(db.logs);
});

app.get('/api/notifications', authMiddleware, (req, res) => {
  const now = new Date();
  const near = db.obat.filter(o => {
    const d = new Date(o.kadaluarsa);
    const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 30; // within 30 days
  });

  const low = db.obat.filter(o => o.jumlah <= 2);

  res.json({ nearExpiry: near, lowStock: low });
});

// Email notification helper
async function checkNotificationsAndSend() {
  if (!process.env.NOTIFY_TO) return;
  const now = new Date();
  const near = db.obat.filter(o => {
    const d = new Date(o.kadaluarsa);
    const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  });
  const low = db.obat.filter(o => o.jumlah <= 2);

  if (near.length === 0 && low.length === 0) return;

  let subject = 'Peringatan Stok Obat';
  let lines = [];
  if (near.length) {
    lines.push('Obat hampir kadaluarsa (<=30 hari):');
    near.forEach(o => lines.push(`- ${o.nama} (exp: ${o.kadaluarsa}, sisa: ${o.jumlah})`));
  }
  if (low.length) {
    lines.push('Obat stok rendah (<=2):');
    low.forEach(o => lines.push(`- ${o.nama} (sisa: ${o.jumlah})`));
  }
  const text = lines.join('\n');
  try {
    await sendMail({ subject, text });
    addLog('email', `Notification sent: ${near.length} near, ${low.length} low`);
  } catch (err) {
    addLog('email-error', err && err.message ? err.message : String(err));
  }
}

// Schedule daily check (runs every 24h) and run once at startup
setTimeout(() => { checkNotificationsAndSend(); }, 2000);
setInterval(checkNotificationsAndSend, 24 * 60 * 60 * 1000);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all to serve SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));