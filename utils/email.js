const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const FALLBACK_LOG = path.join(__dirname, '..', 'email-fallback.log');

let currentTransporter = null;
let emailConfigCache = null;
let lastConfigLoadTime = 0;
const CONFIG_CACHE_DURATION = 60000; // Cache for 1 minute

// Initial transporter from environment variables
function createTransporterFromEnv() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Create transporter from database config
function createTransporterFromConfig(config) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port),
    secure: Boolean(config.smtp_secure),
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass
    }
  });
}

currentTransporter = createTransporterFromEnv();

function appendFallbackLog(obj) {
  try {
    const line = JSON.stringify(obj) + '\n';
    fs.appendFileSync(FALLBACK_LOG, line, 'utf8');
  } catch (e) {
    // best-effort only
    console.error('Failed to write email fallback log', e && e.message ? e.message : e);
  }
}

function isEmailConfigured(config) {
  if (config) {
    return Boolean(config.smtp_user && config.smtp_pass);
  }
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Load email config from database (with caching)
async function loadEmailConfig(db) {
  const now = Date.now();
  
  // Return cached config if still valid
  if (emailConfigCache && (now - lastConfigLoadTime) < CONFIG_CACHE_DURATION) {
    return emailConfigCache;
  }

  if (!db) {
    console.warn('[EMAIL] ⚠️ Database not available for loading email config');
    return null;
  }

  return new Promise((resolve) => {
    db.get("SELECT * FROM email_config WHERE config_type = ?", ['ved_fefo_email'], (err, row) => {
      if (err) {
        console.error('[EMAIL] ❌ Error loading email config:', err);
        resolve(null);
        return;
      }

      if (row) {
        // If password is set to 'FROM_ENV', use environment variable instead
        if (row.smtp_pass === 'FROM_ENV') {
          row.smtp_pass = process.env.SMTP_PASS || '';
        }
        emailConfigCache = row;
        lastConfigLoadTime = now;
        console.log('[EMAIL] ✅ Email config loaded from database');
        resolve(row);
      } else {
        console.warn('[EMAIL] ⚠️ Email config not found in database');
        resolve(null);
      }
    });
  });
}

async function sendMail({ to, subject, text, html }, db) {
  const out = { ts: new Date().toISOString(), to: to || process.env.NOTIFY_TO, subject, text, html };

  // Try to load config from database
  let dbConfig = null;
  try {
    dbConfig = await loadEmailConfig(db);
  } catch (err) {
    console.warn('[EMAIL] ⚠️ Failed to load DB config:', err.message);
  }

  const config = dbConfig || {
    smtp_user: process.env.SMTP_USER,
    smtp_pass: process.env.SMTP_PASS,
    notify_from: process.env.NOTIFY_FROM || process.env.SMTP_USER
  };

  if (!isEmailConfigured(config)) {
    out.error = 'SMTP credentials not configured';
    appendFallbackLog(out);
    console.error('❌ Email not sent: SMTP credentials not configured');
    throw new Error('SMTP credentials not configured. Please set SMTP credentials in email settings.');
  }

  // Update transporter if database config is available
  if (dbConfig) {
    currentTransporter = createTransporterFromConfig(dbConfig);
  }

  try {
    const info = await currentTransporter.sendMail({
      from: config.notify_from || config.smtp_user,
      to: out.to,
      subject,
      text,
      html
    });
    console.log('✅ Email sent successfully to', out.to);
    return info;
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
    appendFallbackLog(out);
    console.error('❌ Email send failed:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = { sendMail, isEmailConfigured, loadEmailConfig };