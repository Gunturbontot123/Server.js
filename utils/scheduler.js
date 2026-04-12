/**
 * Scheduler untuk mengirim laporan VED-FEFO setiap 5 hari
 * Email dikirim ke semua APJ dan Apoteker Pendamping yang terdaftar
 */

const cron = require('node-cron');
const { sendMail, isEmailConfigured } = require('./email');

/**
 * Generate laporan VED-FEFO dalam format HTML
 */
function generateVedFefoReport(vedAnalysis, fefoRecommendations) {
  const { byVed, summary } = vedAnalysis;
  const { urgent, critical, monitor, routine } = fefoRecommendations;

  // Helper untuk format tanggal
  const formatDate = (date) => {
    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format item obat untuk display
  const formatItem = (item) => {
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${item.nama || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.ved || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.jumlah || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.kadaluarsa || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.status || 'N/A'}</td>
      </tr>
    `;
  };

  const urgentHtml = urgent.items && urgent.items.length > 0
    ? urgent.items.map(formatItem).join('')
    : '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #999;">Tidak ada obat urgent</td></tr>';

  const criticalHtml = critical.items && critical.items.length > 0
    ? critical.items.map(formatItem).join('')
    : '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #999;">Tidak ada obat kritis</td></tr>';

  const monitorHtml = monitor.items && monitor.items.length > 0
    ? monitor.items.map(formatItem).join('')
    : '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #999;">Tidak ada obat yang perlu dimonitor</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .header { background-color: #2c3e50; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 5px 0 0 0; font-size: 14px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
        .summary-box { background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #3498db; }
        .summary-box.vital { border-left-color: #e74c3c; }
        .summary-box.essential { border-left-color: #f39c12; }
        .summary-box.desirable { border-left-color: #27ae60; }
        .summary-box.status { border-left-color: #9b59b6; }
        .summary-box h3 { margin: 0 0 10px 0; font-size: 14px; color: #555; }
        .summary-box .number { font-size: 28px; font-weight: bold; color: #2c3e50; }
        .section { background-color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section h2 { margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #3498db; color: #2c3e50; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: #34495e; color: white; padding: 12px; text-align: left; font-weight: bold; }
        tr:hover { background-color: #f5f5f5; }
        .footer { text-align: center; padding: 15px; color: #999; font-size: 12px; border-top: 1px solid #ddd; margin-top: 20px; }
        .action-needed { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; border-radius: 5px; margin-bottom: 20px; }
        .action-needed p { margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Laporan VED-FEFO Periodic</h1>
          <p>ObatQu - Sistem Manajemen Apotek | ${formatDate(new Date())}</p>
        </div>

        <div class="action-needed">
          <p><strong>⚠️ PERHATIAN:</strong> Laporan ini menunjukkan obat prioritas yang perlu segera diperhatikan. Silakan tindak lanjuti rekomendasi di bawah.</p>
        </div>

        <div class="summary">
          <div class="summary-box vital">
            <h3>Vital (V)</h3>
            <div class="number">${summary.vital || 0}</div>
          </div>
          <div class="summary-box essential">
            <h3>Essential (E)</h3>
            <div class="number">${summary.essential || 0}</div>
          </div>
          <div class="summary-box desirable">
            <h3>Desirable (D)</h3>
            <div class="number">${summary.desirable || 0}</div>
          </div>
          <div class="summary-box status">
            <h3>Total Obat</h3>
            <div class="number">${summary.vital + summary.essential + summary.desirable}</div>
          </div>
        </div>

        <div class="section">
          <h2>🔴 URGENT - Harus Langsung Dijual/Dibuang</h2>
          <p>Obat-obat berikut sudah kadaluarsa atau sangat dekat dengan tanggal kadaluarsa. Prioritaskan penjualan atau penarikan segera.</p>
          <table>
            <thead>
              <tr>
                <th>Nama Obat</th>
                <th>VED</th>
                <th>Stok</th>
                <th>Kadaluarsa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${urgentHtml}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>🟠 KRITIS - Vital dengan Stok Rendah</h2>
          <p>Obat-obat Vital (V) dengan stok yang rendah atau perlu segera dipesan ulang.</p>
          <table>
            <thead>
              <tr>
                <th>Nama Obat</th>
                <th>VED</th>
                <th>Stok</th>
                <th>Kadaluarsa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${criticalHtml}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>🟡 MONITOR - Perlu Diperhatikan</h2>
          <p>Obat-obat Essential (E) atau Desirable (D) yang perlu dipantau stoknya.</p>
          <table>
            <thead>
              <tr>
                <th>Nama Obat</th>
                <th>VED</th>
                <th>Stok</th>
                <th>Kadaluarsa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${monitorHtml}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>📊 Statistik Ekspirasi</h2>
          <ul>
            <li><strong>Sudah Kadaluarsa:</strong> ${summary.expired || 0} item</li>
            <li><strong>Hampir Kadaluarsa:</strong> ${summary.nearExpiry || 0} item</li>
            <li><strong>Aman:</strong> ${summary.safe || 0} item</li>
          </ul>
        </div>

        <div class="section">
          <h2>💡 Rekomendasi FEFO</h2>
          <p><strong>First Expiry First Out (FEFO)</strong> adalah strategi penjualan pada obat dengan tanggal kadaluarsa terdekat terlebih dahulu untuk meminimalkan kerugian.</p>
          <ul>
            <li>Prioritaskan penjualan obat di bagian URGENT</li>
            <li>Pesan ulang obat KRITIS agar stok tidak habis</li>
            <li>Monitor terus obat-obat dengan status HAMPIR KADALUARSA</li>
            <li>Manfaatkan FEFO untuk mengoptimalkan penjualan</li>
          </ul>
        </div>

        <div class="footer">
          <p>Laporan ini dikirim otomatis setiap 5 hari pada jam 08:00 WIB oleh sistem ObatQu</p>
          <p>Untuk pertanyaan atau feedback, hubungi APJ atau administrator sistem</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Ambil data VED-FEFO dari database
 */
async function getVedFefoData(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM obat", (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      if (!rows || rows.length === 0) {
        resolve({ vedAnalysis: { byVed: { V: [], E: [], D: [] }, summary: {} }, fefoRecommendations: {} });
        return;
      }

      // Analisis VED-FEFO (simplified - sesuaikan dengan analyzeObatVED di server.js)
      const analysis = rows.map(obat => ({
        ...obat,
        ved: obat.ved || 'D',
        status: getExpireStatus(obat.kadaluarsa)
      }));

      // Group by VED
      const byVed = { V: [], E: [], D: [] };
      analysis.forEach(item => {
        const ved = item.ved || 'D';
        if (byVed[ved]) byVed[ved].push(item);
      });

      // Count by status
      const byStatus = {};
      analysis.forEach(item => {
        byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      });

      // FEFO recommendations
      const sortedByExpiry = [...rows].sort((a, b) => {
        const dateA = parseExpiryDate(a.kadaluarsa);
        const dateB = parseExpiryDate(b.kadaluarsa);
        return dateA - dateB;
      });

      const urgent = sortedByExpiry.filter(o => getExpireStatus(o.kadaluarsa) === 'kadaluarsa').slice(0, 10);
      const critical = sortedByExpiry.filter(o => o.ved === 'V' && getExpireStatus(o.kadaluarsa) !== 'aman').slice(0, 10);
      const monitor = sortedByExpiry.filter(o => o.ved === 'E').slice(0, 10);

      resolve({
        vedAnalysis: {
          byVed,
          summary: {
            vital: byVed.V.length,
            essential: byVed.E.length,
            desirable: byVed.D.length,
            expired: byStatus.kadaluarsa || 0,
            nearExpiry: byStatus.hampir_kadaluarsa || 0,
            safe: byStatus.aman || 0
          }
        },
        fefoRecommendations: {
          urgent: { count: urgent.length, items: urgent },
          critical: { count: critical.length, items: critical },
          monitor: { count: monitor.length, items: monitor },
          routine: { count: sortedByExpiry.length - urgent.length - critical.length - monitor.length }
        }
      });
    });
  });
}

/**
 * Get expire status dari tanggal kadaluarsa
 */
function getExpireStatus(kadaluarsaStr) {
  if (!kadaluarsaStr) return 'unknown';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDate = parseExpiryDate(kadaluarsaStr);
  if (!expiryDate) return 'unknown';

  const daysLeft = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return 'kadaluarsa';
  if (daysLeft <= 30) return 'hampir_kadaluarsa';
  return 'aman';
}

/**
 * Parse tanggal kadaluarsa (support format OKT.27, YYYY-MM-DD, dll)
 */
function parseExpiryDate(dateStr) {
  if (!dateStr) return null;

  try {
    // Format OKT.27
    if (dateStr.includes('.')) {
      const parts = dateStr.split('.');
      if (parts.length === 2) {
        const monthMap = {
          JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, JUN: 6,
          JUL: 7, AGU: 8, SEP: 9, OKT: 10, NOV: 11, DES: 12
        };
        const month = monthMap[parts[0].toUpperCase()] || 1;
        const year = 2000 + parseInt(parts[1]);
        return new Date(year, month, 0);
      }
    }
    // ISO format atau DD-MM-YYYY
    return new Date(dateStr);
  } catch (e) {
    return null;
  }
}

/**
 * Ambil semua users APJ dan Apoteker Pendamping
 */
async function getAllUsersEmails(db) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT email, username, role FROM users WHERE role IN ('APJ', 'APOTEKER_PENDAMPING') AND email IS NOT NULL AND email != ''",
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const emails = (rows || []).map(r => r.email).filter(Boolean);
        resolve(emails);
      }
    );
  });
}

/**
 * Setup scheduler - membaca konfigurasi dari database
 * Support untuk customizable interval dan waktu via scheduler_config table
 */
function setupScheduler(db) {
  if (!isEmailConfigured()) {
    console.warn('⚠️  Scheduler VED-FEFO Email: SMTP tidak dikonfigurasi. Job tidak akan berjalan.');
    return;
  }

  let currentConfig = null;
  let job = null;

  /**
   * Re-schedule job berdasarkan config
   */
  function rescheduleJob() {
    // Hentikan job lama jika ada
    if (job && job.stop) {
      job.stop();
      job = null;
    }

    // Fetch latest config
    db.get(
      "SELECT * FROM scheduler_config WHERE config_type = 'ved_fefo_email'",
      (err, row) => {
        if (err) {
          console.error('[SCHEDULER] Error fetching config:', err);
          // Try to create config if it doesn't exist
          const { v4: uuidv4 } = require('uuid');
          const now = new Date().toISOString();
          console.log('[SCHEDULER] Attempting to create scheduler_config...');
          db.run(
            "INSERT INTO scheduler_config (id, config_type, interval_hari, enabled, email_jam, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [uuidv4(), 'ved_fefo_email', 5, true, '08:00', now, now],
            (insertErr) => {
              if (insertErr) {
                console.error('[SCHEDULER] Failed to create config:', insertErr);
              } else {
                console.log('[SCHEDULER] ✅ Config created successfully, retrying scheduler setup...');
                // Retry after creation
                rescheduleJob();
              }
            }
          );
          return;
        }

        if (!row) {
          console.warn('[SCHEDULER] ⚠️  Config ved_fefo_email tidak ditemukan di database - mencoba membuat...');
          // Try to create config if query returned no rows
          const { v4: uuidv4 } = require('uuid');
          const now = new Date().toISOString();
          db.run(
            "INSERT INTO scheduler_config (id, config_type, interval_hari, enabled, email_jam, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [uuidv4(), 'ved_fefo_email', 5, true, '08:00', now, now],
            (insertErr) => {
              if (insertErr) {
                console.error('[SCHEDULER] Failed to create config:', insertErr);
              } else {
                console.log('[SCHEDULER] ✅ Config created successfully, retrying scheduler setup...');
                // Retry after creation
                rescheduleJob();
              }
            }
          );
          return;
        }

        currentConfig = row;
        // Config loaded - removed verbose logging
        
        // Skip jika disabled
        if (!currentConfig.enabled) {
          console.log('[SCHEDULER] ⏸️  VED-FEFO Email disabled');
          return;
        }

        // Generate cron pattern dari email_jam
        // email_jam format: "HH:MM" (WIB time)
        // Convert to UTC: WIB = UTC + 7, so UTC = WIB - 7
        const [emailHour, emailMin] = (currentConfig.email_jam || '08:00').split(':').map(Number);
        const utcHour = ((emailHour - 7 + 24) % 24);
        const cronPattern = `${emailMin} ${utcHour} * * *`;

        // Create new job
        job = cron.schedule(cronPattern, async () => {
          await sendVedFefoEmail(db, currentConfig);
        });

        // Scheduler setup complete
      }
    );
  }

  /**
   * Send VED-FEFO email dengan checking interval
   */
  async function sendVedFefoEmail(db, config) {
    if (!config.enabled) {
      return;
    }

    const today = new Date();
    const lastSentDate = config.last_sent_at ? new Date(config.last_sent_at) : null;

    // Check apakah sudah waktunya untuk send (berdasarkan interval_hari)
    if (lastSentDate) {
      const daysSinceLastSent = Math.floor((today - lastSentDate) / (1000 * 60 * 60 * 24));
      if (daysSinceLastSent < config.interval_hari) {
        console.log(`[SCHEDULER] VED-FEFO email di-skip (hanya ${daysSinceLastSent} hari sejak pengiriman terakhir, interval: ${config.interval_hari} hari)`);
        return;
      }
    }

    console.log('[SCHEDULER] 🔔 Memulai pengiriman laporan VED-FEFO email...');

    try {
      // Ambil data VED-FEFO
      const { vedAnalysis, fefoRecommendations } = await getVedFefoData(db);

      // Generate HTML
      const htmlReport = generateVedFefoReport(vedAnalysis, fefoRecommendations);

      // Ambil email penerima
      const recipients = await getAllUsersEmails(db);

      if (!recipients || recipients.length === 0) {
        console.warn('[SCHEDULER] Tidak ada email APJ/Apoteker untuk mengirim laporan');
        return;
      }

      // Kirim email ke setiap penerima
      for (const email of recipients) {
        await sendMail({
          to: email,
          subject: `📋 Laporan VED-FEFO Periodic - ${new Date().toLocaleDateString('id-ID')}`,
          text: 'Laporan VED-FEFO Periodic - Silakan lihat konten HTML',
          html: htmlReport
        }, db);
        console.log(`✅ Email VED-FEFO dikirim ke ${email}`);
      }

      // Update last_sent_at di database
      const now = new Date().toISOString();
      db.run(
        "UPDATE scheduler_config SET last_sent_at = $1 WHERE config_type = $2",
        [now, 'ved_fefo_email'],
        (err) => {
          if (err) {
            console.error('[SCHEDULER] Error updating last_sent_at:', err);
          }
        }
      );

      console.log(`[SCHEDULER] ✅ Laporan VED-FEFO berhasil dikirim ke ${recipients.length} penerima`);

    } catch (err) {
      console.error('[SCHEDULER] ❌ Gagal mengirim laporan VED-FEFO:', err && err.message ? err.message : err);
    }
  }

  // Initial setup
  rescheduleJob();

  // Re-check config setiap jam (dalam kasus user update config)
  const configCheckJob = cron.schedule('0 * * * *', () => {
    console.log('[SCHEDULER] 🔄 Re-checking scheduler configuration...');
    rescheduleJob();
  });

  return { job, configCheckJob, rescheduleJob };
}

module.exports = { setupScheduler, generateVedFefoReport, getVedFefoData };
