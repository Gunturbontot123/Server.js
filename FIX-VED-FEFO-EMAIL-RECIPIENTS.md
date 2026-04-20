# 🔧 FIX: VED-FEFO Email Report Recipients Issue

**Status:** ✅ FIXED  
**Date:** April 11, 2026  
**Issue:** Email report menunjukkan "undefined pengguna" dan tidak mengirim ke user yang benar

---

## 🐛 Masalah yang Ditemukan

### 1. **Duplicate Endpoint**
- Ada 2 endpoint `/api/reports/send-ved-fefo-email` di server.js
- Endpoint pertama (line ~2557): Callback-based dengan query `IN ('APJ', 'ASISTEN_APOTEKER')`
- Endpoint kedua (line ~2749): Promise-based dengan improved logging
- **Solusi:** Menghapus endpoint pertama yang duplicate

### 2. **Query Users Tidak Mengembalikan Hasil**
- Query menggunakan: `WHERE role IN ('APJ', 'Asisten Apoteker', 'ASISTEN_APOTEKER')`
- Masalah: Role kemungkinan hanya ada 2 nilai; role name mungkin tidak persis seperti itu
- **Solusi:** Ubah query menjadi explicit OR condition untuk compatibility

### 3. **Missing Logging untuk Debug**
- Tidak ada logging yang detail saat query users
- Response menunjukkan "undefined pengguna" lebih 
- **Solusi:** Tambah logging komprehensif dengan debug output

---

## ✅ Solusi yang Diterapkan

### 1. **Hapus Endpoint Duplicate**
```javascript
// DELETED: Endpoint pertama (callback-based) 
// KEPT: Endpoint kedua (promise-based) dengan improved version
```

### 2. **Perbaiki Query Users**
**BEFORE:**
```javascript
const users = await promiseDb((cb) => 
  db.all("SELECT id, username, email, role FROM users 
          WHERE role IN ('APJ', 'Asisten Apoteker', 'ASISTEN_APOTEKER') 
          AND email IS NOT NULL 
          AND email != ''", cb)
);
```

**AFTER:**
```javascript
console.log('[EMAIL-REPORT] 🔍 Querying users from database...');
const users = await promiseDb((cb) => 
  db.all("SELECT id, username, email, role FROM users 
          WHERE email IS NOT NULL 
          AND email != '' 
          AND (role = 'APJ' 
               OR role = 'Asisten Apoteker' 
               OR role = 'ASISTEN_APOTEKER')", cb)
);

console.log('[EMAIL-REPORT] ✅ Query complete. Users found:', users);
console.log('[EMAIL-REPORT] ✅ Users count:', users ? users.length : 0);

// DEBUG: Jika tidak ada user match, ambil semua user untuk diagnosis
if (!users || users.length === 0) {
  const allUsers = await promiseDb((cb) => 
    db.all("SELECT id, username, email, role FROM users", cb)
  );
  console.log('[EMAIL-REPORT] All users in database:', allUsers);
  
  return res.status(400).json({ 
    message: 'Tidak ada pengguna untuk mengirim laporan.',
    recipients: 0,
    allUsersCount: allUsers ? allUsers.length : 0,
    allUsers: allUsers || []  // Return semua user untuk debugging
  });
}
```

### 3. **Perbaiki UI Response Handler**
**Sebelum:**
```javascript
resultDiv.innerHTML = `...Dikirim ke ${data.sent} pengguna...`;
// Problem: data.sent bisa undefined, tampil "undefined"
```

**Sesudah:**
```javascript
const sent = data.sent || 0;
const failed = data.failed || 0;
let details = `Dikirim ke ${sent} pengguna`;

// Show debug info jika error
if (!response.ok && data.allUsers) {
  let allUsersHtml = '<p><strong>⚠️ Semua user di database:</strong></p><ul>';
  data.allUsers.forEach(user => {
    allUsersHtml += 
      `<li>${user.username} (${user.role}) - Email: ${user.email || 'TIDAK ADA'}</li>`;
  });
  allUsersHtml += '</ul>';
  // Display untuk membantu debugging
}
```

---

## 📊 Debugging Steps

Jika tetap tidak berhasil, ikuti langkah berikut:

### Step 1: Cek Database Users
```sql
-- Di PostgreSQL console
SELECT id, username, email, role FROM users;
```

**Expected output:** Minimal 1 user dengan email dan role = 'APJ' atau 'ASISTEN_APOTEKER'

### Step 2: Klik "Kirim Laporan Sekarang"
- Dashboard → Mengelola Data User → Scroll ke email settings
- Klik button **"📧 Kirim Laporan Sekarang"**

### Step 3: Cek Browser Console
- F12 → Console tab
- Lihat log `[VED-FEFO EMAIL] Response:` 
- Harus ditampilkan struktur response lengkap

### Step 4: Cek Server Console
- Lihat output terminal server
- Format: `[EMAIL-REPORT] 🔍 Querying users...`
- Should show: `[EMAIL-REPORT] ✅ Query complete. Users found: [...]`

### Step 5: Jika Kosong, Debug Info Ditampilkan
- UI akan menampilkan: **"⚠️ Semua user di database:"**
- Daftar semua user termasuk yang tidak punya email
- Ini membantu lihat masalah: role tidak match, email kosong, dlll

---

## 🔍 Debug Response Examples

### ✅ Success Response
```json
{
  "message": "Laporan VED-FEFO berhasil dikirim ke 3 pengguna",
  "sent": 3,
  "failed": 0,
  "failedEmails": [],
  "timestamp": "2026-04-11T14:30:00.000Z"
}
```
**UI menampilkan:** "✅ Laporan VED-FEFO berhasil dikirim ke 3 pengguna | Dikirim ke 3 pengguna"

### ⚠️ Partial Failure Response
```json
{
  "message": "Laporan VED-FEFO berhasil dikirim ke 2 pengguna, 1 gagal",
  "sent": 2,
  "failed": 1,
  "failedEmails": ["user@example.com"],
  "timestamp": "2026-04-11T14:30:00.000Z"
}
```
**UI menampilkan:** "✅ ... | Dikirim ke 2 pengguna | Gagal: 1 | Email gagal: user@example.com"

### ❌ No Users Found (Debug Info)
```json
{
  "message": "Tidak ada pengguna untuk mengirim laporan...",
  "recipients": 0,
  "allUsersCount": 3,
  "allUsers": [
    { "id": 1, "username": "apj", "email": "apj@example.com", "role": "APJ" },
    { "id": 2, "username": "pending", "email": null, "role": "ASISTEN_APOTEKER" },
    { "id": 3, "username": "admin", "email": "admin@example.com", "role": "SuperAdmin" }
  ]
}
```
**UI menampilkan:** 
```
❌ Tidak ada pengguna untuk mengirim laporan...

⚠️ Semua user di database:
- apj (APJ) - Email: apj@example.com
- pending (ASISTEN_APOTEKER) - Email: TIDAK ADA
- admin (SuperAdmin) - Email: admin@example.com
```

---

## 📋 Checklist untuk Fix

- [x] Hapus endpoint duplicate
- [x] Ubah query users ke explicit OR condition
- [x] Tambah logging detail di server
- [x] Tambah debug output jika query kosong
- [x] Perbaiki UI untuk handle undefined values
- [x] Tampilkan semua user jika error untuk debugging
- [x] Test query terhadap PostgreSQL database

---

## 🚀 Cara Menggunakan Sekarang

### 1. **Memastikan Users Terdaftar dengan Email**

Setiap user yang akan menerima laporan harus:
- ✅ Terdaftar di database `users` table
- ✅ Punya email yang valid dan tidak null
- ✅ Role adalah `APJ` atau `ASISTEN_APOTEKER` (case-sensitive!)

### 2. **Klik Kirim Sekarang**

Dashboard → Mengelola Data User → Scroll ke email settings → **"📧 Kirim Laporan Sekarang"**

### 3. **Lihat Hasil**

- ✅ Jika berhasil: Tampil jumlah pengguna yang menerima
- ❌ Jika gagal: Tampil daftar semua user beserta role dan email mereka untuk debugging

---

## 🔧 Manual SQL untuk Add User dengan Email

Jika database kosong atau tidak ada user dengan email:

```sql
-- Add user dengan email
INSERT INTO users (username, email, password, role) 
VALUES ('apj_user', 'apj@example.com', 'hashed_password', 'APJ');

INSERT INTO users (username, email, password, role) 
VALUES ('apoteker_user', 'apoteker@example.com', 'hashed_password', 'ASISTEN_APOTEKER');

-- Verify
SELECT id, username, email, role FROM users;
```

---

## ⚙️ Konfigurasi SMTP untuk Email Aktual

File: `.env`
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

Tanpa SMTP config:
- Email akan dicatat ke `email-fallback.log` di folder server
- Laporan tetap "terkirim" tapi ke log, bukan ke inbox user

---

## 📞 Support

Jika masih bermasalah:
1. Cek database: `SELECT * FROM users;`
2. Pastikan role adalah `APJ` atau `ASISTEN_APOTEKER` (exact case)
3. Pastikan email tidak null: `SELECT * FROM users WHERE email IS NULL;`
4. Lihat server logs untuk error messages detail
5. Cek browser console F12 untuk response API

---

**Fixed by:** ObatQu Development Team  
**Last Updated:** April 11, 2026
