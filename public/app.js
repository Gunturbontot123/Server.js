/* ===== AUTH & INITIAL SETUP ===== */
let currentUser = null;
let allObat = [];
let stokChart = null;

// Ensure fetch sends credentials by default (so session cookies are included)
(function(){
  if (typeof window !== 'undefined' && window.fetch) {
    const _fetch = window.fetch.bind(window);
    window.fetch = function(url, opts = {}) {
      if (!opts.credentials) opts.credentials = 'same-origin';
      return _fetch(url, opts);
    };
  }
})();

// Check auth and load user info
async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location = '/login.html'; return; }
    const data = await res.json();
    currentUser = data.user;
    document.getElementById('userAvatar').textContent = (currentUser.username || 'A')[0].toUpperCase();
    document.getElementById('userName').textContent = currentUser.username || 'User';
    await loadAllData();
  } catch (err) {
    window.location = '/login.html';
  }
}

// ===== DATA LOADING & HELPERS =====
async function loadAllData() {
  try {
    const [resObat, resLogs, resNotif] = await Promise.all([
      fetch('/api/obat'),
      fetch('/api/logs'),
      fetch('/api/notifications')
    ]);
    allObat = await resObat.json();
    const logs = await resLogs.json();
    const notif = await resNotif.json();
    
    updateDashboard();
    renderDataObatTable(allObat);
    updateCharts();
    updateVEDClassification();
    updateActivityLog(logs);
    updateReports();
    updateNotificationBadge(notif);
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// Update notification badge
function updateNotificationBadge(notifData) {
  if (notifData && notifData.total > 0) {
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = Math.min(notifData.total, 9);
      badge.style.display = 'flex';
    }
  }
}

function getExpiryStatus(kadaluarsa) {
  if (!kadaluarsa) return { key: 'baik', label: 'Baik', color: '#27ae60' };
  const d = new Date(kadaluarsa + 'T00:00:00');
  if (isNaN(d)) return { key: 'baik', label: 'Baik', color: '#27ae60' };
  const diffDays = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { key: 'kadaluarsa', label: 'Kadaluarsa', color: '#e74c3c' };
  if (diffDays <= 30) return { key: 'hampir', label: 'Hampir Kadaluarsa', color: '#f39c12' };
  return { key: 'baik', label: 'Baik', color: '#27ae60' };
}

// ===== DASHBOARD UPDATES =====
function updateDashboard() {
  const total = allObat.length;
  let expired = 0, nearExpire = 0, safe = 0;

  allObat.forEach(o => {
    const st = getExpiryStatus(o.kadaluarsa);
    if (st.key === 'kadaluarsa') expired++;
    else if (st.key === 'hampir') nearExpire++;
    else safe++;
  });

  document.getElementById('totalObat').textContent = total;
  document.getElementById('expiredCount').textContent = expired;
  document.getElementById('nearExpireCount').textContent = nearExpire;
  document.getElementById('safeStockCount').textContent = safe;
}

// ===== DATA OBAT TABLE =====
function renderDataObatTable(data) {
  const tbody = document.querySelector('#tableObat');
  tbody.innerHTML = '';
  data.forEach(o => {
    const st = getExpiryStatus(o.kadaluarsa);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.nama}</td>
      <td>${o.jumlah}</td>
      <td>${o.kadaluarsa || '—'}</td>
      <td><span class="status-badge status-${st.key}">${st.label}</span></td>
      <td><strong>${o.ved || '—'}</strong></td>
      <td>
        <button class="btn-edit" data-id="${o.id}" style="margin-right:6px;">✏️ Edit</button>
        <button class="btn-delete" data-id="${o.id}">🗑️ Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind edit/delete
  document.querySelectorAll('.btn-delete').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.closest('button').dataset.id;
      if (confirm('Hapus obat ini?')) deleteObat(id);
    });
  });

  document.querySelectorAll('.btn-edit').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.closest('button').dataset.id;
      const obat = allObat.find(o => o.id === id);
      if (!obat) return;
      const nama = prompt('Nama', obat.nama);
      if (nama === null) return;
      const jumlah = Number(prompt('Jumlah', obat.jumlah));
      if (isNaN(jumlah)) return alert('Jumlah tidak valid');
      const kadaluarsa = prompt('Kadaluarsa (YYYY-MM-DD)', obat.kadaluarsa);
      if (!kadaluarsa) return;
      updateObat(id, { nama, jumlah, kadaluarsa });
    });
  });
}

async function deleteObat(id) {
  try {
    const res = await fetch(`/api/obat/${id}`, { method: 'DELETE' });
    if (res.ok) { loadAllData(); alert('Obat dihapus'); }
    else alert('Gagal menghapus');
  } catch (err) {
    console.error('Error:', err);
  }
}

async function updateObat(id, data) {
  try {
    const res = await fetch(`/api/obat/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) { loadAllData(); alert('Obat diperbarui'); }
    else alert('Gagal memperbarui');
  } catch (err) {
    console.error('Error:', err);
  }
}

// ===== CHART UPDATES =====
function updateCharts() {
  const labels = allObat.map(o => o.nama);
  const data = allObat.map(o => o.jumlah);
  const colors = allObat.map(o => {
    const s = getExpiryStatus(o.kadaluarsa).color;
    return s;
  });

  const ctx = document.getElementById('stokChart');
  if (!ctx) return;

  if (stokChart) stokChart.destroy();

  stokChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Stok',
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.', '1.')),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      },
      plugins: {
        legend: { display: true, position: 'top' },
      }
    }
  });
}

// ===== VED CLASSIFICATION =====
function updateVEDClassification() {
  const v = allObat.filter(o => o.jumlah <= 2);
  const e = allObat.filter(o => o.jumlah > 2 && o.jumlah <= 10);
  const d = allObat.filter(o => o.jumlah > 10);

  document.getElementById('vedVList').innerHTML = v.length
    ? v.map(o => `<li>📍 ${o.nama} (${o.jumlah}) - ${o.kadaluarsa}</li>`).join('')
    : '<li style="color:#999;">Tidak ada</li>';
  document.getElementById('vedEList').innerHTML = e.length
    ? e.map(o => `<li>📍 ${o.nama} (${o.jumlah}) - ${o.kadaluarsa}</li>`).join('')
    : '<li style="color:#999;">Tidak ada</li>';
  document.getElementById('vedDList').innerHTML = d.length
    ? d.map(o => `<li>📍 ${o.nama} (${o.jumlah}) - ${o.kadaluarsa}</li>`).join('')
    : '<li style="color:#999;">Tidak ada</li>';
}

// ===== ACTIVITY LOG =====
function updateActivityLog(logs) {
  const list = document.getElementById('activityList');
  list.innerHTML = logs.slice(0, 10).length
    ? logs.slice(0, 10).map(l => `<li>[${new Date(l.time).toLocaleString()}] ${l.type.toUpperCase()}: ${l.message}</li>`).join('')
    : '<li style="color:#999;">Tidak ada aktivitas</li>';

  const logList = document.getElementById('logList');
  logList.innerHTML = logs.slice(0, 15).length
    ? logs.slice(0, 15).map(l => `<li>[${new Date(l.time).toLocaleString()}] <strong>${l.type.toUpperCase()}</strong>: ${l.message}</li>`).join('')
    : '<li style="color:#999;">Tidak ada log</li>';
}

// ===== REPORTS =====
function updateReports() {
  const expired = allObat.filter(o => getExpiryStatus(o.kadaluarsa).key === 'kadaluarsa');
  const nearExp = allObat.filter(o => getExpiryStatus(o.kadaluarsa).key === 'hampir');
  const critical = allObat.filter(o => o.jumlah <= 2);

  document.getElementById('totalStockValue').textContent = `Rp ${allObat.length * 5000}`;
  document.getElementById('criticalMedicines').textContent = `${critical.length} item`;
  document.getElementById('expireRate').textContent = Math.round((expired.length / Math.max(allObat.length, 1)) * 100) + '%';
}

// ===== FORM HANDLERS =====
document.getElementById('formTambahObat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = document.getElementById('inputNama').value;
  const jumlah = Number(document.getElementById('inputJumlah').value);
  const kadaluarsa = document.getElementById('inputKadaluarsa').value;

  try {
    const res = await fetch('/api/obat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama, jumlah, kadaluarsa })
    });
    if (res.ok) {
      document.getElementById('formTambahObat').reset();
      loadAllData();
      alert('Obat berhasil ditambahkan');
    } else {
      const err = await res.json();
      alert(err.message || 'Gagal menambahkan');
    }
  } catch (err) {
    console.error('Error:', err);
  }
});

// Keluar (FEFO)
document.getElementById('keluarBtn').addEventListener('click', async () => {
  if (!confirm('Keluar 1 unit obat (FEFO)?')) return;
  try {
    const res = await fetch('/api/keluar', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      alert(data.message);
      loadAllData();
    } else {
      const err = await res.json();
      alert(err.message || 'Gagal');
    }
  } catch (err) {
    console.error('Error:', err);
  }
});

// Masuk Obat
document.getElementById('formMasukObat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const obatId = document.getElementById('selectObatMasuk').value;
  const jumlah = Number(document.getElementById('jumlahMasuk').value);

  if (!obatId) return alert('Pilih obat terlebih dahulu');
  if (isNaN(jumlah) || jumlah < 1) return alert('Jumlah tidak valid');

  try {
    const obat = allObat.find(o => o.id === obatId);
    if (!obat) return alert('Obat tidak ditemukan');

    const newJumlah = obat.jumlah + jumlah;
    const res = await fetch(`/api/obat/${obatId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: obat.nama, jumlah: newJumlah, kadaluarsa: obat.kadaluarsa })
    });

    if (res.ok) {
      document.getElementById('formMasukObat').reset();
      loadAllData();
      alert('Obat berhasil ditambahkan ke stok');
    } else {
      alert('Gagal menambahkan stok');
    }
  } catch (err) {
    console.error('Error:', err);
  }
});

// Populate select for masuk obat
function updateSelectObat() {
  const select = document.getElementById('selectObatMasuk');
  select.innerHTML = '<option value="">-- Pilih obat --</option>';
  allObat.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.nama} (Stok: ${o.jumlah})`;
    select.appendChild(opt);
  });
}

// Export CSV
document.getElementById('exportBtn').addEventListener('click', () => {
  const csv = ['Nama,Jumlah,Kadaluarsa,VED', ...allObat.map(o => `${o.nama},${o.jumlah},${o.kadaluarsa || '—'},${o.ved || '—'}`)].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obat.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ===== FILTERING & SEARCH =====
document.getElementById('filterObatInput').addEventListener('keyup', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allObat.filter(o => o.nama.toLowerCase().includes(query));
  renderDataObatTable(filtered);
});

document.getElementById('filterStatusInput').addEventListener('change', (e) => {
  const status = e.target.value;
  let filtered = allObat;
  if (status) {
    filtered = allObat.filter(o => getExpiryStatus(o.kadaluarsa).key === status);
  }
  renderDataObatTable(filtered);
});

// ===== SIDEBAR NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    if (!section) return; // logout button

    // update active nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // show section
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById(`section-${section}`);
    if (sec) sec.classList.add('active');

    // update select dropdown for masuk obat
    if (section === 'keluar-masuk') updateSelectObat();
  });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!confirm('Logout?')) return;
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location = '/login.html';
  } catch (err) {
    console.error('Error:', err);
  }
});

// Sidebar toggle on mobile
// Sidebar toggle (three-dot modern menu)
// create overlay element (if not present in DOM, dashboard.html will include it later)
if (!document.querySelector('.sidebar-overlay')) {
  const ov = document.createElement('div');
  ov.className = 'sidebar-overlay';
  ov.tabIndex = -1;
  ov.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ov);
}

const dotMenu = document.getElementById('dotMenu');
const overlay = document.querySelector('.sidebar-overlay');
const sidebar = document.getElementById('dashboardSidebar');

function openSidebar() {
  document.body.classList.add('sidebar-visible');
  if (dotMenu) dotMenu.setAttribute('aria-expanded', 'true');
  if (sidebar) sidebar.setAttribute('aria-hidden', 'false');
  // focus first menu item for keyboard users
  const first = document.querySelector('.sidebar-nav .nav-item');
  if (first) first.focus();
}

function closeSidebar() {
  document.body.classList.remove('sidebar-visible');
  if (dotMenu) dotMenu.setAttribute('aria-expanded', 'false');
  if (sidebar) sidebar.setAttribute('aria-hidden', 'true');
  if (dotMenu) dotMenu.focus();
}

if (dotMenu) {
  dotMenu.setAttribute('aria-controls', 'dashboardSidebar');
  dotMenu.setAttribute('aria-expanded', 'false');
  dotMenu.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-visible')) closeSidebar();
    else openSidebar();
  });
  // keyboard activation
  dotMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dotMenu.click();
    }
  });
}

overlay && overlay.addEventListener('click', closeSidebar);

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('sidebar-visible')) {
    closeSidebar();
  }
});

// Close sidebar when clicking a nav-item (improves UX)
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
  item.addEventListener('click', () => {
    closeSidebar();
  });
  // allow Enter/Space to activate links when focused
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.click();
    }
  });
});

// ===== INIT =====
window.addEventListener('load', init);
