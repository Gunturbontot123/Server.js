const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const FALLBACK_LOG = path.join(__dirname, '..', 'email-fallback.log');

function appendFallbackLog(obj) {
  try {
    const line = JSON.stringify(obj) + '\n';
    fs.appendFileSync(FALLBACK_LOG, line, 'utf8');
  } catch (e) {
    // best-effort only
    console.error('Failed to write email fallback log', e && e.message ? e.message : e);
  }
}

async function sendMail({ to, subject, text, html }) {
  const out = { ts: new Date().toISOString(), to: to || process.env.NOTIFY_TO, subject, text, html };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    out.error = 'SMTP credentials not configured';
    appendFallbackLog(out);
    console.warn('Email not sent: SMTP credentials not configured. Saved to fallback log.');
    return null;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.NOTIFY_FROM || process.env.SMTP_USER,
      to: out.to,
      subject,
      text,
      html
    });
    return info;
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
    appendFallbackLog(out);
    console.error('Email send failed; saved to fallback log.');
    return null;
  }
}

module.exports = { sendMail };