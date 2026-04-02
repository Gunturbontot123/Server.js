const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'obatqu-secret-demo';
const SESSION_COOKIE_NAME = 'obatqu.sid';
const BCRYPT_ROUNDS = 10;
const ALLOWED_ROLES = ['APJ', 'APOTEKER_PENDAMPING'];
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const OBAT_BOOTSTRAP_PATHS = [
  path.resolve(__dirname, '..', 'DB_Obat.xlsx'),
  path.resolve(__dirname, 'DB_Obat.xlsx')
];
const ADMIN_USERNAME = 'bontot';
const ADMIN_EMAIL = 'useoppo507@gmail.com';
const ADMIN_DEFAULT_PASSWORD = 'Abgbontot';
const SESSION_COOKIE_OPTIONS = {
  maxAge: 24 * 3600 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/'
};

const db = require('./database/database');
const { sendMail, isEmailConfigured } = require('./utils/email');

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

function passwordMatches(plainText, stored) {
  if (isBcryptHash(stored)) return bcrypt.compareSync(plainText, stored);
  return String(stored || '') === String(plainText || '');
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function formatRoleLabel(role) {
  return role === 'APJ' ? 'APJ' : 'Apoteker Pendamping';
}

function getResetRequestMessage() {
  if (isEmailConfigured()) {
    return 'Jika akun ditemukan, link reset password sudah dikirim ke email yang terdaftar.';
  }
  return 'Jika akun ditemukan, link reset password disimpan ke email-fallback.log karena SMTP belum dikonfigurasi.';
}

function parseBootstrapDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date((value - 25569) * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MEI: '05', JUN: '06',
    JUL: '07', AGU: '08', SEP: '09', OKT: '10', NOV: '11', DES: '12'
  };
  const compact = text.toUpperCase().replace(/\s+/g, '');
  const shortMatch = compact.match(/^([A-Z]{3})\.(\d{2})$/);
  if (shortMatch && monthMap[shortMatch[1]]) {
    return `20${shortMatch[2]}-${monthMap[shortMatch[1]]}-28`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function normalizeBootstrapKategori(value) {
  return String(value || '').trim().toUpperCase();
}

const DEFAULT_OBAT_DESCRIPTIONS = {
  allofar: 'Allofar (allopurinol) digunakan untuk membantu menurunkan kadar asam urat dalam darah dan mencegah kekambuhan gout.',
  paracetamol: 'Paracetamol digunakan untuk membantu meredakan demam dan nyeri ringan sampai sedang.',
  amoxicillin: 'Amoxicillin adalah antibiotik untuk infeksi bakteri dan harus digunakan sesuai resep dokter sampai tuntas.',
  ibuprofen: 'Ibuprofen membantu meredakan nyeri, peradangan, dan demam; gunakan setelah makan untuk mengurangi iritasi lambung.',
  omeprazole: 'Omeprazole digunakan untuk menurunkan produksi asam lambung pada keluhan maag, GERD, atau tukak lambung.',
  cetirizine: 'Cetirizine adalah antihistamin untuk meredakan gejala alergi seperti gatal, bersin, dan hidung meler.',
  salbutamol: 'Salbutamol membantu melegakan saluran napas pada asma atau bronkospasme sesuai anjuran tenaga medis.',
  metformin: 'Metformin digunakan untuk membantu mengontrol gula darah pada diabetes tipe 2 bersama pola makan sehat.',
  amlodipine: 'Amlodipine digunakan untuk membantu mengontrol tekanan darah tinggi dan menurunkan risiko komplikasi kardiovaskular.',
  simvastatin: 'Simvastatin membantu menurunkan kadar kolesterol dan digunakan rutin sesuai resep dokter.',
  ranitidine: 'Ranitidine digunakan untuk membantu mengurangi gejala kelebihan asam lambung sesuai indikasi klinis.',
  ctm: 'CTM (chlorpheniramine maleate) adalah antihistamin untuk gejala alergi dan dapat menyebabkan kantuk.',
  antasida: 'Antasida membantu menetralisir asam lambung dan meredakan keluhan nyeri ulu hati atau perut kembung terkait maag.',
  dexamethasone: 'Dexamethasone adalah kortikosteroid untuk kondisi inflamasi tertentu dan penggunaannya harus dengan pengawasan dokter.',
  asammefenamat: 'Asam mefenamat digunakan untuk meredakan nyeri ringan sampai sedang sesuai dosis yang dianjurkan.'
};

function normalizeObatNameLookup(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getDefaultObatDescription(nama) {
  const key = normalizeObatNameLookup(nama);
  return DEFAULT_OBAT_DESCRIPTIONS[key] || '';
}

function resolveObatDescription(nama, deskripsi) {
  const cleaned = String(deskripsi || '').trim();
  if (cleaned) return cleaned;
  return getDefaultObatDescription(nama);
}

function findObatBootstrapFile() {
  return OBAT_BOOTSTRAP_PATHS.find((filePath) => fs.existsSync(filePath)) || null;
}

function bootstrapObatIfEmpty() {
  db.get('SELECT COUNT(*) AS total FROM obat', (countErr, countRow) => {
    if (countErr) {
      console.error('Bootstrap check error:', countErr);
      return;
    }
    if (Number(countRow && countRow.total) > 0) return;

    const backupFile = findObatBootstrapFile();
    if (!backupFile) {
      console.warn('Bootstrap obat dilewati: file backup Excel tidak ditemukan.');
      return;
    }

    try {
      const workbook = XLSX.readFile(backupFile);
      const firstSheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet] || {});
      if (!Array.isArray(rows) || rows.length === 0) {
        console.warn('Bootstrap obat dilewati: sheet backup kosong.');
        return;
      }

      const normalizedRows = rows.map((row) => {
        const nama = String(row.nama_barang || row.Nama || row.nama || '').trim();
        if (!nama) return null;
        const jumlah = Number(row.stok_masuk || row.stok_awal || row.stok || 0) || 0;
        const batch = String(row.batch || row.Batch || row.batch_no || row.no_batch || row.lot || '').trim();
        const kategori = normalizeBootstrapKategori(row[' jenis_obat'] || row.jenis_obat || row.jenis || row.kategori || 'TABLET BEBAS') || 'TABLET BEBAS';
        const deskripsi = resolveObatDescription(nama, row.deskripsi || row.keterangan || row.description || '');
        const ved = ['V', 'E', 'D'].includes(String(row.kategori_v || '').trim().toUpperCase())
          ? String(row.kategori_v || '').trim().toUpperCase()
          : classifyVED(jumlah);
        const kadaluarsa = parseBootstrapDate(row.ed || row.kadaluarsa || row.tgl_masuk || '');
        return { nama, jumlah, batch, kategori, deskripsi, ved, kadaluarsa };
      }).filter(Boolean);

      if (!normalizedRows.length) {
        console.warn('Bootstrap obat dilewati: tidak ada baris valid di backup Excel.');
        return;
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('INSERT INTO obat (id, nama, jumlah, kadaluarsa, ved, batch, kategori, deskripsi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        normalizedRows.forEach((row) => {
          stmt.run([uuidv4(), row.nama, row.jumlah, row.kadaluarsa, row.ved, row.batch, row.kategori, row.deskripsi]);
        });
        stmt.finalize((finalizeErr) => {
          if (finalizeErr) {
            console.error('Bootstrap insert error:', finalizeErr);
            db.run('ROLLBACK');
            return;
          }
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Bootstrap commit error:', commitErr);
              db.run('ROLLBACK');
              return;
            }
            addLog('obat', `Bootstrap import ${normalizedRows.length} obat dari backup Excel`);
            console.log(`Bootstrap obat selesai: ${normalizedRows.length} baris diimpor dari ${backupFile}`);
          });
        });
      });
    } catch (bootstrapErr) {
      console.error('Bootstrap obat gagal:', bootstrapErr);
    }
  });
}

function backfillObatDescriptions() {
  db.all("SELECT id, nama, deskripsi FROM obat", (err, rows) => {
    if (err || !Array.isArray(rows)) return;

    let changed = 0;
    rows.forEach((row) => {
      const current = String(row.deskripsi || '').trim();
      if (current) return;
      const generated = getDefaultObatDescription(row.nama);
      if (!generated) return;
      changed += 1;
      db.run("UPDATE obat SET deskripsi = ? WHERE id = ?", [generated, row.id]);
    });

    if (changed > 0) {
      addLog('obat', `Backfill deskripsi obat otomatis: ${changed} item`);
      console.log(`Backfill deskripsi obat selesai: ${changed} baris diperbarui.`);
    }
  });
}

/* ===============================
  DATABASE (shared module)
================================ */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT,
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
      ved TEXT,
      batch TEXT,
      kategori TEXT DEFAULT 'TABLET BEBAS',
      deskripsi TEXT DEFAULT ''
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

  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.all(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'obat'
  `, (err, cols) => {
    if (err) return;
    const colNames = (cols || []).map(c => c.column_name);
    const missingColumns = [];
    if (!colNames.includes('batch')) missingColumns.push("ALTER TABLE obat ADD COLUMN batch TEXT");
    if (!colNames.includes('kategori')) missingColumns.push("ALTER TABLE obat ADD COLUMN kategori TEXT DEFAULT 'TABLET BEBAS'");
    if (!colNames.includes('deskripsi')) missingColumns.push("ALTER TABLE obat ADD COLUMN deskripsi TEXT DEFAULT ''");

    if (!missingColumns.length) {
      bootstrapObatIfEmpty();
      backfillObatDescriptions();
      return;
    }

    let pending = missingColumns.length;
    missingColumns.forEach((sql) => {
      db.run(sql, () => {
        pending -= 1;
        if (pending === 0) {
          bootstrapObatIfEmpty();
          backfillObatDescriptions();
        }
      });
    });
  });

  // Ensure admin user exists with correct bcrypt password
  /* db.get("SELECT * FROM users WHERE username = ?", [ADMIN_USERNAME], (err2, row) => {
    if (err2) { console.error('DB error checking admin', err2); return; }
    if (!row) {
      const hash = bcrypt.hashSync(ADMIN_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
      db.run(
        "INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)",
        [ADMIN_USERNAME, ADMIN_EMAIL, hash, 'APJ']
      );
    } else {
      // Only fix if password doesn't match
      if (!passwordMatches(ADMIN_DEFAULT_PASSWORD, row.password)) {
        const hash = bcrypt.hashSync(ADMIN_DEFAULT_PASSWORD, BCRYPT_ROUNDS);
        db.run("UPDATE users SET password = ?, role = ? WHERE id = ?", [hash, 'APJ', row.id]);
      }
    }
  }); */
});

/* ===============================
   MIDDLEWARE
================================ */
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Force no-caching on all API and HTML responses
app.use((req, res, next) => {
  const isApi = req.path.startsWith('/api/');
  const isHtml = req.path.endsWith('.html') || req.path === '/';
  if (isApi || isHtml) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: SESSION_COOKIE_OPTIONS
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
function resolveActiveLoginRole(userRole, expectedRole) {
  if (!expectedRole) return null;
  if (userRole === expectedRole) return expectedRole;
  if (userRole === 'APJ' && expectedRole === 'APOTEKER_PENDAMPING') return expectedRole;
  return null;
}

function completeLogin(req, res, user, password, expectedRole) {
  const activeRole = resolveActiveLoginRole(user.role, expectedRole);
  if (!activeRole) {
    return res.status(403).json({ message: `Akun ${user.username} terdaftar sebagai ${formatRoleLabel(user.role)} dan tidak bisa masuk sebagai ${formatRoleLabel(expectedRole)}.` });
  }

  const valid = passwordMatches(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (!isBcryptHash(user.password)) {
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
  }

  req.session.regenerate((regenErr) => {
    if (regenErr) {
      console.error('Session regenerate error:', regenErr);
      return res.status(500).json({ message: 'Session error' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: activeRole,
      accountRole: user.role
    };
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).json({ message: 'Session error' });
      }
      addLog('auth', `${user.username} login sebagai ${activeRole}`);
      return res.json({ message: 'Logged in', user: req.session.user });
    });
  });
}

app.post('/api/login', (req, res) => {
  const { username, email, password, role } = req.body || {};
  const expectedRole = String(role || '').trim().toUpperCase();
  if ((!username && !email) || !password) return res.status(400).json({ message: 'Missing credentials' });
  if (!expectedRole) return res.status(400).json({ message: 'Role harus dipilih' });
  if (!ALLOWED_ROLES.includes(expectedRole)) return res.status(400).json({ message: 'Role tidak valid' });

  const isEmail = email && email.includes('@');
  const value = String(isEmail ? email : username || '').trim();

  if (isEmail) {
    return db.all('SELECT * FROM users WHERE lower(email) = ? ORDER BY id DESC', [value.toLowerCase()], (err, users) => {
      if (err) {
        console.error('Login DB error:', err);
        return res.status(500).json({ message: 'DB error' });
      }
      if (!users || users.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      if (users.length > 1) {
        return res.status(409).json({ message: 'Email dipakai beberapa akun. Silakan login pakai username.' });
      }
      return completeLogin(req, res, users[0], password, expectedRole);
    });
  }

  db.get('SELECT * FROM users WHERE username = ?', [value], (err, user) => {
    if (err) {
      console.error('Login DB error:', err);
      return res.status(500).json({ message: 'DB error' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    return completeLogin(req, res, user, password, expectedRole);
  });
});

// Register new user (API)
app.post('/api/register', (req, res) => {
  const { username, email, password, role } = req.body || {};
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = String(role || '').trim().toUpperCase();

  if (!normalizedUsername || !normalizedEmail || !password || !normalizedRole) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password minimal 4 karakter' });
  }
  if (!ALLOWED_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const sql = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?) RETURNING id`;
  db.get(sql, [normalizedUsername, normalizedEmail, hash, normalizedRole], (err, inserted) => {
    if (err) {
      if (String(err.code || '') === '23505' || String(err.message || '').includes('users.username')) {
        return res.status(400).json({ error: 'Username sudah dipakai' });
      }
      return res.status(400).json({ error: 'Pendaftaran gagal disimpan' });
    }
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        return res.status(500).json({ message: 'Session error' });
      }
      req.session.user = { id: inserted && inserted.id, username: normalizedUsername, role: normalizedRole };
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ message: 'Session error' });
        addLog('auth', `register ${normalizedUsername} (${normalizedRole})`);
        res.json({ message: 'User berhasil dibuat', user: req.session.user });
      });
    });
  });
});

app.post('/api/reset-password/request', (req, res) => {
  const identifier = String((req.body && req.body.identifier) || '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ message: 'Username atau email wajib diisi.' });
  }

  const complete = () => res.json({ message: getResetRequestMessage(), delivery: isEmailConfigured() ? 'email' : 'fallback-log' });

  db.run("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?", [new Date().toISOString()], () => {});
  const isEmailIdentifier = identifier.includes('@');
  const lookupSql = isEmailIdentifier
    ? "SELECT id, username, email FROM users WHERE lower(email) = ? ORDER BY id DESC"
    : "SELECT id, username, email FROM users WHERE lower(username) = ? ORDER BY id DESC";

  db.all(
    lookupSql,
    [identifier],
    (err, users) => {
      if (err) {
        console.error('Reset password lookup error:', err);
        return res.status(500).json({ message: 'DB error' });
      }
      if (!users || users.length === 0) return complete();
      if (isEmailIdentifier && users.length > 1) {
        return res.status(400).json({ message: 'Email dipakai beberapa akun. Masukkan username untuk reset password.' });
      }

      const user = users[0];

      const rawToken = createResetToken();
      const tokenHash = hashResetToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString();
      const resetLink = `${APP_BASE_URL}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

      db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id], (deleteErr) => {
        if (deleteErr) {
          console.error('Reset password cleanup error:', deleteErr);
          return res.status(500).json({ message: 'DB error' });
        }

        db.run(
          "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)",
          [uuidv4(), user.id, tokenHash, expiresAt, now.toISOString()],
          async (insertErr) => {
            if (insertErr) {
              console.error('Reset password token insert error:', insertErr);
              return res.status(500).json({ message: 'DB error' });
            }

            const subject = 'Reset Password Obat.Qu';
            const text = [
              `Halo ${user.username},`,
              '',
              'Kami menerima permintaan reset password untuk akun Anda.',
              `Buka link berikut untuk mengganti password: ${resetLink}`,
              'Link berlaku selama 30 menit.',
              '',
              'Jika Anda tidak meminta reset password, abaikan email ini.'
            ].join('\n');
            const html = `
              <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
                <h2 style="margin-bottom:12px;">Reset Password Obat.Qu</h2>
                <p>Halo <strong>${user.username}</strong>,</p>
                <p>Kami menerima permintaan reset password untuk akun Anda.</p>
                <p>
                  <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#0fbf9b;color:#fff;text-decoration:none;border-radius:8px;">
                    Ganti Password
                  </a>
                </p>
                <p>Atau buka link berikut:</p>
                <p><a href="${resetLink}">${resetLink}</a></p>
                <p>Link berlaku selama 30 menit.</p>
                <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
              </div>
            `;

            await sendMail({ to: user.email, subject, text, html });
            addLog('auth', `reset password request ${user.username}`);
            return complete();
          }
        );
      });
    }
  );
});

app.get('/api/reset-password/validate', (req, res) => {
  const tokenHash = hashResetToken(req.query.token);
  if (!req.query.token) {
    return res.status(400).json({ message: 'Token wajib diisi.' });
  }

  db.get(
    `SELECT prt.id, u.username
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?`,
    [tokenHash, new Date().toISOString()],
    (err, row) => {
      if (err) {
        console.error('Reset token validation error:', err);
        return res.status(500).json({ message: 'DB error' });
      }
      if (!row) {
        return res.status(400).json({ valid: false, message: 'Token reset tidak valid atau sudah kedaluwarsa.' });
      }
      return res.json({ valid: true, username: row.username });
    }
  );
});

app.post('/api/reset-password/confirm', (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!token || !password) {
    return res.status(400).json({ message: 'Token dan password baru wajib diisi.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ message: 'Password minimal 4 karakter.' });
  }

  const tokenHash = hashResetToken(token);
  db.get(
    `SELECT prt.id, prt.user_id, u.username
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?`,
    [tokenHash, new Date().toISOString()],
    (err, row) => {
      if (err) {
        console.error('Reset confirm lookup error:', err);
        return res.status(500).json({ message: 'DB error' });
      }
      if (!row) {
        return res.status(400).json({ message: 'Token reset tidak valid atau sudah kedaluwarsa.' });
      }

      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hash, row.user_id], (updateErr) => {
        if (updateErr) {
          console.error('Reset confirm password update error:', updateErr);
          return res.status(500).json({ message: 'DB error' });
        }

        db.run('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [new Date().toISOString(), row.id], (tokenErr) => {
          if (tokenErr) {
            console.error('Reset confirm token update error:', tokenErr);
            return res.status(500).json({ message: 'DB error' });
          }

          db.run('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?', [row.user_id, row.id], () => {});
          addLog('auth', `reset password success ${row.username}`);
          return res.json({ message: 'Password berhasil diubah. Silakan login dengan password baru.' });
        });
      });
    }
  );
});

app.post('/api/logout', (req, res) => {
  const user = req.session && req.session.user && req.session.user.username;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Failed to destroy session' });
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
    if (user) addLog('auth', `${user} logout`);
    return res.json({ message: 'Logged out' });
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: { ...req.session.user, ...user } });
  });
});

app.put('/api/user/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Password saat ini dan password baru harus diisi.' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ message: 'Password baru minimal 4 karakter.' });
  }

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('Password change lookup error:', err);
      return res.status(500).json({ message: 'DB error' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    if (!passwordMatches(currentPassword, user.password)) {
      return res.status(400).json({ message: 'Password saat ini salah.' });
    }

    const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, userId], (updateErr) => {
      if (updateErr) {
        console.error('Password change update error:', updateErr);
        return res.status(500).json({ message: 'Gagal mengubah password.' });
      }
      addLog('auth', `User ${user.username} changed their password.`);
      res.json({ message: 'Password berhasil diubah.' });
    });
  });
});

app.post('/api/request-password-reset', authMiddleware, (req, res) => {
  const userId = req.session.user.id;

  const complete = (delivery) => res.json({ 
    message: delivery === 'email' 
      ? 'Link reset password telah dikirim ke email Anda.'
      : 'SMTP tidak terkonfigurasi. Link reset disimpan di log server.',
    delivery
  });

  db.get("SELECT id, username, email FROM users WHERE id = ?", [userId], (err, user) => {
    if (err || !user) {
      console.error('Request reset password error:', err);
      return res.status(500).json({ message: 'Gagal memproses permintaan: user tidak ditemukan.' });
    }

    const rawToken = createResetToken();
    const tokenHash = hashResetToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString();
    const resetLink = `${APP_BASE_URL}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

    db.serialize(() => {
      db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id]);
      db.run(
        "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)",
        [uuidv4(), user.id, tokenHash, expiresAt, now.toISOString()],
        async (insertErr) => {
          if (insertErr) {
            console.error('Reset password token insert error:', insertErr);
            return res.status(500).json({ message: 'DB error' });
          }

          const subject = 'Reset Password Obat.Qu';
          const text = `Halo ${user.username},\n\nBuka link berikut untuk mengganti password Anda: ${resetLink}\n\nLink ini berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset password.`;
          const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <h3>Reset Password Obat.Qu</h3>
              <p>Halo <strong>${user.username}</strong>,</p>
              <p>Klik tombol di bawah untuk mengganti password Anda.</p>
              <p><a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#0fbf9b;color:#fff;text-decoration:none;border-radius:8px;">Ganti Password</a></p>
              <p>Link berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset password.</p>
            </div>`;

          try {
            await sendMail({ to: user.email, subject, text, html });
            addLog('auth', `Password reset link sent to ${user.username}`);
            complete('email');
          } catch (mailError) {
            console.error(`Gagal mengirim email reset password ke ${user.email}:`, mailError);
            // Fallback: Log link ke file jika email gagal
            fs.appendFileSync('email-fallback.log', `[${new Date().toISOString()}] RESET LINK for ${user.username} (${user.email}): ${resetLink}\n`);
            complete('fallback-log');
          }
        }
      );
    });
  });
});

/* ===============================
   USERS (APJ ONLY)
================================ */
app.get('/api/users', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  db.all("SELECT id,username,email,role FROM users ORDER BY lower(username) ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

app.put('/api/users/:id/role', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  const nextRole = String((req.body && req.body.role) || '').trim().toUpperCase();
  const targetId = Number(req.params.id);

  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ message: 'ID user tidak valid' });
  }
  if (!ALLOWED_ROLES.includes(nextRole)) {
    return res.status(400).json({ message: 'Role tidak valid' });
  }
  if (req.session.user && Number(req.session.user.id) === targetId && nextRole !== 'APJ') {
    return res.status(400).json({ message: 'Anda tidak bisa menurunkan role akun APJ yang sedang dipakai.' });
  }

  db.get("SELECT id, username, role FROM users WHERE id = ?", [targetId], (findErr, user) => {
    if (findErr) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
    if (user.role === nextRole) {
      return res.json({ message: 'Role user sudah sesuai', user: { ...user, role: nextRole } });
    }

    db.run("UPDATE users SET role = ? WHERE id = ?", [nextRole, targetId], (updateErr) => {
      if (updateErr) return res.status(500).json({ message: 'DB error' });
      addLog('user', `Role ${user.username} diubah dari ${user.role} ke ${nextRole}`);
      return res.json({
        message: `Role ${user.username} berhasil diubah menjadi ${formatRoleLabel(nextRole)}`,
        user: { id: user.id, username: user.username, role: nextRole }
      });
    });
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
  const { nama, jumlah, kadaluarsa, kategori, batch, deskripsi } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const ved = classifyVED(jumlah);
  const finalDeskripsi = resolveObatDescription(nama, deskripsi);

  db.run(
    "INSERT INTO obat (id,nama,jumlah,kadaluarsa,ved,kategori,batch,deskripsi) VALUES (?,?,?,?,?,?,?,?)",
    [uuidv4(), nama, jumlah, kadaluarsa, ved, kategori || 'TABLET BEBAS', batch || '', finalDeskripsi],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('obat', `Tambah ${nama}`);
      return res.json({ message: 'Obat ditambahkan' });
    }
  );
});

app.put('/api/obat/:id', authMiddleware, (req, res) => {
  const { nama, jumlah, kadaluarsa, kategori, batch, deskripsi } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const ved = classifyVED(jumlah);
  const finalDeskripsi = resolveObatDescription(nama, deskripsi);

  db.run(
    "UPDATE obat SET nama=?, jumlah=?, kadaluarsa=?, ved=?, kategori=?, batch=?, deskripsi=? WHERE id=?",
    [nama, jumlah, kadaluarsa, ved, kategori || 'TABLET BEBAS', batch || '', finalDeskripsi, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('obat', `Update ${nama}`);
      return res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/obat/:id', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
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
    "SELECT * FROM obat WHERE jumlah > 0 ORDER BY kadaluarsa ASC",
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
      const qty = parseInt(obat.jumlah || 0, 10);
      if (qty <= 0) {
        notifications.push({
          type: 'error',
          title: `STOK HABIS: ${obat.nama}`,
          message: `${obat.nama} sudah habis. Segera lakukan reorder.`,
          urgency: 3,
          obatId: obat.id,
          timestamp: new Date()
        });
      } else if (qty <= 5) {
        notifications.push({
          type: 'warning',
          title: `STOK MENIPIS: ${obat.nama}`,
          message: `${obat.nama} stok menipis (${qty} unit). Pertimbangkan reorder.`,
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

function setPdfHeaders(res, fileName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
}

function summarizeInventory(rows) {
  const summary = { total: rows.length, vital: 0, essential: 0, desirable: 0, expired: 0, nearExpiry: 0 };
  rows.forEach((obat) => {
    const analysis = analyzeObatVED(obat);
    if (analysis.ved === 'V') summary.vital += 1;
    if (analysis.ved === 'E') summary.essential += 1;
    if (analysis.ved === 'D') summary.desirable += 1;
    if (analysis.status === 'kadaluarsa') summary.expired += 1;
    if (analysis.status === 'hampir_kadaluarsa') summary.nearExpiry += 1;
  });
  return summary;
}

function writeSummaryLines(doc, summary) {
  doc.fontSize(11).font('Helvetica');
  doc.text(`Total obat: ${summary.total}`);
  doc.text(`Vital: ${summary.vital} | Essential: ${summary.essential} | Desirable: ${summary.desirable}`);
  doc.text(`Kadaluarsa: ${summary.expired} | Hampir kadaluarsa: ${summary.nearExpiry}`);
}

const PANDUAN_PDF_SECTIONS = [
  {
    title: '1. Pengantar Sistem',
    paragraphs: [
      'Obat.Qu adalah sistem informasi manajemen apotek berbasis web untuk alur akun, pengelolaan data obat, monitoring stok dan kadaluarsa, penerapan VED-FEFO, serta laporan operasional.',
      'Akses sistem melalui http://localhost:3000 selama server aktif berjalan. Jika file HTML dibuka langsung dari komputer, sistem akan diarahkan kembali ke alamat localhost tersebut.'
    ],
    bullets: [
      'Dashboard ringkasan kondisi stok, kadaluarsa, dan aktivitas.',
      'Pengelolaan data obat meliputi tambah, ubah, hapus, batch, kategori, dan deskripsi.',
      'Monitoring kadaluarsa, monitoring stok, VED-FEFO, laporan, dan manajemen user berbasis role.'
    ]
  },
  {
    title: '2. Akun dan Login',
    paragraphs: [
      'Pendaftaran akun membutuhkan username unik, email, password minimal 4 karakter, dan role pengguna.',
      'Login mewajibkan pemilihan role. Akun APJ dapat masuk sebagai APJ atau sebagai Apoteker Pendamping. Akun Apoteker Pendamping hanya dapat masuk sebagai Apoteker Pendamping.'
    ],
    bullets: [
      'Gunakan username atau email saat login.',
      'Jika satu email dipakai lebih dari satu akun, login harus menggunakan username.',
      'Fitur reset password mengirim link ke email terdaftar atau ke fallback log server jika SMTP belum aktif.',
      'Jika email dipakai beberapa akun, reset password harus dilakukan memakai username.'
    ]
  },
  {
    title: '3. Hak Akses Role',
    paragraphs: [
      'Sistem mendukung dua role utama: APJ dan Apoteker Pendamping.',
      'Keduanya dapat mengakses pengelolaan obat, monitoring, VED-FEFO, dan laporan. Manajemen user hanya tersedia untuk APJ.'
    ],
    bullets: [
      'APJ: akses penuh termasuk mengelola role user.',
      'Apoteker Pendamping: fokus pada operasional obat dan laporan.',
      'Akun APJ yang sedang aktif tidak dapat didemote dari dashboard untuk mencegah putus akses admin.'
    ]
  },
  {
    title: '4. Dashboard Utama',
    paragraphs: [
      'Dashboard menampilkan ringkasan cepat kondisi operasional dan role aktif pengguna setelah login berhasil.',
      'Indikator utama yang ditampilkan adalah total item obat, kadaluarsa, hampir kadaluarsa, stok baik, restock, dan aktivitas.'
    ],
    bullets: [
      'Hampir kadaluarsa dihitung untuk obat dengan sisa masa berlaku 30 hari atau kurang.',
      'Restock merangkum item yang perlu pengisian ulang karena stok rendah atau habis.',
      'Quick Start membantu membuka menu prioritas kerja secara langsung.'
    ]
  },
  {
    title: '5. Mengelola Data Obat',
    paragraphs: [
      'Menu data obat digunakan untuk menambah, mengubah, menghapus, memfilter, dan melihat detail obat dari satu halaman.',
      'Kolom utama meliputi nama obat, batch, kategori, deskripsi, jumlah, tanggal kadaluarsa, status, prioritas, dan VED.'
    ],
    bullets: [
      'Tambah obat memakai form inline tanpa pindah halaman.',
      'Klik nama obat untuk membuka popup detail obat.',
      'Kategori yang dipakai sistem mengikuti data kategori yang tersedia di database.'
    ]
  },
  {
    title: '6. Monitoring Kadaluarsa dan Stok',
    paragraphs: [
      'Monitoring kadaluarsa menampilkan obat yang sudah kadaluarsa atau hampir kadaluarsa agar penanganan dapat diprioritaskan.',
      'Monitoring stok menampilkan status habis, menipis, dan kebutuhan reorder, lengkap dengan prioritas tindakan dan peringatan otomatis.'
    ],
    bullets: [
      'Stok habis: jumlah 0, prioritas P1.',
      'Stok menipis: jumlah 1 sampai 5, prioritas P2.',
      'Reorder: ringkasan item dengan stok 5 atau kurang.',
      'Peringatan otomatis membantu memantau stok menipis dan obat mendekati kadaluarsa.'
    ]
  },
  {
    title: '7. VED-FEFO dan Laporan',
    paragraphs: [
      'VED-FEFO mengelompokkan obat berdasarkan tingkat kepentingan lalu mengurutkan penanganan berdasarkan tanggal kadaluarsa terdekat.',
      'Sistem laporan menyediakan PDF bulanan dari dashboard serta laporan PDF dan CSV operasional lainnya.'
    ],
    bullets: [
      'Vital: prioritas paling tinggi untuk ketersediaan stok.',
      'Essential: penting dan perlu dipantau rutin.',
      'Desirable: prioritas normal.',
      'Laporan yang tersedia mencakup laporan stok lengkap, ringkasan VED, laporan kritis, laporan harian, dan laporan bulanan.'
    ]
  },
  {
    title: '8. Manajemen User dan Catatan Akhir',
    paragraphs: [
      'Menu manajemen user dipakai APJ untuk melihat daftar user, mencari user, dan mengubah role akun.',
      'Gunakan buku panduan ini sebagai referensi operasional harian agar penggunaan sistem tetap konsisten dengan aturan role dan monitoring yang berlaku.'
    ],
    bullets: [
      'Cari user berdasarkan username atau email.',
      'Perubahan role disimpan dari dashboard oleh APJ.',
      'Jika fitur email belum aktif, proses reset password tetap bisa dijalankan melalui fallback log server.'
    ]
  }
];

function writePanduanPdf(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  const contentWidth = doc.page.width - left - right;

  const colors = {
    ink: '#0f172a',
    muted: '#475569',
    primary: '#0f766e',
    primarySoft: '#ccfbf1',
    accent: '#1d4ed8',
    accentSoft: '#dbeafe',
    card: '#f8fafc',
    border: '#dbe4ef',
    coverDark: '#0b2940',
    coverMid: '#103b5b'
  };

  const ensureSpace = (needed = 20) => {
    if (doc.y + needed <= bottomLimit) return;
    doc.addPage();
    drawPageRibbon();
  };

  const drawRoundedCard = (x, y, w, h, radius, fillColor, borderColor) => {
    doc.save();
    doc.lineWidth(1);
    doc.roundedRect(x, y, w, h, radius);
    if (fillColor && borderColor) {
      doc.fillAndStroke(fillColor, borderColor);
    } else if (fillColor) {
      doc.fillColor(fillColor).fill();
    } else if (borderColor) {
      doc.strokeColor(borderColor).stroke();
    }
    doc.restore();
  };

  const drawPageRibbon = () => {
    const y = top - 16;
    drawRoundedCard(left, y, contentWidth, 14, 7, colors.primarySoft, null);
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(8.6)
      .text('BUKU PANDUAN OBAT.QU', left + 10, y + 3, { width: contentWidth - 20, align: 'left' });
    doc.y = top + 4;
  };

  const drawCover = () => {
    const coverHeight = 178;
    drawRoundedCard(left, top, contentWidth, coverHeight, 18, colors.coverDark, null);
    drawRoundedCard(left + contentWidth * 0.42, top, contentWidth * 0.58, coverHeight, 18, colors.coverMid, null);

    drawRoundedCard(left + 16, top + 16, 154, 24, 12, '#1e3a5f', null);
    doc.fillColor('#e0f2fe').font('Helvetica-Bold').fontSize(9.2)
      .text('DOKUMENTASI RESMI', left + 28, top + 23, { width: 130 });

    doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(27)
      .text('Buku Panduan Obat.Qu', left + 18, top + 52, { width: contentWidth - 36 });

    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(11)
      .text('Versi 1.1 | Maret 2026', left + 20, top + 104, { width: 250 });
    doc.text('Sistem Manajemen Apotek Digital', left + 20, top + 120, { width: 320 });

    const boxY = top + 132;
    const boxW = (contentWidth - 52) / 3;
    const labels = [
      { k: 'Role', v: 'APJ & Pendamping' },
      { k: 'Akses', v: 'Web Dashboard' },
      { k: 'Output', v: 'Laporan Operasional' }
    ];
    labels.forEach((item, idx) => {
      const x = left + 16 + idx * (boxW + 10);
      drawRoundedCard(x, boxY, boxW, 34, 9, '#244460', null);
      doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(8.3).text(item.k, x + 8, boxY + 6, { width: boxW - 16 });
      doc.fillColor('#ffffff').font('Helvetica').fontSize(8.9).text(item.v, x + 8, boxY + 18, { width: boxW - 16 });
    });
    doc.y = top + coverHeight + 16;
  };

  const drawIntroCards = () => {
    ensureSpace(108);
    const y = doc.y;
    const cardGap = 10;
    const cardW = (contentWidth - cardGap) / 2;
    const cardH = 88;

    drawRoundedCard(left, y, cardW, cardH, 12, colors.card, colors.border);
    drawRoundedCard(left + cardW + cardGap, y, cardW, cardH, 12, colors.card, colors.border);

    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10.8)
      .text('Tujuan Panduan', left + 12, y + 12, { width: cardW - 24 });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9.6)
      .text('Memberikan acuan operasional yang konsisten untuk akun, role, data obat, monitoring, VED-FEFO, dan laporan.', left + 12, y + 28, { width: cardW - 24, lineGap: 2 });

    doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(10.8)
      .text('Alur Pemakaian', left + cardW + cardGap + 12, y + 12, { width: cardW - 24 });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9.6)
      .text('Login sesuai role, cek prioritas dashboard, lanjutkan monitoring, lalu unduh laporan sesuai kebutuhan.', left + cardW + cardGap + 12, y + 28, { width: cardW - 24, lineGap: 2 });
    doc.y = y + cardH + 14;
  };

  const drawSectionCard = (section, index) => {
    const innerPad = 14;
    const sectionTitle = section && section.title ? section.title : `Bagian ${index + 1}`;
    const bodyWidth = contentWidth - (innerPad * 2);

    doc.font('Helvetica-Bold').fontSize(12.3);
    const titleHeight = doc.heightOfString(sectionTitle, { width: bodyWidth });

    let textHeight = 0;
    (section.paragraphs || []).forEach((paragraph) => {
      doc.font('Helvetica').fontSize(10.1);
      textHeight += doc.heightOfString(paragraph, { width: bodyWidth, lineGap: 2.5 }) + 6;
    });
    (section.bullets || []).forEach((item) => {
      doc.font('Helvetica').fontSize(10.1);
      textHeight += doc.heightOfString(`- ${item}`, { width: bodyWidth - 8, lineGap: 2.5 }) + 4;
    });

    const cardHeight = Math.max(108, 20 + titleHeight + textHeight + innerPad);
    ensureSpace(cardHeight + 14);

    const y = doc.y;
    drawRoundedCard(left, y, contentWidth, cardHeight, 12, '#ffffff', colors.border);

    const stripeColor = index % 2 === 0 ? colors.primary : colors.accent;
    const stripeSoft = index % 2 === 0 ? colors.primarySoft : colors.accentSoft;
    drawRoundedCard(left, y, contentWidth, 24, 12, stripeSoft, null);
    doc.save();
    doc.rect(left, y + 12, contentWidth, 12).fill(stripeSoft);
    doc.restore();

    drawRoundedCard(left + 10, y + 6, 8, 12, 4, stripeColor, null);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11.2)
      .text(sectionTitle, left + 24, y + 8, { width: contentWidth - 34 });

    let bodyY = y + 30;
    (section.paragraphs || []).forEach((paragraph) => {
      doc.fillColor(colors.ink).font('Helvetica').fontSize(10.1)
        .text(paragraph, left + innerPad, bodyY, { width: bodyWidth, lineGap: 2.5 });
      bodyY = doc.y + 5;
    });

    (section.bullets || []).forEach((item) => {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(10.1)
        .text(`- ${item}`, left + innerPad + 6, bodyY, { width: bodyWidth - 8, lineGap: 2.5 });
      bodyY = doc.y + 3;
    });

    doc.y = y + cardHeight + 10;
  };

  drawCover();
  drawIntroCards();
  drawPageRibbon();

  PANDUAN_PDF_SECTIONS.forEach((section, index) => {
    drawSectionCard(section, index);
  });

  ensureSpace(34);
  drawRoundedCard(left, doc.y, contentWidth, 26, 10, colors.primarySoft, null);
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(9)
    .text('Dibuat otomatis oleh server Obat.Qu untuk kebutuhan dokumentasi operasional.', left + 12, doc.y + 8, { width: contentWidth - 24, align: 'center' });
}

/* ===============================
   PDF REPORTS
================================ */
app.get('/api/panduan/pdf', (req, res) => {
  try {
    const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false });
    setPdfHeaders(res, 'Buku-Panduan-Obat.Qu-Maret-2026.pdf');
    doc.info.Title = 'Buku Panduan Obat.Qu';
    doc.info.Author = 'Obat.Qu';
    doc.info.Subject = 'Panduan penggunaan sistem web Obat.Qu';
    doc.info.Creator = 'Obat.Qu Server';
    doc.pipe(res);
    writePanduanPdf(doc);
    doc.end();
  } catch (err) {
    console.error('Panduan PDF generation error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Gagal membuat PDF panduan.' });
    }
    return res.end();
  }
});

app.get('/api/reports/pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const doc = new PDFDocument({ margin: 30 });
    const fileName = `Laporan-Stok-Obat-${new Date().toISOString().split('T')[0]}.pdf`;
    
    setPdfHeaders(res, fileName);
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
app.get('/api/reports/ved-summary-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.all("SELECT * FROM obat", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    
    const doc = new PDFDocument({ margin: 40 });
    const fileName = `VED-Summary-${new Date().toISOString().split('T')[0]}.pdf`;
    
    setPdfHeaders(res, fileName);
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

app.get('/api/reports/csv', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });

    const escapeCsv = (value) => {
      const text = String(value == null ? '' : value);
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };

    const csvLines = [
      ['Nama', 'Batch', 'Kategori', 'Jumlah', 'Kadaluarsa', 'VED'].join(','),
      ...rows.map((row) => [
        escapeCsv(row.nama),
        escapeCsv(row.batch),
        escapeCsv(row.kategori),
        escapeCsv(row.jumlah),
        escapeCsv(row.kadaluarsa),
        escapeCsv(row.ved)
      ].join(','))
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan-Stok-Obat-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csvLines.join('\n'));
  });
});

app.get('/api/reports/critical-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });

    const criticalRows = rows
      .map((row) => ({ ...row, analysis: analyzeObatVED(row) }))
      .filter((row) => row.analysis.status === 'kadaluarsa' || row.analysis.status === 'hampir_kadaluarsa' || row.analysis.ved === 'V');

    const doc = new PDFDocument({ margin: 36 });
    setPdfHeaders(res, `Critical-Report-${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('LAPORAN KRITIS OBAT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Dibuat: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
    doc.moveDown();

    writeSummaryLines(doc, summarizeInventory(rows));
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Daftar Prioritas');
    doc.moveDown(0.5);

    if (!criticalRows.length) {
      doc.fontSize(10).font('Helvetica').text('Tidak ada obat kritis saat ini.');
      doc.end();
      return;
    }

    criticalRows.forEach((item, index) => {
      const status = item.analysis.status === 'kadaluarsa'
        ? 'KADALUARSA'
        : item.analysis.status === 'hampir_kadaluarsa'
          ? 'HAMPIR KADALUARSA'
          : 'STOK VITAL';
      doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${item.nama} [${status}]`);
      doc.font('Helvetica').text(`Qty: ${item.jumlah} | Batch: ${item.batch || '-'} | Kategori: ${item.kategori || '-'} | Kadaluarsa: ${item.kadaluarsa || '-'}`);
      doc.moveDown(0.5);
    });

    doc.end();
  });
});

app.get('/api/reports/daily-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.all("SELECT * FROM logs WHERE substr(time, 1, 10) = ? ORDER BY time DESC", [today], (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });

    const doc = new PDFDocument({ margin: 36 });
    setPdfHeaders(res, `Daily-Report-${today}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('LAPORAN HARIAN SISTEM', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Tanggal: ${today}`, { align: 'center' });
    doc.moveDown();

    if (!rows.length) {
      doc.text('Belum ada aktivitas tercatat hari ini.');
      doc.end();
      return;
    }

    rows.forEach((row, index) => {
      doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${String(row.type || '').toUpperCase()}`);
      doc.font('Helvetica').text(`${row.message || '-'} | ${new Date(row.time).toLocaleString('id-ID')}`);
      doc.moveDown(0.4);
    });

    doc.end();
  });
});

app.get('/api/reports/monthly-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: 'Parameter month harus format YYYY-MM' });
  }

  db.all("SELECT * FROM logs WHERE substr(time, 1, 7) = ? ORDER BY time DESC", [month], (logErr, logRows) => {
    if (logErr) return res.status(500).json({ message: 'DB error' });

    db.all("SELECT * FROM obat ORDER BY nama ASC", (obatErr, obatRows) => {
      if (obatErr) return res.status(500).json({ message: 'DB error' });

      const doc = new PDFDocument({ margin: 36 });
      setPdfHeaders(res, `Monthly-Report-${month}.pdf`);
      doc.pipe(res);

      doc.fontSize(18).font('Helvetica-Bold').text('LAPORAN BULANAN APOTEK', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(`Periode: ${month}`, { align: 'center' });
      doc.moveDown();

      writeSummaryLines(doc, summarizeInventory(obatRows));
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text('Aktivitas Bulanan');
      doc.moveDown(0.5);

      if (!logRows.length) {
        doc.fontSize(10).font('Helvetica').text('Tidak ada aktivitas tercatat pada bulan ini.');
      } else {
        logRows.slice(0, 50).forEach((row, index) => {
          doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${String(row.type || '').toUpperCase()}`);
          doc.font('Helvetica').text(`${row.message || '-'} | ${new Date(row.time).toLocaleString('id-ID')}`);
          doc.moveDown(0.35);
        });
      }

      doc.end();
    });
  });
});

/* ===============================
   KATEGORI
================================ */
app.get('/api/kategori', authMiddleware, (req, res) => {
  db.all("SELECT DISTINCT kategori FROM obat WHERE kategori IS NOT NULL AND kategori != ''", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    const cats = rows.map(r => r.kategori).filter(Boolean).sort();
    if (!cats.length) cats.push('TABLET BEBAS', 'TABLET KERAS', 'SIRUP', 'SALEP', 'ETALASE LUAR');
    return res.json({ categories: cats });
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
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.js', '.css'].includes(ext)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

// Root route: redirect to login or dashboard
app.get('/', (req, res) => {
  const isAuthed = !!(req.session && req.session.user);
  return res.redirect(isAuthed ? '/dashboard.html' : '/login.html');
});

app.get('/dashboard', (req, res) => res.redirect('/dashboard.html'));
app.get('/login', (req, res) => res.redirect('/login.html'));
app.get('/register', (req, res) => res.redirect('/register.html'));
app.get('/reports', (req, res) => res.redirect('/reports.html'));
app.get('/reset-password', (req, res) => res.redirect('/reset-password.html'));

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

const server = app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});