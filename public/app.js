/* ===== AUTH & INITIAL SETUP ===== */
let currentUser = null;
let allObat = [];
let stokChart = null;

/* ===== AUTO FETCH WITH CREDENTIALS ===== */
(function () {
  if (typeof window !== "undefined" && window.fetch) {
    const _fetch = window.fetch.bind(window);
    window.fetch = function (url, opts = {}) {
      if (!opts.credentials) opts.credentials = "same-origin";
      return _fetch(url, opts);
    };
  }
})();

/* ===== INIT ===== */
async function init() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      window.location = "/login.html";
      return;
    }

    const data = await res.json();
    currentUser = data.user;

    document.getElementById("userAvatar").textContent =
      (currentUser.username || "A")[0].toUpperCase();
    document.getElementById("userName").textContent =
      currentUser.username || "User";

    setupNavigation();
    await loadAllData();
  } catch (err) {
    window.location = "/login.html";
  }
}

/* ===== NAVIGATION ===== */
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      if (!section) return;

      document
        .querySelectorAll(".nav-item")
        .forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      document
        .querySelectorAll(".content-section")
        .forEach((s) => s.classList.remove("active"));

      const target = document.getElementById(`section-${section}`);
      if (target) target.classList.add("active");
    });
  });
}

/* ===== LOAD ALL DATA ===== */
async function loadAllData() {
  try {
    const resObat = await fetch("/api/obat");
    allObat = await resObat.json();

    updateDashboard();
    renderDataObatTable(allObat);
    updateCharts();
    updateVED();
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

/* ===== DASHBOARD ===== */
function updateDashboard() {
  document.getElementById("totalObat").textContent =
    allObat.length;
}

/* ===== EXPIRY STATUS ===== */
function getExpiryStatus(kadaluarsa) {
  if (!kadaluarsa)
    return { key: "baik", label: "Baik", color: "#27ae60" };

  const d = new Date(kadaluarsa + "T00:00:00");
  const diffDays = Math.ceil(
    (d - new Date()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0)
    return { key: "kadaluarsa", label: "Kadaluarsa", color: "#e74c3c" };
  if (diffDays <= 30)
    return { key: "hampir", label: "Hampir Kadaluarsa", color: "#f39c12" };

  return { key: "baik", label: "Baik", color: "#27ae60" };
}

/* ===== DATA TABLE ===== */
function renderDataObatTable(data) {
  const tbody = document.getElementById("tableObat");
  tbody.innerHTML = "";

  data.forEach((o) => {
    const st = getExpiryStatus(o.kadaluarsa);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.nama}</td>
      <td>${o.jumlah}</td>
      <td>${o.kadaluarsa || "-"}</td>
      <td><span class="status-badge status-${st.key}">
          ${st.label}
      </span></td>
      <td>${o.ved || "-"}</td>
      <td>
        <button onclick="editObat('${o.id}')">✏️</button>
        <button onclick="deleteObat('${o.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteObat(id) {
  if (!confirm("Hapus obat ini?")) return;
  await fetch(`/api/obat/${id}`, { method: "DELETE" });
  loadAllData();
}

async function editObat(id) {
  const obat = allObat.find((o) => o.id === id);
  if (!obat) return;

  const nama = prompt("Nama", obat.nama);
  const jumlah = Number(prompt("Jumlah", obat.jumlah));
  const kadaluarsa = prompt("Kadaluarsa (YYYY-MM-DD)", obat.kadaluarsa);

  if (!nama || isNaN(jumlah) || !kadaluarsa) return;

  await fetch(`/api/obat/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama, jumlah, kadaluarsa }),
  });

  loadAllData();
}

/* ===== MODAL TAMBAH OBAT ===== */
function openTambahModal() {
  document.getElementById("tambahModal").style.display = "flex";
}

function closeTambahModal() {
  document.getElementById("tambahModal").style.display = "none";
}

async function submitTambahObat() {
  const nama = document.getElementById("modalNama").value;
  const jumlah = Number(document.getElementById("modalJumlah").value);
  const kadaluarsa =
    document.getElementById("modalKadaluarsa").value;

  if (!nama || isNaN(jumlah) || !kadaluarsa) {
    alert("Semua field harus diisi!");
    return;
  }

  await fetch("/api/obat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nama, jumlah, kadaluarsa }),
  });

  closeTambahModal();
  loadAllData();
}

/* ===== KELUAR FEFO ===== */
document.getElementById("keluarBtn")?.addEventListener("click", async () => {
  if (!confirm("Keluar 1 unit obat (FEFO)?")) return;

  const res = await fetch("/api/keluar", { method: "POST" });
  const data = await res.json();
  alert(data.message);

  loadAllData();
});

/* ===== VED ===== */
function updateVED() {
  const v = allObat.filter((o) => o.jumlah <= 2);
  const e = allObat.filter((o) => o.jumlah > 2 && o.jumlah <= 10);
  const d = allObat.filter((o) => o.jumlah > 10);

  document.getElementById("vedVList").innerHTML =
    v.map((o) => `<li>${o.nama} (${o.jumlah})</li>`).join("") ||
    "<li>Tidak ada</li>";

  document.getElementById("vedEList").innerHTML =
    e.map((o) => `<li>${o.nama} (${o.jumlah})</li>`).join("") ||
    "<li>Tidak ada</li>";

  document.getElementById("vedDList").innerHTML =
    d.map((o) => `<li>${o.nama} (${o.jumlah})</li>`).join("") ||
    "<li>Tidak ada</li>";
}

/* ===== CHART ===== */
function updateCharts() {
  const ctx = document.getElementById("stokChart");
  if (!ctx) return;

  if (stokChart) stokChart.destroy();

  stokChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: allObat.map((o) => o.nama),
      datasets: [
        {
          label: "Jumlah Stok",
          data: allObat.map((o) => o.jumlah),
        },
      ],
    },
  });
}

/* ===== LOGOUT ===== */
document
  .getElementById("logoutBtn")
  ?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm("Logout?")) return;

    await fetch("/api/logout", { method: "POST" });
    window.location = "/login.html";
  });

window.addEventListener("load", init);