require('dotenv').config();
const { sendMail } = require('../utils/email');

(async () => {
  try {
    const info = await sendMail({
      subject: 'Tes Notifikasi Apotek',
      text: 'Ini adalah email tes dari aplikasi apotek. Jika Anda menerima ini, konfigurasi SMTP berhasil.'
    });
    console.log('EMAIL SENT OK', info && info.messageId ? info.messageId : info);
  } catch (err) {
    console.error('EMAIL ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
})();