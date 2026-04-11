# 📧 Fitur Pengaturan Scheduler Email VED-FEFO

## Overview

Fitur ini memungkinkan APJ (administrator apotek) untuk **mengatur interval dan waktu pengiriman laporan VED-FEFO** melalui dashboard tanpa perlu memodifikasi kode atau database langsung.

## Fitur Utama

✅ **Customizable Interval** - Atur berapa hari sekali laporan dikirim (1-30 hari)  
✅ **Customizable Time** - Atur jam pengiriman (00:00 - 23:59 WIB)  
✅ **Enable/Disable** - Aktifkan atau nonaktifkan pengiriman email  
✅ **Real-time Updates** - Scheduler otomatis update setiap jam untuk membaca config terbaru  
✅ **Test Email** - Kirim email test tanpa menunggu jadwal  
✅ **Dashboard UI** - Interface user-friendly untuk manage settings  

## Cara Menggunakan

### 1. Akses Pengaturan Scheduler

1. Login ke dashboard dengan akun APJ
2. Klik **"Pengaturan Email"** di sidebar (icon ⚙️)
3. Atau langsung akses: `http://localhost:3000/scheduler-settings.html`

### 2. Mengatur Interval Pengiriman

**Contoh pengaturan:**

```
✅ Aktif
📅 Interval: 5 hari
🕐 Jam Pengiriman: 08:00 WIB
```

Ini berarti laporan akan dikirim setiap 5 hari pada jam 08:00 WIB.

### 3. Simpan Pengaturan

1. Ubah nilai "Interval Pengiriman" (1-30 hari)
2. Ubah nilai "Jam Pengiriman" (HH:MM format)
3. Toggle status enable/disable jika diperlukan
4. Klik **"💾 Simpan Pengaturan"**

### 4. Test Email

Untuk memverifikasi konfigurasi email berfungsi:

1. Klik **"🚀 Kirim Email Test Sekarang"**
2. Email akan dikirim langsung ke semua APJ dan Apoteker Pendamping
3. Cek hasil pengiriman di responsive message

## Database Schema

### Tabel: scheduler_config

```sql
CREATE TABLE scheduler_config (
  id TEXT PRIMARY KEY,
  config_type TEXT UNIQUE NOT NULL,      -- 'ved_fefo_email'
  interval_hari INTEGER DEFAULT 5,       -- Interval dalam hari (1-30)
  enabled BOOLEAN DEFAULT true,          -- Aktif/nonaktif
  email_jam TEXT DEFAULT '08:00',        -- Jam pengiriman (HH:MM format WIB)
  last_sent_at TEXT,                     -- Timestamp pengiriman terakhir
  created_at TEXT,                       -- Timestamp pembuatan
  updated_at TEXT                        -- Timestamp perubahan terakhir
);
```

## API Endpoints

### GET /api/scheduler-config
Ambil semua konfigurasi scheduler.

**Request:**
```bash
GET /api/scheduler-config
Authorization: Required (authenticated user)
```

**Response:**
```json
[
  {
    "id": "uuid-123",
    "config_type": "ved_fefo_email",
    "interval_hari": 5,
    "enabled": true,
    "email_jam": "08:00",
    "last_sent_at": "2026-04-11T08:30:00.000Z",
    "created_at": "2026-04-11T00:00:00.000Z",
    "updated_at": "2026-04-11T10:00:00.000Z"
  }
]
```

### GET /api/scheduler-config/:config_type
Ambil konfigurasi scheduler spesifik.

**Request:**
```bash
GET /api/scheduler-config/ved_fefo_email
Authorization: Required (authenticated user)
```

**Response:**
```json
{
  "id": "uuid-123",
  "config_type": "ved_fefo_email",
  "interval_hari": 5,
  "enabled": true,
  "email_jam": "08:00",
  "last_sent_at": "2026-04-11T08:30:00.000Z",
  "created_at": "2026-04-11T00:00:00.000Z",
  "updated_at": "2026-04-11T10:00:00.000Z"
}
```

### PUT /api/scheduler-config/:id
Update konfigurasi scheduler.

**Request:**
```bash
PUT /api/scheduler-config/uuid-123
Authorization: Required (APJ role only)
Content-Type: application/json

{
  "interval_hari": 3,
  "enabled": true,
  "email_jam": "09:00"
}
```

**Response:**
```json
{
  "message": "Updated",
  "updated_at": "2026-04-11T10:30:00.000Z"
}
```

### POST /api/reports/send-ved-fefo-email
Kirim email laporan VED-FEFO secara manual (test).

**Request:**
```bash
POST /api/reports/send-ved-fefo-email
Authorization: Required (APJ role only)
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

## Cara Kerja Technical

### 1. Initialization

```javascript
// Server startup
app.listen(PORT, () => {
  setupScheduler(db);  // Initialize scheduler
});
```

### 2. Config Read

- Scheduler membaca config dari tabel `scheduler_config` pada startup
- Setiap jam, scheduler re-check config terbaru dari database

### 3. Job Execution

```
Cron Job setiap jam (00 * * * *)
  ↓
Check config dari database
  ↓
Jika enabled, cek interval_hari
  ↓
Jika waktunya, generate report
  ↓
Send email ke semua recipients
  ↓
Update last_sent_at di database
```

### 4. Time Conversion

Schedule menggunakan UTC time. Konversi dari WIB (UTC+7):

```javascript
// User set: "08:00 WIB"
// Convert to UTC: 08:00 - 7 = 01:00 UTC
// Cron pattern: "0 1 * * *"
```

## Files Modified

### 1. [server.js](server.js)
- ✅ Tambah create table `scheduler_config`
- ✅ Tambah function `initializeSchedulerConfig()`
- ✅ Tambah API endpoints:
  - `GET /api/scheduler-config`
  - `GET /api/scheduler-config/:config_type`
  - `PUT /api/scheduler-config/:id`
- ✅ Initialize scheduler saat startup

### 2. [utils/scheduler.js](utils/scheduler.js)
- ✅ Refactor `setupScheduler()` untuk membaca config dari database
- ✅ Tambah dynamic cron scheduling
- ✅ Tambah re-check config setiap jam
- ✅ Update `last_sent_at` di database

### 3. [public/scheduler-settings.html](public/scheduler-settings.html) - **NEW**
- ✅ Dashboard untuk manage scheduler settings
- ✅ Form untuk ubah interval dan jam
- ✅ Toggle enable/disable
- ✅ Test email feature
- ✅ Help & documentation

### 4. [public/dashboard.html](public/dashboard.html)
- ✅ Tambah link ke scheduler settings di sidebar

### 5. [package.json](package.json)
- ✅ Dependency `node-cron` (sudah ada)

## Troubleshooting

### Email tidak dikirim setelah update config?

**Solusi:**
1. Periksa apakah SMTP sudah configured di `.env`
2. Tunggu max 1 jam untuk config re-check (atau restart server)
3. Gunakan fitur test email untuk verify konfigurasi

### Timezone Error

**Problem:** Email dikirim pada jam yang salah  
**Solusi:** Pastikan timezone server di-set ke UTC atau sesuaikan perhitungan konversi

### Database Error

**Problem:** Config tidak tersimpan  
**Solusi:**
```bash
# Verify table exist
SELECT * FROM scheduler_config;

# Re-initialize jika diperlukan
DELETE FROM scheduler_config;
-- Restart server
```

## Security

✅ **Role-based Access** - Hanya APJ yang bisa update config  
✅ **CSRF Protection** - Session-based authentication  
✅ **Input Validation** - Validasi interval (1-30) dan jam (HH:MM)  
✅ **Audit Logging** - Semua perubahan di-log ke tabel logs

## Fitur Future

- [ ] Per-user email preferences
- [ ] Multiple scheduler config types (daily, weekly, monthly reports)
- [ ] Report template customization
- [ ] Conditional alerts (hanya jika ada urgent items)
- [ ] Email schedule history/analytics
- [ ] Webhook integration

## Contoh Penggunaan

### Setup - First Time

```yaml
1. Login sebagai APJ
2. Buka "Pengaturan Email"
3. Set interval: 5 hari
4. Set jam: 08:00
5. Click "Simpan Pengaturan"
6. Click "Kirim Email Test Sekarang"
7. Verify email received
```

### Update - Change Frequency

```yaml
Kasus: Ingin ubah dari 5 hari jadi 3 hari
1. Login sebagai APJ
2. Buka "Pengaturan Email"
3. Ubah interval dari 5 menjadi 3
4. Click "Simpan Pengaturan"
5. Scheduler otomatis update dalam 1 jam
```

### Disable - Maintenance

```yaml
Kasus: Matikan email sementara saat maintenance
1. Login sebagai APJ
2. Buka "Pengaturan Email"
3. Toggle OFF status pengiriman
4. Click "Simpan Pengaturan"
5. Email tidak akan dikirim sampai di-enable kembali
```

---

**Created:** 11-04-2026  
**Version:** 1.0  
**Last Updated:** 11-04-2026
