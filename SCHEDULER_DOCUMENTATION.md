# 📋 VED-FEFO Scheduled Email Reports

## Fitur

Sistem akan otomatis mengirim laporan VED-FEFO (Vital-Essential-Desirable & First Expiry First Out) setiap **5 hari pada jam 08:00 WIB** ke semua APJ dan Apoteker Pendamping yang terdaftar di sistem.

## Cara Kerja

### Laporan Otomatis (Scheduler)
- **Jadwal:** Setiap 5 hari pada jam 08:00 WIB (01:00 UTC)
- **Penerima:** Semua user dengan role APJ atau APOTEKER_PENDAMPING yang memiliki email
- **Konten:**
  - Ringkasan obat Vital (V), Essential (E), Desirable (D)
  - Obat URGENT (sudah/hampir kadaluarsa) yang harus dijual/dibuang
  - Obat KRITIS (Vital dengan stok rendah) yang perlu dipesan ulang
  - Obat yang perlu dimonitor
  - Statistik ekspirasi
  - Rekomendasi FEFO

### Laporan Manual (untuk Testing)

Anda bisa trigger laporan kapan saja dengan POST request ke endpoint:

```
POST /api/reports/send-ved-fefo-email
Content-Type: application/json

// Memerlukan login dan role APJ
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/reports/send-ved-fefo-email \
  -H "Content-Type: application/json" \
  --cookie "obatqu.sid=YOUR_SESSION_TOKEN"
```

**Response:**
```json
{
  "message": "Email laporan VED-FEFO berhasil dikirim",
  "successCount": 2,
  "failCount": 0,
  "totalRecipients": 2,
  "recipients": ["apj@example.com", "apoteker@example.com"]
}
```

## Requirements

✅ **Node Packages:**
- `node-cron` - untuk scheduling (sudah terinstall)
- `nodemailer` - untuk sending email (sudah ada)

✅ **Environment Variables** (pastikan sudah dikonfigurasi di `.env`):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NOTIFY_FROM=your_email@gmail.com
```

✅ **Database:**
- Column `email` di table `users` harus sudah terisi untuk semua user
- Table `obat` harus memiliki: `id`, `nama`, `jumlah`, `kadaluarsa`, `ved`, `batch`, `kategori`, `deskripsi`

## Setup & Konfigurasi

### 1. Verifikasi Email Configuration
```bash
# Cek apakah SMTP sudah configured
# Jika SMTP belum configured, laporan akan disimpan ke email-fallback.log
```

### 2. Pastikan User Memiliki Email
Query database:
```sql
-- Cek user yang belum punya email
SELECT id, username, role, email FROM users WHERE email IS NULL OR email = '';

-- Update email user
UPDATE users SET email = 'apj@apotek.com' WHERE username = 'nama_user';
```

### 3. Test Manual Trigger
```bash
# Login terlebih dahulu melalui web UI atau API
# Kemudian test endpoint POST

curl -X POST http://localhost:3000/api/reports/send-ved-fefo-email \
  -H "Content-Type: application/json" \
  -H "Cookie: obatqu.sid=SESSION_ID"
```

### 4. Monitor Scheduler Logs
Saat server startup, Anda akan melihat:
```
✅ Scheduler VED-FEFO aktif - Email akan dikirim setiap 5 hari pada jam 08:00 WIB
```

Setiap kali job berjalan:
```
[SCHEDULER] 🔔 Memulai pengiriman laporan VED-FEFO email...
✅ Email VED-FEFO dikirim ke apj@example.com
✅ Email VED-FEFO dikirim ke apoteker@example.com
[SCHEDULER] ✅ Laporan VED-FEFO berhasil dikirim ke 2 penerima
```

## Troubleshooting

### Email tidak dikirim?

**1. Cek SMTP Configuration:**
```bash
# Di file .env, pastikan:
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

**2. Cek User Email:**
```bash
# Query database
SELECT COUNT(*) FROM users WHERE email IS NOT NULL AND email != '';
```

**3. Baca Logs:**
- Jika SMTP gagal, cek `email-fallback.log` untuk melihat email yang gagal dikirim
- Cek console server untuk error messages

### Scheduler tidak jalan?

**Cek Console pada saat Server Startup:**
```
✅ Scheduler VED-FEFO aktif - Email akan dikirim setiap 5 hari pada jam 08:00 WIB
```

Jika tidak muncul, berarti SMTP belum dikonfigurasi. Konfigurasi `.env` terlebih dahulu.

### Timezone Issue?

Scheduler menggunakan cron pattern `0 1 * * *` (01:00 UTC = 08:00 WIB).

Jika timezone berbeda, edit [utils/scheduler.js](utils/scheduler.js) baris:
```javascript
// Ganti pola cron sesuai timezone Anda
const job = cron.schedule('0 1 * * *', async () => {  // Sesuaikan jam di sini
```

## File Files Modified

1. **[utils/scheduler.js](utils/scheduler.js)** - NEW
   - Fungsi generate laporan HTML
   - Fetch VED-FEFO data dari database
   - Setup cron scheduler
   - Send email ke recipients

2. **[server.js](server.js)** - MODIFIED
   - Tambah require scheduler
   - Initialize scheduler saat server startup
   - Tambah endpoint POST `/api/reports/send-ved-fefo-email`

3. **[package.json](package.json)** - MODIFIED
   - Tambah dependency `node-cron`

## Fitur Tambahan di Masa Depan

- [ ] Customizable schedule (user bisa atur jam dan interval)
- [ ] Report format selection (PDF, CSV, Email)
- [ ] Recipient preferences per user
- [ ] Report history/archive
- [ ] Conditional alerts (hanya kirim jika ada item URGENT)
- [ ] Different report templates untuk APJ vs Apoteker

---

**Created:** 11-04-2026  
**Last Update:** 11-04-2026  
**Tested On:** Node.js v18+, PostgreSQL 12+
