/* ===== AUTH & INITIAL SETUP ===== */
let currentUser = null;
let allObat = [];
let allUsers = [];
let stokChart = null;
let welcomePopupShown = false;
let latestActivityCount = 0;
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

function setupProfileDropdown() {
  const toggle = document.getElementById('userInfoDropdownToggle');
  const menu = document.getElementById('userDropdownMenu');
  const logoutBtn = document.getElementById('logoutBtnDropdown');
  const profileBtn = menu ? menu.querySelector('a[data-section="profile"]') : null;

  if (!toggle || !menu) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menu.style.display === 'none';
    menu.style.display = isHidden ? 'block' : 'none';
    toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== toggle) {
      menu.style.display = 'none';
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const logoutButton = document.getElementById('logoutBtn');
      if (logoutButton) logoutButton.click();
    });
  }

  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goToSection('profile');
      updateProfileInfo();
      menu.style.display = 'none';
      toggle.setAttribute('aria-expanded', 'false');
    });
  }
}

function showDashboardEntryOverlay(title, message) {
  const overlay = document.getElementById('dashboardEntryOverlay');
  if (!overlay) return;
  const titleEl = overlay.querySelector('strong');
  const messageEl = overlay.querySelector('span');
  if (titleEl && title) titleEl.textContent = title;
  if (messageEl && message) messageEl.textContent = message;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideDashboardEntryOverlay() {
  const overlay = document.getElementById('dashboardEntryOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function markDashboardReady() {
  document.body.classList.remove('dashboard-booting');
  document.body.classList.add('dashboard-ready');
  window.setTimeout(() => hideDashboardEntryOverlay(), 260);
}

showDashboardEntryOverlay(
  'Memuat Dashboard',
  'Menyiapkan ringkasan stok, aktivitas, dan notifikasi terbaru.'
);

function setTambahObatPanelOpen(isOpen) {
  const card = document.getElementById('tambahObatCard');
  const openBtn = document.getElementById('openTambahBtn');
  if (!card) return;
  card.style.display = isOpen ? 'block' : 'none';
  if (openBtn) {
    openBtn.textContent = isOpen ? 'Tutup Form Tambah' : 'Tambah Obat';
  }
  if (isOpen) {
    const inNama = document.getElementById('inputNama');
    if (inNama) inNama.focus();
  }
}

function goToSection(section) {
  if (!section) return;
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) {
    nav.click();
    return;
  }
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach((s) => s.classList.remove('active'));
  const sec = document.getElementById(`section-${section}`);
  if (sec) sec.classList.add('active');
}

function updateProfileInfo() {
  if (!currentUser) return;
  const usernameEl = document.getElementById('profileUsername');
  const emailEl = document.getElementById('profileEmail');
  const roleEl = document.getElementById('profileRole');

  if (usernameEl) usernameEl.textContent = currentUser.username || '-';
  if (emailEl) emailEl.textContent = currentUser.email || '-';
  if (roleEl) roleEl.textContent = getRoleLabel(currentUser.role) || '-';
}

function getRoleLabel(role) {
  return role === 'APJ' ? 'APJ' : 'Apoteker Pendamping';
}

function getRoleUseCases(role) {
  if (role === 'APJ') {
    return {
      badge: 'APJ',
      title: 'Akses APJ',
      description: 'APJ memiliki seluruh akses pada use case, termasuk manajemen user.',
      notice: 'Mode APJ aktif. Use case yang tersedia: Mengelola Data User, Mengelola Data Obat, Monitoring Kadaluarsa, Monitoring Stok, Mengelola Data Kadaluarsa, dan Cetak Laporan.',
      noticeType: 'info',
      items: [
        'Mengelola Data User',
        'Mengelola Data Obat',
        'Monitoring Kadaluarsa',
        'Monitoring Stok',
        'Mengelola Data Kadaluarsa',
        'Cetak Laporan'
      ]
    };
  }

  return {
    badge: 'Apoteker Pendamping',
    title: 'Akses Apoteker Pendamping',
    description: 'Apoteker Pendamping menjalankan use case operasional obat tanpa manajemen user.',
    notice: 'Mode Apoteker Pendamping aktif. Use case yang tersedia: Mengelola Data Obat, Monitoring Kadaluarsa, Monitoring Stok, Mengelola Data Kadaluarsa, dan Cetak Laporan.',
    noticeType: 'warning',
    items: [
      'Mengelola Data Obat',
      'Monitoring Kadaluarsa',
      'Monitoring Stok',
      'Mengelola Data Kadaluarsa',
      'Cetak Laporan'
    ]
  };
}

function updateRoleBadge() {
  const roleLabel = document.getElementById('userRoleLabel');
  if (!roleLabel || !currentUser) return;
  roleLabel.textContent = `Role: ${getRoleLabel(currentUser.role)}`;
  roleLabel.className = `user-role-badge ${isApj() ? 'role-apj' : 'role-pendamping'}`;
}

function updateRoleUseCasePanel() {
  if (!currentUser) return;
  const config = getRoleUseCases(currentUser.role);
  const badge = document.getElementById('roleUseCaseBadge');
  const title = document.getElementById('roleUseCaseTitle');
  const description = document.getElementById('roleUseCaseDescription');
  const list = document.getElementById('roleUseCaseList');

  if (badge) badge.textContent = config.badge;
  if (title) title.textContent = config.title;
  if (description) description.textContent = config.description;
  if (list) {
    list.innerHTML = config.items.map((item) => `<li>${item}</li>`).join('');
  }
}

function isApj() {
  return currentUser && currentUser.role === 'APJ';
}

function showDashboardNotice(message, type = 'info') {
  const notice = document.getElementById('dashboardNotice');
  if (!notice) return;
  if (!message) {
    notice.textContent = '';
    notice.className = 'dashboard-notice is-hidden';
    return;
  }
  notice.textContent = message;
  notice.className = `dashboard-notice notice-${type}`;
}

function showToast(message, type = 'info', timeout = 2800) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 180);
  }, timeout);
}

function applyRolePermissions() {
  if (!currentUser) return;
  const config = getRoleUseCases(currentUser.role);
  updateRoleBadge();
  updateRoleUseCasePanel();

  const usersNav = document.getElementById('usersNav');
  const reportsNav = document.getElementById('reportsNav');
  const usersSection = document.getElementById('section-users');
  const laporanSection = document.getElementById('section-laporan');
  const exportBtn = document.getElementById('exportBtn');

  if (isApj()) {
    [usersNav, reportsNav, usersSection, laporanSection, exportBtn].forEach((el) => {
      if (el) el.classList.remove('is-hidden');
    });
    showDashboardNotice(config.notice, config.noticeType);
    return;
  }

  [reportsNav, laporanSection, exportBtn].forEach((el) => {
    if (el) el.classList.remove('is-hidden');
  });
  [usersNav, usersSection].forEach((el) => {
    if (el) el.classList.add('is-hidden');
  });
  showDashboardNotice(config.notice, config.noticeType);
}

function renderUsersTable(users = allUsers) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  if (!isApj()) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#999;">Hanya APJ yang dapat mengelola user.</td></tr>';
    return;
  }
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#999;">Belum ada user yang cocok.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((user) => {
    const isCurrentUser = Number(currentUser && currentUser.id) === Number(user.id);
    const selfLabel = isCurrentUser ? ' (Anda)' : '';
    const pendampingOptionDisabled = isCurrentUser ? 'disabled' : '';
    const helperText = isCurrentUser
      ? '<div class="user-role-hint">Role akun APJ yang sedang dipakai tidak bisa diturunkan dari dashboard ini.</div>'
      : '<div class="user-role-hint">Pilih role lalu simpan perubahan.</div>';
    const options = [
      `<option value="APJ" ${user.role === 'APJ' ? 'selected' : ''}>APJ</option>`,
      `<option value="APOTEKER_PENDAMPING" ${user.role === 'APOTEKER_PENDAMPING' ? 'selected' : ''} ${pendampingOptionDisabled}>Apoteker Pendamping</option>`
    ].join('');

    return `
      <tr>
        <td><strong>${user.username}</strong>${selfLabel}</td>
        <td>${user.email || '—'}</td>
        <td class="user-role-cell">
          <select class="filter-select user-role-select" data-id="${user.id}" data-current-role="${user.role}">
            ${options}
          </select>
          ${helperText}
        </td>
        <td>
          <button type="button" class="btn-primary save-user-role-btn" data-id="${user.id}" disabled>Role Sudah Sesuai</button>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.user-role-select').forEach((select) => {
    const button = document.querySelector(`.save-user-role-btn[data-id="${select.dataset.id}"]`);
    if (!button) return;

    const syncButtonState = () => {
      const unchanged = select.value === select.dataset.currentRole;
      button.disabled = unchanged;
      button.textContent = unchanged ? 'Role Sudah Sesuai' : 'Simpan Role';
    };

    select.addEventListener('change', syncButtonState);
    syncButtonState();
  });

  document.querySelectorAll('.save-user-role-btn').forEach((button) => {
    button.addEventListener('click', async (e) => {
      const userId = e.currentTarget.dataset.id;
      const select = document.querySelector(`.user-role-select[data-id="${userId}"]`);
      if (!select) return;
      await updateUserRole(userId, select.value, { button: e.currentTarget, select });
    });
  });
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody || !isApj()) return;
  tbody.innerHTML = '<tr><td colspan="4" style="color:#999;">Memuat data user...</td></tr>';
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Gagal memuat user');
    const rows = await res.json();
    allUsers = Array.isArray(rows) ? rows : [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('Error loading users:', err);
    allUsers = [];
    tbody.innerHTML = '<tr><td colspan="4" style="color:#999;">Gagal memuat data user.</td></tr>';
    showToast('Gagal memuat data user.', 'error');
  }
}

async function updateUserRole(userId, role, controls = {}) {
  const actionButton = controls.button || null;
  const roleSelect = controls.select || null;
  const originalLabel = actionButton ? actionButton.textContent : '';

  if (actionButton) {
    actionButton.disabled = true;
    actionButton.textContent = 'Menyimpan...';
  }
  if (roleSelect) roleSelect.disabled = true;

  try {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.message || 'Gagal mengubah role user.', 'error');
      await loadUsers();
      return;
    }
    showToast(data.message || 'Role user berhasil diperbarui.', 'success');
    await loadUsers();
  } catch (err) {
    console.error('Error updating user role:', err);
    showToast('Gagal terhubung saat mengubah role user.', 'error');
  } finally {
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.textContent = originalLabel || 'Simpan Role';
    }
    if (roleSelect) roleSelect.disabled = false;
  }
}

function applyUserFilters() {
  const input = document.getElementById('userSearchInput');
  const query = String(input && input.value || '').trim().toLowerCase();
  if (!query) {
    renderUsersTable(allUsers);
    return;
  }
  const filtered = allUsers.filter((user) => {
    return String(user.username || '').toLowerCase().includes(query)
      || String(user.email || '').toLowerCase().includes(query)
      || getRoleLabel(user.role).toLowerCase().includes(query);
  });
  renderUsersTable(filtered);
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

async function fetchCurrentUser() {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`/api/me?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) return res.json();
      lastError = new Error(`Auth failed: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError || new Error('Auth failed');
}

// Check auth and load user info
async function init() {
  try {
    const data = await fetchCurrentUser();
    currentUser = data.user;
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    if (userAvatar) userAvatar.textContent = (currentUser.username || 'A')[0].toUpperCase();
    if (userName) userName.textContent = currentUser.username || 'User';
    applyRolePermissions();
    await loadCategories();
    await loadAllData();
    markDashboardReady();
  } catch (err) {
    console.error("Initialization failed:", err);
    hideDashboardEntryOverlay();
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
    updateActivityLog(logs);
    updateReports();
    updateNotificationBadge(notif);
    updateAutoWarnings(notif);
    renderMonitoringKadaluarsa();
    renderStockMonitoringTable();
    renderExpiryDataTable();
    updateSelectObat();
    if (isApj()) await loadUsers();
  } catch (err) {
    console.error('Error loading data:', err);
    allObat = [];
    updateDashboard();
    renderDataObatTable([]);
    updateCharts();
    updateActivityLog([]);
    updateReports();
    updateNotificationBadge({ total: 0 });
    updateAutoWarnings({ total: 0, notifications: [] });
    renderMonitoringKadaluarsa();
    renderStockMonitoringTable();
    renderExpiryDataTable();
    updateSelectObat();
    if (isApj()) renderUsersTable([]);
  }
}

// Update notification badge
function updateNotificationBadge(notifData) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;

  if (notifData && notifData.total > 0) {
    badge.textContent = Math.min(notifData.total, 9);
    badge.style.display = 'flex';
    return;
  }

  badge.textContent = '0';
  badge.style.display = 'none';
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

function getObatPriority(obat) {
  const expiryStatus = getExpiryStatus(obat && obat.kadaluarsa);
  const qty = Number(obat && obat.jumlah || 0);
  const ved = String(obat && obat.ved || 'D').toUpperCase();

  let score = 0;
  if (expiryStatus.key === 'kadaluarsa') score += 3;
  else if (expiryStatus.key === 'hampir') score += 2;

  if (qty <= 0) score += 3;
  else if (qty <= 5) score += 2;

  if (ved === 'V') score += 2;
  else if (ved === 'E') score += 1;

  if (score >= 6) {
    return { key: 'tinggi', label: 'Tinggi', level: 'P1' };
  }
  if (score >= 4) {
    return { key: 'sedang', label: 'Sedang', level: 'P2' };
  }
  return { key: 'rendah', label: 'Rendah', level: 'P3' };
}

function formatDaysLeft(kadaluarsa) {
  if (!kadaluarsa) return '—';
  const d = new Date(`${kadaluarsa}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  const diffDays = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} hari lalu`;
  return `${diffDays} hari`;
}

function sortByExpiryAsc(rows) {
  return rows.slice().sort((a, b) => {
    const da = new Date(`${a.kadaluarsa || '9999-12-31'}T00:00:00`);
    const db = new Date(`${b.kadaluarsa || '9999-12-31'}T00:00:00`);
    return da - db;
  });
}

function getExpiryMonthKey(kadaluarsa) {
  const value = String(kadaluarsa || '').trim();
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function populateVedMonthFilter() {
  const monthFilterEl = document.getElementById('vedMonthFilter');
  if (!monthFilterEl) return;

  const previousValue = monthFilterEl.value || '';
  const monthKeys = Array.from(new Set(
    allObat
      .map((obat) => getExpiryMonthKey(obat.kadaluarsa))
      .filter(Boolean)
  )).sort();

  monthFilterEl.innerHTML = '<option value="">Semua Bulan</option>';
  monthKeys.forEach((monthKey) => {
    const date = new Date(`${monthKey}-01T00:00:00`);
    const label = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    monthFilterEl.insertAdjacentHTML('beforeend', `<option value="${monthKey}">${label}</option>`);
  });

  if (previousValue && monthKeys.includes(previousValue)) {
    monthFilterEl.value = previousValue;
  }
}

function buildFefoRankMap(rows) {
  const rankMap = new Map();
  sortByExpiryAsc(rows).forEach((obat, index) => {
    rankMap.set(String(obat.id), index + 1);
  });
  return rankMap;
}

function renderMonitoringKadaluarsa() {
  const expired = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'kadaluarsa');
  const nearExpire = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'hampir');
  const good = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'baik');
  const filterEl = document.getElementById('monitoringExpiryFilter');
  const priorityListEl = document.getElementById('monitoringExpiryPriorityList');
  const priorityNoteEl = document.getElementById('monitoringExpiryPriorityNote');
  const filterValue = filterEl ? filterEl.value : '';
  let rows = sortByExpiryAsc([...expired, ...nearExpire]);
  if (filterValue === 'baik') {
    rows = sortByExpiryAsc(good);
  } else if (filterValue) {
    rows = rows.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === filterValue);
  }

  const expiredCount = document.getElementById('monitoringExpiredCount');
  const nearCount = document.getElementById('monitoringNearExpireCount');
  const totalCount = document.getElementById('monitoringTotalCount');
  const tbody = document.getElementById('monitoringExpiryTable');

  if (expiredCount) expiredCount.textContent = `${expired.length} item`;
  if (nearCount) nearCount.textContent = `${nearExpire.length} item`;
  if (totalCount) totalCount.textContent = `${rows.length} item`;

  if (priorityListEl) {
    const vedOrderMap = { V: 0, E: 1, D: 2 };
    const rankingRows = rows.map((obat) => {
      const vedKey = ['V', 'E', 'D'].includes(String(obat.ved || '').toUpperCase())
        ? String(obat.ved || '').toUpperCase()
        : 'D';
      const expiryDate = new Date(`${obat.kadaluarsa || '9999-12-31'}T00:00:00`);
      const expiryMs = Number.isNaN(expiryDate.getTime()) ? Number.MAX_SAFE_INTEGER : expiryDate.getTime();
      return {
        obat,
        vedKey,
        vedOrder: vedOrderMap[vedKey],
        expiryMs,
        qty: Number(obat.jumlah || 0)
      };
    }).sort((a, b) => {
      if (a.expiryMs !== b.expiryMs) return a.expiryMs - b.expiryMs;
      if (a.vedOrder !== b.vedOrder) return a.vedOrder - b.vedOrder;
      return a.qty - b.qty;
    });

    if (!rankingRows.length) {
      priorityListEl.innerHTML = '<li class="ved-priority-empty">Belum ada data prioritas pada filter Monitoring Kadaluarsa saat ini.</li>';
      if (priorityNoteEl) {
        priorityNoteEl.textContent = 'Sumber ranking VED-FEFO (konteks Monitoring Kadaluarsa): data akan muncul setelah ada item pada filter aktif.';
      }
    } else {
      const topRows = rankingRows.slice(0, 5);
      priorityListEl.innerHTML = topRows.map((entry, index) => {
        const { obat, vedKey } = entry;
        return `
          <li class="ved-priority-item ved-priority-${vedKey.toLowerCase()}">
            <span class="ved-priority-rank">#${index + 1}</span>
            <div class="ved-priority-main">
              <strong><button type="button" class="obat-name-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '—')}</button></strong>
              <span>VED ${vedKey} • Batch ${escapeHtml(obat.batch || '—')} • ${escapeHtml(obat.kadaluarsa || '—')} (${formatDaysLeft(obat.kadaluarsa)})</span>
            </div>
            <span class="ved-priority-month">${escapeHtml(getExpiryStatus(obat.kadaluarsa).label)}</span>
          </li>
        `;
      }).join('');

      if (priorityNoteEl) {
        priorityNoteEl.textContent = 'Sumber ranking VED-FEFO (konteks Monitoring Kadaluarsa): tanggal terdekat diprioritaskan, jika sama maka V lebih dulu.';
      }
    }
  }

  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#999;">Tidak ada obat yang perlu dipantau saat ini.</td></tr>';
    return;
  }

  const fefoRankMap = buildFefoRankMap(rows);

  tbody.innerHTML = rows.map((obat) => {
    const status = getExpiryStatus(obat.kadaluarsa);
    const priority = getObatPriority(obat);
    const vedKey = ['V', 'E', 'D'].includes(String(obat.ved || '').toUpperCase())
      ? String(obat.ved || '').toUpperCase()
      : 'D';
    const fefoRank = fefoRankMap.get(String(obat.id)) || '—';
    return `
      <tr>
        <td><button type="button" class="obat-name-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '—')}</button></td>
        <td>${obat.batch || '—'}</td>
        <td>${obat.kadaluarsa || '—'}</td>
        <td>${formatDaysLeft(obat.kadaluarsa)}</td>
        <td><span class="status-badge status-${status.key}">${status.label}</span></td>
        <td><span class="priority-badge priority-${priority.key}"><span class="priority-dot" aria-hidden="true"></span>${priority.level} ${priority.label}</span></td>
        <td><span class="ved-fefo-badge">${vedKey} • FEFO-${fefoRank}</span></td>
      </tr>
    `;
  }).join('');
}

function renderExpiryDataTable() {
  const timeFilterEl = document.getElementById('vedTimeFilter');
  const monthFilterEl = document.getElementById('vedMonthFilter');
  const vitalList = document.getElementById('vedVitalList');
  const essentialList = document.getElementById('vedEssentialList');
  const desirableList = document.getElementById('vedDesirableList');
  const vedPriorityList = document.getElementById('vedPriorityList');
  const vedPriorityRuleNote = document.getElementById('vedPriorityRuleNote');
  if (!vitalList || !essentialList || !desirableList) return;

  populateVedMonthFilter();

  const timeFilterValue = timeFilterEl ? timeFilterEl.value : '';
  const monthFilterValue = monthFilterEl ? monthFilterEl.value : '';
  let rows = sortByExpiryAsc(allObat);

  if (timeFilterValue) {
    rows = rows.filter((obat) => {
      const kadaluarsa = String(obat.kadaluarsa || '').trim();
      if (!kadaluarsa) {
        return timeFilterValue === '>90';
      }

      const expiryDate = new Date(`${kadaluarsa}T00:00:00`);
      if (Number.isNaN(expiryDate.getTime())) {
        return false;
      }

      const diffDays = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      if (timeFilterValue === 'expired') return diffDays < 0;
      if (timeFilterValue === '0-30') return diffDays >= 0 && diffDays <= 30;
      if (timeFilterValue === '31-90') return diffDays >= 31 && diffDays <= 90;
      if (timeFilterValue === '>90') return diffDays > 90;
      return true;
    });
  }

  if (monthFilterValue) {
    rows = rows.filter((obat) => getExpiryMonthKey(obat.kadaluarsa) === monthFilterValue);
  }

  const groups = { V: [], E: [], D: [] };
  rows.forEach((obat) => {
    const vedKey = ['V', 'E', 'D'].includes(String(obat.ved || '').toUpperCase())
      ? String(obat.ved || '').toUpperCase()
      : 'D';
    groups[vedKey].push(obat);
  });

  const vitalCount = document.getElementById('vedVitalCount');
  const essentialCount = document.getElementById('vedEssentialCount');
  const desirableCount = document.getElementById('vedDesirableCount');
  if (vitalCount) vitalCount.textContent = `${groups.V.length} item`;
  if (essentialCount) essentialCount.textContent = `${groups.E.length} item`;
  if (desirableCount) desirableCount.textContent = `${groups.D.length} item`;

  const getRankClass = (statusKey) => {
    if (statusKey === 'kadaluarsa') return 'urgent';
    if (statusKey === 'hampir') return 'warning';
    return 'safe';
  };

  const getRankLabel = (statusKey) => {
    if (statusKey === 'kadaluarsa') return 'EXP';
    if (statusKey === 'hampir') return 'DUE';
    return 'SAFE';
  };

  const renderVedList = (items, target, emptyMessage) => {
    if (!items.length) {
      target.innerHTML = `<li>${emptyMessage}</li>`;
      return;
    }

    target.innerHTML = items.map((obat) => {
      const status = getExpiryStatus(obat.kadaluarsa);
      return `
        <li class="fefo-${status.key === 'kadaluarsa' ? 'critical' : status.key === 'hampir' ? 'warning' : 'safe'}">
          <span class="rank-badge ${getRankClass(status.key)}">${getRankLabel(status.key)}</span>
          <div class="ved-item-text">
            <button type="button" class="obat-name-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '—')}</button><br>
            Batch ${obat.batch || '—'} | Stok ${obat.jumlah || 0} | ${obat.kadaluarsa || '—'} | ${formatDaysLeft(obat.kadaluarsa)}
          </div>
        </li>
      `;
    }).join('');
  };

  renderVedList(groups.V, vitalList, 'Tidak ada obat vital pada filter ini.');
  renderVedList(groups.E, essentialList, 'Tidak ada obat essential pada filter ini.');
  renderVedList(groups.D, desirableList, 'Tidak ada obat desirable pada filter ini.');

  if (vedPriorityList) {
    const vedOrderMap = { V: 0, E: 1, D: 2 };
    const rankingRows = rows.map((obat) => {
      const vedKey = ['V', 'E', 'D'].includes(String(obat.ved || '').toUpperCase())
        ? String(obat.ved || '').toUpperCase()
        : 'D';
      const kadaluarsa = String(obat.kadaluarsa || '').trim();
      const expiryDate = kadaluarsa ? new Date(`${kadaluarsa}T00:00:00`) : null;
      const isValidDate = expiryDate && !Number.isNaN(expiryDate.getTime());
      const monthOrder = isValidDate
        ? (expiryDate.getFullYear() * 12 + expiryDate.getMonth())
        : Number.MAX_SAFE_INTEGER;
      const monthLabel = isValidDate
        ? expiryDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        : 'Tanpa tanggal';

      return {
        obat,
        vedKey,
        vedOrder: vedOrderMap[vedKey],
        monthOrder,
        monthLabel,
        expiryMs: isValidDate ? expiryDate.getTime() : Number.MAX_SAFE_INTEGER
      };
    }).sort((a, b) => {
      if (a.monthOrder !== b.monthOrder) return a.monthOrder - b.monthOrder;
      if (a.vedOrder !== b.vedOrder) return a.vedOrder - b.vedOrder;
      if (a.expiryMs !== b.expiryMs) return a.expiryMs - b.expiryMs;
      return Number(a.obat.jumlah || 0) - Number(b.obat.jumlah || 0);
    });

    if (!rankingRows.length) {
      vedPriorityList.innerHTML = '<li class="ved-priority-empty">Belum ada data untuk dibuat ranking prioritas.</li>';
      if (vedPriorityRuleNote) {
        vedPriorityRuleNote.textContent = 'Ranking akan muncul setelah data obat pada filter ini tersedia.';
      }
    } else {
      const topRows = rankingRows.slice(0, 8);
      vedPriorityList.innerHTML = topRows.map((entry, index) => {
        const { obat, vedKey, monthLabel } = entry;
        return `
          <li class="ved-priority-item ved-priority-${vedKey.toLowerCase()}">
            <span class="ved-priority-rank">#${index + 1}</span>
            <div class="ved-priority-main">
              <strong><button type="button" class="obat-name-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '—')}</button></strong>
              <span>VED ${vedKey} • Batch ${escapeHtml(obat.batch || '—')} • ${escapeHtml(obat.kadaluarsa || '—')} (${formatDaysLeft(obat.kadaluarsa)})</span>
            </div>
            <span class="ved-priority-month">${escapeHtml(monthLabel)}</span>
          </li>
        `;
      }).join('');

      if (vedPriorityRuleNote) {
        vedPriorityRuleNote.textContent = 'Urutan ditentukan dari bulan kadaluarsa terdekat. Jika bulan sama, prioritas VED: V lalu E lalu D.';
      }
    }
  }
}

const OBAT_EXPLANATION_OVERRIDES = {
  allofar: 'Allofar (allopurinol) umumnya digunakan untuk membantu menurunkan kadar asam urat dalam darah dan mencegah kekambuhan gout. Penggunaan obat harus sesuai resep, dengan pemantauan gejala dan kondisi pasien.',
  paracetamol: 'Paracetamol digunakan untuk membantu meredakan demam dan nyeri ringan sampai sedang.',
  amoxicillin: 'Amoxicillin adalah antibiotik untuk infeksi bakteri dan harus digunakan sesuai resep dokter sampai tuntas.',
  ibuprofen: 'Ibuprofen membantu meredakan nyeri, peradangan, dan demam; gunakan setelah makan untuk mengurangi iritasi lambung.',
  omeprazole: 'Omeprazole digunakan untuk menurunkan produksi asam lambung pada keluhan maag, GERD, atau tukak lambung.',
  cetirizine: 'Cetirizine adalah antihistamin untuk meredakan gejala alergi seperti gatal, bersin, dan hidung meler.',
  salbutamol: 'Salbutamol membantu melegakan saluran napas pada asma atau bronkospasme sesuai anjuran tenaga medis.',
  metformin: 'Metformin digunakan untuk membantu mengontrol gula darah pada diabetes tipe 2 bersama pola makan sehat.',
  amlodipine: 'Amlodipine digunakan untuk membantu mengontrol tekanan darah tinggi dan menurunkan risiko komplikasi kardiovaskular.',
  simvastatin: 'Simvastatin membantu menurunkan kadar kolesterol dan digunakan rutin sesuai resep dokter.',
  ctm: 'CTM (chlorpheniramine maleate) adalah antihistamin untuk gejala alergi dan dapat menyebabkan kantuk.'
};

const KATEGORI_OBAT_DETAILS = {
  'TABLET BEBAS': 'Tablet bebas adalah obat berbentuk padat yang umumnya dapat diberikan tanpa resep, tetapi tetap perlu dijelaskan aturan minum, dosis, dan batas penggunaan kepada pasien.',
  'TABLET KERAS': 'Tablet keras adalah kelompok obat yang memerlukan pengawasan lebih ketat karena biasanya diberikan berdasarkan resep atau pertimbangan tenaga kesehatan.',
  SIRUP: 'Sirup adalah sediaan cair oral yang memudahkan pemberian obat, terutama bila pasien kesulitan menelan tablet atau membutuhkan penyesuaian dosis.',
  SALEP: 'Salep adalah sediaan topikal yang digunakan pada permukaan kulit atau area tertentu sesuai indikasi, dengan perhatian pada cara oles dan kebersihan area pemakaian.',
  'ETALASE LUAR': 'Etalase luar dipakai untuk obat atau produk yang ditempatkan di area pelayanan depan agar mudah dijangkau saat transaksi, namun tetap harus dipilah sesuai aturan penjualan dan penyimpanan.',
  UMUM: 'Kategori umum dipakai bila jenis obat belum dikelompokkan lebih spesifik. Data tetap perlu dilengkapi agar pemantauan stok dan pelayanan menjadi lebih akurat.'
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLookupKey(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getObatExplanation(obat) {
  const nama = String(obat && obat.nama || '').trim();
  const fromDb = String(obat && obat.deskripsi || '').trim();
  if (fromDb) return fromDb;

  const lookup = normalizeLookupKey(nama);
  const direct = lookup.replace(/\s+/g, '');
  if (OBAT_EXPLANATION_OVERRIDES[direct]) return OBAT_EXPLANATION_OVERRIDES[direct];

  const status = getExpiryStatus(obat && obat.kadaluarsa);
  const kategori = String(obat && obat.kategori || 'umum').toUpperCase();
  const jumlah = Number(obat && obat.jumlah || 0);
  const ved = String(obat && obat.ved || 'D').toUpperCase();
  return `${nama || 'Obat ini'} termasuk kategori ${kategori} dengan prioritas VED ${ved}. Status saat ini: ${status.label}. Stok tercatat ${jumlah} unit, sehingga perlu dipantau sesuai kebutuhan terapi dan aturan penggunaan obat.`;
}

function getKategoriObatDetail(kategori) {
  const key = String(kategori || 'UMUM').trim().toUpperCase();
  return KATEGORI_OBAT_DETAILS[key] || KATEGORI_OBAT_DETAILS.UMUM;
}

function getObatMonitoringNote(obat) {
  const status = getExpiryStatus(obat && obat.kadaluarsa);
  const nama = String(obat && obat.nama || 'Obat ini').trim();
  const jumlah = Number(obat && obat.jumlah || 0);
  const ved = String(obat && obat.ved || 'D').toUpperCase();
  const batch = String(obat && obat.batch || '').trim();
  const batchText = batch
    ? `Batch ${batch} sudah tercatat dan siap dilacak.`
    : 'Batch belum diisi, sehingga pelacakan lot sebaiknya segera dilengkapi.';
  return `${nama} saat ini berstatus ${status.label.toLowerCase()} dengan prioritas VED ${ved} dan stok ${jumlah} unit. ${batchText}`;
}

function openObatDetailPopup(obatId) {
  const obat = allObat.find((item) => String(item.id) === String(obatId));
  if (!obat) return;

  const overlay = document.getElementById('obatDetailOverlay');
  const modalEl = overlay ? overlay.querySelector('.modal') : null;
  if (!overlay || !modalEl) return;

  const status = getExpiryStatus(obat.kadaluarsa);
  const priority = getObatPriority(obat);
  const kategori = String(obat.kategori || 'Umum').trim();
  const ved = String(obat.ved || 'D').toUpperCase();
  const batchValue = obat.batch || 'Belum diisi';

  const title = document.getElementById('obatDetailTitle');
  const subtitle = document.getElementById('obatDetailSubtitle');
  const description = document.getElementById('obatDetailDescription');
  const categoryDescription = document.getElementById('obatDetailCategoryDescription');
  const jumlah = document.getElementById('obatDetailJumlah');
  const kadaluarsa = document.getElementById('obatDetailKadaluarsa');
  const batch = document.getElementById('obatDetailBatch');
  const idValue = document.getElementById('obatDetailId');
  const kategoriValue = document.getElementById('obatDetailKategori');
  const statusValue = document.getElementById('obatDetailStatus');
  const sisaHariValue = document.getElementById('obatDetailSisaHari');
  const prioritasValue = document.getElementById('obatDetailPrioritas');
  const note = document.getElementById('obatDetailNote');
  const vedBadge = document.getElementById('obatDetailVed');
  const statusPill = document.getElementById('obatDetailStatusPill');

  if (title) title.textContent = obat.nama || 'Nama obat tidak tersedia';
  if (subtitle) subtitle.textContent = `${kategori || 'Kategori belum diisi'} • Batch ${batchValue}`;
  if (description) description.textContent = getObatExplanation(obat);
  if (categoryDescription) categoryDescription.textContent = getKategoriObatDetail(kategori);
  if (idValue) idValue.textContent = obat.id || '-';
  if (kategoriValue) kategoriValue.textContent = kategori || '-';
  if (statusValue) statusValue.textContent = status.label;
  if (jumlah) jumlah.textContent = `${Number(obat.jumlah || 0)} unit`;
  if (kadaluarsa) kadaluarsa.textContent = obat.kadaluarsa || 'Belum diisi';
  if (batch) batch.textContent = batchValue;
  if (sisaHariValue) sisaHariValue.textContent = formatDaysLeft(obat.kadaluarsa);
  if (prioritasValue) prioritasValue.textContent = `${priority.level} ${priority.label}`;
  if (note) note.textContent = getObatMonitoringNote(obat);
  if (vedBadge) vedBadge.textContent = `VED ${ved}`;
  if (statusPill) statusPill.textContent = status.label;

  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  modalEl.classList.remove('opening');
  void modalEl.offsetWidth;
  modalEl.classList.add('opening');
  modalEl.addEventListener('animationend', () => modalEl.classList.remove('opening'), { once: true });
}

function closeObatDetailPopup() {
  const overlay = document.getElementById('obatDetailOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function bindObatDetailPopup() {
  const closeBtn = document.getElementById('closeObatDetail');
  const closeFooterBtn = document.getElementById('closeObatDetailFooter');
  const overlay = document.getElementById('obatDetailOverlay');

  if (closeBtn) closeBtn.addEventListener('click', closeObatDetailPopup);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeObatDetailPopup);
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeObatDetailPopup();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeObatDetailPopup();
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.obat-name-trigger');
    if (!trigger) return;
    openObatDetailPopup(trigger.dataset.id);
  });
}

// ===== DASHBOARD UPDATES =====
function updateDashboard() {
  const total = allObat.length;
  let totalStockQty = 0;
  let expired = 0, nearExpire = 0, safe = 0;
  let outOfStock = 0, lowStock = 0, reorder = 0;

  allObat.forEach(o => {
    const qty = Number(o.jumlah || 0);
    totalStockQty += Math.max(qty, 0);
    const st = getExpiryStatus(o.kadaluarsa);
    if (st.key === 'kadaluarsa') expired++;
    else if (st.key === 'hampir') nearExpire++;
    else safe++;

    if (qty <= 0) outOfStock++;
    if (qty > 0 && qty <= 5) {
      lowStock++;
    }
    if (qty <= 5) reorder++;
  });

  const totalStockQtyEl = document.getElementById('totalStockQty');
  const totalStockQtyNote = document.getElementById('totalStockQtyNote');
  const expiredCount = document.getElementById('expiredCount');
  const nearExpireCount = document.getElementById('nearExpireCount');
  const safeStockCount = document.getElementById('safeStockCount');
  const restockCountStat = document.getElementById('restockCountStat');
  const activityCountStat = document.getElementById('activityCountStat');
  const dashTotalItemSummary = document.getElementById('dashTotalItemSummary');
  const dashTotalUnitSummary = document.getElementById('dashTotalUnitSummary');
  const dashSafeStockSummary = document.getElementById('dashSafeStockSummary');
  const dashExpiredSummary = document.getElementById('dashExpiredSummary');
  const dashNearExpireSummary = document.getElementById('dashNearExpireSummary');
  const dashOutOfStockSummary = document.getElementById('dashOutOfStockSummary');
  const dashLowStockSummary = document.getElementById('dashLowStockSummary');
  const dashExpiryReview = document.getElementById('dashExpiryReview');
  const dashStockReview = document.getElementById('dashStockReview');
  const dashPrioritySummary = document.getElementById('dashPrioritySummary');
  const dashActionFocus = document.getElementById('dashActionFocus');
  const dashActionReview = document.getElementById('dashActionReview');
  const dashHeroTitle = document.getElementById('dashHeroTitle');
  const dashHeroSummary = document.getElementById('dashHeroSummary');
  const dashHeroChipHealth = document.getElementById('dashHeroChipHealth');
  const dashHeroChipFocus = document.getElementById('dashHeroChipFocus');
  const dashHeroChipUpdated = document.getElementById('dashHeroChipUpdated');
  const dashHeroScore = document.getElementById('dashHeroScore');
  const dashHeroGaugeNote = document.getElementById('dashHeroGaugeNote');

  if (totalStockQtyEl) totalStockQtyEl.textContent = total;
  if (totalStockQtyNote) totalStockQtyNote.textContent = `${totalStockQty} unit stok tersimpan`;
  if (expiredCount) expiredCount.textContent = expired;
  if (nearExpireCount) nearExpireCount.textContent = nearExpire;
  if (safeStockCount) safeStockCount.textContent = safe;
  if (restockCountStat) restockCountStat.textContent = reorder;
  if (activityCountStat) activityCountStat.textContent = latestActivityCount;
  if (dashTotalItemSummary) dashTotalItemSummary.textContent = `${total} item`;
  if (dashTotalUnitSummary) dashTotalUnitSummary.textContent = `${totalStockQty} unit`;
  if (dashSafeStockSummary) dashSafeStockSummary.textContent = `${safe} item`;
  if (dashExpiredSummary) dashExpiredSummary.textContent = `${expired} item`;
  if (dashNearExpireSummary) dashNearExpireSummary.textContent = `${nearExpire} item`;
  if (dashOutOfStockSummary) dashOutOfStockSummary.textContent = `${outOfStock} item`;
  if (dashLowStockSummary) dashLowStockSummary.textContent = `${lowStock} item`;

  if (dashInventoryReview) {
    if (!total) {
      dashInventoryReview.textContent = 'Review: data obat belum tersedia, jadi gambaran persediaan belum bisa dibaca secara menyeluruh. Silakan mulai dari input obat utama agar dashboard bisa memberi ringkasan operasional yang lebih akurat.';
    } else if (safe >= Math.ceil(total * 0.7)) {
      dashInventoryReview.textContent = `Review: persediaan terlihat cukup stabil. Dari ${total} item yang tercatat, ${safe} item masih berada pada status aman sehingga pelayanan harian cenderung lebih terkendali.`;
    } else {
      dashInventoryReview.textContent = `Review: persediaan mulai membutuhkan perhatian lebih. Saat ini hanya ${safe} dari ${total} item yang benar-benar berada pada status aman, jadi perlu prioritas pemantauan bertahap.`;
    }
  }

  if (dashExpiryReview) {
    if (expired > 0) {
      dashExpiryReview.textContent = `Review: terdeteksi ${expired} item sudah kadaluarsa. Langkah paling aman adalah memisahkan item tersebut terlebih dahulu, lalu lanjutkan rotasi FEFO untuk item yang masih bisa dipakai.`;
    } else if (nearExpire > 0) {
      dashExpiryReview.textContent = `Review: ada ${nearExpire} item mendekati kadaluarsa. Kondisi ini belum darurat, tetapi sebaiknya diprioritaskan untuk dikeluarkan lebih dulu agar tidak berubah menjadi item kadaluarsa.`;
    } else {
      dashExpiryReview.textContent = 'Review: indikator kadaluarsa saat ini aman dan belum menunjukkan item kritis. Ritme pengecekan berkala tetap perlu dijaga supaya kondisinya tetap stabil.';
    }
  }

  if (dashStockReview) {
    if (outOfStock > 0) {
      dashStockReview.textContent = `Review: terdapat ${outOfStock} item dengan stok habis. Prioritas utama hari ini adalah melakukan restock untuk mencegah gangguan pada layanan obat yang sering dibutuhkan.`;
    } else if (lowStock > 0) {
      dashStockReview.textContent = `Review: ada ${lowStock} item dengan stok menipis. Kondisi ini ideal untuk reorder bertahap agar transisi stok lebih halus tanpa menunggu sampai kosong.`;
    } else {
      dashStockReview.textContent = 'Review: indikator stok masih stabil, belum ada item yang habis maupun menipis. Kondisi ini sudah baik, tinggal dipertahankan lewat monitoring rutin harian.';
    }
  }

  let prioritySummary = 'Tidak ada kondisi kritis';
  let actionFocus = 'Lanjutkan pemantauan rutin';
  let actionReview = 'Review: fokus tindakan akan otomatis menyesuaikan setelah data operasional harian dibaca penuh oleh sistem.';

  if (expired > 0 && outOfStock > 0) {
    prioritySummary = 'Kadaluarsa dan stok habis';
    actionFocus = 'Pisahkan obat kadaluarsa dan lakukan restock obat kosong';
    actionReview = `Review: ditemukan ${expired} item kadaluarsa dan ${outOfStock} item stok habis secara bersamaan. Kombinasi ini perlu ditangani lebih dulu agar risiko layanan dan risiko mutu obat bisa ditekan di waktu yang sama.`;
  } else if (expired > 0) {
    prioritySummary = 'Kadaluarsa';
    actionFocus = 'Amankan item kadaluarsa dan jalankan FEFO';
    actionReview = `Review: fokus utama hari ini ada pada ${expired} item kadaluarsa. Setelah item tersebut diamankan, tim bisa langsung lanjut ke rotasi FEFO untuk mencegah penumpukan kasus serupa.`;
  } else if (outOfStock > 0) {
    prioritySummary = 'Stok habis';
    actionFocus = 'Segera restock item yang kosong';
    actionReview = `Review: ada ${outOfStock} item stok habis yang berpotensi mengganggu pelayanan. Penjadwalan restock cepat akan sangat membantu menjaga kontinuitas kebutuhan pasien.`;
  } else if (nearExpire > 0 || lowStock > 0) {
    prioritySummary = 'Pemantauan menengah';
    actionFocus = 'Pantau item hampir kadaluarsa dan stok menipis';
    actionReview = `Review: ada ${nearExpire} item hampir kadaluarsa dan ${lowStock} item stok menipis. Strategi terbaik adalah menjalankan FEFO sambil menyiapkan reorder bertahap supaya transisinya tetap aman.`;
  }

  if (dashPrioritySummary) dashPrioritySummary.textContent = prioritySummary;
  if (dashActionFocus) dashActionFocus.textContent = actionFocus;
  if (dashActionReview) dashActionReview.textContent = actionReview;

  const safeRatio = total > 0 ? Math.max(0, Math.min(100, Math.round((safe / total) * 100))) : 0;
  const healthLabel = safeRatio >= 75 ? 'Kondisi: Stabil' : safeRatio >= 50 ? 'Kondisi: Perlu Pemantauan' : 'Kondisi: Perlu Penanganan';

  if (dashHeroScore) dashHeroScore.textContent = `${safeRatio}%`;

  if (dashHeroTitle) {
    dashHeroTitle.textContent = total
      ? `Hari ini ada ${total} item obat yang sedang dipantau sistem`
      : 'Belum ada item obat untuk dianalisis di dashboard';
  }

  if (dashHeroSummary) {
    if (!total) {
      dashHeroSummary.textContent = 'Tambahkan data obat terlebih dahulu agar sistem bisa menampilkan prioritas, tren stok, dan peringatan kadaluarsa secara otomatis.';
    } else if (expired > 0 || outOfStock > 0) {
      dashHeroSummary.textContent = `Sistem mendeteksi ${expired} item kadaluarsa, ${nearExpire} item hampir kadaluarsa, dan ${outOfStock} item stok habis. Mulai dari kondisi paling berisiko agar operasional lebih terkendali.`;
    } else {
      dashHeroSummary.textContent = `Komposisi saat ini menunjukkan ${safe} item aman, ${nearExpire} item hampir kadaluarsa, dan ${outOfStock + lowStock} item terkait risiko stok. Gunakan ringkasan di bawah untuk menentukan aksi paling mendesak.`;
    }
  }

  if (dashHeroChipHealth) {
    dashHeroChipHealth.textContent = healthLabel;
  }
  if (dashHeroChipFocus) {
    dashHeroChipFocus.textContent = `Fokus: ${actionFocus}`;
  }
  if (dashHeroChipUpdated) {
    dashHeroChipUpdated.textContent = `Update: ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (dashHeroGaugeNote) {
    if (!total) {
      dashHeroGaugeNote.textContent = 'Menunggu sinkronisasi data obat';
    } else if (safeRatio >= 75) {
      dashHeroGaugeNote.textContent = `${safe} dari ${total} item berada pada kondisi aman`;
    } else if (safeRatio >= 50) {
      dashHeroGaugeNote.textContent = 'Dashboard menyarankan pemantauan bertahap hari ini';
    } else {
      dashHeroGaugeNote.textContent = 'Perlu tindakan prioritas untuk menstabilkan kondisi';
    }
  }
}

// ===== DATA OBAT TABLE =====
function renderDataObatTable(data) {
  const tbody = document.querySelector('#tableObat');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(o => {
    const deleteAction = isApj() ? `<button class="btn-delete" data-id="${o.id}">🗑️ Hapus</button>` : '';
    const st = getExpiryStatus(o.kadaluarsa);
    const priority = getObatPriority(o);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><button type="button" class="obat-name-trigger" data-id="${escapeHtml(o.id)}">${escapeHtml(o.nama || '—')}</button></td>
      <td>${o.batch || '—'}</td>
      <td>${o.kategori || '—'}</td>
      <td>${o.jumlah}</td>
      <td>${o.kadaluarsa || '—'}</td>
      <td><span class="status-badge status-${st.key}">${st.label}</span></td>
      <td><span class="priority-badge priority-${priority.key}"><span class="priority-dot" aria-hidden="true"></span>${priority.level} ${priority.label}</span></td>
      <td><strong>${o.ved || '—'}</strong></td>
      <td>
        <button class="btn-edit" data-id="${o.id}" style="margin-right:6px;">✏️ Edit</button>
        ${deleteAction}
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
      if (isNaN(jumlah)) return showToast('Jumlah tidak valid.', 'warning');
      const kadaluarsa = prompt('Kadaluarsa (YYYY-MM-DD)', obat.kadaluarsa);
      if (!kadaluarsa) return;
      const kategori = prompt('Kategori (TABLET BEBAS, TABLET KERAS, SIRUP, SALEP, ETALASE LUAR)', obat.kategori || 'TABLET BEBAS');
      if (kategori === null) return;
      const batch = prompt('Batch / Lot (opsional)', obat.batch || '');
      if (batch === null) return;
      const deskripsi = prompt('Deskripsi obat (opsional)', obat.deskripsi || '');
      if (deskripsi === null) return;
      updateObat(id, { nama, jumlah, kadaluarsa, kategori, batch, deskripsi });
    });
  });
}

async function deleteObat(id) {
  try {
    const res = await fetch(`/api/obat/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      loadAllData();
      showToast(data.message || 'Obat dihapus.', 'success');
    } else {
      showToast(data.message || 'Gagal menghapus obat.', 'error');
    }
  } catch (err) {
    console.error('Error:', err);
    showToast('Gagal terhubung saat menghapus obat.', 'error');
  }
}

async function updateObat(id, data) {
  try {
    const res = await fetch(`/api/obat/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) {
      loadAllData();
      showToast(result.message || 'Obat diperbarui.', 'success');
    } else {
      showToast(result.message || 'Gagal memperbarui obat.', 'error');
    }
  } catch (err) {
    console.error('Error:', err);
    showToast('Gagal terhubung saat memperbarui obat.', 'error');
  }
}

// ===== CHART UPDATES =====
function updateCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js tidak tersedia, grafik stok dilewati.');
    return;
  }

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

// ===== ACTIVITY LOG =====
function updateActivityLog(logs) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  latestActivityCount = safeLogs.length;
  const activityCountStat = document.getElementById('activityCountStat');
  if (activityCountStat) activityCountStat.textContent = latestActivityCount;

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
  if (!list) return;
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
  if (!logList) return;
  logList.innerHTML = safeLogs.slice(0, 15).length
    ? safeLogs.slice(0, 15).map(l => `<li>[${formatTime(l.time)}] <strong>${getTypeLabel(l.type)}</strong>: ${l.message}</li>`).join('')
    : '<li style="color:#999;">Tidak ada log</li>';
}

// ===== REPORTS =====
function updateReports() {
  const outOfStock = allObat.filter((o) => Number(o.jumlah || 0) <= 0);
  const lowStock = allObat.filter((o) => {
    const qty = Number(o.jumlah || 0);
    return qty > 0 && qty <= 5;
  });
  const needReorder = allObat.filter((o) => {
    const qty = Number(o.jumlah || 0);
    return qty > 0 && qty <= 5;
  });
  const reorderCandidates = allObat
    .filter((o) => Number(o.jumlah || 0) <= 5)
    .sort((left, right) => {
      const vedOrderMap = { V: 0, E: 1, D: 2 };
      const qtyDiff = Number(left.jumlah || 0) - Number(right.jumlah || 0);
      if (qtyDiff !== 0) return qtyDiff;

      const leftDate = new Date(`${left.kadaluarsa || '9999-12-31'}T00:00:00`).getTime();
      const rightDate = new Date(`${right.kadaluarsa || '9999-12-31'}T00:00:00`).getTime();
      if (leftDate !== rightDate) return leftDate - rightDate;

      const leftVed = ['V', 'E', 'D'].includes(String(left.ved || '').toUpperCase())
        ? String(left.ved || '').toUpperCase()
        : 'D';
      const rightVed = ['V', 'E', 'D'].includes(String(right.ved || '').toUpperCase())
        ? String(right.ved || '').toUpperCase()
        : 'D';
      return vedOrderMap[leftVed] - vedOrderMap[rightVed];
    });

  const outOfStockCount = document.getElementById('outOfStockCount');
  const lowStockCount = document.getElementById('lowStockCount');
  const reorderCount = document.getElementById('reorderCount');
  const stockSummary = document.getElementById('stockSummary');
  const priorityStockList = document.getElementById('priorityStockList');

  if (outOfStockCount) outOfStockCount.textContent = `${outOfStock.length} item`;
  if (lowStockCount) lowStockCount.textContent = `${lowStock.length} item`;
  if (reorderCount) reorderCount.textContent = `${needReorder.length} item`;

  if (stockSummary) {
    if (outOfStock.length > 0) {
      stockSummary.textContent = `${outOfStock.length} obat sudah habis dan perlu ditindaklanjuti segera. Cek data obat untuk pembaruan stok atau lakukan reorder.`;
    } else if (lowStock.length > 0) {
      stockSummary.textContent = `${lowStock.length} obat berada pada stok menipis. Prioritaskan reorder untuk menjaga ketersediaan pelayanan.`;
    } else {
      stockSummary.textContent = 'Stok utama dalam kondisi aman. Tetap lakukan pemantauan rutin untuk item dengan pergerakan cepat.';
    }
  }

  if (priorityStockList) {
    if (!reorderCandidates.length) {
      priorityStockList.innerHTML = '';
    } else {
      priorityStockList.innerHTML = reorderCandidates.slice(0, 3).map((obat, index) => {
        const qty = Number(obat.jumlah || 0);
        const expiryText = obat.kadaluarsa || 'tanpa tanggal';
        const rankClass = index === 0 ? 'priority-rank-1' : index === 1 ? 'priority-rank-2' : 'priority-rank-3';
        return `
          <li class="${rankClass} dashboard-priority-item" data-id="${escapeHtml(obat.id)}" tabindex="0" role="button" aria-label="Buka detail ${escapeHtml(obat.nama || 'obat')}">
            <div class="dashboard-priority-name">
              <span class="dashboard-priority-rank">${index + 1}.</span>
              <button type="button" class="obat-name-trigger dashboard-priority-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '-')}</button>
            </div>
            <div class="dashboard-priority-side">
              <span class="dashboard-priority-meta">Stok ${qty} unit | Kedaluwarsa ${escapeHtml(expiryText)}</span>
              <span class="dashboard-priority-arrow" aria-hidden="true">›</span>
            </div>
          </li>
        `;
      }).join('');
    }
  }
}

function updateAutoWarnings(notifData) {
  const summaryEl = document.getElementById('autoAlertSummary');
  const listEl = document.getElementById('autoAlertList');
  if (!summaryEl || !listEl) return;

  const apiNotifs = Array.isArray(notifData && notifData.notifications)
    ? notifData.notifications
    : [];

  let warnings = apiNotifs.filter((n) => {
    const text = `${n.title || ''} ${n.message || ''}`.toLowerCase();
    return text.includes('stok') || text.includes('kadaluarsa');
  });

  if (!warnings.length) {
    const lowStock = allObat
      .filter((o) => Number(o.jumlah || 0) > 0 && Number(o.jumlah || 0) <= 5)
      .slice(0, 5)
      .map((o) => ({
        title: `Stok menipis: ${o.nama || '-'}`,
        message: `Stok tersisa ${Number(o.jumlah || 0)} unit. Pertimbangkan reorder.`
      }));
    const nearExpiry = allObat
      .filter((o) => getExpiryStatus(o.kadaluarsa).key === 'hampir')
      .slice(0, 5)
      .map((o) => ({
        title: `Mendekati kedaluwarsa: ${o.nama || '-'}`,
        message: `Tanggal kedaluwarsa ${o.kadaluarsa || '-'}. Prioritaskan penggunaan FEFO.`
      }));
    warnings = [...lowStock, ...nearExpiry];
  }

  if (!warnings.length) {
    summaryEl.textContent = 'Tidak ada peringatan stok menipis atau kedaluwarsa mendekat saat ini.';
    listEl.innerHTML = '';
    return;
  }

  summaryEl.textContent = `Terdapat ${warnings.length} peringatan otomatis yang perlu dipantau.`;
  listEl.innerHTML = warnings.slice(0, 8).map((warning) => {
    const high = Number(warning.urgency || 1) >= 2;
    return `
      <li class="auto-alert-item ${high ? 'alert-high' : 'alert-medium'}">
        <strong>${escapeHtml(warning.title || 'Peringatan')}</strong>
        <span>${escapeHtml(warning.message || '-')}</span>
      </li>
    `;
  }).join('');
}

function getStockMonitoringStatus(obat) {
  const qty = Number(obat && obat.jumlah || 0);
  if (qty <= 0) return { key: 'habis', label: 'Habis', badgeKey: 'kadaluarsa' };
  if (qty <= 5) return { key: 'menipis', label: 'Menipis', badgeKey: 'hampir' };
  return { key: 'aman', label: 'Aman', badgeKey: 'baik' };
}

function renderStockMonitoringTable() {
  const filterEl = document.getElementById('stockMonitoringFilter');
  const tbody = document.getElementById('stockMonitoringTable');
  if (!tbody) return;

  const filterValue = filterEl ? filterEl.value : '';
  let rows = allObat.slice();

  if (filterValue === 'habis') {
    rows = rows.filter((obat) => Number(obat.jumlah || 0) <= 0);
  } else if (filterValue === 'menipis') {
    rows = rows.filter((obat) => {
      const qty = Number(obat.jumlah || 0);
      return qty > 0 && qty <= 5;
    });
  } else if (filterValue === 'reorder') {
    rows = rows.filter((obat) => Number(obat.jumlah || 0) <= 5);
  }

  rows.sort((left, right) => Number(left.jumlah || 0) - Number(right.jumlah || 0));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#999;">Tidak ada data stok untuk filter ini.</td></tr>';
    return;
  }

  const fefoRankMap = buildFefoRankMap(rows);

  tbody.innerHTML = rows.map((obat) => {
    const stockStatus = getStockMonitoringStatus(obat);
    const priority = getObatPriority(obat);
    const vedKey = ['V', 'E', 'D'].includes(String(obat.ved || '').toUpperCase())
      ? String(obat.ved || '').toUpperCase()
      : 'D';
    const fefoRank = fefoRankMap.get(String(obat.id)) || '—';
    return `
      <tr>
        <td><button type="button" class="obat-name-trigger" data-id="${escapeHtml(obat.id)}">${escapeHtml(obat.nama || '—')}</button></td>
        <td>${obat.batch || '—'}</td>
        <td>${Number(obat.jumlah || 0)} unit</td>
        <td>${obat.kadaluarsa || '—'}</td>
        <td><span class="status-badge status-${stockStatus.badgeKey}">${stockStatus.label}</span></td>
        <td><span class="priority-badge priority-${priority.key}"><span class="priority-dot" aria-hidden="true"></span>${priority.level} ${priority.label}</span></td>
        <td><span class="ved-fefo-badge">${vedKey} • FEFO-${fefoRank}</span></td>
      </tr>
    `;
  }).join('');
}

// ===== FORM HANDLERS =====
const formTambahObat = document.getElementById('formTambahObat');
if (formTambahObat) formTambahObat.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = document.getElementById('inputNama').value;
  const jumlah = Number(document.getElementById('inputJumlah').value);
  const kadaluarsa = document.getElementById('inputKadaluarsa').value;
  const kategori = document.getElementById('inputKategori') ? document.getElementById('inputKategori').value : '';
  const batch = document.getElementById('inputBatch') ? document.getElementById('inputBatch').value : '';
  const deskripsi = document.getElementById('inputDeskripsi') ? document.getElementById('inputDeskripsi').value : '';

  try {
    const res = await fetch('/api/obat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama, jumlah, kadaluarsa, kategori, batch, deskripsi })
    });
    if (res.ok) {
      formTambahObat.reset();
      loadAllData();
      showToast('Obat berhasil ditambahkan.', 'success');
    } else {
      const err = await res.json();
      showToast(err.message || 'Gagal menambahkan obat.', 'error');
    }
  } catch (err) {
    console.error('Error:', err);
    showToast('Gagal terhubung saat menambah obat.', 'error');
  }
});

// Masuk Obat
function updateSelectObat() {}

// Export CSV
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) exportBtn.addEventListener('click', () => {
  const csvHeader = 'Nama,Batch,Kategori,Deskripsi,Jumlah,Kadaluarsa,VED';
  const csvRows = allObat.map(o => `${o.nama},${(o.batch||'')},${(o.kategori||'—')},${(String(o.deskripsi || '').replace(/,/g, ';'))},${o.jumlah},${o.kadaluarsa || '—'},${o.ved || '—'}`);
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
  const kategoriEl = document.getElementById('filterKategoriInput');
  const kategori = kategoriEl ? kategoriEl.value : '';

  let filtered = allObat.slice();
  if (q) filtered = filtered.filter(o => (o.nama || '').toLowerCase().includes(q));
  if (kategori) filtered = filtered.filter(o => (o.kategori || '').toLowerCase() === kategori.toLowerCase());
  renderDataObatTable(filtered);
}

const filterObatInput = document.getElementById('filterObatInput');
if (filterObatInput) filterObatInput.addEventListener('keyup', applyFilters);
const fk = document.getElementById('filterKategoriInput');
if (fk) fk.addEventListener('change', applyFilters);
const globalSearch = document.getElementById('searchInput');
if (globalSearch) {
  globalSearch.addEventListener('input', (e) => {
    const tableFilter = document.getElementById('filterObatInput');
    if (tableFilter) tableFilter.value = e.target.value;
    applyFilters();
  });
}
const userSearchInput = document.getElementById('userSearchInput');
if (userSearchInput) userSearchInput.addEventListener('input', applyUserFilters);
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', () => { if (isApj()) loadUsers(); });
const vedTimeFilter = document.getElementById('vedTimeFilter');
if (vedTimeFilter) vedTimeFilter.addEventListener('change', renderExpiryDataTable);
const vedMonthFilter = document.getElementById('vedMonthFilter');
if (vedMonthFilter) vedMonthFilter.addEventListener('change', renderExpiryDataTable);
const monitoringExpiryFilter = document.getElementById('monitoringExpiryFilter');
if (monitoringExpiryFilter) monitoringExpiryFilter.addEventListener('change', renderMonitoringKadaluarsa);
const stockMonitoringFilter = document.getElementById('stockMonitoringFilter');
if (stockMonitoringFilter) stockMonitoringFilter.addEventListener('change', renderStockMonitoringTable);

document.addEventListener('click', (event) => {
  const stockCard = event.target.closest('.stock-summary-card');
  if (!stockCard) return;

  const section = stockCard.dataset.section;
  if (section) goToSection(section);

  const expiryFilterValue = stockCard.dataset.expiryFilter;
  if (expiryFilterValue) {
    const expiryFilterEl = document.getElementById('monitoringExpiryFilter');
    if (expiryFilterEl) {
      expiryFilterEl.value = expiryFilterValue;
      renderMonitoringKadaluarsa();
    }
  }

  const stockFilterValue = stockCard.dataset.stockFilter;
  if (stockFilterValue) {
    const stockFilterEl = document.getElementById('stockMonitoringFilter');
    if (stockFilterEl) {
      stockFilterEl.value = stockFilterValue;
      renderStockMonitoringTable();
    }
  }
});

document.addEventListener('keydown', (event) => {
  const stockCard = event.target.closest('.stock-summary-card');
  if (!stockCard) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;

  event.preventDefault();
  stockCard.click();
});

document.addEventListener('click', (event) => {
  if (event.target.closest('.obat-name-trigger')) return;

  const priorityItem = event.target.closest('.dashboard-priority-item');
  if (!priorityItem) return;

  openObatDetailPopup(priorityItem.dataset.id);
});

document.addEventListener('keydown', (event) => {
  const priorityItem = event.target.closest('.dashboard-priority-item');
  if (!priorityItem) return;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openObatDetailPopup(priorityItem.dataset.id);
  }
});

// ===== SIDEBAR NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function(e) {
    e.preventDefault();
    const section = this.dataset.section;

    if (section === 'profile') {
      updateProfileInfo();
    }

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    if (section) {
      const targetSection = document.getElementById(`section-${section}`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    }
    const sidebar = document.getElementById('dashboardSidebar');
    if (sidebar.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
    }
  });
});

const requestPasswordResetBtn = document.getElementById('requestPasswordResetBtn');
if (requestPasswordResetBtn) {
  requestPasswordResetBtn.addEventListener('click', async () => {
    if (!currentUser || !currentUser.email) {
      showToast('Email pengguna tidak ditemukan.', 'error');
      return;
    }
      
    requestPasswordResetBtn.disabled = true;
    requestPasswordResetBtn.textContent = 'Mengirim...';

    try {
      const res = await fetch('/api/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      });
      const data = await res.json();
      showToast(data.message, res.ok ? 'success' : 'error');
    } catch (err) {
      showToast('Gagal meminta reset password. Coba lagi nanti.', 'error');
    } finally {
      requestPasswordResetBtn.disabled = false;
      requestPasswordResetBtn.textContent = 'Kirim Link Reset Password';
    }
  });
}

const changePasswordForm = document.getElementById('changePasswordForm');
if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      showToast('Password baru dan konfirmasi tidak cocok.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password baru minimal harus 6 karakter.', 'error');
      return;
    }
    changePassword(currentPassword, newPassword);
  });
}

// Initialize
init();
setupProfileDropdown();