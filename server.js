require('dotenv').config();
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
const pgSession = require('connect-pg-simple')(session);
const tursoSession = require("./database/session_store.js")

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'obatqu-secret-demo';
const SESSION_COOKIE_NAME = 'obatqu.sid';
const BCRYPT_ROUNDS = 10;
const ALLOWED_ROLES = ['APJ', 'ASISTEN_APOTEKER'];
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const OBAT_BOOTSTRAP_PATHS = [
  path.resolve(__dirname, '..', 'DB_Obat.xlsx'),
  path.resolve(__dirname, 'DB_Obat.xlsx')
];
const ADMIN_USERNAME = 'bontot';
const ADMIN_EMAIL = 'useoppo507@gmail.com';
const ADMIN_DEFAULT_PASSWORD = 'Abgbontot';
const SESSION_COOKIE_SECURE = false;
const SESSION_COOKIE_OPTIONS = {
  maxAge: 24 * 3600 * 1000,
  httpOnly: false,
  sameSite: 'lax',
  secure: SESSION_COOKIE_SECURE,
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
  return role === 'APJ' ? 'APJ' : 'Asisten Apoteker';
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

function initializeKategoriConfig() {
  db.get('SELECT COUNT(*) AS total FROM kategori_config', (err, row) => {
    if (err || (row && row.total > 0)) return;

    const defaultKategori = [
      { nama: 'SIRUP', lead_time: 14, min_stok: 5, optimal_stok: 20, reorder_qty: 30, keterangan: 'Sirup oral - lead time lama, reorder cepat saat stok turun' },
      { nama: 'TABLET BEBAS', lead_time: 7, min_stok: 10, optimal_stok: 30, reorder_qty: 50, keterangan: 'Tablet bebas/umum - lead time sedang' },
      { nama: 'TABLET KERAS', lead_time: 10, min_stok: 8, optimal_stok: 25, reorder_qty: 40, keterangan: 'Tablet keras - perlu resep, lead time lebih panjang' },
      { nama: 'SALEP', lead_time: 7, min_stok: 5, optimal_stok: 15, reorder_qty: 20, keterangan: 'Salep/krim topical' },
      { nama: 'ETALASE LUAR', lead_time: 7, min_stok: 10, optimal_stok: 20, reorder_qty: 30, keterangan: 'Obat display/etalase luar' },
      { nama: 'INJEKSI', lead_time: 14, min_stok: 3, optimal_stok: 12, reorder_qty: 20, keterangan: 'Injeksi - lead time panjang, minimum stok ketat' }
    ];

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare('INSERT INTO kategori_config (id, nama, lead_time_hari, min_stok, optimal_stok, reorder_qty, keterangan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

      defaultKategori.forEach(kat => {
        stmt.run([uuidv4(), kat.nama, kat.lead_time, kat.min_stok, kat.optimal_stok, kat.reorder_qty, kat.keterangan, new Date().toISOString()]);
      });

      stmt.finalize((finalErr) => {
        if (finalErr) {
          console.error('Kategori config init error:', finalErr);
          db.run('ROLLBACK');
          return;
        }
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            console.error('Kategori config commit error:', commitErr);
            db.run('ROLLBACK');
            return;
          }
          console.log(`Kategori config diinisialisasi dengan ${defaultKategori.length} tipe obat`);
        });
      });
    });
  });
}

function initializeSchedulerConfig(callback) {
  db.get('SELECT COUNT(*) AS total FROM scheduler_config', (err, row) => {
    if (err) {
      console.error('Scheduler config check error:', err);
      if (callback) callback(err);
      return;
    }

    if (row && row.total > 0) {
      console.log('✅ Scheduler config sudah ada di database');
      if (callback) callback(null);
      return;
    }

    const now = new Date().toISOString();

    // Default scheduler config untuk VED-FEFO email
    console.log('[INIT] Menginisialisasi scheduler_config dengan default values...');
    db.run(
      "INSERT INTO scheduler_config (id, config_type, interval_hari, enabled, email_jam, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), 'ved_fefo_email', 5, true, '08:00', now, now],
      (err) => {
        if (err) {
          console.error('❌ Scheduler config init error:', err);
          if (callback) callback(err);
          return;
        }
        console.log('✅ Scheduler config diinisialisasi dengan default: VED-FEFO email setiap 5 hari jam 08:00');
        if (callback) callback(null);
      }
    );
  });
}

function initializeEmailConfig(callback) {
  db.get('SELECT COUNT(*) AS total FROM email_config', (err, row) => {
    if (err) {
      console.error('Email config check error:', err);
      if (callback) callback(err);
      return;
    }

    if (row && row.total > 0) {
      console.log('✅ Email config sudah ada di database');
      if (callback) callback(null);
      return;
    }

    const now = new Date().toISOString();
    const smtpHost = 'smtp.gmail.com';  // Fixed for simplicity
    const smtpPort = 465;               // Gmail SSL port
    const smtpSecure = true;            // Always secure for Gmail
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = 'FROM_ENV';        // Signal to read password from environment
    const notifyFrom = process.env.SMTP_USER || '';  // Use SMTP_USER as sender
    const notifyTo = '';

    console.log('[INIT] Menginisialisasi email_config dengan akun: ' + smtpUser);
    db.run(
      "INSERT INTO email_config (id, config_type, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, notify_from, notify_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), 'ved_fefo_email', smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure ? 1 : 0, notifyFrom, notifyTo, now, now],
      (err) => {
        if (err) {
          console.error('❌ Email config init error:', err);
          if (callback) callback(err);
          return;
        }
        console.log('✅ Email config diinisialisasi dari environment variables');
        if (callback) callback(null);
      }
    );
  });
}

/* ===============================
  DATABASE (shared module)
================================ */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS kategori_config (
      id TEXT PRIMARY KEY,
      nama TEXT UNIQUE NOT NULL,
      lead_time_hari INTEGER DEFAULT 7,
      min_stok INTEGER DEFAULT 10,
      optimal_stok INTEGER DEFAULT 30,
      reorder_qty INTEGER DEFAULT 50,
      keterangan TEXT,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      obat_id TEXT NOT NULL,
      obat_nama TEXT NOT NULL,
      jenis_movement TEXT,
      jumlah INTEGER,
      keterangan TEXT,
      waktu TEXT,
      created_at TEXT,
      FOREIGN KEY (obat_id) REFERENCES obat(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduler_config (
      id TEXT PRIMARY KEY,
      config_type TEXT UNIQUE NOT NULL,
      interval_hari INTEGER DEFAULT 5,
      enabled INTEGER DEFAULT 1,
      email_jam TEXT DEFAULT '08:00',
      last_sent_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS email_config (
      id TEXT PRIMARY KEY,
      config_type TEXT UNIQUE NOT NULL,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL,
      smtp_user TEXT NOT NULL,
      smtp_pass TEXT NOT NULL,
      smtp_secure INTEGER DEFAULT 1,
      notify_from TEXT,
      notify_to TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS laporan_pemusnahan_obat (
      id TEXT PRIMARY KEY,
      obat_id TEXT NOT NULL,
      nama_obat TEXT NOT NULL,
      batch TEXT,
      unit_terjual INTEGER DEFAULT 0,
      unit_sisa INTEGER DEFAULT 0,
      pt_pemusnahan TEXT NOT NULL,
      biaya_pemusnahan NUMERIC(12,2) NOT NULL,
      tanggal_pemusnahan TEXT NOT NULL,
      catatan TEXT,
      created_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approved_by_first TEXT,
      approved_at_first TEXT,
      approved_by_second TEXT,
      approved_at_second TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (obat_id) REFERENCES obat(id)
    )
  `);

  db.all(`PRAGMA table_info(obat)`, (err, cols) => {
    if (err) {
      console.error('Error checking obat columns:', err);
      return;
    }
    const colNames = (cols || []).map(c => c.name);
    const missingColumns = [];
    if (!colNames.includes('batch')) missingColumns.push("ALTER TABLE obat ADD COLUMN batch TEXT");
    if (!colNames.includes('kategori')) missingColumns.push("ALTER TABLE obat ADD COLUMN kategori TEXT DEFAULT 'TABLET BEBAS'");
    if (!colNames.includes('deskripsi')) missingColumns.push("ALTER TABLE obat ADD COLUMN deskripsi TEXT DEFAULT ''");

    if (!missingColumns.length) {
      bootstrapObatIfEmpty();
      backfillObatDescriptions();
      initializeKategoriConfig();
      // Initialize scheduler and email config with callback to ensure they complete
      setTimeout(() => {
        initializeSchedulerConfig();
        setTimeout(() => initializeEmailConfig(), 300);
      }, 500);
      return;
    }

    let pending = missingColumns.length;
    missingColumns.forEach((sql) => {
      db.run(sql, () => {
        pending -= 1;
        if (pending === 0) {
          bootstrapObatIfEmpty();
          backfillObatDescriptions();
          initializeKategoriConfig();
          // Initialize scheduler and email config with callback to ensure they complete
          setTimeout(() => {
            initializeSchedulerConfig();
            setTimeout(() => initializeEmailConfig(), 300);
          }, 500);
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
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Trust reverse proxy headers (required for secure cookies behind Azure ingress)
app.set('trust proxy', 1);

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
  store: new tursoSession.TursoSessionStore(),
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: SESSION_COOKIE_OPTIONS
}));

app.get('/healthz', (req, res) => {
  return res.status(200).json({ status: 'ok', service: 'backend-apotek', timestamp: new Date().toISOString() });
});

app.get('/readyz', (req, res) => {
  db.get('SELECT 1 AS ok', (err) => {
    if (err) {
      return res.status(503).json({ status: 'error', ready: false, message: 'Database not ready' });
    }
    return res.status(200).json({ status: 'ok', ready: true });
  });
});

const authMiddleware = (req, res, next) => {
  console.debug(req.session)
  if (req.session && req.session.user) return next();
  console.debug("Auth middleware returns 401")
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

function normalizeVED(input, jumlah) {
  const ved = String(input || '').trim().toUpperCase();
  if (['V', 'E', 'D'].includes(ved)) return ved;
  return null;
}

function resolveStoredVED(obat) {
  const fromDb = normalizeVED(obat && obat.ved);
  if (fromDb) return fromDb;
  return classifyVED(obat && obat.jumlah);
}

// Hitung umur obat (hari tersisa sampai kadaluarsa)
function getAgeStatus(kadaluarsaStr) {
  if (!kadaluarsaStr) return { daysLeft: null, status: 'unknown', urgency: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse berbagai format expiry
  let expiryDate;
  try {
    // Coba format "OKT.27" -> last day of October 2027
    if (kadaluarsaStr.includes('.')) {
      const parts = kadaluarsaStr.split('.');
      if (parts.length === 2) {
        const monthStr = parts[0].toUpperCase();
        const yearStr = parts[1];
        const monthMap = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, JUN: 6, JUL: 7, AGU: 8, SEP: 9, OKT: 10, NOV: 11, DES: 12 };
        const month = monthMap[monthStr] || 1;
        const year = 2000 + parseInt(yearStr);
        // Use last day of the month: new Date(year, month, 0) gives last day of (month-1)
        expiryDate = new Date(year, month, 0);  // Last day of target month
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
  if (daysLeft < 0 || daysLeft <= 60) {
    status = 'kadaluarsa';
    urgency = 3; // Highest priority - 2 months threshold
  } else if (daysLeft <= 180) {
    status = 'hampir_kadaluarsa';
    urgency = 2; // 6 months threshold
  } else if (daysLeft <= 365) {
    status = 'perhatian';
    urgency = 1; // 1 year threshold for monitoring
  } else {
    status = 'aman';
    urgency = 0;
  }

  return { daysLeft, status, urgency };
}

// Analisis VED dengan rekomendasi
function analyzeObatVED(obat) {
  const n = parseInt(obat.jumlah || 0);
  const ved = resolveStoredVED(obat);
  const age = getAgeStatus(obat.kadaluarsa);

  let recommendation = '';
  let action = 'monitor';

  // Rekomendasi berdasarkan VED + Age
  if (age.status === 'kadaluarsa') {
    recommendation = '🔴 SEGERA BUANG - Obat sudah kadaluarsa';
    action = 'remove';
  } else if (age.status === 'hampir_kadaluarsa') {
    recommendation = '⚠️  PRIORITAS - Gunakan segera (≤6 bulan)';
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

function getActorLabel(req) {
  const user = req && req.session && req.session.user ? req.session.user : null;
  if (!user) return 'unknown';
  return `${user.username} (${formatRoleLabel(user.role)})`;
}

function buildObatChangeSummary(beforeRow, afterRow) {
  const fields = [
    ['nama', 'Nama'],
    ['jumlah', 'Jumlah'],
    ['kadaluarsa', 'Kadaluarsa'],
    ['kategori', 'Kategori'],
    ['batch', 'Batch'],
    ['ved', 'VED'],
    ['deskripsi', 'Deskripsi']
  ];

  const changes = [];
  fields.forEach(([key, label]) => {
    const beforeValue = beforeRow && beforeRow[key] != null ? String(beforeRow[key]) : '';
    const afterValue = afterRow && afterRow[key] != null ? String(afterRow[key]) : '';
    if (beforeValue !== afterValue) {
      changes.push(`${label}: "${beforeValue || '-'}" -> "${afterValue || '-'}"`);
    }
  });

  return changes.join('; ');
}

/* ===============================
   AUTH
================================ */
function resolveActiveLoginRole(userRole, expectedRole) {
  if (!expectedRole) return null;
  if (userRole === expectedRole) return expectedRole;
  if (userRole === 'APJ' && expectedRole === 'ASISTEN_APOTEKER') return expectedRole;
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
      console.debug("A log in success with", req.session.user)
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
        return res.status(500).json({ message: err.message || 'DB error' });
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
      return res.status(500).json({ message: err.message || 'DB error' });
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
  const sql = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`;
  db.run(sql, [normalizedUsername, normalizedEmail, hash, normalizedRole], function(err) {
    if (err) {
      if (String(err.code || '') === 'SQLITE_CONSTRAINT' || String(err.message || '').includes('users.username')) {
        return res.status(400).json({ error: 'Username sudah dipakai' });
      }
      return res.status(400).json({ error: 'Pendaftaran gagal disimpan' });
    }
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        return res.status(500).json({ message: 'Session error' });
      }
      req.session.user = { id: this.lastID, username: normalizedUsername, role: normalizedRole };
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

  const complete = (delivery) => {
    let message = 'Jika akun ditemukan, link reset password sudah dikirim ke email yang terdaftar.';
    if (delivery === 'fallback-log') {
      message = 'Jika akun ditemukan, link reset password disimpan ke email-fallback.log karena SMTP belum dikonfigurasi.';
    }
    return res.json({ message, delivery: delivery || 'email' });
  };

  db.run("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?", [new Date().toISOString()], () => { });
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

            const subject = 'Reset Password obatqu';
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
                <h2 style="margin-bottom:12px;">Reset Password obatqu</h2>
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

            try {
              await sendMail({ to: user.email, subject, text, html }, db);
              addLog('auth', `reset password request ${user.username}`);
              return complete('email');
            } catch (mailError) {
              console.error(`Gagal mengirim email reset password ke ${user.email}:`, mailError);
              // Fallback: Log link ke file jika email gagal
              fs.appendFileSync('email-fallback.log', `[${new Date().toISOString()}] RESET LINK for ${user.username} (${user.email}): ${resetLink}\n`);
              addLog('auth', `reset password request ${user.username} (fallback to log)`);
              return complete('fallback-log');
            }
          }
        );
      });
    }
  );
});

app.get('/api/reset-password/validate', (req, res) => {
  if (!req.query.token) {
    return res.status(400).json({ message: 'Token wajib diisi.' });
  }
  const tokenHash = hashResetToken(req.query.token);

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

          db.run('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?', [row.user_id, row.id], () => { });
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

          const subject = 'Reset Password obatqu';
          const text = `Halo ${user.username},\n\nBuka link berikut untuk mengganti password Anda: ${resetLink}\n\nLink ini berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset password.`;
          const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;">
              <h3>Reset Password obatqu</h3>
              <p>Halo <strong>${user.username}</strong>,</p>
              <p>Klik tombol di bawah untuk mengganti password Anda.</p>
              <p><a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#0fbf9b;color:#fff;text-decoration:none;border-radius:8px;">Ganti Password</a></p>
              <p>Link berlaku selama 30 menit. Abaikan email ini jika Anda tidak meminta reset password.</p>
            </div>`;

          try {
            await sendMail({ to: user.email, subject, text, html }, db);
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
  const actor = getActorLabel(req);

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
      addLog('audit', `Ubah role: ${user.username} dari ${user.role} ke ${nextRole} oleh ${actor}`);
      return res.json({
        message: `Role ${user.username} berhasil diubah menjadi ${formatRoleLabel(nextRole)}`,
        user: { id: user.id, username: user.username, role: nextRole }
      });
    });
  });
});

app.delete('/api/users/:id', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  const targetId = Number(req.params.id);
  const actor = getActorLabel(req);

  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ message: 'ID user tidak valid' });
  }

  // Prevent deleting the current user
  if (req.session.user && Number(req.session.user.id) === targetId) {
    return res.status(400).json({ message: 'Anda tidak bisa menghapus akun yang sedang dipakai.' });
  }

  db.get("SELECT id, username, email, role FROM users WHERE id = ?", [targetId], (findErr, user) => {
    if (findErr) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    db.run("DELETE FROM users WHERE id = ?", [targetId], function(err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('audit', `Hapus user: ${user.username} (${user.role}) oleh ${actor}`);
      return res.json({ message: `User ${user.username} berhasil dihapus` });
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
  const { nama, jumlah, kadaluarsa, kategori, batch, deskripsi, ved: vedInput } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const ved = normalizeVED(vedInput, jumlah) || classifyVED(jumlah);
  const finalDeskripsi = resolveObatDescription(nama, deskripsi);
  const actor = getActorLabel(req);

  db.run(
    "INSERT INTO obat (id,nama,jumlah,kadaluarsa,ved,kategori,batch,deskripsi) VALUES (?,?,?,?,?,?,?,?)",
    [uuidv4(), nama, jumlah, kadaluarsa, ved, kategori || 'TABLET BEBAS', batch || '', finalDeskripsi],
    function(err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      addLog('audit', `Tambah obat: ${nama} (Batch ${batch || '-'}) oleh ${actor}`);
      return res.json({ message: 'Obat ditambahkan' });
    }
  );
});

app.put('/api/obat/:id', authMiddleware, (req, res) => {
  const { nama, jumlah, kadaluarsa, kategori, batch, deskripsi, ved: vedInput } = req.body || {};
  if (!nama || jumlah == null) return res.status(400).json({ message: 'Nama dan jumlah wajib diisi' });
  const finalDeskripsi = resolveObatDescription(nama, deskripsi);
  const trimmedVed = String(vedInput || '').trim();
  const actor = getActorLabel(req);

  const runUpdate = (vedValue, beforeRow) => {
    db.run(
      "UPDATE obat SET nama=?, jumlah=?, kadaluarsa=?, ved=?, kategori=?, batch=?, deskripsi=? WHERE id=?",
      [nama, jumlah, kadaluarsa, vedValue, kategori || 'TABLET BEBAS', batch || '', finalDeskripsi, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ message: 'DB error' });
        const afterRow = {
          nama,
          jumlah,
          kadaluarsa,
          ved: vedValue,
          kategori: kategori || 'TABLET BEBAS',
          batch: batch || '',
          deskripsi: finalDeskripsi
        };
        const summary = buildObatChangeSummary(beforeRow, afterRow);
        const summaryText = summary ? `Perubahan: ${summary}` : 'Perubahan: tidak terdeteksi';
        addLog('audit', `Edit obat: ${nama} (ID ${req.params.id}) oleh ${actor}. ${summaryText}`);
        return res.json({ message: 'Updated' });
      }
    );
  };

  db.get("SELECT * FROM obat WHERE id = ?", [req.params.id], (findErr, row) => {
    if (findErr) return res.status(500).json({ message: 'DB error' });
    if (!row) return res.status(404).json({ message: 'Obat tidak ditemukan' });

    if (trimmedVed) {
      const normalized = normalizeVED(trimmedVed, jumlah);
      if (!normalized) {
        return res.status(400).json({ message: 'VED harus diisi dengan V, E, atau D.' });
      }
      return runUpdate(normalized, row);
    }

    const existingVed = row.ved ? row.ved : classifyVED(jumlah);
    return runUpdate(existingVed, row);
  });
});

app.delete('/api/obat/:id', authMiddleware, (req, res) => {
  const user = req.session && req.session.user ? req.session.user : null;
  const actor = user ? `${user.username} (${formatRoleLabel(user.role)})` : 'unknown';

  db.get("SELECT id, nama, batch FROM obat WHERE id = ?", [req.params.id], (findErr, obat) => {
    if (findErr) return res.status(500).json({ message: 'DB error' });
    if (!obat) return res.status(404).json({ message: 'Obat tidak ditemukan' });

    db.run(
      "DELETE FROM obat WHERE id=?",
      [req.params.id],
      function(err) {
        if (err) return res.status(500).json({ message: 'DB error' });
        addLog('audit', `Hapus obat: ${obat.nama} (Batch ${obat.batch || '-'}) oleh ${actor}`);
        return res.json({ message: 'Deleted' });
      }
    );
  });
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

          // Track stock movement
          const movementId = uuidv4();
          const now = new Date().toISOString();
          db.run(
            "INSERT INTO stock_movements (id, obat_id, obat_nama, jenis_movement, jumlah, keterangan, waktu, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [movementId, obat.id, obat.nama, 'RELEASE_FEFO', 1, 'Obat keluar via FEFO', obat.kadaluarsa || 'Tanpa tanggal', now],
            (err3) => {
              if (err3) console.error('Stock movement log error:', err3);
            }
          );

          addLog('fefo', `FEFO ${obat.nama} oleh ${req.session.user.username} (${formatRoleLabel(req.session.user.role)})`);
          return res.json({ message: 'FEFO berhasil' });
        }
      );
    }
  );
});

// Release/Sale tracking endpoint - Simplified & more robust
app.post('/api/release', authMiddleware, async (req, res) => {
  try {
    const { obat_id, jumlah, keterangan } = req.body || {};

    console.log('=== /api/release START ===');
    console.log('Request:', { obat_id, jumlah, keterangan });

    // Validasi input
    if (!obat_id) {
      console.error('[FAIL] obat_id missing');
      return res.status(400).json({ message: 'Obat ID diperlukan' });
    }

    const qtyInt = parseInt(jumlah || 0);
    if (isNaN(qtyInt) || qtyInt < 1) {
      console.error('[FAIL] jumlah invalid:', jumlah);
      return res.status(400).json({ message: 'Jumlah harus angka positif' });
    }

    console.log('[OK] Input valid. qtyInt=' + qtyInt);

    // Get obat - using Promise wrapper
    const obat = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM obat WHERE id = ?", [obat_id], (err, row) => {
        if (err) reject(new Error('DB GET error: ' + err.message));
        if (!row) reject(new Error('Obat not found with id: ' + obat_id));
        resolve(row);
      });
    });

    console.log('[OK] Obat found:', obat.nama, 'Current stok:', obat.jumlah);

    const releaseQty = Math.min(qtyInt, obat.jumlah);
    const newJumlah = Math.max(0, obat.jumlah - releaseQty);

    console.log('[INFO] releaseQty=' + releaseQty + ', newJumlah=' + newJumlah);

    // Update obat stok
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE obat SET jumlah=?, ved=? WHERE id=?",
        [newJumlah, classifyVED(newJumlah), obat.id],
        (err) => {
          if (err) reject(new Error('DB UPDATE error: ' + err.message));
          console.log('[OK] Stok updated');
          resolve();
        }
      );
    });

    // Record movement (don't block on this)
    const movementId = uuidv4();
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO stock_movements (id, obat_id, obat_nama, jenis_movement, jumlah, keterangan, waktu, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [movementId, obat.id, obat.nama, 'RELEASE', releaseQty, keterangan || '', obat.kadaluarsa || '', now],
      (err) => {
        if (err) console.error('[WARN] Movement insert error:', err.message);
        else console.log('[OK] Movement recorded');
      }
    );

    // Log activity (async, don't block)
    setImmediate(() => {
      try {
        addLog('release', 'Release ' + releaseQty + 'x ' + obat.nama + ' by ' + req.session.user.username);
        console.log('[OK] Activity logged');
      } catch (logErr) {
        console.error('[WARN] Log error:', logErr.message);
      }
    });

    // SEND RESPONSE IMMEDIATELY
    console.log('[OK] Sending response with status 200');
    res.json({
      message: 'Release berhasil',
      released: releaseQty,
      remaining: newJumlah
    });
    console.log('=== /api/release END (SUCCESS) ===\n');

  } catch (err) {
    console.error('[ERROR] Exception caught:', err.message);
    console.log('=== /api/release END (ERROR) ===\n');

    if (res.headersSent) {
      console.error('[CRITICAL] Headers already sent, cannot send error response');
      return;
    }

    res.status(500).json({
      message: 'Gagal: ' + err.message
    });
  }
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
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200) || 200));

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
      notifications: notifications.slice(0, limit)
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
    title: '1. Pengantar Sistem obatqu',
    paragraphs: [
      'obatqu adalah sistem informasi manajemen apotek berbasis web yang dirancang untuk membantu petugas apotek mengelola data obat, memantau kadaluarsa, mengontrol stok, menjalankan prioritas VED-FEFO, dan mengunduh laporan operasional dari antarmuka yang konsisten.',
      'Akses sistem melalui https://obatqu.online pada browser. Jika file HTML dibuka langsung dari komputer, sistem otomatis mengarahkan ke alamat tersebut selama server aktif berjalan.'
    ],
    bullets: [
      'Dashboard ringkasan: Indikator stok, kadaluarsa, dan restock dalam satu layar dengan navigasi cepat ke menu terkait.',
      'Mengelola Data Obat: Tambah, ubah, hapus data obat beserta batch, kategori, dan deskripsi. Catat obat yang dikeluarkan.',
      'VED-FEFO: Kelompokkan obat berdasarkan kategori (Vital, Essential, Desirable) dengan urutan FEFO untuk prioritas penanganan.',
      'Monitoring Kadaluarsa: Pantau obat yang sudah atau akan segera kadaluarsa dengan status (Aman, Hampir Kadaluarsa, Kadaluarsa).',
      'Monitoring Stok: Lihat status stok (Habis, Menipis, Reorder) dan risiko kehabisan stok berdasarkan pola pemakaian.',
      'Mengelola Data User: Kelola akun pengguna, penetapan role, manajemen hak akses, dan atur pengaturan email VED-FEFO (APJ saja).',
      'Laporan: Unduh laporan stok, kritis, aktivitas, pelepasan obat dalam format PDF dan CSV.'
    ]
  },
  {
    title: '2. Akun dan Login',
    paragraphs: [
      'Semua pengguna wajib memiliki akun sebelum dapat mengakses dashboard. Proses akun meliputi pendaftaran, masuk, dan pemulihan password.',
      'Pendaftaran membutuhkan username unik, email, password minimal 4 karakter, dan pilihan role (APJ atau Asisten Apoteker)',
      'Login mewajibkan pemilihan role. Akun APJ dapat masuk sebagai APJ atau sebagai Asisten Apoteker, namun Akun Asisten Apoteker hanya dapat masuk dengan role tersebut.'
    ],
    bullets: [
      'Gunakan username atau email saat login. Jika satu email dipakai lebih dari satu akun, gunakan username agar sistem mengenali akun yang benar.',
      'Fitur reset password mengirim link ke email terdaftar atau ke fallback log server jika SMTP belum aktif.',
      'Role yang dipilih saat daftar menentukan hak akses di seluruh sistem.'
    ]
  },
  {
    title: '3. Hak Akses dan Role',
    paragraphs: [
      'Sistem mendukung dua role utama: APJ (Apoteker Penanggung Jawab) dan Asisten Apoteker.',
      'Keduanya dapat mengakses pengelolaan obat, monitoring, VED-FEFO, dan laporan. Manajemen user dan pengaturan email VED-FEFO hanya tersedia untuk APJ.'
    ],
    bullets: [
      'APJ: Akses penuh termasuk mengelola role pengguna lain dan mengatur pengaturan email VED-FEFO.',
      'Asisten Apoteker: Fokus pada operasional obat, monitoring, dan laporan.',
      'Akun APJ yang sedang aktif tidak dapat didemote dari dashboard untuk mencegah putus akses admin.'
    ]
  },
  {
    title: '4. Dashboard Utama',
    paragraphs: [
      'Dashboard menampilkan ringkasan cepat kondisi operasional dan role aktif pengguna setelah login berhasil.',
      'Indikator utama adalah total item obat, kadaluarsa, hampir kadaluarsa (30 hari), stok baik, restock, dan aktivitas.'
    ],
    bullets: [
      'Quick Start membantu membuka menu prioritas kerja secara langsung.',
      'Ringkasan Indikator: Lihat total obat, status expired, hampir kadaluarsa, stok baik, stok menipis, dan reorder dalam satu pandangan.',
      'Akses cepat ke menu Mengelola Obat, Monitoring, VED-FEFO, Laporan, dan lainnya melalui navigasi sidebar.'
    ]
  },
  {
    title: '5. Mengelola Data Obat',
    paragraphs: [
      'Menu data obat digunakan untuk menambah, mengubah, menghapus, memfilter, melihat detail obat, dan mencatat obat yang dikeluarkan dari satu halaman.',
      'Kolom utama meliputi nama obat, batch, kategori, deskripsi, jumlah, tanggal kadaluarsa, status, prioritas, dan VED.'
    ],
    bullets: [
      'Tambah obat menggunakan form inline tanpa pindah halaman.',
      'Klik nama obat untuk membuka popup detail dan melihat history obat.',
      'Tombol "Obat Keluar" untuk mencatat pelepasan obat dan tracking pola penggunaan.',
      'Filter berdasarkan kategori, status, atau VED untuk pencarian cepat.'
    ]
  },
  {
    title: '6. Monitoring Kadaluarsa dan VED-FEFO',
    paragraphs: [
      'Monitoring kadaluarsa menampilkan obat yang sudah kadaluarsa atau hampir kadaluarsa agar penanganan dapat diprioritaskan.',
      'VED-FEFO mengelompokkan obat berdasarkan tingkat kepentingan lalu mengurutkan penanganan berdasarkan tanggal kadaluarsa terdekat (FEFO).'
    ],
    bullets: [
      'Vital (V): Prioritas paling tinggi untuk ketersediaan stok dan penanganan kadaluarsa terlebih dahulu.',
      'Essential (E): Penting dan perlu dipantau rutin agar selalu tersedia.',
      'Desirable (D): Prioritas normal, pantau jika mulai menipis.',
      'Setiap obat ditampilkan dengan status (Aman, Hampir Kadaluarsa, Kadaluarsa) dan ranking VED untuk urutan penugasan.'
    ]
  },
  {
    title: '6b. Monitoring Stok (Agregasi Per Produk)',
    paragraphs: [
      'Monitoring stok menampilkan status habis, menipis, dan kebutuhan reorder lengkap dengan prioritas tindakan dan peringatan otomatis. FITUR BARU: Sistem sekarang menghitung prioritas dan status stok berdasarkan TOTAL qty dari semua batch dengan nama produk yang sama, bukan per batch individual. Ini memastikan ranking yang akurat ketika ada penambahan stok dari batch lain.',
      'Contoh: Minyak Telon My Baby 30ml memiliki Batch O951225 (1 unit) dan Batch O961225 (10 unit). Total = 11 unit → Status: Aman, Prioritas: P3 (bukan P1 hanya karena Batch O951225 qty=1).'
    ],
    bullets: [
      'Status Stok berdasarkan Total Qty Produk: Habis (total < min_stok kategori), Menipis (min ≤ total < optimal), Aman (total ≥ optimal).',
      'Ranking Prioritas (P1/P2/P3) dihitung dari TOTAL qty produk + klasifikasi VED, bukan qty batch individual.',
      'Tabel Monitoring Stok menampilkan kolom: "X unit (Total: Y unit)" — X adalah batch saat ini, Y adalah total semua batch produk.',
      'Detail Popup: Klik nama obat untuk membuka ringkasan stok yang menunjukkan batch qty, total product qty, "Sudah Ditambah! Z unit" (jika batch lain ada), ranking dengan threshold, dan daftar batch lain.'
    ]
  },
  {
    title: '7. Laporan dan Unduhan',
    paragraphs: [
      'Sistem laporan menyediakan laporan dari dashboard serta laporan PDF dan CSV operasional lainnya.',
      'Laporan mencakup laporan stok lengkap, ringkasan VED, laporan kritis (obat kadaluarsa + stok habis), laporan harian, laporan pelepasan, dan rekomendasi restock.'
    ],
    bullets: [
      'Detail Stok Lengkap (PDF/CSV): Inventaris lengkap semua obat dengan batch, kategori, VED, jumlah, dan tanggal kadaluarsa.',
      'Laporan Obat Kritis (PDF): Daftar obat yang perlu tindakan segera (kadaluarsa, hampir expired, stok habis/menipis).',
      'Laporan Aktivitas Harian (PDF): Ringkasan obat baru, dikeluarkan, perubahan stok, dan kategori hari ini.',
      'Rekomendasi Restock (PDF): Saran pemesanan berdasarkan pola penggunaan, lead time, dan klasifikasi VED.'
    ]
  },
  {
    title: '8. Mengelola Data User dan Pengaturan',
    paragraphs: [
      'Menu manajemen user dipakai APJ untuk melihat daftar user, mencari user, dan mengubah role akun.',
      'Fitur baru: APJ dapat mengatur pengaturan email VED-FEFO otomatis di bagian bawah menu "Mengelola Data User".'
    ],
    bullets: [
      'Cari user berdasarkan username atau email untuk menemukan akun dengan cepat.',
      'Ubah role pengguna dari APJ atau Asisten Apoteker sesuai kebutuhan organisasi.',
      'Pengaturan Email VED-FEFO: Set interval pengiriman (1-30 hari), waktu pengiriman (HH:MM), aktifkan/nonaktifkan, dan test pengiriman.',
      'Gunakan buku panduan ini sebagai referensi operasional harian agar penggunaan sistem tetap konsisten dengan aturan role dan monitoring.'
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
      .text('obatqu.online', left + 10, y + 3, { width: contentWidth - 20, align: 'left' });
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
      .text('obatqu.online', left + 18, top + 52, { width: contentWidth - 36 });

    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(11)
      .text('Versi 1.3 | April 2026', left + 20, top + 104, { width: 250 });
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
    .text('Dibuat otomatis oleh server obatqu untuk kebutuhan dokumentasi operasional.', left + 12, doc.y + 8, { width: contentWidth - 24, align: 'center' });
}

/* ===============================
   PDF REPORTS
================================ */
app.get('/api/panduan/pdf', (req, res) => {
  try {
    const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false });
    const fileName = 'obatqu-online-panduan-April-2026.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    doc.info.Title = 'obatqu.online - Panduan Penggunaan';
    doc.info.Author = 'obatqu';
    doc.info.Subject = 'Panduan penggunaan sistem obatqu';
    doc.info.Creator = 'obatqu Server';

    doc.pipe(res);
    writePanduanPdf(doc);
    doc.end();
  } catch (err) {
    console.error('Panduan PDF generation error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Gagal membuat PDF panduan: ' + err.message });
    }
    res.end();
  }
});

app.get('/api/reports/pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  try {
    console.log('[REPORT] /api/reports/pdf START - COMPREHENSIVE STOCK & EXPIRY REPORT');

    db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
      db.all("SELECT * FROM stock_movements ORDER BY waktu DESC LIMIT 100", (movErr, movements) => {
        try {
          if (err) {
            console.error('[REPORT] DB query error:', err.message);
            if (!res.headersSent) {
              return res.status(500).json({ message: 'Database error' });
            }
            return;
          }

          if (!Array.isArray(rows) || rows.length === 0) {
            console.warn('[REPORT] No data from database');
            rows = [];
          }

          console.log('[REPORT] Creating comprehensive PDF with ' + rows.length + ' items');

          const doc = new PDFDocument({ margin: 30, bufferPages: false });
          const fileName = `Laporan-Stok-Lengkap-${new Date().toISOString().split('T')[0]}.pdf`;

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

          doc.on('error', (err) => {
            console.error('[REPORT] Document error:', err.message);
            if (!res.headersSent) {
              res.status(500).json({ message: 'PDF generation error' });
            }
          });

          res.on('error', (err) => {
            console.error('[REPORT] Response error:', err.message);
            doc.end();
          });

          doc.pipe(res);

          // HEADER
          doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN STOK DAN KADALUARSA OBAT', { align: 'center' });
          doc.fontSize(10).font('Helvetica').text('obatqu - Pharmacy Management System', { align: 'center' });
          const tanggalLaporan = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          doc.text(`Tanggal: ${tanggalLaporan}`, { align: 'center' });
          doc.moveDown();

          // ===== SECTION 1: RINGKASAN KADALUARSA =====
          doc.fontSize(13).font('Helvetica-Bold').fillColor('#2c3e50').text('█ BAGIAN 1: RINGKASAN KADALUARSA');
          doc.fillColor('#000000').fontSize(10).font('Helvetica');

          const expiryStats = { expired: 0, nearExpiry: 0, safe: 0 };
          const expiredList = [];
          const nearExpiryList = [];

          rows.forEach(obat => {
            const analysis = analyzeObatVED(obat);
            if (analysis.status === 'kadaluarsa') {
              expiryStats.expired++;
              expiredList.push(obat);
            } else if (analysis.status === 'hampir_kadaluarsa') {
              expiryStats.nearExpiry++;
              nearExpiryList.push(obat);
            } else {
              expiryStats.safe++;
            }
          });

          doc.text(`Total Obat Kadaluarsa: ${expiryStats.expired} item - HARUS DIMUSNAHKAN`, { font: 'Helvetica-Bold' });
          doc.text(`Total Obat Hampir Kadaluarsa (<=6 bulan): ${expiryStats.nearExpiry} item - PRIORITAS PENJUALAN`, { font: 'Helvetica-Bold' });
          doc.text(`Total Obat Aman: ${expiryStats.safe} item - STOK TERJAGA`, { font: 'Helvetica-Bold' });
          doc.moveDown();

          if (expiryStats.expired > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('Obat Kadaluarsa - PRIORITAS TINGGI:');
            doc.fontSize(9).font('Helvetica');
            expiredList.slice(0, 10).forEach((obat, idx) => {
              doc.text(`${idx + 1}. ${String(obat.nama).substring(0, 35)} | Batch: ${obat.batch || '-'} | Kadaluarsa: ${obat.kadaluarsa || '-'} | VED: ${obat.ved || '-'} | Stok: ${obat.jumlah} unit`);
            });
            if (expiryStats.expired > 10) {
              doc.text(`... dan ${expiryStats.expired - 10} item lainnya`);
            }
            doc.moveDown();
          }

          // ===== SECTION 2: RINGKASAN STOK =====
          doc.fontSize(13).font('Helvetica-Bold').fillColor('#2c3e50').text('█ BAGIAN 2: RINGKASAN STOK OBAT');
          doc.fillColor('#000000').fontSize(10).font('Helvetica');

          const stockStats = { outOfStock: 0, lowStock: 0, criticalVital: 0, normalStock: 0 };
          const outOfStockList = [];
          const lowStockList = [];
          const criticalList = [];

          rows.forEach(obat => {
            const qty = Number(obat.jumlah || 0);
            const ved = String(obat.ved || 'D').toUpperCase();

            if (qty <= 0) {
              stockStats.outOfStock++;
              outOfStockList.push(obat);
            } else if (qty <= 5) {
              stockStats.lowStock++;
              if (ved === 'V') {
                stockStats.criticalVital++;
                criticalList.push(obat);
              }
              lowStockList.push(obat);
            } else {
              stockStats.normalStock++;
            }
          });

          doc.text(`Total Obat Habis (0 unit): ${stockStats.outOfStock} item - LAYANAN TERGANGGU, PESAN SEGERA`, { font: 'Helvetica-Bold' });
          doc.text(`Total Obat Menipis (1-5 unit): ${stockStats.lowStock} item - PERLU REORDER`, { font: 'Helvetica-Bold' });
          doc.text(`Total Obat VITAL Menipis: ${stockStats.criticalVital} item - URGEN SESUAIKAN STOK`, { font: 'Helvetica-Bold' });
          doc.text(`Total Obat Stok Aman (>5 unit): ${stockStats.normalStock} item - KONDISI BAIK`, { font: 'Helvetica-Bold' });
          doc.moveDown();

          if (stockStats.outOfStock > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('Obat Habis - PRIORITAS TERTINGGI:');
            doc.fontSize(9).font('Helvetica');
            outOfStockList.slice(0, 8).forEach((obat, idx) => {
              doc.text(`${idx + 1}. ${String(obat.nama).substring(0, 35)} | VED: ${obat.ved || '-'} | Kategori: ${obat.kategori || '-'}`);
            });
            if (stockStats.outOfStock > 8) {
              doc.text(`... dan ${stockStats.outOfStock - 8} item lainnya`);
            }
            doc.moveDown();
          }

          if (stockStats.criticalVital > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('Obat VITAL Menipis - URGEN:');
            doc.fontSize(9).font('Helvetica');
            criticalList.forEach((obat, idx) => {
              doc.text(`${idx + 1}. ${String(obat.nama).substring(0, 35)} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
            });
            doc.moveDown();
          }

          // ===== PAGE BREAK / New Section =====
          doc.addPage();

          // ===== SECTION 3: VED-FEFO PRIORITY =====
          doc.fontSize(13).font('Helvetica-Bold').fillColor('#2c3e50').text('█ BAGIAN 3: KLASIFIKASI VED-FEFO');
          doc.fillColor('#000000').fontSize(10).font('Helvetica');
          doc.text('Strategi Vital-Essential-Desirable dengan First Expiry First Out untuk optimasi stok dan meminimalkan kerugian kadaluarsa.');
          doc.moveDown();

          const vedStats = { V: 0, E: 0, D: 0 };
          const vedList = { V: [], E: [], D: [] };

          rows.forEach(obat => {
            const analysis = analyzeObatVED(obat);
            vedStats[analysis.ved]++;
            vedList[analysis.ved].push(obat);
          });

          doc.fontSize(11).font('Helvetica-Bold').text(`V - VITAL (Stok Kritis): ${vedStats.V} item`);
          doc.fontSize(9).font('Helvetica').text('Obat esensial yang harus selalu tersedia. Kekurangan dapat mengganggu layanan kesehatan. Stok minimal: 2 unit.');
          vedList.V.slice(0, 5).forEach((obat, idx) => {
            doc.text(`  ${idx + 1}. ${String(obat.nama).substring(0, 40)} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
          });
          if (vedStats.V > 5) doc.text(`  ... dan ${vedStats.V - 5} obat Vital lainnya`);
          doc.moveDown(0.5);

          doc.fontSize(11).font('Helvetica-Bold').text(`E - ESSENTIAL (Stok Pantau): ${vedStats.E} item`);
          doc.fontSize(9).font('Helvetica').text('Obat penting yang diperlukan secara teratur. Stok optimal: 3-10 unit.');
          vedList.E.slice(0, 5).forEach((obat, idx) => {
            doc.text(`  ${idx + 1}. ${String(obat.nama).substring(0, 40)} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
          });
          if (vedStats.E > 5) doc.text(`  ... dan ${vedStats.E - 5} obat Essential lainnya`);
          doc.moveDown(0.5);

          doc.fontSize(11).font('Helvetica-Bold').text(`D - DESIRABLE (Stok Aman): ${vedStats.D} item`);
          doc.fontSize(9).font('Helvetica').text('Obat tambahan untuk melengkapi layanan. Stok aman: lebih dari 10 unit.');
          vedList.D.slice(0, 5).forEach((obat, idx) => {
            doc.text(`  ${idx + 1}. ${String(obat.nama).substring(0, 40)} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
          });
          if (vedStats.D > 5) doc.text(`  ... dan ${vedStats.D - 5} obat Desirable lainnya`);
          doc.moveDown();

          // ===== SECTION 4: HISTORY OBAT MASUK/KELUAR =====
          doc.fontSize(13).font('Helvetica-Bold').fillColor('#2c3e50').text('█ BAGIAN 4: RIWAYAT STOK (100 TRANSAKSI TERAKHIR)');
          doc.fillColor('#000000').fontSize(9).font('Helvetica');

          if (movements && movements.length > 0) {
            movements.slice(0, 20).forEach((mov, idx) => {
              const waktuFormat = new Date(mov.waktu).toLocaleDateString('id-ID');
              const tipe = mov.jenis_movement || 'UNKNOWN';
              doc.text(`${idx + 1}. [${waktuFormat}] ${tipe} | ${mov.obat_nama || '-'} | Qty: ${mov.jumlah || 0} unit | Ket: ${mov.keterangan || '-'}`);
            });
            if (movements.length > 20) {
              doc.text(`... dan ${movements.length - 20} transaksi lainnya`);
            }
          } else {
            doc.text('Belum ada history obat masuk/keluar');
          }
          doc.moveDown();

          // ===== FOOTER =====
          doc.fontSize(9).font('Helvetica').fillColor('#666666').text('LAPORAN MANAJEMEN STOK OBAT KOMPREHENSIF', { align: 'center', underline: true });
          doc.fontSize(8).text('Laporan ini berfokus pada pengelolaan kadaluarsa, stok, dan prioritas VED-FEFO untuk meminimalkan kerugian dan memastikan ketersediaan obat esensial.', { align: 'justify', color: '#666666' });

          console.log('[REPORT] Comprehensive report generated successfully');
          doc.end();

        } catch (innerErr) {
          console.error('[REPORT] Inner error:', innerErr.message, innerErr.stack);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error: ' + innerErr.message });
          }
        }
      });
    });

  } catch (err) {
    console.error('[REPORT] Outer error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
});

// Simplified VED Summary PDF
app.get('/api/reports/ved-summary-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  console.log('[REPORT] 📊 GET /api/reports/ved-summary-pdf START');

  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) {
      console.error('[REPORT] ❌ DB error:', err.message);
      return res.status(500).json({ message: 'Database error: ' + err.message });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn('[REPORT] ⚠️ No data from database');
      rows = [];
    }

    try {
      console.log('[REPORT] ✅ Query successful, generating PDF with ' + rows.length + ' items');

      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const fileName = `Laporan-VED-FEFO-${new Date().toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Error handler untuk PDF document
      doc.on('error', (err) => {
        console.error('[REPORT] ❌ PDF document error:', err.message, err.stack);
        if (!res.headersSent) {
          res.status(500).json({ message: 'PDF error: ' + err.message });
        }
      });

      // Error handler untuk response stream
      res.on('error', (err) => {
        console.error('[REPORT] ❌ Response stream error:', err.message);
        try {
          doc.destroy();
        } catch (e) {
          console.error('[REPORT] Error destroying doc:', e.message);
        }
      });

      doc.pipe(res);

      // HEADER
      doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN ANALISIS VED-FEFO', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text('Klasifikasi Obat Berdasarkan Ketersediaan Stok', { align: 'center' });
      const tanggalLaporan = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      doc.fontSize(10).text(`Tanggal: ${tanggalLaporan}`, { align: 'center' });
      doc.moveDown(1.5);

      // Summary boxes
      const categories = { V: [], E: [], D: [] };
      rows.forEach(obat => {
        const ved = resolveStoredVED(obat);
        categories[ved].push(obat);
      });

      const totalItems = rows.length;
      doc.fontSize(12).font('Helvetica-Bold').text('RINGKASAN KLASIFIKASI OBAT', { align: 'left' });
      doc.moveDown(0.5);

      // Summary statistics
      doc.fontSize(11).font('Helvetica');
      doc.text(`Total Obat: ${totalItems} item`, { underline: true });
      doc.fontSize(9).text(`[V] Vital: ${categories.V.length} item (${((categories.V.length / totalItems) * 100).toFixed(1)}%)`);
      doc.text(`[E] Essential: ${categories.E.length} item (${((categories.E.length / totalItems) * 100).toFixed(1)}%)`);
      doc.text(`[D] Desirable: ${categories.D.length} item (${((categories.D.length / totalItems) * 100).toFixed(1)}%)`);
      doc.moveDown(1);

      // VITAL Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#c0392b').text('[V] VITAL - Stok Kritis', { underline: true });
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      doc.text('Obat esensial yang harus selalu tersedia di apotek. Stok harus dijaga minimal 2 unit. Kekurangan stok dapat mengganggu layanan kesehatan.', { align: 'left' });
      doc.moveDown(0.3);

      if (categories.V.length === 0) {
        doc.text('✓ Tidak ada obat kategori Vital');
      } else {
        doc.text(`Daftar ${Math.min(categories.V.length, 15)} dari ${categories.V.length} obat Vital:`, { underline: true });
        doc.moveDown(0.2);
        categories.V.slice(0, 15).forEach((obat, i) => {
          doc.text(`${i + 1}. ${obat.nama} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
        });
        if (categories.V.length > 15) {
          doc.text(`... dan ${categories.V.length - 15} obat Vital lainnya`);
        }
      }
      doc.moveDown(1);

      // ESSENTIAL Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#f39c12').text('[E] ESSENTIAL - Stok Pantau', { underline: true });
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      doc.text('Obat penting yang diperlukan secara teratur. Stok optimal adalah 3-10 unit. Kelangkaan stok dapat mengurangi kenyamanan layanan.', { align: 'left' });
      doc.moveDown(0.3);

      if (categories.E.length === 0) {
        doc.text('✓ Tidak ada obat kategori Essential');
      } else {
        doc.text(`Total: ${categories.E.length} obat Essential`);
        doc.moveDown(0.2);
        categories.E.slice(0, 10).forEach((obat, i) => {
          doc.text(`${i + 1}. ${obat.nama} | Stok: ${obat.jumlah} unit | Kadaluarsa: ${obat.kadaluarsa || '-'}`);
        });
        if (categories.E.length > 10) {
          doc.text(`... dan ${categories.E.length - 10} obat Essential lainnya`);
        }
      }
      doc.moveDown(1);

      // DESIRABLE Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#27ae60').text('[D] DESIRABLE - Stok Aman', { underline: true });
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      doc.text('Obat tambahan yang tersedia sesuai kebutuhan. Stok yang aman adalah lebih dari 10 unit. Ketersediaan ini mendukung pelayanan yang komprehensif.', { align: 'left' });
      doc.moveDown(0.3);

      if (categories.D.length === 0) {
        doc.text('✓ Tidak ada obat kategori Desirable');
      } else {
        doc.text(`Total: ${categories.D.length} obat Desirable (kondisi stok aman)`);
      }
      doc.moveDown(1.5);

      // Footer
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('PENJELASAN METODE VED-FEFO:', { underline: true, color: '#000000' });
      doc.text('VED-FEFO adalah singkatan dari Vital-Essential-Desirable dan First Expiry First Out. Metode ini menggabungkan klasifikasi obat berdasarkan pentingnya ketersediaan (VED) dengan prinsip "obat dengan tanggal kadaluarsa terdekat harus dijual lebih dulu" (FEFO). Dengan metode ini, apotek dapat meminimalkan kerugian dari obat yang kadaluarsa sambil memastikan ketersediaan obat esensial.', { align: 'justify' });

      doc.end();
      console.log('[REPORT] ✅ PDF stream ended');
    } catch (err) {
      console.error('[REPORT] ❌ Error generating PDF:', err.message, err.stack);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error generating report: ' + err.message });
      }
    }
  });
});

app.get('/api/reports/csv', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  console.log('[REPORT] 📊 GET /api/reports/csv START');
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) {
      console.error('[REPORT] ❌ DB error:', err.message);
      return res.status(500).json({ message: 'DB error' });
    }
    console.log('[REPORT] ✅ Query successful, generating CSV...');
    const escapeCsv = (value) => {
      const text = String(value == null ? '' : value);
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };

    const csvLines = [
      ['Nama', 'Batch', 'Kategori', 'Deskripsi', 'Jumlah', 'Kadaluarsa', 'VED'].join(','),
      ...rows.map((row) => [
        escapeCsv(row.nama),
        escapeCsv(row.batch),
        escapeCsv(row.kategori),
        escapeCsv(row.deskripsi),
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
  console.log('[REPORT] 📊 GET /api/reports/critical-pdf START');
  db.all("SELECT * FROM obat ORDER BY nama ASC", (err, rows) => {
    if (err) {
      console.error('[REPORT] ❌ DB error:', err.message);
      return res.status(500).json({ message: 'Database error: ' + err.message });
    }

    if (!rows) {
      console.log('[REPORT] ℹ️ No rows found (null result)');
      rows = [];
    }
    console.log('[REPORT] ✅ Query successful, generating PDF with ' + rows.length + ' items');

    try {
      // Analyze all items
      const analyzedRows = rows.map((row) => ({ ...row, analysis: analyzeObatVED(row) }));

      // Separate each category clearly
      const expired = analyzedRows.filter(r => r.analysis.status === 'kadaluarsa');
      const nearExpiry = analyzedRows.filter(r => r.analysis.status === 'hampir_kadaluarsa');
      const vitalLowStock = analyzedRows.filter(r => r.analysis.ved === 'V' && r.analysis.status !== 'kadaluarsa' && r.analysis.status !== 'hampir_kadaluarsa');

      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const fileName = `Laporan-Obat-Kritis-${new Date().toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Error handlers BEFORE pipe
      doc.on('error', (docErr) => {
        console.error('[REPORT] ❌ PDF error:', docErr.message);
        if (!res.headersSent) res.status(500).json({ message: 'PDF error: ' + docErr.message });
      });
      res.on('error', (resErr) => {
        console.error('[REPORT] ❌ Response error:', resErr.message);
        try { doc.destroy(); } catch (e) { }
      });

      doc.pipe(res);

      // HEADER
      doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN OBAT KRITIS', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text('Obat Prioritas yang Memerlukan Tindakan Segera', { align: 'center' });
      const tanggalLaporan = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      doc.fontSize(10).text(`Tanggal: ${tanggalLaporan}`, { align: 'center' });
      doc.moveDown(1.5);

      // Summary section - dengan count yang AKURAT
      doc.fontSize(11).font('Helvetica-Bold').text('RINGKASAN KONDISI KRITIS', { underline: true });
      doc.fontSize(9).font('Helvetica');
      doc.text(`• Obat Kadaluarsa: ${expired.length} item (HARUS DIMUSNAHKAN SEGERA)`);
      doc.text(`• Obat Hampir Kadaluarsa: ${nearExpiry.length} item (PRIORITAS PENJUALAN FEFO)`);
      doc.text(`• Obat Vital Menipis: ${vitalLowStock.length} item (URGEN PESAN ULANG)`);
      doc.moveDown(1);

      // Content
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#c0392b').text('DAFTAR OBAT MEMERLUKAN TINDAKAN', { underline: true });
      doc.fillColor('#000000').fontSize(9).font('Helvetica').moveDown(0.3);

      const totalCritical = expired.length + nearExpiry.length + vitalLowStock.length;
      if (totalCritical === 0) {
        doc.text('✓ Tidak ada obat kritis saat ini. Kondisi stok dan kadaluarsa dalam keadaan baik.');
        doc.end();
        return;
      }

      // Group by status - FIXED LOGIC
      const grouped = {
        expired: expired,
        nearExpiry: nearExpiry,
        vitalLowStock: vitalLowStock
      };

      // Expired section
      if (grouped.expired.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`🔴 KADALUARSA - HARUS DIMUSNAHKAN (${grouped.expired.length} item)`, { underline: true });
        doc.fillColor('#000000').fontSize(9).font('Helvetica').moveDown(0.2);
        grouped.expired.forEach((item, index) => {
          doc.text(`${index + 1}. ${item.nama}`);
          doc.fontSize(8).text(`   Stok: ${item.jumlah} unit | Batch: ${item.batch || '-'} | Kadaluarsa: ${item.kadaluarsa || '-'} | Kategori: ${item.kategori || '-'}`);
          doc.fontSize(9);
        });
        doc.moveDown(0.5);
      }

      // Near expiry section
      if (grouped.nearExpiry.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#e8a900').text(`🟠 HAMPIR KADALUARSA - PRIORITAS PENJUALAN (${grouped.nearExpiry.length} item)`, { underline: true });
        doc.fillColor('#000000').fontSize(9).font('Helvetica').moveDown(0.2);
        grouped.nearExpiry.forEach((item, index) => {
          doc.text(`${index + 1}. ${item.nama}`);
          doc.fontSize(8).text(`   Stok: ${item.jumlah} unit | Batch: ${item.batch || '-'} | Kadaluarsa: ${item.kadaluarsa || '-'} | Kategori: ${item.kategori || '-'}`);
          doc.fontSize(9);
        });
        doc.moveDown(0.5);
      }

      // Vital low stock section
      if (grouped.vitalLowStock.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`🔴 OBAT VITAL MENIPIS - URGEN PESAN ULANG (${grouped.vitalLowStock.length} item)`, { underline: true });
        doc.fillColor('#000000').fontSize(9).font('Helvetica').moveDown(0.2);
        grouped.vitalLowStock.forEach((item, index) => {
          doc.text(`${index + 1}. ${item.nama}`);
          doc.fontSize(8).text(`   Stok: ${item.jumlah} unit | Batch: ${item.batch || '-'} | Kadaluarsa: ${item.kadaluarsa || '-'} | Kategori: ${item.kategori || '-'}`);
          doc.fontSize(9);
        });
      }

      doc.moveDown(1);
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text('Laporan ini menampilkan obat-obat yang memerlukan tindakan segera. Tindakan yang disarankan: (1) Musnahkan obat kadaluarsa sesuai prosedur, (2) Prioritaskan penjualan obat hampir kadaluarsa dengan sistem FEFO, (3) Pesan ulang obat vital yang menipis.');

      doc.end();
      console.log('[REPORT] ✅ critical-pdf generated successfully');
    } catch (ex) {
      console.error('[REPORT] ❌ Exception:', ex.message, ex.stack);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error: ' + ex.message });
      }
    }
  });
});

app.get('/api/reports/daily-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  console.log('[REPORT] 📊 GET /api/reports/daily-pdf START');
  const today = new Date().toISOString().slice(0, 10);
  console.log('[REPORT] Query date:', today);

  db.all("SELECT * FROM logs WHERE substr(time, 1, 10) = ? ORDER BY time DESC", [today], (err, rows) => {
    if (err) {
      console.error('[REPORT] ❌ DB error:', err.message);
      return res.status(500).json({ message: 'Database error: ' + err.message });
    }

    if (!rows) {
      console.log('[REPORT] ℹ️ No rows found (null result)');
      rows = [];
    }
    console.log('[REPORT] ✅ Query successful, found', rows.length, 'log entries');

    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const fileName = `Laporan-Aktivitas-Harian-${today}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Error handlers BEFORE pipe
      doc.on('error', (docErr) => {
        console.error('[REPORT] ❌ PDF error:', docErr.message);
        if (!res.headersSent) res.status(500).json({ message: 'PDF error: ' + docErr.message });
      });
      res.on('error', (resErr) => {
        console.error('[REPORT] ❌ Response error:', resErr.message);
        try { doc.destroy(); } catch (e) { }
      });

      doc.pipe(res);

      // HEADER
      doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN AKTIVITAS HARIAN', { align: 'center' });
      const tanggalLaporan = new Date(today).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      doc.fontSize(11).font('Helvetica').text(`Tanggal: ${tanggalLaporan}`, { align: 'center' });
      doc.moveDown(1);

      if (!rows || rows.length === 0) {
        doc.fontSize(10).font('Helvetica').text('✓ Tidak ada aktivitas tercatat pada tanggal ini.');
        doc.end();
        console.log('[REPORT] ✅ daily-pdf generated (empty report)');
        return;
      }

      doc.fontSize(11).font('Helvetica-Bold').text(`Total Aktivitas: ${rows.length} event`);
      doc.fontSize(9).font('Helvetica').text('Riwayat lengkap dari semua transaksi dan perubahan sistem yang tercatat.');
      doc.moveDown(0.5);

      rows.forEach((row, index) => {
        const time = new Date(row.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        doc.fontSize(9).font('Helvetica-Bold').text(`${index + 1}. [${time}] ${String(row.type || 'UNKNOWN').toUpperCase()}`);
        doc.font('Helvetica').text(`${row.message || 'No message'}`);
        doc.moveDown(0.3);
      });

      doc.moveDown(1);
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text('Laporan ini menampilkan semua aktivitas sistem yang tercatat pada tanggal tersebut, termasuk penambahan obat, perubahan stok, dan transaksi lainnya.');

      doc.end();
      console.log('[REPORT] ✅ daily-pdf generated successfully');
    } catch (ex) {
      console.error('[REPORT] ❌ Exception:', ex.message, ex.stack);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error: ' + ex.message });
      }
    }
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
   MANAGEMENT REPORTS
================================ */

// Management Report - Shows released/sold quantities and analysis
app.get('/api/reports/management-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  console.log('[REPORT] 📊 GET /api/reports/management-pdf START');
  db.all("SELECT * FROM stock_movements ORDER BY waktu DESC", (err, movements) => {
    if (err) {
      console.error('[REPORT] ❌ DB error in movements query:', err.message);
      return res.status(500).json({ message: 'Database error: ' + err.message });
    }

    if (!movements) {
      console.log('[REPORT] ℹ️ No movements found (null result)');
      movements = [];
    }
    console.log('[REPORT] ✅ Query successful, found', movements.length, 'movements');

    db.all("SELECT * FROM obat ORDER BY nama ASC", (obatErr, obat) => {
      if (obatErr) {
        console.error('[REPORT] ❌ DB error in obat query:', obatErr.message);
        return res.status(500).json({ message: 'Database error: ' + obatErr.message });
      }

      try {
        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        const fileName = `Laporan-Pelepasan-Obat-${new Date().toISOString().split('T')[0]}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Error handlers BEFORE pipe - CRITICAL!
        doc.on('error', (docErr) => {
          console.error('[REPORT] ❌ PDF error:', docErr.message);
          if (!res.headersSent) {
            res.status(500).json({ message: 'PDF error: ' + docErr.message });
          }
        });

        res.on('error', (resErr) => {
          console.error('[REPORT] ❌ Response error:', resErr.message);
          try { doc.destroy(); } catch (e) { }
        });

        doc.pipe(res);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN PELEPASAN OBAT', { align: 'center' });
        doc.fontSize(11).font('Helvetica').text('Riwayat pengeluaran dan transaksi stok obat', { align: 'center' });
        doc.fontSize(10).text(`Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
        doc.moveDown(1);

        // Summary
        const totalReleased = movements.reduce((sum, m) => sum + (m.jumlah || 0), 0);
        const uniqueItems = [...new Set(movements.map(m => m.obat_nama))].length;
        const releaseTypes = {};
        movements.forEach(m => {
          releaseTypes[m.jenis_movement] = (releaseTypes[m.jenis_movement] || 0) + 1;
        });

        doc.fontSize(12).font('Helvetica-Bold').text('RINGKASAN PELEPASAN OBAT', { underline: true });
        doc.fontSize(9).font('Helvetica');
        doc.text(`• Total Pelepasan: ${totalReleased} unit`);
        doc.text(`• Jenis Obat Keluar: ${uniqueItems} item`);
        doc.text(`• Jumlah Transaksi: ${movements.length} kali`);
        doc.text(`• Tipe Transaksi:`);
        Object.entries(releaseTypes).forEach(([type, count]) => {
          doc.text(`  - ${type}: ${count} transaksi`);
        });
        doc.moveDown();

        // Released by Medicine
        doc.fontSize(12).font('Helvetica-Bold').text('DETAIL PELEPASAN BERDASARKAN OBAT', { underline: true });
        doc.fontSize(9).font('Helvetica').moveDown(0.3);

        const releaseByObat = {};
        movements.forEach(m => {
          if (!releaseByObat[m.obat_nama]) {
            releaseByObat[m.obat_nama] = { total: 0, transactions: [] };
          }
          releaseByObat[m.obat_nama].total += m.jumlah || 0;
          releaseByObat[m.obat_nama].transactions.push({
            type: m.jenis_movement,
            qty: m.jumlah,
            date: m.waktu,
            notes: m.keterangan
          });
        });

        Object.entries(releaseByObat).sort((a, b) => b[1].total - a[1].total).forEach((entry, idx) => {
          const [obatName, data] = entry;
          doc.fontSize(10).font('Helvetica-Bold').text(`${idx + 1}. ${obatName}`);
          doc.fontSize(8).font('Helvetica').text(`   Total Pelepasan: ${data.total} unit | Transaksi: ${data.transactions.length} kali`);

          data.transactions.slice(0, 3).forEach(tx => {
            const dateFormat = new Date(tx.date).toLocaleDateString('id-ID');
            doc.text(`   • ${tx.type} (${tx.qty} unit) - ${dateFormat} - ${tx.notes || 'Tanpa catatan'}`);
          });

          if (data.transactions.length > 3) {
            doc.text(`   ... dan ${data.transactions.length - 3} transaksi lainnya`);
          }
          doc.moveDown(0.3);
        });

        doc.moveDown();
        doc.fontSize(8).font('Helvetica').fillColor('#666666');
        doc.text('Laporan ini menampilkan semua transaksi pelepasan obat dari database, termasuk penjualan normal, pengembalian, dan pengeluaran lainnya.', { align: 'justify' });

        doc.end();
        console.log('[REPORT] ✅ management-pdf stream completed');
      } catch (ex) {
        console.error('[REPORT] ❌ Exception during PDF generation:', ex.message, ex.stack);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error: ' + ex.message });
        }
      }
    });
  });
});

// Restock Analysis Report
app.get('/api/reports/restock-analysis-pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  console.log('[REPORT] 📊 GET /api/reports/restock-analysis-pdf START');
  db.all("SELECT * FROM obat ORDER BY nama ASC", (obatErr, obat) => {
    if (obatErr) {
      console.error('[REPORT] ❌ DB error:', obatErr.message);
      return res.status(500).json({ message: 'DB error' });
    }
    console.log('[REPORT] ✅ Obat query successful, found', obat.length, 'items');

    db.all("SELECT * FROM stock_movements WHERE jenis_movement IN ('RELEASE', 'RELEASE_FEFO') ORDER BY created_at DESC", (movErr, movements) => {
      if (movErr) {
        console.error('[REPORT] ❌ DB error:', movErr.message);
        return res.status(500).json({ message: 'DB error' });
      }
      console.log('[REPORT] ✅ Movements query successful, found', movements.length, 'movements');

      // Fetch kategori config
      db.all("SELECT * FROM kategori_config", (katErr, kategoriConfig) => {
        if (katErr) {
          console.error('[REPORT] ❌ DB error in kategori query:', katErr.message);
          return res.status(500).json({ message: 'Database error: ' + katErr.message });
        }

        try {
          const doc = new PDFDocument({ margin: 36, size: 'A4' });
          const fileName = `Laporan-Analisis-Restock-${new Date().toISOString().split('T')[0]}.pdf`;

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

          // Error handlers BEFORE pipe - CRITICAL!
          doc.on('error', (docErr) => {
            console.error('[REPORT] ❌ PDF error:', docErr.message);
            if (!res.headersSent) {
              res.status(500).json({ message: 'PDF error: ' + docErr.message });
            }
          });

          res.on('error', (resErr) => {
            console.error('[REPORT] ❌ Response error:', resErr.message);
            try { doc.destroy(); } catch (e) { }
          });

          doc.pipe(res);

          // Header
          doc.fontSize(20).font('Helvetica-Bold').text('LAPORAN ANALISIS & REKOMENDASI RESTOCK', { align: 'center' });
          doc.fontSize(11).font('Helvetica').text('Berbasis Pola Penggunaan 30 Hari dan Lead Time Supplier', { align: 'center' });
          doc.fontSize(10).text(`Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
          doc.moveDown(1);

          // Calculate usage rates
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const releaseHistory = {};
          movements.forEach(m => {
            const movDate = new Date(m.created_at);
            if (movDate >= thirtyDaysAgo) {
              if (!releaseHistory[m.obat_nama]) {
                releaseHistory[m.obat_nama] = { total: 0, count: 0 };
              }
              releaseHistory[m.obat_nama].total += m.jumlah || 0;
              releaseHistory[m.obat_nama].count += 1;
            }
          });

          // Get kategori config map
          const kategoriMap = {};
          kategoriConfig.forEach(k => {
            kategoriMap[k.nama] = {
              leadTime: k.lead_time_hari,
              minStock: k.min_stok,
              optimalStock: k.optimal_stok,
              reorderQty: k.reorder_qty
            };
          });

          // Default config for unmapped categories
          const defaultConfig = {
            leadTime: 7,
            minStock: 10,
            optimalStock: 30,
            reorderQty: 50
          };

          // Generate recommendations
          const recommendations = obat.map(o => {
            const currentStock = o.jumlah;
            const usage = releaseHistory[o.nama] || { total: 0, count: 0 };
            const dailyUsage = usage.total / 30;
            const kategori = o.kategori || 'TABLET BEBAS';

            // Get config for this category
            const config = kategoriMap[kategori] || defaultConfig;
            const leadTime = config.leadTime;
            const minStock = config.minStock;
            const optimalStock = config.optimalStock;
            const reorderQty = config.reorderQty;

            let recommendation = '';
            let daysOfStock = dailyUsage > 0 ? Math.round(currentStock / dailyUsage) : 999;
            let reorderLevel = dailyUsage * leadTime; // Berapa stok yg dibutuhkan untuk lead time

            // Logic berbasis kategori dan lead time:
            // Jika stok saat ini akan habis dalam waktu <= lead time, URGENT
            if (currentStock <= 0) {
              recommendation = '[URGENT] Stok habis, pesan SEGERA ke supplier';
            } else if (daysOfStock <= leadTime) {
              // Stok saat ini tidak akan cukup sampai pesanan tiba
              recommendation = `[URGENT] Restock sekarang! Ada ${daysOfStock} hari stok, lead time ${leadTime} hari`;
            } else if (daysOfStock <= leadTime + 2) {
              // Margin kecil saja untuk buffer
              recommendation = `[HIGH PRIORITY] Pesan dalam 1-2 hari. Stok: ${daysOfStock} hari, lead time: ${leadTime} hari`;
            } else if (currentStock < minStock) {
              // Stok di bawah minimum untuk kategori ini
              recommendation = `[MEDIUM] Stok ${currentStock} unit < minimum ${minStock}. Rencanakan pemesanan`;
            } else if (currentStock < optimalStock && dailyUsage > 1) {
              // Diantara minimum dan optimal, usage tinggi
              recommendation = '[MEDIUM] Pertimbangkan pesan minggu depan';
            } else if (dailyUsage > 5) {
              // Penggunaan sangat tinggi, monitor ketat
              recommendation = '[MONITOR] Putaran tinggi, usage ' + dailyUsage.toFixed(2) + ' unit/hari';
            } else {
              recommendation = '[OK] Stok cukup';
            }

            return {
              nama: o.nama,
              ved: resolveStoredVED(o),
              batch: o.batch || '-',
              kategori,
              currentStock,
              dailyUsage: dailyUsage.toFixed(2),
              daysOfStock,
              monthlyUsage: usage.total,
              minStock,
              optimalStock,
              reorderQty,
              leadTime,
              recommendation
            };
          }).sort((a, b) => {
            // Sort by priority: urgent first, high next (text-based labels)
            const priorityMap = {
              '[URGENT]': 0,
              '[HIGH PRIORITY]': 1,
              '[MEDIUM]': 2,
              '[MONITOR]': 3,
              '[OK]': 4
            };

            // Extract priority label from recommendation
            let aPriority = 5;
            let bPriority = 5;

            for (const [label, priority] of Object.entries(priorityMap)) {
              if (a.recommendation.startsWith(label)) aPriority = priority;
              if (b.recommendation.startsWith(label)) bPriority = priority;
            }

            return aPriority - bPriority;
          });

          // Calculate priority counts for summary
          const urgentCount = recommendations.filter(r => r.recommendation.startsWith('[URGENT]')).length;
          const highCount = recommendations.filter(r => r.recommendation.startsWith('[HIGH PRIORITY]')).length;
          const mediumCount = recommendations.filter(r => r.recommendation.startsWith('[MEDIUM]')).length;
          const monitorCount = recommendations.filter(r => r.recommendation.startsWith('[MONITOR]')).length;

          // Calculate total and average usage for summary
          const totalUsage = recommendations.reduce((sum, r) => sum + r.monthlyUsage, 0);
          const avgDailyUsage = (totalUsage / 30).toFixed(2);

          // Summary section dengan visual yang lebih baik - LARGER & CLEARER
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#2c3e50').text('RINGKASAN ANALISIS PENGGUNAAN 30 HARI', { underline: true }).fillColor('#000000');
          doc.moveDown(0.5);

          doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c3e50');
          doc.text(`Total Pengeluaran Obat: ${totalUsage} unit / 30 hari`, { width: 200 });
          doc.fontSize(11).font('Helvetica').fillColor('#555555');
          doc.text(`Rata-rata: ${avgDailyUsage} unit/hari (~${(avgDailyUsage * 30).toFixed(0)} unit/bulan)`);
          doc.moveDown(0.5);

          // Status boxes - WIDER & CLEARER
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b');
          doc.text(`[URGENT] Obat yang harus dipesan HARI INI: ${urgentCount} item`);
          doc.fontSize(10).font('Helvetica').fillColor('#666666');
          doc.text(`Stok akan habis lebih cepat dari waktu pengiriman supplier. Tindakan: Hubungi supplier segera.`);
          doc.moveDown(0.4);

          doc.fontSize(11).font('Helvetica-Bold').fillColor('#e8a900');
          doc.text(`[HIGH PRIORITY] Obat untuk dipesan dalam 1-2 HARI: ${highCount} item`);
          doc.fontSize(10).font('Helvetica').fillColor('#666666');
          doc.text(`Stok akan mencapai titik kritis dalam 1-2 hari. Tindakan: Persiapkan pemesanan dengan segera.`);
          doc.moveDown(0.4);

          doc.fontSize(11).font('Helvetica-Bold').fillColor('#f39c12');
          doc.text(`[MEDIUM] Obat untuk direncanakan minggu depan: ${mediumCount} item`);
          doc.fontSize(10).font('Helvetica').fillColor('#666666');
          doc.text(`Stok normal tetapi masih di bawah optimal. Rencanakan pemesanan dalam 3-7 hari.`);
          doc.moveDown(0.4);

          doc.fontSize(11).font('Helvetica-Bold').fillColor('#9b59b6');
          doc.text(`[MONITOR] Obat dengan putaran tinggi: ${monitorCount} item`);
          doc.fontSize(10).font('Helvetica').fillColor('#666666');
          doc.text(`Penjualan tinggi membutuhkan monitoring harian dan pemesanan lebih sering.`);
          doc.moveDown(0.6);

          // Kesimpulan
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#7f8c8d').text('CATATAN: Analisis di atas berbasis pola penggunaan 30 hari terakhir. Data akurat membantu keputusan pemesanan supplier yang lebih efektif.').fillColor('#000000');
          doc.moveDown();

          // Recommendations by Priority - IMPROVED LAYOUT & WIDER
          doc.addPage(); // New page untuk recommendations
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#2c3e50').text('REKOMENDASI RESTOCK BERDASARKAN PRIORITAS', { underline: true }).fillColor('#000000');
          doc.moveDown(0.5);

          const priorityGroups = {
            '[URGENT] PESAN HARI INI': [
              recommendations.filter(r => r.recommendation.startsWith('[URGENT]')),
              'Stok akan habis LEBIH CEPAT daripada waktu pengiriman. HUBUNGI SUPPLIER HARI INI untuk menghindari kehabisan stok di apotek.',
              '#c0392b'
            ],
            '[HIGH PRIORITY] PESAN 1-2 HARI': [
              recommendations.filter(r => r.recommendation.startsWith('[HIGH PRIORITY]')),
              'Stok tersedia namun akan kritiks dalam 1-2 hari. Mulai persiapkan pemesanan kepada supplier dengan segera.',
              '#e8a900'
            ],
            '[MEDIUM] RENCANA MINGGU DEPAN': [
              recommendations.filter(r => r.recommendation.startsWith('[MEDIUM]')),
              'Stok saat ini normal tetapi masih di bawah level optimal. Rencanakan pemesanan dalam periode 3-7 hari.',
              '#f39c12'
            ],
            '[MONITOR] PUTARAN TINGGI': [
              recommendations.filter(r => r.recommendation.startsWith('[MONITOR]')),
              'Penjualan obat ini sangat tinggi (>5 unit/hari). Pantau stok harian dan pertimbangkan pemesanan lebih sering.',
              '#9b59b6'
            ],
            '[OK] STOK AMAN': [
              recommendations.filter(r => r.recommendation.startsWith('[OK]')),
              'Stok obat dalam kondisi baik dan mencukupi. Tidak ada pemesanan mendesak. Lanjutkan monitoring rutin.',
              '#27ae60'
            ]
          };

          Object.entries(priorityGroups).forEach(([priority, [items, description, color]]) => {
            if (items.length === 0) return;

            // Priority header
            doc.fontSize(12).font('Helvetica-Bold').fillColor(color).text(`${priority} (${items.length} item)`, { underline: true }).fillColor('#000000');
            doc.fontSize(10).font('Helvetica').fillColor('#333333').text(description);
            doc.moveDown(0.4);

            // Items - WIDER & CLEARER
            items.forEach((item, idx) => {
              // Medicine name - BIGGER & BOLD
              doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text(`${idx + 1}. ${item.nama}`).fillColor('#000000');

              // Key info - ON ONE LINE each for clarity
              doc.fontSize(9).font('Helvetica');
              doc.text(`    Kategori: ${item.kategori} | VED: ${item.ved || '-'} | Batch: ${item.batch}`);

              // Two columns: Stock Info | Reorder Info
              doc.fontSize(9).font('Helvetica-Bold').fillColor('#2980b9').text('    STOK SAAT INI:', 50).fillColor('#000000');
              doc.fontSize(9).text(`REORDER TARGET:`, 300);
              doc.moveDown(0.15);

              doc.fontSize(9).text(`      Stok: ${item.currentStock} unit`, 50);
              doc.text(`Minimum: ${item.minStock} unit`, 300);
              doc.moveDown(0.1);

              doc.fontSize(9).text(`      Pakai: ${item.dailyUsage} unit/hari`, 50);
              doc.text(`Optimal: ${item.optimalStock} unit`, 300);
              doc.moveDown(0.1);

              doc.fontSize(9).text(`      Sisa: ${item.daysOfStock} hari`, 50);
              doc.text(`Lead time: ${item.leadTime} hari`, 300);
              doc.moveDown(0.1);

              doc.fontSize(9).text(`      Bulan: ${item.monthlyUsage} unit`, 50);
              doc.text(`Order: ${item.reorderQty} unit`, 300);
              doc.moveDown(0.3);

              // Recommendation note - CLEAR
              doc.fontSize(10).font('Helvetica-Bold').fillColor(color);
              doc.text(`    → ${item.recommendation}`);
              doc.fillColor('#000000');

              doc.moveDown(0.5);
            });

            doc.moveDown(0.3);
          });

          // Kategori Config Info - IMPROVED
          doc.addPage();
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#2c3e50').text('█ KONFIGURASI & STANDAR PER KATEGORI OBAT', { underline: true }).fillColor('#000000');
          doc.fontSize(10).font('Helvetica').text('Tabel berikut menunjukkan parameter yang digunakan untuk setiap jenis/kategori obat dalam mengevaluasi kebutuhan pemesanan:');
          doc.moveDown(0.5);

          // Table header
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#34495e');
          doc.text('Kategori', 50);
          doc.fontSize(10).text('Lead Time', 200);
          doc.text('Min Stok', 280);
          doc.text('Optimal', 360);
          doc.text('Reorder Qty', 440);
          doc.fillColor('#000000').moveDown(0.3);

          // Line separator
          doc.lineWidth(0.5).moveTo(50, doc.y).lineTo(530, doc.y).stroke().moveDown(0.3);

          // Table content
          kategoriConfig.forEach((k, idx) => {
            doc.fontSize(10).font('Helvetica-Bold').text(k.nama, 50);
            doc.fontSize(10).font('Helvetica');
            doc.text(`${k.lead_time_hari} hari`, 200);
            doc.text(`${k.min_stok} unit`, 280);
            doc.text(`${k.optimal_stok} unit`, 360);
            doc.text(`${k.reorder_qty} unit`, 440);

            // Deskripsi jika ada
            if (k.keterangan && k.keterangan.trim().length > 0) {
              doc.fontSize(8).font('Helvetica-Oblique').fillColor('#7f8c8d');
              doc.text(`Catatan: ${k.keterangan}`, 50, doc.y, { width: 450 });
              doc.fillColor('#000000');
            }

            doc.moveDown(0.4);

            // Add page break jika perlu
            if (doc.y > 650) {
              doc.addPage();
              doc.fontSize(11).font('Helvetica-Bold').fillColor('#34495e');
              doc.text('Kategori', 50);
              doc.fontSize(10).text('Lead Time', 200);
              doc.text('Min Stok', 280);
              doc.text('Optimal', 360);
              doc.text('Reorder Qty', 440);
              doc.fillColor('#000000').moveDown(0.3);
              doc.lineWidth(0.5).moveTo(50, doc.y).lineTo(530, doc.y).stroke().moveDown(0.3);
            }
          });

          // Penjelasan parameter
          doc.moveDown(0.5);
          doc.fontSize(11).font('Helvetica-Bold').text('Penjelasan Parameter:', { underline: true });
          doc.fontSize(9).font('Helvetica');
          doc.text('• Lead Time: Berapa hari yang dibutuhkan supplier untuk mengirimkan pesanan (dari order hingga barang sampai)', { color: '#2c3e50' });
          doc.text('• Min Stok: Batas minimum stok yang harus selalu tersedia untuk kategori ini', { color: '#2c3e50' });
          doc.text('• Optimal: Target level stok ideal untuk operasional apotek yang lancar', { color: '#2c3e50' });
          doc.text('• Reorder Qty: Jumlah standar yang harus dipesan setiap kali melakukan pemesanan', { color: '#2c3e50' });

          doc.moveDown(0.5);
          doc.fontSize(8).font('Helvetica-Oblique').fillColor('#7f8c8d');
          doc.text('Catatan: Parameter di atas dapat disesuaikan sesuai kebutuhan apotek Anda. Hubungi APJ untuk melakukan perubahan konfigurasi kategori obat.');

          // Footer
          doc.moveDown(0.5);
          doc.fontSize(9).font('Helvetica').fillColor('#000000');
          doc.text('Laporan ini dibuat secara otomatis oleh sistem obatqu untuk membantu pengambilan keputusan pemesanan obat yang lebih efisien.', { align: 'center' });

          doc.end();
          console.log('[REPORT] ✅ restock-analysis-pdf stream completed');
        } catch (ex) {
          console.error('[REPORT] ❌ Exception:', ex.message, ex.stack);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error: ' + ex.message });
          }
        }
      });
    });
  });
});

/* ===============================
   SEND VED-FEFO REPORT EMAIL (MANUAL TRIGGER)
================================ */
/* ===============================
   KATEGORI CONFIG MANAGEMENT
================================ */
app.get('/api/kategori-config', authMiddleware, (req, res) => {
  db.all("SELECT * FROM kategori_config ORDER BY nama ASC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

app.put('/api/kategori-config/:id', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  const { lead_time_hari, min_stok, optimal_stok, reorder_qty, keterangan } = req.body;

  if (!lead_time_hari || !min_stok || !optimal_stok || !reorder_qty) {
    return res.status(400).json({ message: 'Field lead_time_hari, min_stok, optimal_stok, reorder_qty diperlukan' });
  }

  db.run(
    "UPDATE kategori_config SET lead_time_hari=?, min_stok=?, optimal_stok=?, reorder_qty=?, keterangan=? WHERE id=?",
    [lead_time_hari, min_stok, optimal_stok, reorder_qty, keterangan, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (this.changes === 0) return res.status(404).json({ message: 'Kategori tidak ditemukan' });
      addLog('audit', `Update kategori config ID ${req.params.id}`);
      return res.json({ message: 'Updated' });
    }
  );
});

/* ===============================
   SCHEDULER CONFIG MANAGEMENT
================================ */
app.get('/api/scheduler-config', authMiddleware, (req, res) => {
  db.all("SELECT * FROM scheduler_config ORDER BY updated_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

app.get('/api/scheduler-config/:config_type', authMiddleware, (req, res) => {
  console.log('[API] 🔍 GET scheduler-config:', req.params.config_type);
  db.get("SELECT * FROM scheduler_config WHERE config_type = ?", [req.params.config_type], (err, row) => {
    if (err) {
      console.error('[API] ❌ DB error:', err);
      return res.status(500).json({ message: 'DB error', error: err.message });
    }
    if (!row) {
      console.warn('[API] ⚠️ Configuration tidak ditemukan:', req.params.config_type);
      return res.status(404).json({ message: 'Configuration tidak ditemukan' });
    }
    console.log('[API] ✅ Config found:', row);
    return res.json(row);
  });
});

app.put('/api/scheduler-config/:id', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  const { interval_hari, enabled, email_jam } = req.body;
  console.log('[API] 💾 PUT scheduler-config:', { id: req.params.id, interval_hari, enabled, email_jam });

  if (interval_hari === undefined || enabled === undefined || !email_jam) {
    console.warn('[API] ⚠️ Missing required fields');
    return res.status(400).json({ message: 'Field interval_hari, enabled, email_jam diperlukan' });
  }

  const now = new Date().toISOString();
  db.run(
    "UPDATE scheduler_config SET interval_hari=?, enabled=?, email_jam=?, updated_at=? WHERE id=?",
    [interval_hari, enabled, email_jam, now, req.params.id],
    function(err) {
      if (err) {
        console.error('[API] ❌ DB error:', err);
        return res.status(500).json({ message: 'DB error', error: err.message });
      }
      if (this.changes === 0) {
        console.warn('[API] ⚠️ Scheduler config tidak ditemukan:', req.params.id);
        return res.status(404).json({ message: 'Scheduler config tidak ditemukan' });
      }
      console.log('[API] ✅ Scheduler config updated successfully');
      addLog('audit', `Update scheduler config ID ${req.params.id}: interval=${interval_hari}, enabled=${enabled}`);
      return res.json({ message: 'Updated', updated_at: now });
    }
  );
});

/* ===============================
   EMAIL CONFIG
================================ */
app.get('/api/email-config', authMiddleware, (req, res) => {
  db.get("SELECT id, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, notify_from, notify_to, created_at, updated_at FROM email_config WHERE config_type = ?", ['ved_fefo_email'], (err, row) => {
    if (err) {
      console.error('[API] ❌ DB error:', err);
      return res.status(500).json({ message: 'DB error', error: err.message });
    }
    if (!row) {
      console.warn('[API] ⚠️ Email config tidak ditemukan');
      return res.status(404).json({ message: 'Email config tidak ditemukan' });
    }
    console.log('[API] ✅ Email config found');
    return res.json(row);
  });
});

app.put('/api/email-config/:id', authMiddleware, roleMiddleware(['APJ']), (req, res) => {
  const { smtp_user } = req.body;
  console.log('[API] 💾 PUT email-config (simplified):', { id: req.params.id, smtp_user });

  if (!smtp_user) {
    console.warn('[API] ⚠️ Email pengirim diperlukan');
    return res.status(400).json({ message: 'Email pengirim (smtp_user) diperlukan' });
  }

  const now = new Date().toISOString();
  // Always use Gmail defaults + FROM_ENV for password
  db.run(
    "UPDATE email_config SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass=?, smtp_secure=?, notify_from=?, updated_at=? WHERE id=?",
    ['smtp.gmail.com', 465, smtp_user, 'FROM_ENV', 1, smtp_user, now, req.params.id],
    function(err) {
      if (err) {
        console.error('[API] ❌ DB error:', err);
        return res.status(500).json({ message: 'DB error', error: err.message });
      }
      if (this.changes === 0) {
        console.warn('[API] ⚠️ Email config tidak ditemukan:', req.params.id);
        return res.status(404).json({ message: 'Email config tidak ditemukan' });
      }
      console.log('[API] ✅ Email config updated successfully');
      addLog('audit', `Update email config ID ${req.params.id}: smtp_user=${smtp_user}`);
      return res.json({ message: 'Updated', updated_at: now });
    }
  );
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
  LOGS
================================ */
app.get('/api/logs', authMiddleware, (req, res) => {
  db.all("SELECT * FROM logs ORDER BY time DESC LIMIT 200", (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json(rows);
  });
});

/* ===============================
   VED-FEFO EMAIL REPORTS
================================ */
// Helper function for promisified db operations
function promiseDb(operation) {
  return new Promise((resolve, reject) => {
    operation((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Send VED-FEFO report via email to all users (manual trigger)
app.post('/api/reports/send-ved-fefo-email', authMiddleware, roleMiddleware(['APJ']), async (req, res) => {
  try {
    console.log('[EMAIL-REPORT] 📧 POST /api/reports/send-ved-fefo-email START');
    console.log('[EMAIL-REPORT] SMTP Configured:', isEmailConfigured() ? '✅ YES' : '❌ NO (SMTP_USER & SMTP_PASS must be set)');

    // Early check for SMTP configuration
    if (!isEmailConfigured()) {
      console.error('[EMAIL-REPORT] ❌ SMTP not configured. Email cannot be sent.');
      return res.status(400).json({
        message: '❌ Email tidak dapat dikirim: SMTP belum dikonfigurasi. Hubungi administrator untuk setup SMTP_USER dan SMTP_PASS environment variables.',
        sent: 0,
        failed: 0,
        smtpConfigured: false
      });
    }

    // Fetch all obat data
    const obatRows = await promiseDb((cb) => db.all("SELECT * FROM obat ORDER BY kadaluarsa ASC", cb));
    console.log('[EMAIL-REPORT] ✅ Fetched', obatRows.length, 'obat items');

    if (!obatRows || obatRows.length === 0) {
      console.warn('[EMAIL-REPORT] ⚠️  No obat data found');
      return res.json({
        message: 'Tidak ada data obat untuk dilaporkan',
        sent: 0,
        failed: 0,
        timestamp: new Date().toISOString()
      });
    }

    // Prepare VED analysis
    const analysis = obatRows.map(obat => ({
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

    const vedAnalysis = {
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
    };

    // Prepare FEFO recommendations
    const urgent = [];
    const critical = [];
    const monitor = [];

    obatRows.forEach(obat => {
      const analysis = analyzeObatVED(obat);
      const item = { ...obat, ...analysis };

      if (analysis.action === 'remove') {
        urgent.push(item);
      } else if (analysis.action === 'urgent' || analysis.action === 'urgent_order') {
        critical.push(item);
      } else if (analysis.action === 'monitor') {
        monitor.push(item);
      }
    });

    const fefoRecommendations = {
      urgent: { count: urgent.length, items: urgent.slice(0, 10) },
      critical: { count: critical.length, items: critical.slice(0, 10) },
      monitor: { count: monitor.length, items: monitor.slice(0, 10) }
    };

    console.log('[EMAIL-REPORT] ✅ VED analysis: V=' + vedAnalysis.summary.vital + ', E=' + vedAnalysis.summary.essential + ', D=' + vedAnalysis.summary.desirable);

    // Generate email HTML
    const { generateVedFefoReport } = require('./utils/scheduler');
    const htmlContent = generateVedFefoReport(vedAnalysis, fefoRecommendations);
    console.log('[EMAIL-REPORT] ✅ HTML email generated');

    // Fetch all users with role APJ or Asisten Apoteker
    console.log('[EMAIL-REPORT] 🔍 Querying users from database...');
    const users = await promiseDb((cb) => db.all("SELECT id, username, email, role FROM users WHERE email IS NOT NULL AND email != '' AND (role = 'APJ' OR role = 'Asisten Apoteker' OR role = 'ASISTEN_APOTEKER')", cb));

    console.log('[EMAIL-REPORT] ✅ Query complete. Users found:', users);
    console.log('[EMAIL-REPORT] ✅ Users count:', users ? users.length : 0);

    if (!users || users.length === 0) {
      console.warn('[EMAIL-REPORT] ⚠️  No users with email found');
      console.log('[EMAIL-REPORT] Debug: Fetching all users to check...');
      const allUsers = await promiseDb((cb) => db.all("SELECT id, username, email, role FROM users", cb));
      console.log('[EMAIL-REPORT] All users in database:', allUsers);

      return res.status(400).json({
        message: 'Tidak ada pengguna untuk mengirim laporan. Pastikan email user sudah terdaftar.',
        recipients: 0,
        allUsersCount: allUsers ? allUsers.length : 0,
        allUsers: allUsers || []
      });
    }

    // Send email to each user
    let successCount = 0;
    let failedCount = 0;
    const failedEmails = [];
    const failedReasons = [];

    for (const user of users) {
      try {
        const subject = `Laporan VED-FEFO ObatQu - ${new Date().toLocaleDateString('id-ID')}`;
        const text = `Halo ${user.username},\n\nLaporan VED-FEFO periodic untuk tindakan manajemen stok obat.\n\nSilakan buka email ini dengan format HTML untuk melihat laporan lengkap.\n\nDari: ObatQu System`;

        const sendResult = await sendMail({
          to: user.email,
          subject,
          text,
          html: htmlContent
        }, db);

        if (sendResult) {
          console.log('[EMAIL-REPORT] ✅ Email sent to', user.email, '- Message ID:', sendResult.messageId || 'N/A');
          successCount++;
        } else {
          console.error('[EMAIL-REPORT] ⚠️ Email send returned null for', user.email);
          failedCount++;
          failedEmails.push(user.email);
          failedReasons.push({ email: user.email, reason: 'Returned null unexpectedly' });
        }
      } catch (mailErr) {
        console.error('[EMAIL-REPORT] ❌ Failed to send to', user.email, '- Error:', mailErr && mailErr.message ? mailErr.message : String(mailErr));
        failedCount++;
        failedEmails.push(user.email);
        failedReasons.push({ email: user.email, reason: mailErr && mailErr.message ? mailErr.message : 'Unknown error' });
      }
    }

    // Update last_sent_at in scheduler_config
    const now = new Date().toISOString();
    db.run(
      "UPDATE scheduler_config SET last_sent_at = ? WHERE config_type = 'ved_fefo_email'",
      [now],
      (err) => {
        if (err) console.error('[EMAIL-REPORT] Failed to update last_sent_at:', err);
      }
    );

    // Log activity
    addLog('email', `VED-FEFO email report sent: ${successCount} successful, ${failedCount} failed`);

    console.log('[EMAIL-REPORT] 📧 Complete: ' + successCount + ' sent, ' + failedCount + ' failed');

    return res.json({
      message: `Laporan VED-FEFO berhasil dikirim ke ${successCount} pengguna${failedCount > 0 ? ', ' + failedCount + ' gagal' : ''}`,
      sent: successCount,
      failed: failedCount,
      failedEmails: failedCount > 0 ? failedEmails : undefined,
      failedReasons: failedCount > 0 ? failedReasons : undefined,
      timestamp: now
    });

  } catch (err) {
    console.error('[EMAIL-REPORT] ❌ Error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Gagal mengirim laporan: ' + err.message
    });
  }
});

/* ===============================
   LAPORAN PEMUSNAHAN OBAT
================================ */

// Create laporan pemusnahan
app.post('/api/laporan-pemusnahan', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const { obat_id, unit_terjual, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan } = req.body;
  const user = req.session.user;
  const laporan_id = uuidv4();
  const now = new Date().toISOString();

  // Log incoming data for debugging
  console.log('[LAPORAN PEMUSNAHAN POST] Received data:', {
    obat_id, unit_terjual, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan,
    body: req.body
  });

  // Validasi: check null/undefined/empty string, not just falsy (0 is valid)
  const missingFields = [];
  if (obat_id === null || obat_id === undefined || obat_id === '') missingFields.push('obat_id');
  if (unit_sisa === null || unit_sisa === undefined || unit_sisa === '') missingFields.push('unit_sisa');
  if (pt_pemusnahan === null || pt_pemusnahan === undefined || pt_pemusnahan === '') missingFields.push('pt_pemusnahan');
  if (biaya_pemusnahan === null || biaya_pemusnahan === undefined || biaya_pemusnahan === '') missingFields.push('biaya_pemusnahan');
  if (tanggal_pemusnahan === null || tanggal_pemusnahan === undefined || tanggal_pemusnahan === '') missingFields.push('tanggal_pemusnahan');

  if (missingFields.length > 0) {
    console.error('[LAPORAN PEMUSNAHAN] Validation failed - missing fields:', missingFields);
    return res.status(400).json({
      message: `Data tidak lengkap. Field yang hilang: ${missingFields.join(', ')}`,
      missingFields: missingFields
    });
  }

  db.get("SELECT nama FROM obat WHERE id = ?", [obat_id], (err, obat) => {
    if (err) {
      console.error('[LAPORAN PEMUSNAHAN] DB error saat query obat:', err);
      return res.status(500).json({ message: 'Database error: ' + err.message });
    }
    if (!obat) {
      console.error('[LAPORAN PEMUSNAHAN] Obat tidak ditemukan untuk ID:', obat_id);
      return res.status(404).json({ message: `Obat dengan ID ${obat_id} tidak ditemukan` });
    }

    console.log('[LAPORAN PEMUSNAHAN] Obat found:', obat);
    console.log('[LAPORAN PEMUSNAHAN] Preparing INSERT with values:', {
      laporan_id, obat_id, nama_obat: obat.nama,
      unit_terjual: unit_terjual || 0,
      unit_sisa, pt_pemusnahan, biaya_pemusnahan,
      tanggal_pemusnahan, created_by: user.username, now
    });

    db.run(
      `INSERT INTO laporan_pemusnahan_obat 
       (id, obat_id, nama_obat, batch, unit_terjual, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan, created_by, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [laporan_id, obat_id, obat.nama, req.body.batch || '', unit_terjual || 0, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan || '', user.username, now, now],
      (err) => {
        if (err) {
          console.error('[LAPORAN PEMUSNAHAN] INSERT failed:', err);
          return res.status(500).json({ message: 'Error menyimpan laporan: ' + err.message });
        }
        console.log('[LAPORAN PEMUSNAHAN] INSERT success, ID:', laporan_id);
        res.json({ message: 'Laporan berhasil dibuat', id: laporan_id });
      }
    );
  });
});

// Get all laporan pemusnahan
app.get('/api/laporan-pemusnahan', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const { status = '' } = req.query;
  let query = 'SELECT * FROM laporan_pemusnahan_obat ORDER BY created_at DESC';
  const params = [];

  if (status) {
    query = 'SELECT * FROM laporan_pemusnahan_obat WHERE status = ? ORDER BY created_at DESC';
    params.push(status);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Error: ' + err.message });
    }
    res.json(rows || []);
  });
});

// Get laporan by ID
app.get('/api/laporan-pemusnahan/:id', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.get('SELECT * FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }
    res.json(row);
  });
});

// Update laporan pemusnahan (hanya jika pending)
app.put('/api/laporan-pemusnahan/:id', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.get('SELECT status FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }
    // Allow updating only when status is 'pending' or 'need_second_approval'
    if (row.status !== 'pending' && row.status !== 'need_second_approval') {
      return res.status(400).json({ message: 'Laporan tidak bisa diupdate, status sudah: ' + row.status });
    }

    const { unit_terjual, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan } = req.body;
    const now = new Date().toISOString();

    db.run(
      `UPDATE laporan_pemusnahan_obat 
       SET unit_terjual = COALESCE(?, unit_terjual), 
           unit_sisa = COALESCE(?, unit_sisa), 
           pt_pemusnahan = COALESCE(?, pt_pemusnahan), 
           biaya_pemusnahan = COALESCE(?, biaya_pemusnahan), 
           tanggal_pemusnahan = COALESCE(?, tanggal_pemusnahan), 
           catatan = COALESCE(?, catatan),
           updated_at = ?
       WHERE id = ?`,
      [unit_terjual, unit_sisa, pt_pemusnahan, biaya_pemusnahan, tanggal_pemusnahan, catatan, now, req.params.id],
      (err) => {
        if (err) {
          return res.status(500).json({ message: 'Error update: ' + err.message });
        }
        res.json({ success: true, message: 'Laporan berhasil diupdate' });
      }
    );
  });
});

// Approve laporan (first approval atau second approval)
app.post('/api/laporan-pemusnahan/:id/approve', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const user = req.session.user;
  const { approval_type } = req.body; // 'first' atau 'second'
  const now = new Date().toISOString();

  db.get('SELECT * FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }

    if (approval_type === 'first') {
      if (row.status !== 'pending' && row.status !== 'need_second_approval') {
        return res.status(400).json({ message: 'Laporan tidak bisa di-approve di tahap pertama' });
      }
      db.run(
        `UPDATE laporan_pemusnahan_obat 
         SET approved_by_first = ?, approved_at_first = ?, status = 'need_second_approval', updated_at = ?
         WHERE id = ?`,
        [user.username, now, now, req.params.id],
        (err) => {
          if (err) {
            return res.status(500).json({ message: 'Error: ' + err.message });
          }
          res.json({ message: 'Persetujuan pertama dicatat, menunggu persetujuan kedua' });
        }
      );
    } else if (approval_type === 'second') {
      if (row.status !== 'need_second_approval') {
        return res.status(400).json({ message: 'Laporan harus melewati persetujuan pertama dulu' });
      }
      db.run(
        `UPDATE laporan_pemusnahan_obat 
         SET approved_by_second = ?, approved_at_second = ?, status = 'approved', updated_at = ?
         WHERE id = ?`,
        [user.username, now, now, req.params.id],
        (err) => {
          if (err) {
            return res.status(500).json({ message: 'Error: ' + err.message });
          }
          res.json({ message: 'Laporan pemusnahan approved sepenuhnya' });
        }
      );
    } else {
      res.status(400).json({ message: 'approval_type harus "first" atau "second"' });
    }
  });
});

// Reject laporan
app.post('/api/laporan-pemusnahan/:id/reject', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  const now = new Date().toISOString();

  db.get('SELECT status FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }

    if (row.status === 'approved') {
      return res.status(400).json({ message: 'Laporan yang sudah approved tidak bisa di-reject' });
    }

    db.run(
      `UPDATE laporan_pemusnahan_obat SET status = 'rejected', updated_at = ? WHERE id = ?`,
      [now, req.params.id],
      (err) => {
        if (err) {
          return res.status(500).json({ message: 'Error: ' + err.message });
        }
        res.json({ message: 'Laporan ditolak' });
      }
    );
  });
});

// Delete laporan (hanya jika pending)
app.delete('/api/laporan-pemusnahan/:id', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.get('SELECT status FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ message: 'Hanya laporan pending yang bisa dihapus' });
    }

    db.run('DELETE FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error: ' + err.message });
      }
      res.json({ message: 'Laporan berhasil dihapus' });
    });
  });
});

// Generate PDF untuk laporan pemusnahan dengan analisis
app.get('/api/laporan-pemusnahan/:id/pdf', authMiddleware, roleMiddleware(ALLOWED_ROLES), (req, res) => {
  db.get('SELECT * FROM laporan_pemusnahan_obat WHERE id = ?', [req.params.id], (err, laporan) => {
    if (err || !laporan) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }

    // Calculate recommendations
    const ved = String(laporan.ved || 'D').toUpperCase();
    const baseQty = { 'V': 100, 'E': 50, 'D': 20 };
    const minOrder = Math.ceil((baseQty[ved] || 20) * 1.0);

    let analysis = '';
    let recommendation = '';

    if (ved === 'V') {
      analysis = `Obat ini termasuk kategori VITAL (penting). Pemusnahan ${laporan.unit_sisa} unit menyebabkan gap pada stok kritis.`;
      recommendation = `Pesan ulang minimal ${minOrder} unit ke supplier untuk merestorasi stok kategori Vital.`;
    } else if (ved === 'E') {
      analysis = `Obat ini termasuk kategori ESSENTIAL. Pemusnahan harus diikuti monitoring ketat pola penggunaan.`;
      recommendation = `Pesan ulang minimal ${minOrder} unit. Monitor usage rate untuk forecasting lebih akurat.`;
    } else {
      analysis = `Obat ini termasuk kategori DESIRABLE. Pemusnahan tidak berdampak langsung operasional.`;
      recommendation = `Pesan ulang minimal ${minOrder} unit saat ada kesempatan. Prioritaskan kategori V dan E.`;
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const filename = `Laporan-Pemusnahan-${laporan.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('LAPORAN PEMUSNAHAN OBAT KADALUARSA', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Sistem Manajemen Apotek', { align: 'center' });
    doc.moveDown(0.5);

    // Divider
    doc.moveTo(36, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Info Laporan
    doc.fontSize(11).font('Helvetica-Bold').text('INFORMASI LAPORAN');
    doc.fontSize(10).font('Helvetica');
    doc.text(`ID Laporan: ${laporan.id}`);
    doc.text(`Status: ${laporan.status}`);
    doc.text(`Tanggal Dibuat: ${new Date(laporan.created_at).toLocaleDateString('id-ID')}`);
    doc.text(`Dibuat Oleh: ${laporan.created_by}`);
    doc.moveDown(0.3);

    // Info Obat
    doc.fontSize(11).font('Helvetica-Bold').text('INFORMASI OBAT KADALUARSA');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nama Obat: ${laporan.nama_obat}`);
    doc.text(`Batch: ${laporan.batch || '-'}`);
    doc.text(`VED Kategori: [${ved}]`);
    doc.text(`Unit Terjual: ${laporan.unit_terjual} unit`);
    doc.text(`Unit Sisa (Dipemusnah): ${laporan.unit_sisa} unit`);
    doc.text(`Tanggal Kadaluarsa: ${laporan.tanggal_pemusnahan}`);
    doc.moveDown(0.3);

    // Data Pemusnahan
    doc.fontSize(11).font('Helvetica-Bold').text('DATA PEMUSNAHAN');
    doc.fontSize(10).font('Helvetica');
    doc.text(`PT Pemusnahan: ${laporan.pt_pemusnahan}`);
    doc.text(`Biaya Pemusnahan: Rp ${Number(laporan.biaya_pemusnahan || 0).toLocaleString('id-ID')}`);
    doc.text(`Catatan: ${laporan.catatan || '-'}`);
    doc.moveDown(0.3);

    // Approval Info
    if (laporan.status === 'approved' || laporan.status === 'need_second_approval') {
      doc.fontSize(11).font('Helvetica-Bold').text('APPROVAL');
      doc.fontSize(10).font('Helvetica');
      if (laporan.approved_by_first) {
        doc.text(`Approval I oleh: ${laporan.approved_by_first} (${new Date(laporan.approved_at_first).toLocaleDateString('id-ID')})`);
      }
      if (laporan.approved_by_second && laporan.status === 'approved') {
        doc.text(`Approval II oleh: ${laporan.approved_by_second} (${new Date(laporan.approved_at_second).toLocaleDateString('id-ID')})`);
      }
      doc.moveDown(0.3);
    }

    // Divider
    doc.moveTo(36, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Analysis & Recommendation
    doc.fontSize(12).font('Helvetica-Bold').text('ANALISIS & REKOMENDASI PEMESANAN');
    doc.moveDown(0.2);

    doc.fontSize(10).font('Helvetica-Bold').text('Analisis:');
    doc.font('Helvetica').text(analysis, { align: 'justify', lineGap: 5 });
    doc.moveDown(0.2);

    doc.font('Helvetica-Bold').text('Rekomendasi Pemesanan Minimum:');
    doc.font('Helvetica').text(`${minOrder} unit`, { align: 'justify', lineGap: 5 });
    doc.moveDown(0.2);

    doc.font('Helvetica').text(recommendation, { align: 'justify', lineGap: 5 });
    doc.moveDown(0.3);

    // Footer
    doc.fontSize(8).text('Dokumen ini digenerate otomatis oleh Sistem Manajemen Apotek', { align: 'center', color: '#999' });
    doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { align: 'center', color: '#999' });

    doc.end();
  });
});

/* ===============================
   STATIC
================================ */
// Serve static public folder
app.get('/runtime-config.js', (req, res) => {
  const runtimeBase = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(`window.__APP_BASE_URL = ${JSON.stringify(runtimeBase)};`);
});

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

// Auto-seed database if enabled
async function autoSeedIfNeeded() {
  const AUTO_SEED = String(process.env.AUTO_SEED || 'false').toLowerCase();
  if (AUTO_SEED !== 'true') {
    return;
  }

  try {
    console.log('🌱 AUTO_SEED enabled. Checking if seeding is needed...');

    // Check if database is empty
    const result = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS total FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const userCount = result && result.total ? Number(result.total) : 0;
    if (userCount > 0) {
      console.log('✅ Database sudah populated. Seeding dilewati.');
      return;
    }

    console.log('🌱 Database kosong. Running seeding...');
    const seedScript = path.join(__dirname, 'scripts', 'seed.js');

    await new Promise((resolve, reject) => {
      require('child_process').execFile('node', [seedScript], {
        stdio: ['ignore', 'pipe', 'pipe']
      }, (err, stdout, stderr) => {
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Database seeding completed.');
  } catch (err) {
    console.error('⚠️  Auto-seeding error (continuing anyway):', err.message);
  }
}

// Start server with auto-seed
async function startServer() {
  await autoSeedIfNeeded();

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

const server = startServer();

function gracefulShutdown(signal) {
  console.log(`${signal} diterima. Menutup server...`);
  server.close(() => {
    if (db && typeof db.close === 'function') {
      db.close();
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});
