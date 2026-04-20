#!/usr/bin/env node

/**
 * Export Seed Data Script
 * Exports real data from PostgreSQL to seed_data.xlsx
 * 
 * Usage: node scripts/export_seed_data.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

const db = require('../database/database');

const OUTPUT_FILE = path.join(__dirname, '..', 'seed_data.xlsx');

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

async function exportSeedData() {
  await db.ready;

  try {
    log(colors.cyan, '📤 Starting data export from PostgreSQL...\n');

    // Export users (without password - already safe in database)
    log(colors.cyan, '📝 Exporting users...');
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT username, email, role FROM users ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    log(colors.green, `✅ Exported ${users.length} users (without passwords - already in database)`);

    // Export kategori
    log(colors.cyan, '📝 Exporting kategori_config...');
    const kategori = await new Promise((resolve, reject) => {
      db.all(
        'SELECT nama, lead_time_hari, min_stok, optimal_stok, reorder_qty FROM kategori_config ORDER BY nama',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    log(colors.green, `✅ Exported ${kategori.length} kategori`);

    // Export obat
    log(colors.cyan, '📝 Exporting obat...');
    const obat = await new Promise((resolve, reject) => {
      db.all(
        'SELECT nama, batch, kadaluarsa, kategori, jumlah, deskripsi FROM obat ORDER BY nama',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    log(colors.green, `✅ Exported ${obat.length} obat`);

    // Export scheduler_config
    log(colors.cyan, '📝 Exporting scheduler_config...');
    const schedulerConfig = await new Promise((resolve, reject) => {
      db.all(
        'SELECT config_type, interval_hari, enabled, email_jam FROM scheduler_config ORDER BY config_type',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    log(colors.green, `✅ Exported ${schedulerConfig.length} scheduler configs`);

    // Export email_config
    log(colors.cyan, '📝 Exporting email_config...');
    const emailConfig = await new Promise((resolve, reject) => {
      db.all(
        'SELECT config_type, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM email_config ORDER BY config_type',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    log(colors.green, `✅ Exported ${emailConfig.length} email configs`);

    // Create Excel workbook
    log(colors.cyan, '\n📄 Creating Excel file...');
    const wb = XLSX.utils.book_new();

    const wsUsers = XLSX.utils.json_to_sheet(users);
    XLSX.utils.book_append_sheet(wb, wsUsers, 'users');

    const wsKategori = XLSX.utils.json_to_sheet(kategori);
    XLSX.utils.book_append_sheet(wb, wsKategori, 'kategori');

    const wsObat = XLSX.utils.json_to_sheet(obat);
    XLSX.utils.book_append_sheet(wb, wsObat, 'obat');

    const wsScheduler = XLSX.utils.json_to_sheet(schedulerConfig);
    XLSX.utils.book_append_sheet(wb, wsScheduler, 'scheduler_config');

    const wsEmail = XLSX.utils.json_to_sheet(emailConfig);
    XLSX.utils.book_append_sheet(wb, wsEmail, 'email_config');

    // Write file
    XLSX.writeFile(wb, OUTPUT_FILE);

    log(colors.green, `\n✅ Data export completed!`);
    log(colors.green, `📁 File saved: ${OUTPUT_FILE}`);
    log(colors.green, `\n📊 Summary:`);
    log(colors.yellow, `   • Users: ${users.length}`);
    log(colors.yellow, `   • Kategori: ${kategori.length}`);
    log(colors.yellow, `   • Obat: ${obat.length}`);
    log(colors.yellow, `   • Scheduler Configs: ${schedulerConfig.length}`);
    log(colors.yellow, `   • Email Configs: ${emailConfig.length}`);
    log(colors.green, `\n✅ Ready to deploy! Commit this file to GitHub.\n`);

    process.exit(0);
  } catch (err) {
    log(colors.red, '❌ Export failed:', err.message);
    process.exit(1);
  }
}

exportSeedData();
