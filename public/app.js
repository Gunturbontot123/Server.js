/* ===== AUTH & INITIAL SETUP ===== */
let currentUser = null;
let allObat = [];
let stokChart = null;
// When the page is opened from the file system (file://) we need an absolute API base
const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
const LOGIN_URL = API_BASE ? `${API_BASE}/login.html` : '/login.html';

// Ensure fetch sends credentials by default (so session cookies are included)
(function(){
  if (typeof window !== 'undefined' && window.fetch) {
    const _fetch = window.fetch.bind(window);
    window.fetch = function(url, opts = {}) {
      // Always include credentials so session cookies work for localhost and file:// usage.
      if (!opts.credentials) opts.credentials = 'include';

      // prefix relative URLs with API_BASE when necessary (helps when opened via file://)
      let target = url;
      try {
        if (typeof url === 'string' && !/^https?:\/\//i.test(url) && !url.startsWith('data:') && API_BASE) {
          target = API_BASE + url;
        }
      } catch (err) {
        // fallback to original url
        target = url;
      }

      return _fetch(target, opts);
    };
  }
})();

function redirectToLogin() {
  window.location = LOGIN_URL;
}

async function fetchOptionalJson(url, fallbackValue, normalize = (value) => value) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallbackValue;
    const data = await res.json();
    return normalize(data);
  } catch (err) {
    return fallbackValue;
  }
}

// Check auth and load user info
async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      redirectToLogin();
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    document.getElementById('userAvatar').textContent = (currentUser.username || 'A')[0].toUpperCase();
    document.getElementById('userName').textContent = currentUser.username || 'User';
    await loadCategories();
    await loadAllData();
  } catch (err) {
    redirectToLogin();
  }
}

// Load kategori options from server and populate selects
async function loadCategories() {
  try {
    const res = await fetch('/api/kategori');
    if (!res.ok) return;
    const data = await res.json();
    const cats = data.categories || [];

    const input = document.getElementById('inputKategori');
    const filter = document.getElementById('filterKategoriInput');
    if (input) {
      // keep a placeholder option
      input.innerHTML = '<option value="">-- Pilih jenis --</option>' + cats.map(c => `<option>${c}</option>`).join('');
    }
    if (filter) {
      filter.innerHTML = '<option value="">Semua Jenis</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load kategori', err);
  }
}

// ===== DATA LOADING & HELPERS =====
async function loadAllData() {
  try {
    const resObat = await fetch('/api/obat');
    if (!resObat.ok) throw new Error('Gagal memuat /api/obat');
    const obatData = await resObat.json();
    allObat = Array.isArray(obatData) ? obatData : [];

    // Optional endpoints: dashboard remains functional even if one endpoint fails.
    const logs = await fetchOptionalJson('/api/logs', [], (value) => Array.isArray(value) ? value : []);
    const notif = await fetchOptionalJson(
      '/api/notifications',
      { total: 0 },
      (value) => (value && typeof value === 'object') ? value : { total: 0 }
    );
    
    updateDashboard();
    renderDataObatTable(allObat);
    updateCharts();
    updateVEDClassification();
    updateActivityLog(logs);
    updateReports();
    updateNotificationBadge(notif);
  } catch (err) {
    console.error('Error loading data:', err);
    allObat = [];
    updateDashboard();
    renderDataObatTable([]);
    updateCharts();
    updateActivityLog([]);
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
      <td>${o.batch || '—'}</td>
      <td>${o.kategori || '—'}</td>
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
      const kategori = prompt('Kategori (TABLET BEBAS, TABLET KERAS, SIRUP, SALEP, ETALASE LUAR)', obat.kategori || 'TABLET BEBAS');
      if (kategori === null) return;
      const batch = prompt('Batch / Lot (opsional)', obat.batch || '');
      if (batch === null) return;
      updateObat(id, { nama, jumlah, kadaluarsa, kategori, batch });
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
  // Keep dashboard readable: show top 20 stock items in descending order.
  const topStock = [...allObat]
    .sort((a, b) => Number(b.jumlah || 0) - Number(a.jumlah || 0))
    .slice(0, 20);

  const labels = topStock.map(o => o.nama);
  const data = topStock.map(o => Number(o.jumlah || 0));
  const colors = topStock.map(o => {
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
        label: 'Jumlah Stok (Top 20)',
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
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { autoSkip: false } }
      },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: (context) => `Stok: ${context.parsed.x}`
          }
        }
      }
    }
  });
}

// ===== VED CLASSIFICATION =====
function updateVEDClassification() {
  // classify by V/E/D then rank by earliest expiry (FEFO within each VED)
  function classifyVED(n) {
    const v = parseInt(n || 0, 10);
    if (v <= 2) return 'V';
    if (v <= 10) return 'E';
    return 'D';
  }

  function toDate(kadaluarsa) {
    if (!kadaluarsa) return null;
    const d = new Date(kadaluarsa + 'T00:00:00');
    if (isNaN(d)) return null;
    return d;
  }

  function daysLeft(kadaluarsa) {
    const d = toDate(kadaluarsa);
    if (!d) return null;
    const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  const groups = { V: [], E: [], D: [] };
  allObat.forEach(o => {
    const ved = o.ved || classifyVED(o.jumlah);
    groups[ved] = groups[ved] || [];
    groups[ved].push(o);
  });

  // sort each group by expiry ascending (earliest first). Items without expiry go last.
  Object.keys(groups).forEach(k => {
    groups[k].sort((a, b) => {
      const da = toDate(a.kadaluarsa);
      const db = toDate(b.kadaluarsa);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  });

  function renderList(arr, limit) {
    if (!arr || !arr.length) return '<li style="color:#999;">Tidak ada</li>';
    const list = (limit && limit > 0) ? arr.slice(0, limit) : arr;
    return list.map((o, idx) => {
      const dl = daysLeft(o.kadaluarsa);
      const dlText = dl == null ? '—' : (dl < 0 ? `${Math.abs(dl)} hari lalu` : `${dl} hari`);
      // urgency badge: kadaluarsa -> urgent, hampir -> warning, else safe
      let badgeClass = 'safe';
      if (dl != null) {
        if (dl < 0) badgeClass = 'urgent';
        else if (dl <= 30) badgeClass = 'warning';
      }
      return `
        <li>
          <div class="rank-badge ${badgeClass}">${idx + 1}</div>
          <div class="ved-item-text"><strong>${o.nama}</strong> — ${o.jumlah} unit<br/><small>Kadaluarsa: ${o.kadaluarsa || '—'} (${dlText})</small></div>
        </li>`;
    }).join('');
  }

  // read top-n selector (0 = all)
  let topN = 10;
  try {
    const sel = document.getElementById('vedTopN');
    if (sel) topN = Number(sel.value) || 0;
  } catch (e) { topN = 10; }

  document.getElementById('vedVList').innerHTML = renderList(groups.V, topN);
  document.getElementById('vedEList').innerHTML = renderList(groups.E, topN);
  document.getElementById('vedDList').innerHTML = renderList(groups.D, topN);
}

// ===== ACTIVITY LOG =====
function updateActivityLog(logs) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const getTypeLabel = (type) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('obat')) return 'OBAT';
    if (t.includes('auth') || t.includes('login')) return 'AUTH';
    if (t.includes('user')) return 'USER';
    return (type || 'LOG').toString().toUpperCase();
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID');
  };

  const list = document.getElementById('activityList');
  list.innerHTML = safeLogs.slice(0, 10).length
    ? safeLogs.slice(0, 10).map(l => `
      <li class="activity-item">
        <span class="activity-type">${getTypeLabel(l.type)}</span>
        <div class="activity-main">
          <div class="activity-message">${l.message || '-'}</div>
          <small class="activity-time">${formatTime(l.time)}</small>
        </div>
      </li>
    `).join('')
    : '<li style="color:#999;">Tidak ada aktivitas</li>';

  const logList = document.getElementById('logList');
  logList.innerHTML = safeLogs.slice(0, 15).length
    ? safeLogs.slice(0, 15).map(l => `<li>[${formatTime(l.time)}] <strong>${getTypeLabel(l.type)}</strong>: ${l.message}</li>`).join('')
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
  const kategori = document.getElementById('inputKategori').value;
  const batch = document.getElementById('inputBatch') ? document.getElementById('inputBatch').value : '';

  try {
    const res = await fetch('/api/obat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama, jumlah, kadaluarsa, kategori, batch })
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
      body: JSON.stringify({ nama: obat.nama, jumlah: newJumlah, kadaluarsa: obat.kadaluarsa, kategori: obat.kategori })
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
    opt.textContent = `${o.nama} [${o.batch || '-'}] (${o.kategori || '—'}) - Stok: ${o.jumlah}`;
    select.appendChild(opt);
  });
}

// Export CSV
document.getElementById('exportBtn').addEventListener('click', () => {
  const csvHeader = 'Nama,Batch,Kategori,Jumlah,Kadaluarsa,VED';
  const csvRows = allObat.map(o => `${o.nama},${(o.batch||'')},${(o.kategori||'—')},${o.jumlah},${o.kadaluarsa || '—'},${o.ved || '—'}`);
  const csv = [csvHeader, ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obat.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ===== FILTERING & SEARCH =====
function applyFilters() {
  const q = (document.getElementById('filterObatInput').value || '').toLowerCase();
  const status = document.getElementById('filterStatusInput').value;
  const kategori = document.getElementById('filterKategoriInput').value;

  let filtered = allObat.slice();
  if (q) filtered = filtered.filter(o => (o.nama || '').toLowerCase().includes(q));
  if (status) filtered = filtered.filter(o => getExpiryStatus(o.kadaluarsa).key === status);
  if (kategori) filtered = filtered.filter(o => (o.kategori || '').toLowerCase() === kategori.toLowerCase());
  renderDataObatTable(filtered);
}

document.getElementById('filterObatInput').addEventListener('keyup', applyFilters);
document.getElementById('filterStatusInput').addEventListener('change', applyFilters);
const fk = document.getElementById('filterKategoriInput');
if (fk) fk.addEventListener('change', applyFilters);

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
    if (section === 'keluar' || section === 'keluar-masuk') updateSelectObat();
  });
});

// Sidebar description behaviour: update description box on hover/focus
const sidebarDescEl = document.getElementById('sidebarDesc');
document.querySelectorAll('.nav-item').forEach(it => {
  const desc = it.dataset.desc || '';
  it.addEventListener('mouseenter', () => { if (sidebarDescEl && desc) sidebarDescEl.textContent = desc; });
  it.addEventListener('focus', () => { if (sidebarDescEl && desc) sidebarDescEl.textContent = desc; });
  it.addEventListener('mouseleave', () => { if (sidebarDescEl) sidebarDescEl.textContent = document.querySelector('.nav-item.active')?.dataset.desc || '' });
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

// ===== WELCOME POPUP LOGIC =====
function showWelcomePopup() {
  try {
    const keySeen = 'seenWelcomePopup_v1';
    const keyShow = 'showWelcomeOnNextVisit';

    const shouldShow = localStorage.getItem(keyShow);
    if (!shouldShow) return; // only show when set by login

    // remove the trigger so it only triggers once per login
    try { localStorage.removeItem(keyShow); } catch (e) {}

    const seen = localStorage.getItem(keySeen);
    if (seen) return; // user opted out permanently

    const overlay = document.getElementById('welcomeOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    // animate modal card
    const modalEl = overlay.querySelector('.modal');
    if (modalEl) {
      modalEl.classList.remove('opening');
      // trigger reflow then add class to animate
      void modalEl.offsetWidth;
      modalEl.classList.add('opening');
      modalEl.addEventListener('animationend', () => modalEl.classList.remove('opening'), { once: true });
    }

    const closeBtn = document.getElementById('closeWelcome');
    const startBtn = document.getElementById('startWelcome');
    const dontShow = document.getElementById('dontShowWelcome');

    function close(remember) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      if (remember && dontShow && dontShow.checked) {
        try { localStorage.setItem(keySeen, '1'); } catch (e) {}
      }
    }

    if (closeBtn) closeBtn.addEventListener('click', () => close(true));
    if (startBtn) startBtn.addEventListener('click', () => { close(true); });

    // quick action buttons inside popup
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const section = btn.dataset.section;
        if (section) {
          // trigger navigation similar to sidebar click
          const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
          if (nav) nav.click();
        }
        close(true);
      });
    });

    // close when clicking outside modal content
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(true);
    });
  } catch (err) {
    console.error('Welcome popup error', err);
  }
}

// show popup shortly after load (gives SPA time to initialize)
window.addEventListener('load', () => setTimeout(showWelcomePopup, 600));

// VED Top-N selector: re-render when changed
const vedTopSel = document.getElementById('vedTopN');
if (vedTopSel) {
  vedTopSel.addEventListener('change', () => {
    updateVEDClassification();
  });
}

// Reports: download monthly PDF
const downloadMonthlyBtn = document.getElementById('downloadMonthlyPdf');
if (downloadMonthlyBtn) {
  downloadMonthlyBtn.addEventListener('click', () => {
    const monthInput = document.getElementById('reportMonth');
    const m = monthInput ? monthInput.value : null;
    if (!m) return alert('Pilih bulan terlebih dahulu');
    const url = (API_BASE ? API_BASE : '') + `/api/reports/monthly-pdf?month=${encodeURIComponent(m)}`;
    // open in new tab to trigger download
    window.open(url, '_blank');
  });
  // default month to current month
  const mi = document.getElementById('reportMonth');
  if (mi && !mi.value) {
    const now = new Date();
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2,'0');
    mi.value = `${y}-${mm}`;
  }
}

// Toggle 'Tambah Obat' panel inside Data Obat
const openTambahBtn = document.getElementById('openTambahBtn');
if (openTambahBtn) {
  openTambahBtn.addEventListener('click', () => {
    const card = document.getElementById('tambahObatCard');
    if (!card) return;
    card.style.display = (card.style.display === 'block') ? 'none' : 'block';
    if (card.style.display === 'block') {
      const inNama = document.getElementById('inputNama');
      if (inNama) inNama.focus();
    }
  });
}