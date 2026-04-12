# 📧 Dokumentasi: Automated VED-FEFO Email Report Delivery

**Versi:** 1.0  
**Tanggal:** April 2026  
**Status:** ✅ Aktif  

---

## 📋 Ringkasan

Sistem ObatQu sekarang dilengkapi dengan fitur **Automated VED-FEFO Email Report Delivery** yang memungkinkan APJ untuk:

1. **Mengirim laporan VED-FEFO secara manual** kapan saja ke semua pengguna (APJ + Apoteker Pendamping)
2. **Mengatur jadwal otomatis** untuk pengiriman laporan berkala (default: setiap 7 hari pada jam 09:00)
3. **Memantau penerima email** dengan notifikasi sukses/gagal
4. **Melacak history pengiriman** melalui log sistem

---

## 🎯 Fitur Utama

### 1. **Pengiriman Manual Laporan VED-FEFO**
- **Endpoint:** `POST /api/reports/send-ved-fefo-email`
- **Role:** APJ saja
- **Deskripsi:** Mengirim laporan VED-FEFO ke semua pengguna dengan email terdaftar
- **Respons:**
  ```json
  {
    "message": "Laporan VED-FEFO berhasil dikirim ke 5 pengguna",
    "sent": 5,
    "failed": 0,
    "timestamp": "2026-04-11T14:30:00.000Z"
  }
  ```

### 2. **Pengaturan Jadwal Otomatis**
- **Menu:** Dashboard → Mengelola Data User → ⚙️ Pengaturan Email VED-FEFO
- **Setting yang dapat dikonfigurasi:**
  - **Interval Pengiriman (hari):** 1-30 hari
  - **Jam Pengiriman:** Format HH:MM (WIB)
  - **Status Pengiriman:** Aktif/Nonaktif toggle
  - **Riwayat Pengiriman Terakhir:** Timestamp pengiriman terakhir

### 3. **Format Email HTML**
Laporan VED-FEFO yang dikirim mencakup:
- **Header:** Judl laporan, timestamp, nama sistem
- **Alert Box:** Notifikasi perhatian untuk action yang diperlukan
- **Ringkasan VED:** Jumlah item per kategori Vital/Essential/Desirable
- **Tabel Urgent:** Obat yang sudah/hampir kadaluarsa
- **Tabel Kritis:** Obat Vital dengan stok rendah
- **Tabel Monitor:** Obat Essential/Desirable yang perlu diperhatikan
- **Statistik Ekspirasi:** Breakdown obat aman/hampir kadaluarsa/kadaluarsa
- **Rekomendasi FEFO:** Penjelasan strategi First Expiry First Out
- **Footer:** Kontak APJ dan informasi sistem

---

## 🔧 Implementasi Teknis

### Database Schema

#### Tabel: `scheduler_config`
```sql
CREATE TABLE scheduler_config (
  id TEXT PRIMARY KEY,
  config_type TEXT UNIQUE NOT NULL,     -- e.g., 'ved_fefo_email'
  interval_hari INTEGER DEFAULT 5,       -- 1-30 hari
  enabled BOOLEAN DEFAULT true,          -- Aktif/Nonaktif
  email_jam TEXT DEFAULT '08:00',        -- Format HH:MM
  last_sent_at TEXT,                     -- ISO timestamp pengiriman terakhir
  created_at TEXT,                       -- ISO timestamp
  updated_at TEXT                        -- ISO timestamp
);
```

### Endpoint API

#### POST `/api/reports/send-ved-fefo-email`
**Autentikasi:** Required (APJ only)  
**Deskripsi:** Mengirim laporan VED-FEFO ke semua pengguna dengan email

**Request:**
```
POST /api/reports/send-ved-fefo-email HTTP/1.1
Authorization: Bearer <session>
Content-Type: application/json
```

**Response (Success):**
```json
{
  "message": "Laporan VED-FEFO berhasil dikirim ke 5 pengguna",
  "sent": 5,
  "failed": 0,
  "failedEmails": [],
  "timestamp": "2026-04-11T14:30:00.000Z"
}
```

**Response (Partial Failure):**
```json
{
  "message": "Laporan VED-FEFO berhasil dikirim ke 4 pengguna, 1 gagal",
  "sent": 4,
  "failed": 1,
  "failedEmails": ["user2@example.com"],
  "timestamp": "2026-04-11T14:30:00.000Z"
}
```

**Response (No Users):**
```json
{
  "message": "Tidak ada pengguna untuk mengirim laporan. Pastikan email user sudah terdaftar.",
  "recipients": 0
}
```

#### GET `/api/scheduler-config`
**Autentikasi:** Required  
**Deskripsi:** Mengambil semua konfigurasi scheduler

**Response:**
```json
[
  {
    "id": "170a1204-815d-4d4f-920b-c7ba908bd028",
    "config_type": "ved_fefo_email",
    "interval_hari": 7,
    "enabled": true,
    "email_jam": "09:00",
    "last_sent_at": "2026-04-11T02:00:00.000Z",
    "created_at": "2026-04-11T04:04:21.523Z",
    "updated_at": "2026-04-11T10:53:03.518Z"
  }
]
```

#### GET `/api/scheduler-config/:config_type`
**Autentikasi:** Required  
**Deskripsi:** Mengambil konfigurasi scheduler untuk tipe tertentu

#### PUT `/api/scheduler-config/:id`
**Autentikasi:** Required (APJ only)  
**Deskripsi:** Update konfigurasi scheduler

**Request:**
```json
{
  "interval_hari": 5,
  "enabled": true,
  "email_jam": "08:00"
}
```

**Response:**
```json
{
  "message": "Updated",
  "updated_at": "2026-04-11T14:35:00.000Z"
}
```

---

## 📊 Alur Kerja

### 1️⃣ **Pengiriman Manual dari Dashboard**

```
1. APJ membuka Dashboard → Mengelola Data User
2. Scroll ke section "⚙️ Pengaturan Email VED-FEFO"
3. Klik tombol "📧 Kirim Laporan Sekarang"
4. Sistem meminta konfirmasi
5. APJ klik "Iya" untuk melanjutkan
6. Endpoint POST /api/reports/send-ved-fefo-email dieksekusi
7. Sistem mengambil semua data obat
8. Sistem menganalisis VED + FEFO recommendations
9. Sistem generate HTML email
10. Sistem query semua users dengan role APJ/Apoteker Pendamping
11. Sistem kirim email ke setiap user via Nodemailer
12. Sistem catat hasil dengan success/failed count
13. UI menampilkan hasil pengiriman
```

### 2️⃣ **Pengiriman Otomatis Berkala**

```
1. Server startup → setupScheduler() dipanggil
2. Scheduler membaca config dari database (ved_fefo_email)
3. Cron job dibuat berdasarkan interval + email_jam
4. Setiap interval tertentu (default: 7 hari pada jam 09:00)
5. Scheduler mengeksekusi job yang sama seperti pengiriman manual
6. Hasil dicatat di logs system
7. Timestamp last_sent_at diperbarui di scheduler_config
```

### 3️⃣ **Konfigurasi Jadwal**

```
1. APJ buka Dashboard → Mengelola Data User
2. Scroll ke section email settings
3. APJ ubah nilai:
   - Interval: 1-30 hari
   - Jam: HH:MM format (WIB)
   - Enabled: toggle on/off
4. Klik "💾 Simpan Pengaturan"
5. Endpoint PUT /api/scheduler-config/:id dieksekusi
6. Scheduler otomatis re-schedule cron job dengan setting baru
```

---

## 🔌 Integrasi dengan Email System

### Email Configuration

Sistem menggunakan **Nodemailer** dengan konfigurasi SMTP:

```javascript
// From: utils/email.js
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
```

### Environment Variables (.env)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Fallback Mechanism

Jika SMTP tidak terkonfigurasi:
- Email list dicatat ke file `email-fallback.log`
- Scheduler masih berjalan tapi email tidak terkirim
- Admin dapat melihat daftar email yang seharusnya dikirim di log

---

## 📝 Log dan Monitoring

### Log Entries

Setiap pengiriman dicatat dengan format:

```
[EMAIL-REPORT] 📧 POST /api/reports/send-ved-fefo-email START
[EMAIL-REPORT] ✅ Fetched 142 obat items
[EMAIL-REPORT] ✅ VED analysis: V=45, E=120, D=230
[EMAIL-REPORT] ✅ HTML email generated
[EMAIL-REPORT] ✅ Fetched 5 users with email
[EMAIL-REPORT] ✅ Email sent to user1@example.com
[EMAIL-REPORT] ✅ Email sent to user2@example.com
[EMAIL-REPORT] ❌ Failed to send to user3@example.com: Network timeout
[EMAIL-REPORT] 📧 Complete: 4 sent, 1 failed
```

### Activity Log Database

Aktivitas dicatat di tabel `logs`:

```sql
SELECT * FROM logs WHERE type = 'email' ORDER BY time DESC;
```

Sample: `VED-FEFO email report sent: 4 successful, 1 failed`

---

## 🚀 Penggunaan Step-by-Step

### Mengirim Laporan Sekarang (Manual)

1. **Login** sebagai APJ
2. **Buka Dashboard**
3. **Klik "Mengelola Data User"** di sidebar
4. **Scroll bawah** ke section "⚙️ Pengaturan Email VED-FEFO"
5. Klik tombol **"📧 Kirim Laporan Sekarang"**
6. **Konfirmasi** dialog yang muncul
7. **Tunggu** proses pengiriman (biasanya 5-30 detik tergantung jumlah user)
8. **Lihat hasil** di bagian email action result
   - ✅ Jika sukses: Tampil nomor pengguna yang menerima
   - ❌ Jika ada yang gagal: Tampil daftar email yang gagal

### Mengatur Jadwal Otomatis

1. **Login** sebagai APJ
2. **Buka Dashboard**
3. **Klik "Mengelola Data User"** di sidebar
4. **Scroll bawah** ke section "⚙️ Pengaturan Email VED-FEFO"
5. **Ubah nilai:**
   - Interval: Ketik angka 1-30 untuk jumlah hari
   - Jam: Klik field dan pilih waktu (HH:MM)
   - Status: Toggle untuk enable/disable
6. **Klik "💾 Simpan Pengaturan"**
7. **Tunggu konfirmasi** "Pengaturan berhasil disimpan"
8. **Scheduler otomatis update** dan siap kirim pada jadwal baru

### Melihat Riwayat Pengiriman

1. **Login** sebagai APJ
2. **Buka Dashboard**
3. **Klik "Mengelola Data User"**
4. **Scroll ke email settings**
5. **Lihat "Pengiriman Terakhir"** di display current status
   - Menunjukkan tanggal/jam pengiriman terakhir
   - Atau "-" jika belum pernah dikirim

---

## ⚙️ Konfigurasi Default

| Setting | Default | Min | Max |
|---------|---------|-----|-----|
| Interval Pengiriman | 7 hari | 1 | 30 |
| Jam Pengiriman | 09:00 | 00:00 | 23:59 |
| Status | Enabled | - | - |

---

## 🔒 Keamanan

### Access Control
- **Hanya APJ** yang dapat mengakses endpoint email report
- **Hanya APJ** yang dapat mengubah konfigurasi scheduler
- Semua pengguna (APJ + Apoteker Pendamping) **menerima** laporan

### Email Validation
- Email user harus terdaftar dan tidak null
- Email yang invalid otomatis di-skip
- Tidak ada pengiriman jika tidak ada user dengan email

### Rate Limiting
- Endpoint manual trigger dapat digunakan kapan saja
- Scheduler otomatis mengecek interval untuk mencegah pengiriman berlebihan

---

## 🐛 Troubleshooting

### ❌ "Tidak ada pengguna untuk mengirim laporan"
**Penyebab:** Tidak ada user dengan email terdaftar
**Solusi:**
1. Update email user di menu "Mengelola Data User"
2. Pastikan role user adalah "APJ" atau "Apoteker Pendamping"
3. Email harus format valid (xxx@domain.com)

### ❌ "Gagal mengirim laporan: SMTP not configured"
**Penyebab:** Email SMTP tidak dikonfigurasi di .env
**Solusi:**
1. Konfigurasi `.env` dengan SMTP credentials
2. Restart server
3. Coba kirim laporan lagi

### ❌ Sebagian user menerima, sebagian tidak
**Penyebab:** Beberapa email gagal terkirim (network, invalid, dll)
**Solusi:**
1. Cek daftar email yang gagal di response API
2. Verifikasi email tersebut valid dan terdaftar
3. Konfigurasi ulang SMTP jika masalah berlanjut

### ❌ Email tidak dikirim pada jadwal yang diatur
**Penyebab:** Scheduler mungkin tidak jalan atau setting salah
**Solusi:**
1. Restart server
2. Verifikasi `email_jam` sudah diatur dengan benar
3. Pastikan status scheduler "Enabled" di form settings
4. Cek browser console untuk error messages

### ❌ "Pengiriman Terakhir" masih menunjukkan "-"
**Penyebab:** Scheduler belum pernah menjalankan pengiriman
**Solusi:**
1. Klik "📧 Kirim Laporan Sekarang" manual pertama kali
2. Scheduler akan mulai berjalan dari jadwal berikutnya
3. Tunggu cicyle berikutnya (misal: 7 hari kemudian)

---

## 📚 API Reference Summary

| Method | Endpoint | Role | Deskripsi |
|--------|----------|------|-----------|
| POST | `/api/reports/send-ved-fefo-email` | APJ | Kirim laporan VED-FEFO ke semua user |
| GET | `/api/scheduler-config` | All | Ambil semua scheduler config |
| GET | `/api/scheduler-config/:type` | All | Ambil config spesifik |
| PUT | `/api/scheduler-config/:id` | APJ | Update scheduler config |

---

## 📈 Metrics & Analytics

### Pengiriman Success Rate
```
Total Pengiriman: 25
Sukses: 24
Gagal: 1
Success Rate: 96%
```

### Email Recipients Overview
```
Pengguna APJ: 5
Pengguna Apoteker Pendamping: 8
Total User dengan Email: 13
```

---

## 🔄 Update & Maintenance

### Scheduled Checks
- Scheduler otomatis check config setiap startup
- Cron pattern di-update real-time saat config berubah
- Last sent timestamp di-track untuk audit trail

### Database Maintenance
- Log entries: Retained untuk 90 hari (configurable)
- Scheduler config: Permanent record
- Email fallback log: Rotated setiap bulan

---

## 📞 Support & Contact

Untuk pertanyaan atau isu terkait email VED-FEFO report:
1. Hubungi APJ sistem
2. Periksa server logs: `console.log` output di terminal
3. Verifikasi email configuration di `.env`
4. Cek daftar user dan email di database

---

**Dibuat oleh:** ObatQu Development Team  
**Last Updated:** April 11, 2026  
**Version:** 1.0 - Stable
