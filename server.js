const express = require('express');
const session = require('express-session');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const cors = require('cors');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'obatqu-secret-demo';

const db = require('./database/database');

/* ===============================
  DATABASE (shared module)
================================ */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
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

  // Ensure admin user exists (do not delete other users)
  db.get("SELECT * FROM users WHERE username = ?", ['admin'], (err2, row) => {
    if (err2) { console.error('DB error checking admin', err2); return; }
    if (!row) {
      db.run(
        "INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)",
        ['admin', 'admin@local', 'admin', 'APJ']
      );
    } else {
      db.run(
        "UPDATE users SET password = ?, role = ? WHERE username = ?",
        ['admin', 'APJ', 'admin']
      );
    }
  });
});

/* ===============================
   MIDDLEWARE
================================ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 3600 * 1000 }
}));

const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ message: 'Unauthorized' });
};

const roleMiddleware = (roles = []) => {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};

/* ===============================
   HELPER
================================ */
function classifyVED(jumlah) {
  const n = parseInt(jumlah || 0, 10);
  if (n <= 2) return 'V';
  if (n <= 10) return 'E';
  return 'D';
}

// Hitung umur obat (hari tersisa sampai kadaluarsa)
function getAgeStatus(kadaluarsaStr) {
  if (!kadaluarsaStr) return { daysLeft: null, status: 'unknown', urgency: 0 };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Parse berbagai format expiry
  let expiryDate;
  try {
    // Coba format "OKT.27" -> "27-10-2027" atau "2027-10-27"
    if (kadaluarsaStr.includes('.')) {
      const parts = kadaluarsaStr.split('.');
      if (parts.length === 2) {
        const monthStr = parts[0].toUpperCase();
        const yearStr = parts[1];
        const monthMap = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, JUN: 6, JUL: 7, AGU: 8, SEP: 9, OKT: 10, NOV: 11, DES: 12 };
        const month = monthMap[monthStr] || 1;
        const year = 2000 + parseInt(yearStr);
        expiryDate = new Date(year, month - 1, 28); // 28 hari terakhir bulan
      }
    } else {
      // Coba format ISO atau DD-MM-YYYY
      expiryDate = new Date(kadaluarsaStr);
    }
    
    if (isNaN(expiryDate)) throw new Error('Invalid date');
  } catch (err) {
    return { daysLeft: null, status: 'unknown', urgency: 0 };
  }
  
  const daysLeft = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
  
  let status, urgency;
  if (daysLeft < 0) {
    status = 'kadaluarsa';
    urgency = 3; // Highest priority - remove immediately
  } else if (daysLeft <= 30) {
    status = 'hampir_kadaluarsa';
    urgency = 2;
  } else if (daysLeft <= 90) {
    status = 'perhatian';
    urgency = 1;
  } else {
    status = 'aman';
    urgency = 0;
  }
  
  return { daysLeft, status, urgency };
}

// Analisis VED dengan rekomendasi
function analyzeObatVED(obat) {
  const n = parseInt(obat.jumlah || 0);
  const ved = classifyVED(n);
  const age = getAgeStatus(obat.kadaluarsa);
  
  let recommendation = '';
  let action = 'monitor';
  
  // Rekomendasi berdasarkan VED + Age
  if (age.status === 'kadaluarsa') {
    recommendation = '🔴 SEGERA BUANG - Obat sudah kadaluarsa';
    action = 'remove';
  } else if (age.status === 'hampir_kadaluarsa') {
    recommendation = '⚠️  PRIORITAS - Gunakan segera (≤30 hari)';
    action = 'urgent';
  } else if (ved === 'V') {
    recommendation = '🟡 VITAL - Stok sangat rendah, pesan segera';
    action = 'urgent_order';
  } else if (ved === 'E' && age.status === 'perhatian') {
    recommendation = '🟠 ESSENTIAL - Monitor ketat, siap pesan';
    action = 'monitor';
  } else if (ved === 'D' && n > 20) {
    recommendation = '✅ STOCK AMAN - Monitor rutin';
    action = 'routine';
  } else if (ved === 'D') {
    recommendation = '✅ STOCK CUKUP - Pemantauan normal';
    action = 'routine';
  }
  
  return { ved, ...age, recommendation, action };
}

function addLog(type, message) {
  db.run(
    "INSERT INTO logs (id,type,message,time) VALUES (?,?,?,?)",
    [uuidv4(), type, message, new Date().toISOString()]
  );
}

/* ===============================
   AUTH
================================ */
app.post('/api/login', (req, res) => {
  const { username, email, password } = req.body || {};
  if ((!username && !email) || !password) return res.status(400).json({ message: 'Missing credentials' });

  const isEmail = email && email.includes('@');
  const value = isEmail ? email : username;
  const query = isEmail
    ? 'SELECT * FROM users WHERE email = ? AND password = ?'
    : 'SELECT * FROM users WHERE username = ? AND password = ?';

  db.get(query, [value, password], (err, user) => {
    if (err) {
      console.error('Login DB error:', err);
      return res.status(500).json({ message: 'DB error' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    addLog('auth', `${user.username} login`);
    return res.json({ message: 'Logged in', user: req.session.user });
  });
});

// Register new user (API)
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const sql = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`;
  db.run(sql, [username, email, password, 'USER'], function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    // set session for newly registered user
    req.session.user = { id: this.lastID, username: username, role: 'USER' };
    addLog('auth', `register ${username}`);
    res.json({ message: 'User berhasil dibuat', user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  const user = req.session && req.session.user && req.session.user.username;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Failed to destroy session' });
    if (user) addLog('auth', `${user} logout`);
    return res.json({ message: 'Logged out' });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  return res.status(401).json({ message: 'Not authenticated' });
});

/* ===============================
   USERS (APJ ONLY)
================================ */
app.get('/api/users', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  db.all("SELECT id,username,role FROM users", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

/* ===============================
   OBAT CRUD
================================ */
app.get('/api/obat', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

app.post('/api/obat', authMiddleware, (req, res) => {
  const { nama, jumlah, kadaluarsa } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const ved = classifyVED(jumlah);

  db.run(
    "INSERT INTO obat (id,nama,jumlah,kadaluarsa,ved) VALUES (?,?,?,?,?)",
    [uuidv4(), nama, jumlah, kadaluarsa, ved],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('obat', `Tambah ${nama}`);
      return res.json({ message: 'Obat ditambahkan' });
    }
  );
});

app.put('/api/obat/:id', authMiddleware, (req, res) => {
  const { nama, jumlah, kadaluarsa } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const ved = classifyVED(jumlah);

  db.run(
    "UPDATE obat SET nama=?, jumlah=?, kadaluarsa=?, ved=? WHERE id=?",
    [nama, jumlah, kadaluarsa, ved, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('obat', `Update ${nama}`);
      return res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/obat/:id', authMiddleware, (req, res) => {
  db.run(
    "DELETE FROM obat WHERE id=?",
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('obat', `Delete ID ${req.params.id}`);
      return res.json({ message: 'Deleted' });
    }
  );
});

/* ===============================
   FEFO
================================ */
app.post('/api/keluar', authMiddleware, (req, res) => {
  db.all(
    "SELECT * FROM obat WHERE jumlah > 0 ORDER BY date(kadaluarsa) ASC",
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (!rows || !rows.length) return res.status(400).json({ message: 'Tidak ada stok' });

      const obat = rows[0];
      const newJumlah = Math.max(0, obat.jumlah - 1);

      db.run(
        "UPDATE obat SET jumlah=?, ved=? WHERE id=?",
        [newJumlah, classifyVED(newJumlah), obat.id],
        (err2) => {
          if (err2) return res.status(500).json({ message: 'DB error' });
          addLog('fefo', `FEFO ${obat.nama}`);
          return res.json({ message: 'FEFO berhasil' });
        }
      );
    }
  );
});

/* ===============================
   VED-FEFO ANALYSIS
================================ */
// Get VED classification dengan analisis
app.get('/api/ved-analysis', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const analysis = rows.map(obat => ({
      ...obat,
      ...analyzeObatVED(obat)
    }));
    
    // Group by VED
    const byVed = { V: [], E: [], D: [] };
    analysis.forEach(item => {
      byVed[item.ved].push(item);
    });
    
    // Count by status
    const byStatus = {};
    analysis.forEach(item => {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    });
    
    res.json({
      total: analysis.length,
      byVed,
      byStatus,
      summary: {
        vital: byVed.V.length,
        essential: byVed.E.length,
        desirable: byVed.D.length,
        expired: (byStatus.kadaluarsa || 0),
        nearExpiry: (byStatus.hampir_kadaluarsa || 0),
        safe: (byStatus.aman || 0)
      }
    });
  });
});

// Get FEFO recommendations (First Expiry First Out)
app.get('/api/fefo-recommendations', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat ORDER BY kadaluarsa ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const urgent = [];    // Kadaluarsa atau hampir kadaluarsa
    const critical = [];  // Vital (V) dengan stok rendah
    const monitor = [];   // Essential (E) dengan perhatian
    const routine = [];   // Desirable (D) atau aman
    
    rows.forEach(obat => {
      const analysis = analyzeObatVED(obat);
      const item = { ...obat, ...analysis };
      
      if (analysis.action === 'remove') {
        urgent.push(item);
      } else if (analysis.action === 'urgent' || analysis.action === 'urgent_order') {
        critical.push(item);
      } else if (analysis.action === 'monitor') {
        monitor.push(item);
      } else {
        routine.push(item);
      }
    });
    
    res.json({
      urgent: { count: urgent.length, items: urgent.slice(0, 10) },
      critical: { count: critical.length, items: critical.slice(0, 10) },
      monitor: { count: monitor.length, items: monitor.slice(0, 10) },
      routine: { count: routine.length }
    });
  });
});

/* ===============================
   NOTIFICATIONS
================================ */
app.get('/api/notifications', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const notifications = [];
    
    rows.forEach(obat => {
      const analysis = analyzeObatVED(obat);
      
      // Critical alerts
      if (analysis.status === 'kadaluarsa') {
        notifications.push({
          type: 'error',
          title: `🔴 KADALUARSA: ${obat.nama}`,
          message: `Obat ${obat.nama} sudah kadaluarsa. Segera buang.`,
          urgency: 3,
          obatId: obat.id,
          timestamp: new Date()
        });
      } else if (analysis.status === 'hampir_kadaluarsa') {
        notifications.push({
          type: 'warning',
          title: `⚠️  HAMPIR KADALUARSA: ${obat.nama}`,
          message: `${obat.nama} kadaluarsa dalam ${analysis.daysLeft} hari. Gunakan segera!`,
          urgency: 2,
          obatId: obat.id,
          timestamp: new Date()
        });
      }
      
      // Stock alerts
      if (analysis.ved === 'V' && parseInt(obat.jumlah) <= 2) {
        notifications.push({
          type: 'error',
          title: `🟡 STOK KRITIS: ${obat.nama}`,
          message: `${obat.nama} stok sangat rendah (${obat.jumlah} unit). PESAN SEGERA!`,
          urgency: 2,
          obatId: obat.id,
          timestamp: new Date()
        });
      }
    });
    
    // Sort by urgency and return top 20
    notifications.sort((a, b) => b.urgency - a.urgency);
    
    res.json({
      total: notifications.length,
      critical: notifications.filter(n => n.urgency >= 2).length,
      warning: notifications.filter(n => n.urgency === 1).length,
      notifications: notifications.slice(0, 20)
    });
  });
});

/* ===============================
   PDF REPORTS
================================ */
app.get('/api/reports/pdf', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const doc = new PDFDocument({ margin: 30 });
    const fileName = `Laporan-Stok-Obat-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);
    
    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('🏥 LAPORAN STOK OBAT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('ObatQU.id - Pharmacy Management System', { align: 'center' });
    doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { align: 'center' });
    doc.moveDown();
    
    // Summary Statistics
    doc.fontSize(12).font('Helvetica-Bold').text('RINGKASAN');
    doc.fontSize(10).font('Helvetica');
    
    const stats = { V: 0, E: 0, D: 0, expired: 0, nearExpiry: 0, safe: 0 };
    const vedList = { V: [], E: [], D: [] };
    
    rows.forEach(obat => {
      const analysis = analyzeObatVED(obat);
      stats[analysis.ved]++;
      vedList[analysis.ved].push(obat);
      
      if (analysis.status === 'kadaluarsa') stats.expired++;
      else if (analysis.status === 'hampir_kadaluarsa') stats.nearExpiry++;
      else if (analysis.status === 'aman') stats.safe++;
    });
    
    doc.text(`Total Obat: ${rows.length}`);
    doc.text(`  • Vital (V): ${stats.V} | Essential (E): ${stats.E} | Desirable (D): ${stats.D}`);
    doc.text(`Status: Aman: ${stats.safe} | Perhatian: ${stats.nearExpiry} | Kadaluarsa: ${stats.expired}`);
    doc.moveDown();
    
    // VED Classification Table
    doc.fontSize(12).font('Helvetica-Bold').text('KLASIFIKASI VED');
    doc.fontSize(9).font('Helvetica');
    
    const tableTop = doc.y;
    const col1 = 50, col2 = 200, col3 = 350, col4 = 450;
    
    // Headers
    doc.text('Kategori', col1, tableTop);
    doc.text('Jumlah', col2, tableTop);
    doc.text('Keterangan', col3, tableTop);
    
    let y = tableTop + 20;
    const categories = [
      { code: 'V', label: 'VITAL', desc: '≤2 unit (Stok Kritis)', items: vedList.V },
      { code: 'E', label: 'ESSENTIAL', desc: '3-10 unit (Pantau)', items: vedList.E },
      { code: 'D', label: 'DESIRABLE', desc: '>10 unit (Aman)', items: vedList.D }
    ];
    
    categories.forEach(cat => {
      doc.text(`${cat.code} - ${cat.label}`, col1, y);
      doc.text(cat.items.length.toString(), col2, y);
      doc.text(cat.desc, col3, y);
      y += 15;
    });
    
    doc.moveDown();
    
    // Detailed Medicine List
    doc.fontSize(12).font('Helvetica-Bold').text('DAFTAR OBAT (Terperinci)');
    doc.fontSize(8).font('Helvetica');
    
    y = doc.y;
    const detailTop = y;
    
    // Table headers
    doc.text('No', 30, y);
    doc.text('Nama Obat', 60, y);
    doc.text('Qty', 280, y);
    doc.text('VED', 320, y);
    doc.text('Kadaluarsa', 360, y);
    doc.text('Status', 450, y);
    
    y += 12;
    doc.moveTo(30, y).lineTo(550, y).stroke();
    y += 5;
    
    let rowNum = 1;
    rows.forEach(obat => {
      const analysis = analyzeObatVED(obat);
      const statusEmoji = analysis.status === 'kadaluarsa' ? '🔴' : 
                         analysis.status === 'hampir_kadaluarsa' ? '⚠️' : 
                         analysis.status === 'aman' ? '✅' : '❓';
      
      doc.text(`${rowNum}`, 30, y);
      doc.text(obat.nama.substring(0, 25), 60, y);
      doc.text(obat.jumlah.toString(), 280, y);
      doc.text(analysis.ved, 320, y);
      doc.text(obat.kadaluarsa || '-', 360, y);
      doc.text(statusEmoji, 450, y);
      
      y += 12;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      rowNum++;
    });
    
    doc.moveDown();
    doc.fontSize(9).font('Helvetica').text('Laporan ini dibuat otomatis oleh sistem ObatQU.id', { align: 'center' });
    
    doc.end();
  });
});

// Simplified VED Summary PDF
app.get('/api/reports/ved-summary-pdf', authMiddleware, (req, res) => {
  db.all("SELECT * FROM obat", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const doc = new PDFDocument({ margin: 40 });
    const fileName = `VED-Summary-${new Date().toISOString().split('T')[0]}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);
    
    doc.fontSize(18).font('Helvetica-Bold').text('VED-FEFO ANALYSIS REPORT', { align: 'center' });
    doc.fontSize(11).text(`Generated: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
    doc.moveDown(2);
    
    // Analysis by category
    const categories = { V: [], E: [], D: [] };
    rows.forEach(obat => {
      const ved = classifyVED(obat.jumlah);
      categories[ved].push(obat);
    });
    
    doc.fontSize(14).font('Helvetica-Bold').text('VITAL (V) - Stok ≤ 2 Unit');
    doc.fontSize(10).font('Helvetica');
    if (categories.V.length === 0) {
      doc.text('Tidak ada obat kategori Vital');
    } else {
      categories.V.slice(0, 20).forEach((obat, i) => {
        doc.text(`${i+1}. ${obat.nama} - Qty: ${obat.jumlah}`);
      });
    }
    doc.moveDown();
    
    doc.fontSize(14).font('Helvetica-Bold').text('ESSENTIAL (E) - Stok 3-10 Unit');
    doc.fontSize(10).font('Helvetica');
    if (categories.E.length === 0) {
      doc.text('Tidak ada obat kategori Essential');
    } else {
      doc.text(`Total: ${categories.E.length} obat`);
    }
    doc.moveDown();
    
    doc.fontSize(14).font('Helvetica-Bold').text('DESIRABLE (D) - Stok > 10 Unit');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total: ${categories.D.length} obat (AMAN)`);
    
    doc.end();
  });
});

/* ===============================
   LOGS (APJ ONLY)
================================ */
app.get('/api/logs', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  db.all("SELECT * FROM logs ORDER BY time DESC LIMIT 200", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

/* ===============================
   STATIC
================================ */
// Serve static public folder
app.use(express.static(path.join(__dirname, 'public')));

// Root health-check / quick response
app.get('/', (req, res) => {
  res.send('Server Apotek Jalan!');
});

// Simple SPA fallback to index.html if file not found (for client-side routing)
app.use((req, res, next) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
      if (err) return next(err);
    });
  }
  next();
});

const server = app.listen(3000, () => {
  console.log("Server berjalan di http://localhost:3000");
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
