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

function setupSidebarToggle() {
  const body = document.body;
  const sidebar = document.getElementById('dashboardSidebar');
  if (!body || !sidebar) return;

  const dotMenu = document.getElementById('dotMenu');
  const toggleBtn = document.getElementById('toggleSidebar');
  const nav = sidebar.querySelector('.sidebar-nav');

  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  const openSidebar = () => {
    body.classList.add('sidebar-visible');
    sidebar.setAttribute('aria-hidden', 'false');
  };
  const closeSidebar = () => {
    body.classList.remove('sidebar-visible');
    sidebar.setAttribute('aria-hidden', 'true');
  };
  const toggleSidebar = () => {
    body.classList.toggle('sidebar-visible');
    const isOpen = body.classList.contains('sidebar-visible');
    sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  const syncSidebarForViewport = () => {
    if (window.matchMedia('(min-width: 1025px)').matches) {
      openSidebar();
      if (nav) nav.classList.remove('active');
    } else {
      closeSidebar();
    }
  };

  if (dotMenu) {
    dotMenu.addEventListener('click', (event) => {
      event.preventDefault();
      toggleSidebar();
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (nav) nav.classList.toggle('active');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      closeSidebar();
    });
  }

  window.addEventListener('resize', () => {
    syncSidebarForViewport();
  });

  syncSidebarForViewport();
}

function showDashboardEntryOverlay(title, message) {
  console.log('[showDashboardEntryOverlay] Showing overlay:', title);
  const overlay = document.getElementById('dashboardEntryOverlay');
  if (!overlay) {
    console.warn('[showDashboardEntryOverlay] Overlay element not found!');
    return;
  }
  const titleEl = overlay.querySelector('strong');
  const messageEl = overlay.querySelector('span');
  if (titleEl && title) titleEl.textContent = title;
  if (messageEl && message) messageEl.textContent = message;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  console.log('[showDashboardEntryOverlay] Overlay shown');
}

function hideDashboardEntryOverlay() {
  console.log('[hideDashboardEntryOverlay] Hiding overlay');
  const overlay = document.getElementById('dashboardEntryOverlay');
  if (!overlay) {
    console.warn('[hideDashboardEntryOverlay] Overlay element not found!');
    return;
  }
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  console.log('[hideDashboardEntryOverlay] Overlay hidden');
}

function markDashboardReady() {
  console.log('[markDashboardReady] Removing dashboard-booting, adding dashboard-ready');
  console.log('[markDashboardReady] Before - classes:', document.body.className);
  
  document.body.classList.remove('dashboard-booting');
  document.body.classList.add('dashboard-ready');
  
  console.log('[markDashboardReady] After - classes:', document.body.className);
  console.log('[markDashboardReady] Scheduling overlay hide in 260ms');
  window.setTimeout(() => {
    console.log('[markDashboardReady] Hiding overlay...');
    hideDashboardEntryOverlay();
  }, 260);
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

function downloadReport(type) {
  const urls = {
    'full-pdf': (API_BASE || '') + '/api/reports/pdf',
    'ved-summary-pdf': (API_BASE || '') + '/api/reports/ved-summary-pdf',
    'full-csv': (API_BASE || '') + '/api/reports/csv',
    'critical-pdf': (API_BASE || '') + '/api/reports/critical-pdf',
    'daily-pdf': (API_BASE || '') + '/api/reports/daily-pdf',
    'management-pdf': (API_BASE || '') + '/api/reports/management-pdf',
    'restock-analysis-pdf': (API_BASE || '') + '/api/reports/restock-analysis-pdf'
  };
  
  if (!urls[type]) {
    console.error('Unknown report type:', type);
    showToast('Tipe laporan tidak diketahui.', 'error');
    return;
  }
  
  const url = urls[type];
  console.log('[DOWNLOAD] Starting:', { type, url });
  showToast('Mengunduh laporan...', 'info');
  
  // Fetch first to check for errors
  fetch(url, {
    method: 'GET',
    credentials: 'include'
  })
    .then(res => {
      console.log('[DOWNLOAD] Response received:', {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type'),
        contentDisposition: res.headers.get('content-disposition'),
        contentLength: res.headers.get('content-length')
      });
      
      if (!res.ok) {
        console.error('[DOWNLOAD] Response not ok');
        return res.text().then(text => {
          console.error('[DOWNLOAD] Error response text:', text);
          try {
            const data = JSON.parse(text);
            throw new Error(data.message || 'Gagal membuat laporan');
          } catch (e) {
            throw new Error('Gagal membuat laporan: ' + res.statusText);
          }
        });
      }
      
      return res.blob();
    })
    .then(blob => {
      console.log('[DOWNLOAD] Blob received:', { size: blob.size, type: blob.type });
      
      if (blob.size === 0) {
        console.error('[DOWNLOAD] Blob empty!');
        throw new Error('File laporan kosong');
      }
      
      // Create download link
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const ext = type.includes('pdf') ? 'pdf' : 'csv';
      link.download = `Laporan-${type}-${new Date().toISOString().split('T')[0]}.${ext}`;
      
      console.log('[DOWNLOAD] Creating download:', link.download);
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        console.log('[DOWNLOAD] Cleanup done');
      }, 100);
      
      showToast('Laporan berhasil diunduh.', 'success');
      console.log('[DOWNLOAD] Success');
    })
    .catch(err => {
      console.error('[DOWNLOAD] Error:', err.message, err.stack);
      showToast('Gagal mengunduh laporan: ' + err.message, 'error');
    });
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
      notice: 'Mode APJ aktif. Use case yang tersedia: Mengelola Data User, Mengelola Data Obat, Monitoring Kadaluarsa, Monitoring Stok, VED-FEFO, dan Laporan.',
      noticeType: 'info',
      items: [
        'Mengelola Data User',
        'Mengelola Data Obat',
        'Monitoring Kadaluarsa',
        'Monitoring Stok',
        'VED-FEFO',
        'Laporan'
      ]
    };
  }

  return {
    badge: 'Apoteker Pendamping',
    title: 'Akses Apoteker Pendamping',
    description: 'Apoteker Pendamping menjalankan use case operasional obat tanpa manajemen user.',
    notice: 'Mode Apoteker Pendamping aktif. Use case yang tersedia: Mengelola Data Obat, Monitoring Kadaluarsa, Monitoring Stok, VED-FEFO, dan Laporan.',
    noticeType: 'warning',
    items: [
      'Mengelola Data Obat',
      'Monitoring Kadaluarsa',
      'Monitoring Stok',
      'VED-FEFO',
      'Laporan'
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
  const usersSection = document.getElementById('section-users');
  const exportBtn = document.getElementById('exportBtn');

  if (isApj()) {
    [usersNav, usersSection, exportBtn].forEach((el) => {
      if (el) el.classList.remove('is-hidden');
    });
    showDashboardNotice(config.notice, config.noticeType);
    return;
  }

  [exportBtn].forEach((el) => {
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
    tbody.innerHTML = '<tr><td colspan="4">Hanya APJ yang dapat mengelola user.</td></tr>';
    return;
  }
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="4">Belum ada user yang cocok.</td></tr>';
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
  tbody.innerHTML = '<tr><td colspan="4">Memuat data user...</td></tr>';
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Gagal memuat user');
    const rows = await res.json();
    allUsers = Array.isArray(rows) ? rows : [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('Error loading users:', err);
    allUsers = [];
    tbody.innerHTML = '<tr><td colspan="4">Gagal memuat data user.</td></tr>';
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

// ===== EMAIL SETTINGS FUNCTIONS =====
let currentEmailConfigId = null;

async function loadEmailSettings() {
  const loadingEl = document.getElementById('emailSettingsLoading');
  const formEl = document.getElementById('emailSettingsForm');
  const errorEl = document.getElementById('emailSettingsError');

  if (!loadingEl || !formEl) return;

  loadingEl.style.display = 'block';
  formEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

  try {
    const response = await fetch('/api/scheduler-config/ved_fefo_email', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Gagal memuat konfigurasi email');
    }

    const config = await response.json();
    currentEmailConfigId = config.id;

    // Fill form with current values
    const intervalInput = document.getElementById('emailIntervalInput');
    const timeInput = document.getElementById('emailTimeInput');
    const enabledCheckbox = document.getElementById('emailEnabledCheckbox');

    if (intervalInput) intervalInput.value = config.interval_hari || 5;
    if (timeInput) timeInput.value = config.email_jam || '08:00';
    if (enabledCheckbox) enabledCheckbox.checked = config.enabled === true || config.enabled === 1;

    updateEmailStatusDisplay(config);
    loadingEl.style.display = 'none';
    formEl.style.display = 'block';

  } catch (error) {
    console.error('Error loading email settings:', error);
    loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = '❌ Gagal memuat pengaturan email: ' + error.message;
    }
  }
}

function updateEmailStatusDisplay(config) {
  const statusDisplay = document.getElementById('emailStatusDisplay');
  const currentStatus = document.getElementById('emailCurrentStatus');
  const currentInterval = document.getElementById('emailCurrentInterval');
  const currentTime = document.getElementById('emailCurrentTime');
  const lastSent = document.getElementById('emailLastSent');

  if (statusDisplay) {
    statusDisplay.textContent = config.enabled ? '✅ Aktif' : '⏸️ Nonaktif';
    statusDisplay.style.color = config.enabled ? '#27ae60' : '#e74c3c';
  }

  if (currentStatus) currentStatus.textContent = config.enabled ? '✅ Aktif' : '⏸️ Nonaktif';
  if (currentInterval) currentInterval.textContent = `${config.interval_hari} hari`;
  if (currentTime) currentTime.textContent = (config.email_jam || '08:00') + ' WIB';
  if (lastSent) {
    lastSent.textContent = config.last_sent_at 
      ? new Date(config.last_sent_at).toLocaleString('id-ID') 
      : 'Belum pernah dikirim';
  }
}

async function saveEmailSettings() {
  if (!currentEmailConfigId) {
    showToast('ID konfigurasi tidak ditemukan', 'error');
    return;
  }

  const intervalInput = document.getElementById('emailIntervalInput');
  const timeInput = document.getElementById('emailTimeInput');
  const enabledCheckbox = document.getElementById('emailEnabledCheckbox');
  const saveBtn = document.querySelector('button[onclick="saveEmailSettings()"]');

  if (!intervalInput || !timeInput || !enabledCheckbox) {
    showToast('Form input tidak ditemukan', 'error');
    return;
  }

  const intervalDays = parseInt(intervalInput.value);
  const emailTime = timeInput.value;
  const enabled = enabledCheckbox.checked;

  // Validation
  if (!intervalDays || intervalDays < 1 || intervalDays > 30) {
    showToast('Interval harus antara 1-30 hari', 'error');
    return;
  }

  if (!emailTime) {
    showToast('Jam pengiriman harus diisi', 'error');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Menyimpan...';
  }

  try {
    const response = await fetch(`/api/scheduler-config/${currentEmailConfigId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        interval_hari: intervalDays,
        enabled: enabled,
        email_jam: emailTime
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Gagal menyimpan pengaturan');
    }

    showToast('✅ Pengaturan email berhasil disimpan!', 'success');
    
    // Reload settings to refresh display
    setTimeout(loadEmailSettings, 1000);

  } catch (error) {
    console.error('Error saving email settings:', error);
    showToast('❌ Gagal menyimpan pengaturan: ' + error.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Simpan Pengaturan';
    }
  }
}

async function sendTestEmail() {
  const testBtn = document.querySelector('button[onclick="sendTestEmail()"]');
  const resultDiv = document.getElementById('emailActionResult');
  const originalText = testBtn ? testBtn.textContent : '🚀 Kirim Test Email';

  if (!testBtn) {
    showToast('Tombol test email tidak ditemukan', 'error');
    return;
  }

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = '⏳ Mengirim...';
  }

  try {
    const response = await fetch('/api/reports/send-ved-fefo-email', {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Gagal mengirim email test');
    }

    const result = await response.json();
    
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div style="padding: 15px; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 4px;">
          <strong>✅ Email Test Berhasil!</strong><br>
          Berhasil dikirim ke <strong>${result.successCount || 0}</strong> penerima<br>
          <small>Penerima: ${(result.recipients && result.recipients.length > 0 ? result.recipients.join(', ') : 'Tidak ada penerima')}</small>
        </div>
      `;
    }

    showToast('✅ Email test berhasil dikirim!', 'success');

  } catch (error) {
    console.error('Error sending test email:', error);
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div style="padding: 15px; background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 4px;">
          <strong>❌ Gagal Mengirim Email</strong><br>
          ${error.message}
        </div>
      `;
    }
    showToast('❌ Gagal mengirim email: ' + error.message, 'error');
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  }
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
  console.log('[init] Starting dashboard initialization...');
  try {
    const data = await fetchCurrentUser();
    currentUser = data.user;
    console.log('[init] Current user loaded:', currentUser.username, 'Role:', currentUser.role);
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    if (userAvatar) userAvatar.textContent = (currentUser.username || 'A')[0].toUpperCase();
    if (userName) userName.textContent = currentUser.username || 'User';
    
    applyRolePermissions();
    console.log('[init] Role permissions applied');
    
    await loadCategories();
    console.log('[init] Categories loaded');
    
    await loadAllData();
    console.log('[init] All data loaded, marking dashboard ready...');
    
    markDashboardReady();
    console.log('[init] Dashboard ready - initialization complete');
  } catch (err) {
    console.error("[init] Initialization failed:", err);
    console.error('[init] Error details:', err.message, err.stack);
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
    console.log('[loadAllData] Starting data fetch...');
    const resObat = await fetch('/api/obat');
    console.log('[loadAllData] /api/obat response:', resObat.status, resObat.ok);
    
    if (resObat.status === 401) {
      console.error('[loadAllData] Auth failed - session expired');
      showToast('Sesi login berakhir. Silakan login ulang.', 'warning');
      redirectToLogin();
      throw new Error('Session expired (401 from /api/obat)');
    }
    if (!resObat.ok) {
      console.error('[loadAllData] /api/obat failed:', resObat.status, resObat.statusText);
      throw new Error(`Gagal memuat /api/obat (HTTP ${resObat.status})`);
    }
    const obatData = await resObat.json();
    console.log('[loadAllData] Obat data loaded:', obatData.length || 0, 'items');
    allObat = Array.isArray(obatData) ? obatData : [];

    // Optional endpoints: dashboard remains functional even if one endpoint fails.
    const logs = await fetchOptionalJson('/api/logs', [], (value) => Array.isArray(value) ? value : []);
    const notif = await fetchOptionalJson(
      '/api/notifications?limit=200',
      { total: 0 },
      (value) => (value && typeof value === 'object') ? value : { total: 0 }
    );
    
    console.log('[loadAllData] Rendering UI components...');
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
    if (isApj()) {
      console.log('[loadAllData] User is APJ, loading users...');
      await loadUsers();
    }
    console.log('[loadAllData] Data loading complete');
  } catch (err) {
    console.error('[loadAllData] Error loading data:', err);
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

function parseExpiryDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM (assume end of month)
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map((n) => parseInt(n, 10));
    if (!y || !m) return null;
    const endOfMonth = new Date(y, m, 0);
    return Number.isNaN(endOfMonth.getTime()) ? null : endOfMonth;
  }

  // MM-YYYY or MM/YYYY (assume end of month)
  if (/^\d{2}[-/]\d{4}$/.test(raw)) {
    const parts = raw.includes('/') ? raw.split('/') : raw.split('-');
    const m = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (!y || !m) return null;
    const endOfMonth = new Date(y, m, 0);
    return Number.isNaN(endOfMonth.getTime()) ? null : endOfMonth;
  }

  // Fallback to native Date parsing
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getExpiryStatus(kadaluarsa) {
  const d = parseExpiryDate(kadaluarsa);
  if (!d) return { key: 'baik', label: 'Baik', color: '#27ae60' };
  const now = new Date();
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { key: 'kadaluarsa', label: 'Kadaluarsa', color: '#e74c3c' };
  
  // Use days threshold for consistency with backend (60 days = 2 months)
  if (diffDays <= 60) return { key: 'kadaluarsa', label: 'Kadaluarsa', color: '#e74c3c' };
  if (diffDays <= 180) return { key: 'hampir', label: 'Hampir Kadaluarsa', color: '#f39c12' };
  return { key: 'baik', label: 'Baik', color: '#27ae60' };
}

function getObatPriority(obat) {
  const qty = Number(obat && obat.jumlah || 0);
  const ved = String(obat && obat.ved || '').toUpperCase();
  
  // Priority combines VED classification + stock level
  if (qty <= 0) return { key: 'tinggi', label: 'Tinggi (P1)', level: 'P1' };  // Out of stock = critical
  
  // Low stock (1-5 units)
  if (qty <= 5) {
    if (ved === 'V') return { key: 'tinggi', label: 'Tinggi (P1)', level: 'P1' };  // Vital with low stock = critical
    if (ved === 'E') return { key: 'sedang', label: 'Sedang (P2)', level: 'P2' };  // Essential with low stock = medium
    // Desirable with low stock
    return { key: 'rendah', label: 'Rendah (P3)', level: 'P3' };  // Desirable with low stock = low priority
  }
  
  return { key: 'rendah', label: 'Rendah (P3)', level: 'P3' };  // Adequate stock
}

function formatDaysLeft(kadaluarsa) {
  const d = parseExpiryDate(kadaluarsa);
  if (!d) return '—';
  const diffDays = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} hari lalu`;
  return `${diffDays} hari`;
}

function sortByExpiryAsc(rows) {
  return rows.slice().sort((a, b) => {
    const da = parseExpiryDate(a.kadaluarsa) || new Date('9999-12-31T00:00:00');
    const db = parseExpiryDate(b.kadaluarsa) || new Date('9999-12-31T00:00:00');
    return da - db;
  });
}


function getExpiryMonthKey(kadaluarsa) {
  const date = parseExpiryDate(kadaluarsa);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function populateMonitoringMonthFilter() {
  const monthFilterEl = document.getElementById('monitoringMonthFilter');
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
  populateMonitoringMonthFilter();
  const expired = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'kadaluarsa');
  const nearExpire = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'hampir');
  const good = allObat.filter((obat) => getExpiryStatus(obat.kadaluarsa).key === 'baik');
  const filterEl = document.getElementById('monitoringExpiryFilter');
  const monthFilterEl = document.getElementById('monitoringMonthFilter');
  const priorityListEl = document.getElementById('monitoringExpiryPriorityList');
  const priorityNoteEl = document.getElementById('monitoringExpiryPriorityNote');
  const filterValue = filterEl ? filterEl.value : '';
  const monthFilterValue = monthFilterEl ? monthFilterEl.value : '';
  let rows = sortByExpiryAsc([...expired, ...nearExpire]);

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
    tbody.innerHTML = '<tr><td colspan="7">Tidak ada obat yang perlu dipantau saat ini.</td></tr>';
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
  const vitalList = document.getElementById('vedVitalList');
  const essentialList = document.getElementById('vedEssentialList');
  const desirableList = document.getElementById('vedDesirableList');
  const vedPriorityList = document.getElementById('vedPriorityList');
  const vedPriorityRuleNote = document.getElementById('vedPriorityRuleNote');
  if (!vitalList || !essentialList || !desirableList) return;

  const timeFilterValue = timeFilterEl ? timeFilterEl.value : '';
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
      if (timeFilterValue === '0-60') return diffDays >= 0 && diffDays <= 60;
      if (timeFilterValue === '61-180') return diffDays >= 61 && diffDays <= 180;
      if (timeFilterValue === '>180') return diffDays > 180;
      return true;
    });
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
              <span>VED ${vedKey} • Batch ${escapeHtml(obat.batch || '—')} • Stok ${obat.jumlah || 0} • ${escapeHtml(obat.kadaluarsa || '—')} (${formatDaysLeft(obat.kadaluarsa)})</span>
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
  // Analgesik & Antipiretik - Penurun Demam & Pereda Nyeri
  paracetamol: 'Paracetamol (Acetaminophen) - Analgesik dan antipiretik untuk menurunkan demam dan meredakan nyeri ringan hingga sedang. Aman untuk bayi, anak, dewasa, dan ibu hamil. Dosis anak sesuai usia, dewasa 500-1000mg tiap 4-6 jam, maksimal 4g/hari.',
  beneuron: 'Beneuron (Paracetamol) - Formulasi paracetamol sirup untuk penurun demam anak. Rasa strawberry yang disukai anak-anak. Gunakan sesuai berat badan dan usia anak.',
  betamol: 'Betamol (Paracetamol Sirup) - Paracetamol cair untuk meredakan demam dan nyeri pada anak. Diberikan setiap 4-6 jam sesuai kebutuhan. Tersedia dalam rasa cherry yang menarik untuk anak.',
  sanmol: 'Sanmol (Paracetamol Tablet) - Tablet paracetamol untuk dewasa, pereda nyeri dan penurun demam efektif. Diminum dengan air putih, dapat dengan atau tanpa makanan.',
  'bye bye fever': 'Bye Bye Fever - Paracetamol khusus formulasi untuk bayi dan anak. Turun panas dan nyeri cepat. Dosis aman sesuai usia bayi Anda.',
  ibuprofen: 'Ibuprofen - Anti-inflamasi non-steroid (NSAID) untuk meredakan nyeri, peradangan, dan demam. Lebih kuat dari paracetamol. Minum setelah makan untuk mengurangi iritasi lambung. Dewasa 200-400mg tiap 4-6 jam.',
  'ibuprofen syr': 'Ibuprofen Sirup - Ibuprofen cair untuk anak yang sulit menelan tablet. Efektif untuk demam tinggi dan nyeri. Dosis sesuai usia dan berat badan anak.',
  bodrex: 'Bodrex (Ibuprofen) - Tablet ibuprofen untuk nyeri otot, kepala, dan demam. Aksi cepat, pereda nyeri efektif dalam 30 menit. Jangan minum bersamaan dengan aspirin.',
  asammefenamat: 'Asam Mefenamat - NSAID untuk nyeri ringan hingga sedang, terutama nyeri menstruasi. Diminum tiap 6-8 jam. Jangan gunakan jika alergi aspirin atau NSAID lain.',
  fargetik: 'Fargetik (Asam Mefenamat) - Pereda nyeri untuk migrain, nyeri sendi, nyeri haid. Mulai kerja 15-30 menit. Maksimal 3-4 hari penggunaan berturut-turut.',
  meloxicam: 'Meloxicam - NSAID selectif untuk nyeri sendi dan tulang kronis (arthritis). Efek anti-inflamasi kuat. Diminum 1x sehari 7.5-15mg sesuai resep dokter.',
  samcofenac: 'Samcofenac - Kombinasi diclofenac (anti-inflamasi) sendawa, untuk nyeri otot dan sendi. Aksi cepat untuk nyeri akut. Minum dengan makanan untuk proteksi lambung.',
  
  // Antibiotik - Pembunuh Bakteri
  amoxicillin: 'Amoxicillin - Antibiotik beta-laktam untuk berbagai infeksi bakteri (telinga, hidung, kulit, saluran kencing). Harus diminum sampai habis (biasanya 7-10 hari) walaupun sudah merasa baik. Dewasa 500mg-1g tiap 8 jam.',
  'amoxicillin hj': 'Amoxicillin HJ - Amoxicillin generik berkualitas untuk pengobatan infeksi bakteri. Harus dihabiskan sesuai durasi yang diberikan dokter untuk mencegah resistensi bakteri.',
  brodamox: 'Brodamox (Amoxicillin) - Amoxicillin sirup untuk anak dengan infeksi bakteri. Rasa jeruk yang menarik. Dosis berdasarkan berat badan anak.',
  yusimox: 'Yusimox (Amoxicillin) - Amoxicillin tablet untuk dewasa, efektif melawan streptococcus, stafiloccus, dan bakteri gram-negatif. Diminum tiap 8 jam.',
  cefadroxil: 'Cefadroxil - Antibiotik sefalosporin generasi 1 untuk infeksi kulit, infeksi saluran kemih, infeksi saluran napas. Aman dan efektif. Diminum 2x sehari 500mg.',
  lostacef: 'Lostacef (Cefadroxil Sirup) - Cefadroxil cair untuk anak dengan infeksi bakteri. Rasa strawberry dan jeruk. Dosis anak 25-50mg/kg/hari dibagi 2 dosis.',
  cefixime: 'Cefixime - Antibiotik sefalosporin generasi 3 untuk infeksi saluran kemih, sinusitis, otitis media. Dapat diberikan sekali atau dua kali sehari. Efektif melawan bakteri resistant.',
  floxigra: 'Floxigra (Ciprofloxacin) - Fluoroquinolone antibiotik spektrum luas untuk infeksi saluran kemih, saluran cerna, pernapasan. Dewasa 500-750mg dua kali sehari. Hindari paparan sinar matahari.',
  'floxifar': 'Floxifar (Fluoroquinolone) - Antibiotik kuat untuk infeksi gram-negatif. Efektif untuk infeksi organ dalam. Gunakan sesuai resep dokter karena potensi efek samping.',
  erlamycetine: 'Erlamycetine (Erythromycin) - Antibiotik makrolid untuk infeksi bakteri gram-positif. Alternatif bagi yang alergi penisilin. Diminum tiap 6 jam sebelum makan.',
  clindamycin: 'Clindamycin - Antibiotik untuk infeksi bakteri serius termasuk anaerob. Efektif untuk infeksi gigi, kulit, saluran pernapasan. Minum dengan air putih banyak.',
  metronidazole: 'Metronidazole - Antimikroba untuk infeksi bakteri anaerob dan protozoa (ameba, trikomonas). Jangan minum alkohol saat menggunakan. Efek samping rasa logam di mulut.',
  helixime: 'Helixime - Kombinasi antibiotik untuk h. pylori penyebab tukak lambung. Biasanya diberikan dengan PPI. Efektivitas tinggi dalam eradikasi bakteri.',
  
  // Antifungal - Obat Jamur
  ketokonazol: 'Ketokonazol - Antifungal untuk infeksi jamur sistemik dan lokal. Menghambat sintesis ergosterol sel jamur. Efektif untuk candida, dermatofita, pityriasis. Diminum dengan makanan untuk absorpsi optimal.',
  'ketokonazole salf': 'Ketokonazole Salep - Aplikasi topikal untuk jamur kulit, panu, eksim jamur. Oleskan pada area yang terkena 2x sehari. Efek dalam 2-4 minggu penggunaan teratur.',
  mycoral: 'Mycoral (Ketokonazol) - Tablet ketokonazol untuk infeksi jamur sistemik. Dosis 200-400mg sehari. Perlu pemantauan fungsi hati karena risiko hepatotoksisitas.',
  'mycoral cream': 'Mycoral Cream (Ketokonazole) - Krim untuk jamur kulit, penyakit kulit jamur, seborrheic dermatitis. Oleskan tipis pada area yang terkena Pagi dan malam.',
  flucadex: 'Flucadex (Fluconazole) - Antifungal untuk candidiasis orofaringeal, esofageal, vaginal, dan infeksi jamur sistemik. Efektif melawan candida albicans.',
  
  // Asma & Bronkodilator
  salbutamol: 'Salbutamol (Albuterol) - Beta-2 agonis untuk melegakan saluran napas pada asma, bronkitis kronis, PPOK. Inhaler memberikan efek dalam 15 menit. Pemakaian rutin atau PRN sesuai kebutuhan dokter.',
  brochifar: 'Brochifar - Kombinasi ekspektoran dan bronkodilator untuk batuk asma, bronkitis. Memudahkan pengeluaran dahak dan lega napas. Minum 3-4x sehari.',
  
  // Antihistamin & Alergi
  cetirizine: 'Cetirizine - Antihistamin H1 selektif, non-sedating (tidak mengantuk) untuk rhinitis alergi, urtikaria, alergi musiman. Mulai kerja 20-40 menit. Dewasa 10mg sehari, anak 5-10mg.',
  ctm: 'CTM (Chlorpheniramine Maleate) - Antihistamin obat untuk gejala alergi (gatal, bersin, pilek, bintik merah). DAPAT MENGANTUK, hindari mengemudi. Lebih sesuai untuk alergi berat.',
  histigo: 'Histigo - Antihistamin untuk alergi akut dan kronis. Efektif meredakan gatal, ruam alergi, urticaria. Gunakan sesuai kebutuhan tapi jangan melebihi dosis.',
  lerzin: 'Lerzin (Cetirizine) - Antihistamin non-sedating untuk alergi sepanjang hari. Cocok untuk yang butuh tetap waspada. Aman untuk pemakaian jangka panjang.',
  'lerzin drop': 'Lerzin Drop (Cetirizine Tetes) - Cetirizine dalam bentuk tetes untuk bayi dan balita alergi. Dosis berdasarkan usia dan berat badan. Rasa strawberry yang aman untuk bayi.',
  'lerzin sirup': 'Lerzin Sirup (Cetirizine) - Cetirizine cair untuk anak dengan alergi. Penyerapan cepat, non-sedating. Aman untuk alergi musiman atau perennial.',
  caviplex: 'Caviplex - Kombinasi antihistamin dan dekongestan untuk flu alergi dan rhinitis alergi. Mengurangi hidung tersumbat + alergi. Minum 2-3x sehari.',
  'caviplex syr': 'Caviplex Sirup - Antihistamin sirup anak untuk alergi dan flu pada anak. Efektif mengurangi gejala alergi dengan rasa yang enak.',
  
  // Antimaag & Anti-Asam Lambung
  omeprazole: 'Omeprazole - Proton Pump Inhibitor (PPI) untuk mengurangi produksi asam lambung. Efektif untuk GERD, tukak lambung, esofagitis. Diminum 30 menit sebelum makan, dosis 20-40mg sehari.',
  'omeprazol hj': 'Omeprazol HJ - Omeprazole generik berkualitas untuk penyakit asam lambung kronis. Penyembuhan lambung dalam 4-8 minggu penggunaan. Efek dalam 1 jam pertama.',
  ranitidine: 'Ranitidine - H2 receptor antagonist untuk duodenal ulcer, GERD, gastritis. Mengurangi asam lambung 50%. Diminum 2x sehari 150mg atau 1x 300mg malam hari.',
  gasela: 'Gasela (Ranitidine) - Ranitidine sirup untuk asam lambung kronis. Efektif 1-2 jam. Aman untuk jangka panjang, menurunkan keasaman lambung signifikan.',
  antasida: 'Antasida - Menetralisir asam lambung langsung untuk pereda nyeri ulu hati akut. Kerja cepat 5-10 menit. Berisi Ca/Al hydroxide. Gunakan sesuai kebutuhan tapi maksimal 3 jam setelah makan.',
  promaag: 'Promaag - Antasida kombinasi untuk maag, gastritis, perut kembung. Kandungan magnesium hidroksida dan simethicone untuk pereda gas. Kerja cepat untuk nyeri ulu hati akut.',
  
  // Batuk & Pilek & Ekspektoran
  ambroxol: 'Ambroxol - Mucolytic ekspektoran untuk memecah dahak kental dan memudahkan batuk produktif. Efektif untuk batuk berdahak kronis. Diminum 3x sehari 30mg atau sirup. Mulai kerja 4-8 jam.',
  itramol: 'Itramol Sirup - Itrakonazol + ambroxol? atau paracetamol + ambroxol. Ekspektoran untuk batuk berdahak pada anak. Rasa jeruk yang disukai anak.',
  grantusif: 'Grantusif - Kombinasi ekspektoran dan dextromethorphan (pereda batuk) untuk batuk kering maupun berdahak. Malam hari hilangkan batuk, siang keluarkan dahak.',
  scopma: 'Scopma - Kombinasi obat batuk, flu, dan ekspektoran. Efektif untuk batuk plus gejala flu. Kombinasi sempurna untuk ISPA (Infeksi Saluran Pernapasan Atas).',
  'vicks formula': 'Vicks Formula - Ekspektoran tradisional dengan mentol dan kayu putih untuk batuk dan flu. Aroma kuat membantu pernapasan. Diminum hangat untuk efek maksimal.',
  'hufagrip bp': 'Hufagrip BP - Kombinasi paracetamol, kafein, dan DM untuk flu dan batuk. BP = Bronkopneumonia. Efektif untuk demam + batuk + pilek sekaligus.',
  fasidol: 'Fasidol - Paracetamol untuk demam dengan gejala flu. Dikombinasikan dengan deflt. Minum tiap 4-6 jam saat demam.',
  'fasidol syr': 'Fasidol Sirup - Fasidol cair untuk anak demam dan flu. Rasa strawberry. Dosis sesuai usia, diminum tiap 4-6 jam.',
  'pimtrakol syr': 'Pimtrakol Sirup Cherry - Batuk anak rasa cherry. Ekspektoran untuk memudahkan pengeluaran dahak. 3-4x sehari sesuai usia.',
  'procurma syr': 'Procurma Sirup - Obat batuk pilek kombinasi. Pereda batuk + demam + pilek dalam satu produk. Ideal untuk ISPA ringan-sedang.',
  guanistrep: 'Guanistrep Sirup - Guaifenesin ekspektoran sirup untuk anak. Memecah dahak kental. Diminum 3x sehari dengan banyak air putih.',
  
  // Diabetes
  metformin: 'Metformin - Antidiabetes oral untuk diabetes tipe 2. Menurunkan gula darah dengan meningkatkan sensitivitas insulin dan mengurangi glukoneogenesis hepatik. Diminum 500-1000mg tiap 8 jam. Tidak menyebabkan hipoglikemia.',
  'metformin 500mg': 'Metformin 500mg - Dosis standar metformin untuk kontrol gula darah sedang. Dikombinasikan dengan diet dan olahraga. Efek penuh dalam 2-3 minggu.',
  
  // Hipertensi & Jantung
  amlodipine: 'Amlodipine - Calcium channel blocker untuk hipertensi dan angina. Melemaskan otot pembuluh darah untuk turunkan tekanan darah. Diminum 1x sehari 5-10mg. Tidak boleh tiba-tiba dihentikan.',
  'amlodipine 5mg': 'Amlodipine 5mg - Dosis standar untuk hipertensi ringan-sedang. Diminum setiap hari pada waktu sama. Efektif dalam 6-14 hari. Efek samping minimal.',
  'amlodipin 10mg': 'Amlodipin 10mg - Dosis lebih kuat untuk hipertensi berat atau maintenance setelah dosis 5mg tidak cukup. Sangat efektif, toleransi baik.',
  simvastatin: 'Simvastatin - Statin untuk menurunkan kolesterol LDL berbahaya. Mencegah serangan jantung dan stroke. Diminum 1x malam 10-80mg. Jangan digabung beberapa statin.',
  'simvastatin hj': 'Simvastatin HJ - Simvastatin generik untuk terapi kolesterol kronis. Penurunan kolesterol terlihat dalam 4-6 minggu. Efektivitas terjaga dengan gaya hidup sehat.',
  
  // Kortikosteroid
  dexamethasone: 'Dexamethasone - Kortikosteroid sistemik untuk inflamasi berat, alergi anaphylaxis, edema serebral, syok septik, myxedema. Potensial tinggi. Penggunaan jangka pendek sebisa mungkin.',
  'dexaharsen 0,5': 'Dexaharsen 0.5mg - Deksametason dosis rendah untuk penggunaan jangka panjang atau ringan. Untuk asma berat, alergi, inflamasi. Monitor fungsi adrenal.',
  dexanta: 'Dexanta - Deksametason untuk anti-inflamasi dan potensial imunosupresif. Gunakan dengan resep dokter untuk durasi terbatas.',
  'dexicorta': 'Dexicorta - Deksametason untuk kondisi inflamasi akut. Kerja cepat mengurangi peradangan. Taper down bertahap saat pulih untuk hindari adrenal insufficiency.',
  'metil prednisolon': 'Metil Prednisolon - Kortikosteroid untuk rheumatoid arthritis, SLE, inflamasi berat. Dosis mengikuti derajat peradangan. Konsumsi dengan makanan untuk proteksi lambung.',
  danasone: 'Danasone (Prednison) - Kortikosteroid untuk berbagai kondisi inflamasi dan imunitas. Harus taper down bertahap. Monitoring gula darah, tekanan darah, osteoporosis.',
  
  // Antikonvulsan & Neurologis
  orphen: 'Orphen - Obat untuk kejang epilepsi dan neurologi. Stabilisasi membran sel saraf. Perlu pemeriksaan berkala dokter saraf.',
  grafalin: 'Grafalin - Antikonvulsan dosis anak untuk pencegahan kejang. Profilaksis untuk anak berisiko kejang. Dosis disesuaikan berat badan anak.',
  
  // Antiemetic (Anti-Mual)
  ondansetron: 'Ondansetron - 5-HT3 antagonis untuk mual dan muntah terutama pasca operasi dan kemoterapi. Dosis 4-8mg IV, IM, atau PO. Sangat efektif dengan efek samping minimal.',
  
  // Suplemen & Vitamin
  lecozinc: 'Lecozinc - Zinc + vitamin C kombinasi untuk imunitas dan pemulihan luka. Penting saat sakit atau pasca operasi. Diminum 1x sehari preferably pagi.',
  'leco zink': 'Leco Zinc Sirup - Zinc sirup untuk anak guna meningkatkan imunitas dan cepat sembuh dari sakit. Rasa jeruk. Berfungsi sebagai imunostimulan.',
  'zinc sulfate': 'Zinc Sulfate - Suplemen zinc murni untuk imunitas dan penyembuhan luka. Direkomendasikan saat demam berdarah, sakit berat. Dosis 15-50mg/hari sesuai kondisi.',
  curcuma: 'Curcuma Lysine 60 - Kurkumin + Lisin untuk anti-inflamasi alami dan imunitas. Dari tanaman kunyit. Supplement herbal Aman untuk jangka panjang.',
  'vit c': 'Vitamin C - Asam askorbat untuk imunitas antioksidan pencegah flu. Asam + dapat meningkatkan penyerapan zat besi. Dewasa 50-200mg/hari, bayi 15-45mg.',
  'white vit c': 'White Vitamin C - Vitamin C putih asli untuk keamanan pencernaan dan penyerapan optimal. Tidak ada pewarna. Untuk mereka dengan pencernaan sensitif.',
  'vit c pot': 'Vitamin C Potassium - Vitamin C + Kalium kombinasi untuk imunitas dan keseimbangan elektrolit. Penting saat diare, muntah, atau dehidrasi.',
  
  // Topical - Salep & Lotion
  'bufacort salep': 'Bufacort Salep - Kombinasi antifungal dan steroid untuk infeksi jamur dengan peradangan. Oleskan tipis pada area terkena 2x sehari. Perbaikan terlihat 3-5 hari.',
  'salep 24': 'Salep 24 - Salep universal untuk luka, iritasi kulit ringan, dermatitis. Formula lembut tidak perih. Cocok untuk sensit skin. Oleskan tiap kali perlu.',
  'genalten cream': 'Genalten Cream - Krim untuk berbagai masalah kulit (eksim, dermatitis, gatal). Formula lembut tidak menyakit. Aplikasi 2-3x sehari.',
  'enbatic cream': 'Enbatic Cream - Krim menyembuhkan luka ringan, goresan, lecet. Kandungan antiseptik + nutrisi regenerasi. Perawatan luka modern aman anak.',
  
  // Pencernaan & Gangguan Lambung
  microlax: 'Microlax - Pencahar lunak untuk sembelit ringan. Enema mikro, kerja lokal di usus besar. Efek dalam 5-20 menit. Non-sistemik, aman untuk anak dan ibu hamil.',
  
  // Obat Tetes & Lotion Mata
  insto: 'Insto - Tetes mata regular untuk mata kering, lelah, iritasi ringan. Pelumas mata alami. Gunakan sesuai kebutuhan, biasanya 3-4x sehari saat mata terasa kering.',
  rohto: 'Rohto - Tetes mata dengan menthol menyegarkan untuk mata lelah dan merah. Sensasi dingin meredakan kelelahan. Gunakan 1-2 tetes pada pagi atau malam.',
  'rohto cool': 'Rohto Cool - Tetes mata segar dengan rasa dingin untuk mata lelah, alergi, dan iritasi. Memberikan kenyamanan instant. Ideal setelah layar lama.',
  'rohto steril': 'Rohto Steril 7ml - Tetes mata steril untuk iritasi mata, alergi, mata merah. Formula steril aman. Gunakan 1-2 tetes sesuai kebutuhan.',
  cazetin: 'Cazetin - Tetes mata untuk iritasi ringan, mata kering, conjunctivitis alergi. Formula mild tidak menyengat. Aman penggunaan berkala.',
  seremig: 'Seremig - Tetes mata untuk gejala mata lelah, minus, silau layar. Nutrisi mata optimal. Gunakan 1-2 tetes sebelum tidur.',
  
  // Minyak Therapeutik
  'minyak kayu putih': 'Minyak Kayu Putih - Minyak aromaterapi dengan eucalyptus untuk pusing, pereda nyeri otot, flu tradisional. Hangatkan di telapak tangan, oleskan di dada. Dapat dengan vaporisasi.',
  'minyak telon': 'Minyak Telon - Minyak tradisional untuk bayi demam, kembung, masuk angin. Dari essensial oil jahe, lemongrass, dll. Oleskan dada, perut, lengan bayi sebelum tidur.',
  
  // Antikonvulsan Tambahan
  vesperum: 'Vesperum - Suplemen untuk kesehatan dan kekuatan tulang, sendi. Kombinasi mineral dan vitamin. Penting untuk lansia dan osteoporosis.',
  'vesperum syr': 'Vesperum Sirup - Vesperum cair untuk anak dengan masalah pertumbuhan tulang. Rasa jeruk yang menarik, nutrisi tulang lengkap.',
  
  // Obat Lain
  allofar: 'Allofar (Allopurinol) - Obat untuk penyakit gout dan asam urat tinggi kronis. Mengurangi produksi asam urat. Diminum 1x sehari 100-300mg. Efek penuh 2-6 minggu. Perlu tes laboratorium berkala.',
  alleron: 'Alleron - Antihistamin untuk alergi dan urtikaria. Alternatif CTM, umumnya sedating. Untuk alergi akut dan berat.',
  alpara: 'Alpara - Obat untuk gangguan kecemasan, anxiety. Anxiolytic bermanfaat untuk OCD, GAD. Resep dokter anjuran.',
  ambeven: 'Ambeven - Vaso-aktif agent untuk gangguan sirkulasi, edema varises. Meningkatkan tonus pembuluh darah. Diminum 2-3x sehari.',
  anabion: 'Anabion - Vitamin dan mineral kombinasi lengkap. Suplemen nutrisi untuk defisiensi gizi, penyembuhan pasca sakit.',
  anaton: 'Anaton - Analgesik untuk nyeri sendi ringan, pegal linu otot. Alternatif NSAID. Diminum sesuai kebutuhan rasa nyeri.',
  anelat: 'Anelat - Analgesik untuk pereda nyeri umum, pegal linu. Non-NSAID alternatif untuk sensitive stomach.',
  'antasida doen': 'Antasida Doen - Antasida tablet atau sirup untuk asam lambung. Kombinasi MgOH dan AlOH. Efektif 30 menit-2 jam.',
  bufacaryl: 'Bufacaryl - Antibiotik lokal topikal untuk luka superfisial, cut, lecet. Antiseptik pencegah infeksi. Aplikasi berkala pada luka terbuka.',
  carbidu: 'Carbidu - Obat untuk masalah pernapasan, sesak napas ringan. Inhalasi vapor atau diminum. Tradisional untuk TBC awal.',
  'carbidu 0,5': 'Carbidu 0.5 - Formula ringan carbidu untuk anak. Dosis lebih kecil untuk keamanan. Sesak napas ringan anak.',
  coparcetin: 'Coparcetin - Bioflavonoid untuk kesehatan pembuluh darah, varises, edema. Memperkuat kapiler. Diminum 2-3x sehari.',
  curvit: 'Curvit - Suplemen kompleks untuk kesehatan umum, pemulihan pasca sakit. Vitamin dan mineral balance. Diminum 1x sehari.',
  'curvit syr': 'Curvit Sirup - Curvit cair untuk anak nutrisi lengkap. Pertumbuhan dan imunitas anak. Rasa jeruk yang gurih.',
  estalex: 'Estalex - Bronkodilator untuk masalah pernapasan, bronkitis. Lega napas dan membersihkan saluran udara blocked.',
  elsiron: 'Elsiron - Obat untuk kesehatan pembuluh darah, sirkulasi. Mencegah trombosis. Konsultasi dokter untuk dosis.',
  flasicox: 'Flasicox - Anti-inflamasi untuk sakit sendi, arthritis. Alternatif standard NSAID. Diminum dengan makanan.',
  flutamol: 'Flutamol - Analgesik pereda nyeri umum. Non-NSAID gentle untuk lambung. Diminum 1-2 tablet tiap 6 jam.',
  freshcare: 'Freshcare - Balsem aromaterapi untuk pegal linu, nyeri otot, strain. Hangatkan, oleskan, rasakan relaksasi otot.',
  'gpu lang': 'GPU Lang - Obat demam tradisional herbal. Jamu untuk turun panas alami. Diminum 1 botol tiap 6-8 jam demam.',
  'gpu lang 30ml': 'GPU Lang 30ml - GPU Lang petite ukuran untuk anak-anak. Dosis lebih kecil, rasa lebih toleran anak.',
  'gpu lang 60ml': 'GPU Lang 60ml - GPU Lang ukuran standar untuk dewasa. Satu botol untuk satu dosis penurun panas herbal.',
  'kondom sutra': 'Kondom Sutra Merah - Alat kontrasepsi barrier untuk hubungan intim responsibel. Perlindungan dual (kehamilan + PMS). Kualitas teruji dermatologis.',
  liflamal: 'Liflamal - Anti-inflamasi untuk nyeri sendi, radang lutut, osteoarthritis. Khusus formula long-acting, diminum 1x sehari.',
  lokev: 'Lokev - Lokal anestetik untuk luka superfisial, lecet ringan. Bius lokal non-sistemik. Aplikasi lokal kebutuhan, max 3x sehari.',
  mexon: 'Mexon - Obat untuk gangguan pencernaan, kembung, dispepsia. Antiflatulen dan carminatif. Diminum 1-2 tablet setelah makan.',
  mirasic: 'Mirasic - Parasetamol + kafein untuk nyeri kepala, migrain dengan kelemahan. Kafein meningkatkan efektivitas analgesik. Diminum tiap 4-6 jam.',
  'mirasic forte': 'Mirasic Forte - Parasetamol + kafein dosis lebih tinggi untuk migrain berat, nyeri kepala cluster. Lebih kuat dari regular. Gunakan saat nyeri akut.',
  voltadex: 'Voltadex - Diklofenak 50mg anti-inflamasi untuk nyeri endonesia dan radang. Tab dengan selaput untuk delayed release. 1-2 tablet tiap 8 jam.',
  wiros: 'Wiros (Piroxicam) - NSAID untuk nyeri sendi kronis, arthritis, osteoporosis pain. Long-acting once daily 10-20mg. Proteksi lambung dengan antasida concurrent.',
  zevask: 'Zevask - Montelukast untuk asma alergi, rhinitis alergi perennial. Coreceptor antagonist. Diminum 1x malam. Efek optimal 2 minggu pemakaian.',
  'zevask 5mg': 'Zevask 5mg - Montelukast dosis anak untuk asma kontrol alergi anak 2-6 tahun. Chewable tablet fruity flavor.',
  'zevask 10mg': 'Zevask 10mg - Montelukast dosis dewasa untuk asma persistent maintenance therapy. 1 tablet setiap malam. Tidak untuk acute attack (gunakan inhaler).',
  ramolit: 'Ramolit - Suplemen untuk metabolisme tulang dan persendian (osteoporoth treatment). Kalsilot + vitamin D. Jangka panjang untuk pencegahan fraktur.',
  
  // Fallback
  unknown: 'Obat ini memerlukan penjelasan lebih detail dari tenaga medis profesional.'
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
  const dashInventoryReview = document.getElementById('dashInventoryReview');
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
        <button type="button" class="btn-secondary obat-detail-trigger" data-id="${o.id}">ℹ️ Detail</button>
        <button class="btn-edit" data-id="${o.id}">✏️ Edit</button>
        <button class="btn-delete" data-id="${o.id}" data-nama="${escapeHtml(o.nama || '')}">🗑️ Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind edit/delete
  document.querySelectorAll('.btn-delete').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.closest('button').dataset.id;
      const nama = e.target.closest('button').dataset.nama || 'obat ini';
      if (confirm(`Hapus ${nama} secara permanen?`)) deleteObat(id);
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
      const ved = prompt('VED (V/E/D)', obat.ved || 'D');
      if (ved === null) return;
      const batch = prompt('Batch / Lot (opsional)', obat.batch || '');
      if (batch === null) return;
      const deskripsi = prompt('Deskripsi obat (opsional)', obat.deskripsi || '');
      if (deskripsi === null) return;
      updateObat(id, { nama, jumlah, kadaluarsa, kategori, ved, batch, deskripsi });
    });
  });

  document.querySelectorAll('.obat-detail-trigger').forEach((button) => {
    button.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      openObatDetailPopup(id);
    });
  });
}

async function deleteObat(id) {
  try {
    const res = await fetch(`/api/obat/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadAllData();
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
      await loadAllData();
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
  const activityCountLabel = document.getElementById('activityCountLabel');
  if (activityCountLabel) activityCountLabel.textContent = latestActivityCount;

  const getTypeLabel = (type) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('obat')) return 'OBAT';
    if (t.includes('audit')) return 'AUDIT';
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
    : '<li>Tidak ada aktivitas</li>';

  const logList = document.getElementById('logList');
  if (!logList) return;
  logList.innerHTML = safeLogs.slice(0, 10).length
    ? safeLogs.slice(0, 10).map(l => `<li>[${formatTime(l.time)}] <strong>${getTypeLabel(l.type)}</strong>: ${l.message}</li>`).join('')
    : '<li>Tidak ada log</li>';
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
    tbody.innerHTML = '<tr><td colspan="7">Tidak ada data stok untuk filter ini.</td></tr>';
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
  const nama = String(document.getElementById('inputNama').value || '').trim();
  const jumlahRaw = document.getElementById('inputJumlah').value;
  const jumlah = Number(jumlahRaw);
  const kadaluarsa = document.getElementById('inputKadaluarsa').value;
  const ved = document.getElementById('inputVed') ? document.getElementById('inputVed').value : '';
  const kategori = document.getElementById('inputKategori') ? document.getElementById('inputKategori').value : '';
  const batch = document.getElementById('inputBatch') ? document.getElementById('inputBatch').value : '';
  const deskripsi = document.getElementById('inputDeskripsi') ? document.getElementById('inputDeskripsi').value : '';

  if (!nama) {
    showToast('Nama obat wajib diisi.', 'error');
    return;
  }
  if (!Number.isFinite(jumlah)) {
    showToast('Jumlah harus berupa angka (bilangan bulat positif).', 'error');
    return;
  }
  if (jumlah <= 0) {
    showToast('Jumlah harus lebih dari 0.', 'error');
    return;
  }
  if (!Number.isInteger(jumlah)) {
    showToast('Jumlah harus berupa bilangan bulat (tidak boleh desimal).', 'error');
    return;
  }
  if (!kadaluarsa) {
    showToast('Tanggal kadaluarsa wajib diisi.', 'error');
    return;
  }
  if (!ved) {
    showToast('VED wajib dipilih.', 'error');
    return;
  }
  if (!kategori) {
    showToast('Kategori/Jenis obat wajib dipilih.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/obat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama, jumlah, kadaluarsa, kategori, batch, deskripsi, ved })
    });
    if (res.ok) {
      formTambahObat.reset();
      setTambahObatPanelOpen(false);
      await loadAllData();
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
function updateSelectObat() {
  const releaseObatSelect = document.getElementById('releaseObatSelect');
  if (!releaseObatSelect) return;
  
  const currentValue = releaseObatSelect.value;
  releaseObatSelect.innerHTML = '<option value="">-- Pilih Obat --</option>';
  allObat.forEach(obat => {
    const option = document.createElement('option');
    option.value = obat.id;
    option.textContent = `${obat.nama} (Stok: ${obat.jumlah})`;
    releaseObatSelect.appendChild(option);
  });
  if (currentValue && allObat.find(o => o.id === currentValue)) {
    releaseObatSelect.value = currentValue;
  }
}

async function handleLogout(event) {
  if (event) event.preventDefault();
  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.message || 'Gagal logout.', 'error');
      return;
    }
  } catch (err) {
    showToast('Gagal terhubung saat logout.', 'error');
  } finally {
    redirectToLogin();
  }
}

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

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

function setupMonthlyPdfDownload() {
  const monthInput = document.getElementById('reportMonth');
  const downloadBtn = document.getElementById('downloadMonthlyPdf');
  if (!monthInput || !downloadBtn) return;

  if (!monthInput.value) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${now.getFullYear()}-${month}`;
  }

  downloadBtn.addEventListener('click', async () => {
    const month = String(monthInput.value || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      showToast('Pilih bulan laporan terlebih dahulu.', 'warning');
      return;
    }

    const originalText = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Menyiapkan PDF...';

    try {
      const res = await fetch(`/api/reports/monthly-pdf?month=${encodeURIComponent(month)}`);
      if (res.status === 401) {
        showToast('Sesi login berakhir. Silakan login ulang.', 'warning');
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'Gagal mengunduh laporan PDF.', 'error');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Monthly-Report-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Laporan PDF berhasil diunduh.', 'success');
    } catch (err) {
      console.error('Error downloading monthly PDF:', err);
      showToast('Gagal terhubung saat mengunduh PDF.', 'error');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalText || 'Unduh PDF Bulanan';
    }
  });
}


function setupReleaseTracking() {
  const releaseObatSelect = document.getElementById('releaseObatSelect');
  const releaseQty = document.getElementById('releaseQty');
  const releaseKeterangan = document.getElementById('releaseKeterangan');
  const submitReleaseBtn = document.getElementById('submitReleaseBtn');
  const releaseStatus = document.getElementById('releaseStatus');

  if (!submitReleaseBtn) return;

  // Populate obat select
  const populateReleaseSelect = () => {
    if (!releaseObatSelect) return;
    const currentValue = releaseObatSelect.value;
    releaseObatSelect.innerHTML = '<option value="">-- Pilih Obat --</option>';
    allObat.forEach(obat => {
      const option = document.createElement('option');
      option.value = obat.id;
      option.textContent = `${obat.nama} (Stok: ${obat.jumlah})`;
      releaseObatSelect.appendChild(option);
    });
    if (currentValue && allObat.find(o => o.id === currentValue)) {
      releaseObatSelect.value = currentValue;
    }
  };

  // Submit release
  submitReleaseBtn.addEventListener('click', async () => {
    const obatId = releaseObatSelect ? releaseObatSelect.value : '';
    const qtyValue = releaseQty ? releaseQty.value : '';
    const qty = parseInt(qtyValue);
    const keterangan = releaseKeterangan ? releaseKeterangan.value : '';

    // Validasi
    if (!obatId || !obatId.trim()) {
      showToast('Pilih obat terlebih dahulu.', 'warning');
      return;
    }
    
    if (!qtyValue || !qtyValue.trim() || isNaN(qty) || qty < 1) {
      showToast('Masukkan jumlah obat yang valid (harus angka positif).', 'warning');
      return;
    }

    // Cek stok cukup
    const selectedObat = allObat.find(o => o.id === obatId);
    if (!selectedObat) {
      showToast('Obat tidak ditemukan. Silakan refresh halaman.', 'error');
      return;
    }
    
    if (qty > selectedObat.jumlah) {
      showToast(`Stok tidak cukup! Stok tersedia: ${selectedObat.jumlah} unit.`, 'warning');
      return;
    }

    submitReleaseBtn.disabled = true;
    submitReleaseBtn.textContent = 'Memproses...';

    const requestBody = { 
      obat_id: obatId, 
      jumlah: qty, 
      keterangan: keterangan || '' 
    };
    
    console.log('Sending release request:', {
      obatId,
      qty,
      selectedObat: selectedObat ? { id: selectedObat.id, nama: selectedObat.nama, jumlah: selectedObat.jumlah } : null,
      requestBody
    });

    try {
      const res = await fetch('/api/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      console.log('Response received:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        headers: {
          contentType: res.headers.get('content-type')
        }
      });

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr);
        console.error('Response status:', res.status);
        console.log('Response text preview:', await res.text().catch(() => 'Could not read response'));
        showToast('Error parsing server response. Check console.', 'error');
        return;
      }

      console.log('Response data:', data);

      if (!res.ok) {
        console.error('API Error Response:', {
          status: res.status,
          statusText: res.statusText,
          message: data && data.message ? data.message : 'Unknown error',
          fullResponse: data
        });
        showToast(data && data.message ? data.message : 'Gagal mencatat pelepasan.', 'error');
        return;
      }

      console.log('Release success:', data);

      if (releaseStatus) {
        releaseStatus.style.display = 'block';
        releaseStatus.style.backgroundColor = '#d4edda';
        releaseStatus.style.color = '#155724';
        releaseStatus.style.border = '1px solid #c3e6cb';
        releaseStatus.innerHTML = `✅ Pelepasan berhasil dicatat: ${qty} unit dikeluarkan, sisa stok ${data.remaining} unit`;
      }

      // Reset form
      if (releaseQty) releaseQty.value = '';
      if (releaseKeterangan) releaseKeterangan.value = '';

      // Reload data
      await fetchAllData();
      populateReleaseSelect();

      showToast('Pelepasan obat berhasil dicatat.', 'success');
    } catch (err) {
      console.error('Release error (catch):', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      showToast('Gagal mencatat pelepasan obat.', 'error');
      if (releaseStatus) {
        releaseStatus.style.display = 'block';
        releaseStatus.style.backgroundColor = '#f8d7da';
        releaseStatus.style.color = '#721c24';
        releaseStatus.style.border = '1px solid #f5c6cb';
        releaseStatus.textContent = '❌ Gagal mencatat pelepasan.';
      }
    } finally {
      submitReleaseBtn.disabled = false;
      submitReleaseBtn.textContent = 'Catat Pelepasan';
    }
  });

  // Show release section for reporting roles and populate on data change
  if (releaseSection) {
    releaseSection.style.display = 'block';
  }
  populateReleaseSelect();
}

function setupOperationalReportDownloads() {
  const fullPdfBtn = document.getElementById('downloadFullPdf');
  const csvBtn = document.getElementById('downloadCsvReport');
  const criticalPdfBtn = document.getElementById('downloadCriticalPdf');

  const triggerDownload = async (url, fallbackFileName, button) => {
    const originalText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Memproses...';
    }
    try {
      const res = await fetch(url);
      if (res.status === 401) {
        showToast('Sesi login berakhir. Silakan login ulang.', 'warning');
        redirectToLogin();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'Gagal mengunduh laporan.', 'error');
        return;
      }

      const blob = await res.blob();
      const a = document.createElement('a');
      const header = res.headers.get('Content-Disposition') || '';
      const m = header.match(/filename="?([^";]+)"?/i);
      const fileName = (m && m[1]) ? m[1] : fallbackFileName;
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      showToast('Laporan berhasil diunduh.', 'success');
    } catch (err) {
      console.error('Error downloading report:', err);
      showToast('Gagal terhubung saat mengunduh laporan.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  };

  if (fullPdfBtn) {
    fullPdfBtn.addEventListener('click', () => {
      triggerDownload('/api/reports/pdf', 'Laporan-Stok-Obat.pdf', fullPdfBtn);
    });
  }
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      triggerDownload('/api/reports/csv', 'Laporan-Stok-Obat.csv', csvBtn);
    });
  }
  if (criticalPdfBtn) {
    criticalPdfBtn.addEventListener('click', () => {
      triggerDownload('/api/reports/critical-pdf', 'Critical-Report.pdf', criticalPdfBtn);
    });
  }
}

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
const monitoringExpiryFilter = document.getElementById('monitoringExpiryFilter');
if (monitoringExpiryFilter) monitoringExpiryFilter.addEventListener('change', renderMonitoringKadaluarsa);
const monitoringMonthFilter = document.getElementById('monitoringMonthFilter');
if (monitoringMonthFilter) monitoringMonthFilter.addEventListener('change', renderMonitoringKadaluarsa);
const stockMonitoringFilter = document.getElementById('stockMonitoringFilter');
if (stockMonitoringFilter) stockMonitoringFilter.addEventListener('change', renderStockMonitoringTable);

const openTambahBtn = document.getElementById('openTambahBtn');
if (openTambahBtn) {
  openTambahBtn.addEventListener('click', () => {
    const card = document.getElementById('tambahObatCard');
    const isOpen = !!(card && card.style.display !== 'none');
    setTambahObatPanelOpen(!isOpen);
  });
}
const closeTambahBtn = document.getElementById('closeTambahBtn');
if (closeTambahBtn) closeTambahBtn.addEventListener('click', () => setTambahObatPanelOpen(false));

// Obat Keluar button handlers
const openObatKeluarBtn = document.getElementById('openObatKeluarBtn');
if (openObatKeluarBtn) {
  openObatKeluarBtn.addEventListener('click', () => {
    const card = document.getElementById('obatKeluarCard');
    if (card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
  });
}
const closeObatKeluarBtn = document.getElementById('closeObatKeluarBtn');
if (closeObatKeluarBtn) {
  closeObatKeluarBtn.addEventListener('click', () => {
    const card = document.getElementById('obatKeluarCard');
    if (card) card.style.display = 'none';
  });
}

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
  item.addEventListener('click', async function(e) {
    e.preventDefault();
    const section = this.dataset.section;

    if (section === 'profile') {
      updateProfileInfo();
    }

    if (section === 'users' && isApj()) {
      await loadEmailSettings();
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

    if (['monitoring-kadaluarsa', 'monitoring-stok', 'data-kadaluarsa', 'dashboard'].includes(section)) {
      await loadAllData();
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
setupSidebarToggle();
bindObatDetailPopup();
setupReleaseTracking();

// Setup email settings checkbox listener
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'emailEnabledCheckbox') {
    const enabled = e.target.checked;
    const statusDisplay = document.getElementById('emailStatusDisplay');
    if (statusDisplay) {
      statusDisplay.textContent = enabled ? '✅ Aktif' : '⏸️ Nonaktif';
      statusDisplay.style.color = enabled ? '#27ae60' : '#e74c3c';
    }
  }
});

// Setup event listeners for report download buttons
document.addEventListener('DOMContentLoaded', () => {
  // Report download buttons
  const reportBtns = document.querySelectorAll('.report-download-btn');
  reportBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const reportType = btn.dataset.reportType;
      downloadReport(reportType);
    });
  });

  // Email settings buttons
  const saveEmailBtn = document.querySelector('.email-save-btn');
  if (saveEmailBtn) {
    saveEmailBtn.addEventListener('click', (e) => {
      e.preventDefault();
      saveEmailSettings();
    });
  }

  const testEmailBtn = document.querySelector('.email-test-btn');
  if (testEmailBtn) {
    testEmailBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sendTestEmail();
    });
  }
});

