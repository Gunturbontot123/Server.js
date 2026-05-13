#!/usr/bin/env node

/**
 * Database Seeding Script
 * Reads seed_data.xlsx and populates SQLite database
 * 
 * Usage: node scripts/seed.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const db = require('../database/database');

const SEED_FILE = path.join(__dirname, '..', 'seed_data.xlsx');
const BCRYPT_ROUNDS = 10;

// Color logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

function createSampleExcelFile() {
  log(colors.yellow, '⚠️  seed_data.xlsx not found. Creating sample file...');

  const sampleData = {
    users: [
      { username: 'bontot', email: 'useoppo507@gmail.com', password: 'Abgbontot', role: 'APJ' },
      { username: 'apj_demo', email: 'apj@example.com', password: 'Demo1234', role: 'APJ' },
      { username: 'asisten_demo', email: 'asisten@example.com', password: 'Demo1234', role: 'ASISTEN_APOTEKER' },
    ],
    kategori: [
      { nama: 'SIRUP', lead_time_hari: 14, min_stok: 10, optimal_stok: 30, reorder_qty: 50 },
      { nama: 'TABLET BEBAS', lead_time_hari: 7, min_stok: 10, optimal_stok: 30, reorder_qty: 50 },
      { nama: 'TABLET KERAS', lead_time_hari: 10, min_stok: 5, optimal_stok: 20, reorder_qty: 40 },
      { nama: 'SALEP', lead_time_hari: 7, min_stok: 5, optimal_stok: 15, reorder_qty: 30 },
      { nama: 'ETALASE LUAR', lead_time_hari: 7, min_stok: 15, optimal_stok: 40, reorder_qty: 60 },
      { nama: 'INJEKSI', lead_time_hari: 14, min_stok: 5, optimal_stok: 20, reorder_qty: 35 },
    ],
    obat: [
      { nama: 'Paracetamol', batch: 'B20260101', kadaluarsa: '2027-12-31', kategori: 'TABLET BEBAS', jumlah: 50, deskripsi: 'Penurun demam & nyeri ringan' },
      { nama: 'Amoxicillin', batch: 'B20260102', kadaluarsa: '2026-08-15', kategori: 'TABLET KERAS', jumlah: 5, deskripsi: 'Antibiotik untuk infeksi bakteri' },
      { nama: 'Ibuprofen', batch: 'B20260103', kadaluarsa: '2026-05-20', kategori: 'TABLET BEBAS', jumlah: 2, deskripsi: 'Pereda nyeri & peradangan' },
      { nama: 'Omeprazole', batch: 'B20260104', kadaluarsa: '2027-06-30', kategori: 'TABLET KERAS', jumlah: 25, deskripsi: 'Menurunkan asam lambung' },
      { nama: 'Cetirizine', batch: 'B20260105', kadaluarsa: '2026-03-10', kategori: 'TABLET BEBAS', jumlah: 0, deskripsi: 'Antihistamin untuk alergi' },
      { nama: 'Salbutamol', batch: 'B20260106', kadaluarsa: '2027-09-15', kategori: 'SIRUP', jumlah: 8, deskripsi: 'Melegakan saluran napas asma' },
      { nama: 'Metformin', batch: 'B20260107', kadaluarsa: '2028-01-20', kategori: 'TABLET KERAS', jumlah: 40, deskripsi: 'Kontrol gula darah diabetes' },
      { nama: 'Amlodipine', batch: 'B20260108', kadaluarsa: '2027-04-10', kategori: 'TABLET KERAS', jumlah: 30, deskripsi: 'Kontrol tekanan darah tinggi' },
      { nama: 'Simvastatin', batch: 'B20260109', kadaluarsa: '2026-02-28', kategori: 'TABLET KERAS', jumlah: 1, deskripsi: 'Menurunkan kadar kolesterol' },
      { nama: 'Ranitidine', batch: 'B20260110', kadaluarsa: '2027-11-30', kategori: 'TABLET BEBAS', jumlah: 35, deskripsi: 'Mengurangi asam lambung' },
      { nama: 'CTM', batch: 'B20260111', kadaluarsa: '2026-06-15', kategori: 'TABLET BEBAS', jumlah: 12, deskripsi: 'Antihistamin untuk alergi' },
      { nama: 'Antasida', batch: 'B20260112', kadaluarsa: '2026-12-31', kategori: 'TABLET BEBAS', jumlah: 20, deskripsi: 'Menetralisir asam lambung' },
      { nama: 'Dexamethasone', batch: 'B20260113', kadaluarsa: '2026-09-20', kategori: 'INJEKSI', jumlah: 3, deskripsi: 'Kortikosteroid antiinflamasi' },
      { nama: 'Asam Mefenamat', batch: 'B20260114', kadaluarsa: '2026-04-30', kategori: 'TABLET BEBAS', jumlah: 7, deskripsi: 'Pereda nyeri ringan sampai sedang' },
      { nama: 'Allofar', batch: 'B20260115', kadaluarsa: '2027-05-15', kategori: 'TABLET BEBAS', jumlah: 45, deskripsi: 'Menurunkan kadar asam urat' },
    ],
    scheduler_config: [
      { config_type: 'ved_fefo_email', interval_hari: 5, enabled: true, email_jam: '08:00' },
    ],
    email_config: [
      { config_type: 'smtp_gmail', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_user: '', smtp_pass: '', smtp_secure: true },
    ],
  };

  const wb = XLSX.utils.book_new();
  
  for (const [sheetName, data] of Object.entries(sampleData)) {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, SEED_FILE);
  log(colors.green, '✅ Sample seed_data.xlsx created at:', SEED_FILE);
}

async function readSeedData() {
  if (!fs.existsSync(SEED_FILE)) {
    createSampleExcelFile();
  }

  try {
    const workbook = XLSX.readFile(SEED_FILE);
    const data = {};

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      data[sheetName] = XLSX.utils.sheet_to_json(ws);
    }

    return data;
  } catch (err) {
    log(colors.red, '❌ Error reading seed_data.xlsx:', err.message);
    throw err;
  }
}

async function seedDatabase(data) {
  await db.ready;

  try {
    // Drop and recreate tables
    log(colors.cyan, '🔄 Dropping and recreating tables...');
    
    await db.run(`DROP TABLE IF EXISTS laporan_pemusnahan_obat`);
    await db.run(`DROP TABLE IF EXISTS stock_movements`);
    await db.run(`DROP TABLE IF EXISTS password_reset_tokens`);
    await db.run(`DROP TABLE IF EXISTS email_config`);
    await db.run(`DROP TABLE IF EXISTS scheduler_config`);
    await db.run(`DROP TABLE IF EXISTS kategori_config`);
    await db.run(`DROP TABLE IF EXISTS obat`);
    await db.run(`DROP TABLE IF EXISTS logs`);
    await db.run(`DROP TABLE IF EXISTS users`);

    // Create users table
    await db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('APJ', 'ASISTEN_APOTEKER')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create obat table
    await db.run(`
      CREATE TABLE obat (
        id TEXT PRIMARY KEY,
        nama TEXT NOT NULL,
        jumlah INTEGER DEFAULT 0,
        kadaluarsa TEXT,
        ved TEXT CHECK (ved IN ('V', 'E', 'D')),
        batch TEXT,
        kategori TEXT DEFAULT 'TABLET BEBAS',
        deskripsi TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create kategori_config table
    await db.run(`
      CREATE TABLE kategori_config (
        id TEXT PRIMARY KEY,
        nama TEXT UNIQUE NOT NULL,
        lead_time_hari INTEGER DEFAULT 7,
        min_stok INTEGER DEFAULT 10,
        optimal_stok INTEGER DEFAULT 30,
        reorder_qty INTEGER DEFAULT 50,
        keterangan TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create logs table
    await db.run(`
      CREATE TABLE logs (
        id TEXT PRIMARY KEY,
        type TEXT,
        message TEXT,
        time TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create password_reset_tokens table
    await db.run(`
      CREATE TABLE password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create scheduler_config table
    await db.run(`
      CREATE TABLE scheduler_config (
        id TEXT PRIMARY KEY,
        config_type TEXT UNIQUE NOT NULL,
        interval_hari INTEGER DEFAULT 5,
        enabled INTEGER DEFAULT 1,
        email_jam TEXT DEFAULT '08:00',
        last_sent_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create email_config table
    await db.run(`
      CREATE TABLE email_config (
        id TEXT PRIMARY KEY,
        config_type TEXT UNIQUE NOT NULL,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_user TEXT NOT NULL,
        smtp_pass TEXT NOT NULL,
        smtp_secure INTEGER DEFAULT 1,
        notify_from TEXT,
        notify_to TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create stock_movements table
    await db.run(`
      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY,
        obat_id TEXT NOT NULL,
        obat_nama TEXT NOT NULL,
        jenis_movement TEXT,
        jumlah INTEGER,
        keterangan TEXT,
        waktu TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (obat_id) REFERENCES obat(id) ON DELETE CASCADE
      )
    `);

    // Create laporan_pemusnahan_obat table
    await db.run(`
      CREATE TABLE laporan_pemusnahan_obat (
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (obat_id) REFERENCES obat(id) ON DELETE CASCADE
      )
    `);

    log(colors.green, '✅ Tables created successfully');

    // Seed users
    log(colors.cyan, '📝 Seeding users...');
    if (data.users && Array.isArray(data.users)) {
      for (const user of data.users) {
        // If password not in seed file, skip user seeding (already in database)
        // Password is kept in database for security
        if (!user.password) {
          log(colors.yellow, `⏭️  Skipping user ${user.username} - password not in seed file (already in database)`);
          continue;
        }
        const hashedPassword = bcrypt.hashSync(user.password, BCRYPT_ROUNDS);
        await db.run(
          `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
          [user.username, user.email || null, hashedPassword, user.role]
        );
      }
      log(colors.green, `✅ Seeded users (passwords kept in database)`);
    }

    // Seed kategori
    log(colors.cyan, '📝 Seeding kategori...');
    if (data.kategori && Array.isArray(data.kategori)) {
      for (const kategori of data.kategori) {
        await db.run(
          `INSERT INTO kategori_config (id, nama, lead_time_hari, min_stok, optimal_stok, reorder_qty) VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), kategori.nama, kategori.lead_time_hari || 7, kategori.min_stok || 10, kategori.optimal_stok || 30, kategori.reorder_qty || 50]
        );
      }
      log(colors.green, `✅ Seeded ${data.kategori.length} kategori`);
    }

    // Seed obat
    log(colors.cyan, '📝 Seeding obat...');
    if (data.obat && Array.isArray(data.obat)) {
      for (const obat of data.obat) {
        const ved = classifyVED(obat.jumlah);
        await db.run(
          `INSERT INTO obat (id, nama, jumlah, kadaluarsa, ved, batch, kategori, deskripsi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), obat.nama, obat.jumlah || 0, obat.kadaluarsa || null, ved, obat.batch || '', obat.kategori || 'TABLET BEBAS', obat.deskripsi || '']
        );
      }
      log(colors.green, `✅ Seeded ${data.obat.length} obat`);
    }

    // Seed scheduler_config - SKIP (not in use)
    log(colors.yellow, '⏭️  Skipping scheduler_config (not in use)');

    // Seed email_config
    log(colors.cyan, '📝 Seeding email_config...');
    if (data.email_config && Array.isArray(data.email_config)) {
      for (const config of data.email_config) {
        await db.run(
          `INSERT INTO email_config (id, config_type, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), config.config_type, config.smtp_host, config.smtp_port || 465, config.smtp_user || '', config.smtp_pass || '', config.smtp_secure !== false ? 1 : 0]
        );
      }
      log(colors.green, `✅ Seeded email_config`);
    }

    log(colors.green, '\n✅ Database seeding completed successfully!\n');
    return true;
  } catch (err) {
    log(colors.red, '❌ Error seeding database:', err.message);
    throw err;
  }
}

function classifyVED(jumlah) {
  if (jumlah <= 5) return 'V';
  if (jumlah <= 20) return 'E';
  return 'D';
}

async function main() {
  try {
    log(colors.bright, '\n🌱 Starting Database Seeding...\n');
    
    const data = await readSeedData();
    await seedDatabase(data);
    
    process.exit(0);
  } catch (err) {
    log(colors.red, '❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

main();
