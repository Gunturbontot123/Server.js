async function checkAuth() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    window.location = '/login.html';
    return false;
  }
  return true;
}

async function loadData() {
  if (!(await checkAuth())) return;
  const [resObat, resNotif, resLogs] = await Promise.all([
    fetch('/api/obat'),
    fetch('/api/notifications'),
    fetch('/api/logs')
  ]);

  const obat = await resObat.json();
  const notif = await resNotif.json();
  const logs = await resLogs.json();

  renderTable(obat);
  updateCards(obat, notif);
  renderLogs(logs);
}

function renderTable(obat) {
  const tbody = document.querySelector('#tableObat tbody');
  tbody.innerHTML = '';
  obat.forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${o.nama}</td><td>${o.jumlah}</td><td>${o.kadaluarsa}</td><td>${o.ved}</td>
      <td><button data-id="${o.id}" class="btn small btn-edit">Edit</button> <button data-id="${o.id}" class="btn small btn-delete">Hapus</button></td>`;
    tbody.appendChild(tr);
  });

  // bind edit/delete
  document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    if (!confirm('Hapus obat ini?')) return;
    await fetch('/api/obat/' + id, { method: 'DELETE' });
    loadData();
  }));

  document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    const o = obat.find(x => x.id === id);
    if (!o) return;
    const nama = prompt('Nama', o.nama); if (nama===null) return;
    const jumlah = Number(prompt('Jumlah', o.jumlah)); if (isNaN(jumlah)) return alert('Jumlah tidak valid');
    const kadaluarsa = prompt('Kadaluarsa (YYYY-MM-DD)', o.kadaluarsa); if (!kadaluarsa) return;
    fetch('/api/obat/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nama, jumlah, kadaluarsa }) }).then(()=>loadData());
  }));
}

function updateCards(obat, notif) {
  document.getElementById('totalObat').textContent = obat.length;
  document.getElementById('nearExpiry').textContent = notif.nearExpiry.length + ' item';
  document.getElementById('lowStock').textContent = notif.lowStock.length + ' item';

  const ved = obat.reduce((acc,o)=>{ acc[o.ved] = (acc[o.ved]||0)+1; return acc; },{});
  document.getElementById('vedSummary').innerHTML = `V: ${ved.V||0} &nbsp; E: ${ved.E||0} &nbsp; D: ${ved.D||0}`;

  const noteEl = document.getElementById('notifications');
  noteEl.innerHTML = '';
  if (notif.nearExpiry.length===0 && notif.lowStock.length===0) noteEl.textContent = 'Tidak ada notifikasi saat ini.';
  else {
    if (notif.nearExpiry.length) {
      const h = document.createElement('div'); h.innerHTML = `<b>Hampir kadaluarsa:</b> ${notif.nearExpiry.map(i=>i.nama+' ('+i.kadaluarsa+')').join(', ')}`;
      noteEl.appendChild(h);
    }
    if (notif.lowStock.length) {
      const h = document.createElement('div'); h.innerHTML = `<b>Stok rendah:</b> ${notif.lowStock.map(i=>i.nama+' ('+i.jumlah+')').join(', ')}`;
      noteEl.appendChild(h);
    }
  }

  // build chart
  const wrap = document.getElementById('chartWrap');
  wrap.innerHTML = `<div class="card"><h3>Chart Stok</h3><canvas id="stokChart" width="600" height="200"></canvas></div>`;
  const ctx = document.getElementById('stokChart');
  if (window.Chart && ctx) {
    const labels = obat.map(o=>o.nama);
    const data = obat.map(o=>o.jumlah);
    if (window._stokChart) window._stokChart.destroy();
    window._stokChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Jumlah', data, backgroundColor: 'rgba(0,184,148,0.6)' }] }, options: { responsive:true, maintainAspectRatio:false } });
  } else {
    // lazy load Chart.js
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/chart.js'; s.onload = () => updateCards(obat, notif); document.body.appendChild(s);
  }
}

function renderLogs(logs){
  const ul = document.getElementById('logs');
  ul.innerHTML = '';
  logs.slice(0,15).forEach(l => {
    const li = document.createElement('li'); li.textContent = `[${new Date(l.time).toLocaleString()}] ${l.type.toUpperCase()}: ${l.message}`;
    ul.appendChild(li);
  });
}

// add obat
if (document.getElementById('btnAdd')) {
  document.getElementById('btnAdd').addEventListener('click', async () => {
    const nama = document.getElementById('nama').value;
    const jumlah = Number(document.getElementById('jumlah').value);
    const kadaluarsa = document.getElementById('kadaluarsa').value;
    const res = await fetch('/api/obat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nama, jumlah, kadaluarsa }) });
    if (res.ok) { document.getElementById('nama').value=''; document.getElementById('jumlah').value=1; document.getElementById('kadaluarsa').value=''; loadData(); }
    else { const body = await res.json().catch(()=>({message:'error'})); alert(body.message||'Gagal'); }
  });
}

// FEFO
if (document.getElementById('btnFEFO')) {
  document.getElementById('btnFEFO').addEventListener('click', async () => {
    if (!confirm('Keluarkan 1 unit obat berdasarkan FEFO?')) return;
    const res = await fetch('/api/keluar', { method: 'POST' });
    if (res.ok) { const body = await res.json(); alert(body.message); loadData(); }
    else { const body = await res.json().catch(()=>({message:'error'})); alert(body.message||'Gagal'); }
  });
}

// export CSV
if (document.getElementById('btnExport')) {
  document.getElementById('btnExport').addEventListener('click', async () => {
    const res = await fetch('/api/obat');
    const obat = await res.json();
    const csv = ['Nama,Jumlah,Kadaluarsa,VED', ...obat.map(o => `${o.nama.replace(/,/g,' ')} , ${o.jumlah}, ${o.kadaluarsa}, ${o.ved}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'obat.csv'; a.click(); URL.revokeObjectURL(url);
  });
}
// Logout
if (document.getElementById('btnLogout')) {
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location = '/login.html';
  });
}

// on load
window.addEventListener('load', () => {
  if (window.location.pathname.endsWith('dashboard.html')) loadData();
});

// small helper for login page
if (window.location.pathname.endsWith('login.html')) {
  // if already logged in, redirect
  fetch('/api/me').then(r => { if (r.ok) window.location = '/dashboard.html' });
}

// Socket.IO client for real-time notifications
(function(){
  const s = document.createElement('script');
  s.src = '/socket.io/socket.io.js';
  s.onload = () => {
    try {
      const socket = io();
      socket.on('connect', ()=>console.log('socket connected', socket.id));
      socket.on('notifications', (data) => {
        console.log('socket notifications', data);
        if (window.location.pathname.endsWith('dashboard.html')) loadData();
        if ((data && data.nearExpiry && data.nearExpiry.length) || (data && data.lowStock && data.lowStock.length)) {
          showToast({ type: 'warning', text: 'Ada notifikasi baru: cek dashboard' });
        }
      });
      socket.on('log', (entry) => { if (window.location.pathname.endsWith('dashboard.html')) loadData(); });
    } catch (e) { console.warn('Socket.IO not available', e); }
  };
  document.head.appendChild(s);
})();

// Toast helper
function showToast({ type='info', text='Notifikasi' , timeout=5000 } = {}){
  let container = document.querySelector('.toast-container');
  if (!container) { container = document.createElement('div'); container.className='toast-container'; document.body.appendChild(container); }
  const t = document.createElement('div'); t.className = 'toast toast--' + (type||'info');
  const body = document.createElement('div'); body.className='toast-body'; body.textContent = text;
  const btn = document.createElement('button'); btn.className='toast-close'; btn.innerHTML='✕';
  btn.addEventListener('click', ()=>{ t.classList.add('toast--hide'); setTimeout(()=>t.remove(),300); });
  t.appendChild(body); t.appendChild(btn); container.appendChild(t);
  setTimeout(()=>{ t.classList.add('toast--hide'); setTimeout(()=>t.remove(),300); }, timeout);
  return t;
}
