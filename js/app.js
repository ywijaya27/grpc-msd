window.grpcBuildId = "GRPC-ROWPRINT-20261105-02";
/**
 * ============================================================================
 * GOODS RECEIVED PHOTO AND CHECKLIST (GRPC) - JAVASCRIPT ENGINE
 * File: Javascript.html (JavaScript.html)
 * Architecture: Client-Side SPA, Instant UX, Laptop Webcam & File Upload, RBAC
 * Version: 2.4.1 (Multi-Device Hotfix)
 * ============================================================================
 */

// \u2500\u2500 GLOBAL APPLICATION STATE (OPTIMISTIC & INSTANT UX) \u2500\u2500
window.appState = {
  currentUser: null, sessionToken: null, materials: [], planners: [], users: [],
  kpi: {todayCount:0, urgentCount:0, defectCount:0}, activeInspection: {},
  pendingPrintRef: null, printRef: null, printItem: null, printRequestId: 0, saving: false,
  currentEditingRef: null,
  webcamStream: null
};

// \u2500\u2500 INITIALIZATION ON DOM LOAD \u2500\u2500
function initializeGrpc() {
  if (window.grpcBooted) return;
  try {
    initTheme();
    navigateTo('login');
    updateDeviceMode();
    window.addEventListener('resize', updateDeviceMode);
    setupKeyboardShortcuts();
    window.grpcBooted = true;
    const errorBox = document.getElementById('grpc-startup-error');
    if (errorBox) errorBox.hidden = true;
  } catch (error) {
    const login = document.getElementById('section-login');
    if (login) login.classList.add('active');
    if (window.grpcBootError) window.grpcBootError(error.message);
    else console.error('GRPC startup:', error);
  }
}

// ============================================================================
// 1. SINGLE PAGE APPLICATION (SPA) ROUTING (0ms DELAY)
// ============================================================================
function navigateTo(sectionId) {
  if (sectionId === 'login' && window.appState.currentUser) { logoutApp(); return; }
  if (!window.appState.currentUser) sectionId = 'login';
  if (sectionId === 'userAdmin' && !hasPermission('admin')) return;
  if (sectionId === 'printPreview' && !window.appState.printRef) {
    showToast('Pilih tombol Cetak pada baris Material Master.', 'info'); sectionId = 'materialMaster';
  }
  document.body.classList.toggle('is-logged-out', sectionId === 'login');
  document.body.classList.toggle('print-ready', sectionId === 'printPreview');
  // 1. Sembunyikan semua section
  document.querySelectorAll('.app-section').forEach(function(sec) {
    sec.classList.remove('active');
  });

  // 2. Tampilkan target section
  const target = document.getElementById('section-' + sectionId);
  if (target) {
    target.classList.add('active');
  }

  // 3. AUTO-LAYOUT TOP: Paksa instan scroll ke paling atas tanpa delay di semua browser/device (HP, Laptop, Tablet, Notepad)
  window.scrollTo(0, 0);
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.scrollTop = 0;
  if (target) {
    target.scrollTop = 0;
  }

  // 3. Reset dan aktifkan kelas tab navigasi di header
  const tabIds = ['dashboard', 'materialMaster', 'mobileInspection', 'userAdmin'];
  tabIds.forEach(function(id) {
    const btn = document.getElementById('nav-' + id);
    if (btn) {
      if (id === sectionId) {
        btn.className = 'nav-tab-btn px-3.5 py-1.5 rounded-lg font-bold text-white bg-[var(--primary)] shadow-sm flex items-center gap-1.5 tracking-wide';
      } else {
        btn.className = 'nav-tab-btn px-3 py-1.5 rounded-lg font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5';
      }
    }
  });

  // 4. Lifecycle per Section
  if (sectionId === 'dashboard') {
    renderDashboard(window.appState.materials, window.appState.kpi);
  } else if (sectionId === 'materialMaster') {
    renderMaterialTable(window.appState.materials);
    updateKpiTiles();
  } else if (sectionId === 'userAdmin') {
    renderUsersTable(window.appState.users);
  }

  // Matikan webcam jika keluar dari halaman mobile inspection
  if (sectionId !== 'mobileInspection') {
    stopWebcamStream();
  }

  enforcePermissionGating();
}

function toggleMobileNavMenu() {
  const menu = document.getElementById('mobileNavMenu');
  if (menu) menu.classList.toggle('hidden');
}

// ============================================================================
// 2. THEME ENGINE: DUAL LIGHT / DARK MODE
// ============================================================================
function initTheme() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('grpc_theme') || 'light'; } catch (error) {}
  document.documentElement.setAttribute('data-theme', savedTheme === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('grpc_theme', next); } catch (error) {}
  showToast('Tampilan beralih ke Mode ' + (next === 'dark' ? 'Gelap' : 'Terang'), 'info');
}

// ============================================================================
// 3. TOAST NOTIFICATION UTILITY
// ============================================================================
function showToast(message, type) {
  const container = document.getElementById('grpcToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'grpc-toast';

  let icon = 'info';
  let borderColor = 'var(--secondary)';
  if (type === 'success') { icon = 'check_circle'; borderColor = 'var(--primary)'; }
  if (type === 'warning') { icon = 'warning'; borderColor = 'var(--tertiary)'; }
  if (type === 'danger') { icon = 'error'; borderColor = 'var(--danger)'; }

  toast.style.borderLeftColor = borderColor;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-[20px]" style="color: ${borderColor}">${icon}</span>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(function() { toast.remove(); }, 250);
  }, 3500);
}

// ============================================================================
// 4. DATA ENGINE: OPTIMISTIC LOCAL INITIALIZATION & GAS SYNC
// ============================================================================
async function loadInitialData() {
  try { const res = await api('getInitialAppData'); applyInitialData(res.data); }
  catch(e) { showToast(e.message, 'danger'); }
}

function applyInitialData(data) {
  window.appState.materials = (data.materials || []).map(m => {
    ['current','previous'].forEach(k=>{ if(m[k+'_photo_id'] && !String(m[k+'_photo_id']).startsWith('DEMO')) m[k+'_photo_url']='https:\x2f\x2fdrive.google.com/thumbnail?id='+encodeURIComponent(m[k+'_photo_id'])+'&sz=w1600'; }); return m;
  });
  window.appState.planners = data.planners || [];
  window.appState.kpi = data.kpi || {};
  renderMaterialTable(window.appState.materials); populatePlannerDropdown(); populateInspectionPO();
  updateKpiTiles(); if(hasPermission('admin')) loadAllUsers();
}

function loadFallbackDemoData() {}

function filterMasterBy(filterType) {
  navigateTo('materialMaster');
  filterMaterialTable(filterType);
}

function renderDashboard(materials, kpiData) {
  materials = materials || window.appState.materials || [];
  
  let todayCount = 0;
  let urgentCount = 0;
  let emergencyCount = 0;
  let defectCount = 0;
  let carCount = 0;
  let partialCount = 0;
  let totalRemainQty = 0;

  let packGood = 0, packBad = 0;
  let docComp = 0, docIncomp = 0;
  let specSuit = 0, specUnsuit = 0;
  let qualGood = 0, qualBad = 0;

  const expediteList = [];
  const carList = [];

  const todayStr = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Jakarta'}); // Tanggal referensi sistem

  materials.forEach(function(m) {
    const rcvDate = (m.rcv_date || '').toString();
    if (rcvDate.indexOf(todayStr) >= 0 || rcvDate.indexOf(new Date().toISOString().slice(0, 10)) >= 0) {
      todayCount++;
    }
    if (m.order_status === 'Urgent' || m.order_status === 'Emergency') {
      if (m.order_status === 'Emergency') emergencyCount++;
      else urgentCount++;
      expediteList.push(m);
    }
    if (m.packaging_cond === 'Good') packGood++;
    else if (m.packaging_cond === 'Bad') packBad++;

    if (m.doc_completion === 'Complete') docComp++;
    else if (m.doc_completion === 'Incomplete') docIncomp++;

    if (m.mat_specification === 'Suitable') specSuit++;
    else if (m.mat_specification === 'Unsuitable') specUnsuit++;

    if (m.mat_quality === 'Good') qualGood++;
    else if (m.mat_quality === 'Bad') qualBad++;

    if (m.delivery_qty_status === 'Partial Received' || Number(m.remain_qty) > 0) {
      partialCount++;
      totalRemainQty += Number(m.remain_qty) || 0;
    }

    const hasCar = (m.id_car && m.id_car.toString().trim() !== '');
    const isDefect = (m.packaging_cond === 'Bad' || m.mat_specification === 'Unsuitable' || m.mat_quality === 'Bad');
    if (hasCar || isDefect) {
      defectCount++;
      if (hasCar) carCount++;
      carList.push(m);
    }
  });

  // Top 4 Hero Metrics
  const elToday = document.getElementById('dash-today-count');
  if (elToday) elToday.textContent = todayCount;

  const elUrgent = document.getElementById('dash-urgent-count');
  if (elUrgent) elUrgent.textContent = ('0' + (urgentCount + emergencyCount)).slice(-2);

  const elDefect = document.getElementById('dash-defect-count');
  if (elDefect) elDefect.textContent = ('0' + (defectCount || carCount)).slice(-2);

  const elPartial = document.getElementById('dash-partial-count');
  if (elPartial) elPartial.textContent = ('0' + partialCount).slice(-2);

  const elRemain = document.getElementById('dash-remain-qty-badge');
  if (elRemain) elRemain.textContent = totalRemainQty + ' EA REMAIN';

  // KRI-RCV Risk Bars
  const packTotal = Math.max(1, packGood + packBad);
  const packPct = Math.round((packGood / packTotal) * 100);
  setProgressBar('kri-pack-bar', 'kri-pack-text', packPct, packGood + ' Good / ' + packBad + ' Bad');

  const docTotal = Math.max(1, docComp + docIncomp);
  const docPct = Math.round((docComp / docTotal) * 100);
  setProgressBar('kri-doc-bar', 'kri-doc-text', docPct, docComp + ' Complete / ' + docIncomp + ' Incomplete');

  const specTotal = Math.max(1, specSuit + specUnsuit);
  const specPct = Math.round((specSuit / specTotal) * 100);
  setProgressBar('kri-spec-bar', 'kri-spec-text', specPct, specSuit + ' Suitable / ' + specUnsuit + ' Unsuitable');

  const qualTotal = Math.max(1, qualGood + qualBad);
  const qualPct = Math.round((qualGood / qualTotal) * 100);
  setProgressBar('kri-qual-bar', 'kri-qual-text', qualPct, qualGood + ' Good / ' + qualBad + ' Bad');

  // Overall Score
  const overallPct = Math.round((packPct + docPct + specPct + qualPct) / 4);
  const elScore = document.getElementById('dash-overall-score');
  if (elScore) {
    elScore.innerHTML = `<span class="w-2 h-2 rounded-full ${overallPct >= 90 ? 'bg-emerald-500' : 'bg-amber-500'} animate-ping mr-1"></span> ${overallPct}% COMPLIANCE`;
  }

  // Render Queue Tables
  renderExpediteQueueTable(expediteList);
  renderCarAuditQueueTable(carList);
}

function setProgressBar(barId, textId, pct, label) {
  const bar = document.getElementById(barId);
  const text = document.getElementById(textId);
  if (bar) {
    bar.style.width = pct + '%';
    bar.className = (pct >= 90 ? 'bg-[#1E7E34]' : (pct >= 75 ? 'bg-[#F57C00]' : 'bg-[#D32F2F]')) + ' h-full rounded-full transition-all duration-300';
  }
  if (text) {
    text.textContent = pct + '% (' + label + ')';
    text.className = (pct >= 90 ? 'text-emerald-700 dark:text-emerald-400' : (pct >= 75 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400')) + ' font-bold';
  }
}

function renderExpediteQueueTable(list) {
  const tbody = document.getElementById('dash-expedite-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 font-sans">Tidak ada antrian barang darurat saat ini.</td></tr>';
    return;
  }
  list.forEach(function(item) {
    const isEmerg = item.order_status === 'Emergency';
    const badge = isEmerg 
      ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse">EMERGENCY</span>'
      : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">URGENT</span>';
    
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40';
    tr.innerHTML = `
      <td class="py-2 px-1 font-mono font-bold text-slate-900 dark:text-slate-100">${escapeHtml(item.po_no)} <span class="text-emerald-700 font-semibold block text-[11px]">${escapeHtml(item.material_no)}</span></td>
      <td class="py-2 px-1 text-slate-700 dark:text-slate-300 max-w-[130px] truncate" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</td>
      <td class="py-2 px-1">${badge}</td>
      <td class="py-2 px-1 text-right">
        <button type="button" data-ref="${escapeHtml(item.grpc_no)}" data-po="${escapeHtml(item.po_no)}" data-material="${escapeHtml(item.material_no)}" onclick="quickPrintReport(this.dataset.ref, this.dataset.po, this.dataset.material, this)" class="btn-action-report" title="Cetak laporan item ini" aria-label="Cetak laporan item ini">${printIconMarkup()}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCarAuditQueueTable(list) {
  const tbody = document.getElementById('dash-car-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400 font-sans">Tidak ada temuan CAR atau barang rusak (All Clear).</td></tr>';
    return;
  }
  list.forEach(function(item) {
    const carId = item.id_car ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 font-mono">${item.id_car}</span>` : '<span class="text-slate-400 font-mono text-[10px]">QA-HOLD</span>';
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40';
    tr.innerHTML = `
      <td class="py-2 px-1">${carId}</td>
      <td class="py-2 px-1 font-mono font-bold text-slate-900 dark:text-slate-100">${escapeHtml(item.po_no)} <span class="text-emerald-700 block text-[11px] font-semibold">${escapeHtml(item.material_no)}</span></td>
      <td class="py-2 px-1 text-slate-700 dark:text-slate-300 max-w-[140px] truncate" title="${escapeHtml(item.remarks)}">${item.remarks || 'Packaging/Quality QA Hold'}</td>
      <td class="py-2 px-1 text-right">
        <button type="button" data-ref="${escapeHtml(item.grpc_no)}" data-po="${escapeHtml(item.po_no)}" data-material="${escapeHtml(item.material_no)}" onclick="quickPrintReport(this.dataset.ref, this.dataset.po, this.dataset.material, this)" class="btn-action-report" title="Cetak laporan item ini" aria-label="Cetak laporan item ini">${printIconMarkup()}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateKpiTiles() {
  const elToday = document.getElementById('kpi-today-count');
  const elUrgent = document.getElementById('kpi-urgent-count');
  const elDefect = document.getElementById('kpi-defect-count');

  if (elToday) elToday.textContent = window.appState.kpi.todayCount || 0;
  if (elUrgent) elUrgent.textContent = ('0' + (window.appState.kpi.urgentCount || 0)).slice(-2);
  if (elDefect) elDefect.textContent = ('0' + (window.appState.kpi.defectCount || 0)).slice(-2);
}

function populatePlannerDropdown() {
  const select = document.getElementById('insp-checked-by');
  if (!select || !window.appState.planners) return;
  select.replaceChildren(new Option('Pilih pemeriksa', ''));
  window.appState.planners.filter(p=>p.is_active!==false && String(p.is_active).toLowerCase()!=='false').forEach(function(p) {
    const opt = document.createElement('option');
    opt.value = p.nama_planner + ' (' + p.dept + ')';
    opt.textContent = p.nama_planner + ' (' + p.dept + ')';
    select.appendChild(opt);
  });
}

function refreshMaterialData() {
  showToast('Memperbarui data dari Google Sheets...', 'info');
  loadInitialData();
}

// ============================================================================
// 5. LAPTOP WEBCAM STREAMING & DUAL PHOTO CAPTURE
// ============================================================================
function toggleWebcamStream() {
  if (!window.appState.activeInspection.grpc_no) return showToast('Pilih PO dan material dahulu.', 'warning');
  const video = document.getElementById('webcam-video-stream');
  const previewImg = document.getElementById('mobile-photo-preview');
  const btnText = document.getElementById('webcam-btn-text');
  const snapBtn = document.getElementById('btn-snap-webcam');
  const iconLabel = document.getElementById('webcam-icon-label');
  const reticleText = document.getElementById('reticle-status-text');

  if (window.appState.webcamStream) {
    stopWebcamStream();
    return;
  }

  // Cek dukungan API mediaDevices
  const md = navigator.mediaDevices || ((navigator.mozGetUserMedia || navigator.webkitGetUserMedia) ? {
    getUserMedia: function(c) {
      return new Promise(function(y, n) {
        (navigator.mozGetUserMedia || navigator.webkitGetUserMedia).call(navigator, c, y, n);
      });
    }
  } : null);

  if (!md || !md.getUserMedia) {
    showToast('Browser atau izin iframe Google Apps Script membatasi akses webcam langsung. Buka file picker...', 'warning');
    document.getElementById('cameraFileInput').click();
    return;
  }

  showToast('Menghubungkan ke kamera laptop/webcam...', 'info');

  // Coba permintaan kamera dengan fallback constraints bertingkat
  function tryConnectCamera(constraints) {
    return md.getUserMedia(constraints)
      .then(function(stream) {
        window.appState.webcamStream = stream;
        if (video) {
          video.srcObject = stream;
          video.classList.remove('hidden');
          // Pastikan video mulai diputar
          video.play().catch(function(e){ console.log('Video play caught:', e); });
        }
        if (previewImg) previewImg.classList.add('hidden');
        if (snapBtn) snapBtn.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Tutup Kamera Laptop';
        if (iconLabel) iconLabel.textContent = 'videocam_off';
        if (reticleText) reticleText.textContent = 'WEBCAM LIVE \u00b7 KLIK JEPRET';
        showToast('Kamera laptop terhubung! Arahkan ke objek lalu klik tombol Jepret.', 'success');
      });
  }

  // 1. Coba fleksibel video standar (bekerja di laptop Windows, Mac, Linux)
  tryConnectCamera({ video: { facingMode: {ideal: 'environment'} }, audio: false })
    .catch(function(err1) {
      console.warn('Percobaan video:true gagal, coba facingMode user:', err1);
      return tryConnectCamera({ video: { facingMode: 'user' }, audio: false });
    })
    .catch(function(err2) {
      console.warn('Gagal menghubungkan webcam:', err2);
      let errMsg = 'Tidak dapat menyalakan webcam (' + (err2.name || err2.message) + ').';
      if (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError') {
        errMsg = 'Izin kamera diblokir di browser. Klik ikon gembok/kamera di samping URL browser untuk mengizinkan (Allow Kamera).';
      } else if (err2.name === 'NotFoundError' || err2.name === 'DevicesNotFoundError') {
        errMsg = 'Kamera/webcam tidak terdeteksi pada laptop.';
      }
      showToast(errMsg + ' Membuka pemilih file foto...', 'warning');
      document.getElementById('cameraFileInput').click();
    });
}

function stopWebcamStream() {
  if (window.appState.webcamStream) {
    window.appState.webcamStream.getTracks().forEach(function(track) { track.stop(); });
    window.appState.webcamStream = null;
  }
  const video = document.getElementById('webcam-video-stream');
  const previewImg = document.getElementById('mobile-photo-preview');
  const btnText = document.getElementById('webcam-btn-text');
  const snapBtn = document.getElementById('btn-snap-webcam');
  const iconLabel = document.getElementById('webcam-icon-label');
  const reticleText = document.getElementById('reticle-status-text');

  if (video) video.classList.add('hidden');
  if (previewImg) previewImg.classList.remove('hidden');
  if (snapBtn) snapBtn.classList.add('hidden');
  if (btnText) btnText.textContent = 'Buka Kamera / Webcam';
  if (iconLabel) iconLabel.textContent = 'videocam';
  if (reticleText) reticleText.textContent = 'CAMERA READY \u00b7 AUTO-COMPRESS';
}

function captureWebcamFrame() {
  const video = document.getElementById('webcam-video-stream');
  const previewImg = document.getElementById('mobile-photo-preview');

  if (!video || !window.appState.webcamStream) return;

  if (!window.appState.activeInspection.grpc_no || !video.videoWidth) return showToast('Pilih material dan tunggu kamera siap.', 'warning');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1,1200/Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth*scale);
  canvas.height = Math.round(video.videoHeight*scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/jpeg', 0.8);
  window.appState.activeInspection.base64Photo = base64;

  if (previewImg) previewImg.src = base64;
  stopWebcamStream();

  const sizeKb = Math.round((base64.length * 3) / 4 / 1024);
  const sizeBadge = document.getElementById('photo-size-badge');
  if (sizeBadge) sizeBadge.textContent = '~' + sizeKb + ' KB JPEG (FOTO WEBCAM SUKSES)';

  showToast('Foto berhasil dijepret dari kamera laptop!', 'success');
  checkPhotoRevisionConflict();
}

function handleNativeCameraUpload(event) {
  const captureRecord = window.appState.activeInspection;
  const file = event.target.files[0];
  if (!file) return;
  if (!captureRecord.grpc_no) { event.target.value=''; return showToast('Pilih PO dan material dahulu.', 'warning'); }
  if (!file.type.startsWith('image/') || file.size > 25*1024*1024) return showToast('Pilih gambar maksimal 25 MB.', 'warning');
  event.target.value='';

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onerror = () => showToast('Foto tidak dapat dibaca. Gunakan JPEG/PNG.', 'danger');
    img.onload = function() {
      if (captureRecord !== window.appState.activeInspection) return;
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
      window.appState.activeInspection.base64Photo = compressedBase64;

      const previewImg = document.getElementById('mobile-photo-preview');
      if (previewImg) {
        previewImg.src = compressedBase64;
      }

      const sizeKb = Math.round((compressedBase64.length * 3) / 4 / 1024);
      const sizeBadge = document.getElementById('photo-size-badge');
      if (sizeBadge) {
        sizeBadge.textContent = '~' + sizeKb + ' KB JPEG (KOMPRES SUKSES)';
      }

      const now = new Date();
      const timeStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ' WIB';
      const timeLabel = document.getElementById('photo-timestamp-label');
      if (timeLabel) timeLabel.textContent = 'BAY-04 \u00b7 ' + timeStr;

      showToast('File foto berhasil dimuat & dikompresi (~' + sizeKb + ' KB)', 'success');
      checkPhotoRevisionConflict();
    };
    img.src = e.target.result;
  };
  reader.onerror = () => showToast('Gagal membaca foto.', 'danger');
  reader.readAsDataURL(file);
}

function checkPhotoRevisionConflict() {}

function openPhotoOverwriteModal() {
  const m = document.getElementById('modal-photoOverwrite');
  if (m) m.classList.add('active');
}

function closePhotoOverwriteModal() {
  const m = document.getElementById('modal-photoOverwrite');
  if (m) m.classList.remove('active');
}

function confirmPhotoOverwriteAction() {
  closePhotoOverwriteModal();
  showToast('Konfirmasi: Foto lama akan dipindahkan ke Riwayat Rev-1 dan foto baru ini menjadi Rev-2 Aktif.', 'info');
}

// ============================================================================
// 6. MATERIAL LOOKUP & CALCULATION ENGINE
// ============================================================================
function executeMaterialLookup() {
  const po = document.getElementById('insp-po-no').value, mat = document.getElementById('insp-mat-code').value;
  const item = window.appState.materials.find(m => String(m.po_no) === po && String(m.material_no) === mat);
  stopWebcamStream(); window.appState.activeInspection = item ? Object.assign({}, item, {base64Photo:null}) : {};
  document.getElementById('insp-item-desc').textContent = item ? item.description : 'Pilih PO dan Material No';
  document.getElementById('insp-vendor').textContent = item ? item.vendor_name : '\u2014';
  ['po','rcv'].forEach(k => document.getElementById('insp-'+k+'-qty').textContent = item ? item[k+'_qty'] : 0);
  document.getElementById('input-remain-qty').value = item ? item.remain_qty : 0;
  document.getElementById('insp-rem-qty').textContent = (item ? item.remain_qty : 0) + ' REM';
  document.getElementById('mobile-photo-preview').src = item && item.current_photo_url || emptyPhoto;
  document.getElementById('insp-remarks').value = item && item.remarks || '';
  const map = {pkg:'packaging_cond',qty:'delivery_qty_status',doc:'doc_completion',spec:'mat_specification',qual:'mat_quality',acc:'mat_accessories',prio:'order_status'};
  Object.keys(map).forEach(g => document.querySelectorAll('input[name="chk_'+g+'"]').forEach(r => {
    r.checked = !!item && item[map[g]] === r.value;
    const card = r.closest('.inspection-radio-card'); card.classList.remove('active-good','active-bad','active-urgent');
    if(r.checked) selectInspectionRadio(card,g,r.value);
  }));
  if (item && item.check_by) document.getElementById('insp-checked-by').value = item.check_by;
}

function adjustRemainingQty(delta) {
  const input = document.getElementById('input-remain-qty');
  if (!input) return;
  let val = parseInt(input.value, 10) || 0;
  val = Math.min(Number(window.appState.activeInspection.po_qty)||0, Math.max(0, val + delta));
  input.value = val;
  window.appState.activeInspection.remain_qty = val;
}

function selectInspectionRadio(cardElement, groupKey, val) {
  const container = cardElement.parentElement;
  container.querySelectorAll('.inspection-radio-card').forEach(function(c) {
    c.classList.remove('active-good', 'active-bad', 'active-urgent');
  });

  if (val === 'Good' || val === 'Complete' || val === 'Suitable' || val === 'None' || val === 'Normal') {
    cardElement.classList.add('active-good');
  } else if (val === 'Bad' || val === 'Incomplete' || val === 'Unsuitable' || val === 'Emergency') {
    cardElement.classList.add('active-bad');
  } else {
    cardElement.classList.add('active-urgent');
  }

  const radio = cardElement.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
}

// ============================================================================
// 7. SUBMIT INSPECTION (STANDARD CHECKLIST OR FAST-TRACK SKIP)
// ============================================================================
async function submitInspection(isSkip) {
  if (window.appState.saving) return;
  const a = window.appState.activeInspection;
  if (!a.grpc_no) return showToast('Pilih PO dan Material No dari master.', 'warning');
  if (!a.base64Photo && !a.current_photo_id) return showToast('Ambil foto terlebih dahulu.', 'warning');
  const remain = Number(document.getElementById('input-remain-qty').value);
  if (!Number.isFinite(remain) || remain < 0 || remain > Number(a.po_qty)) return showToast('Sisa qty harus antara 0 dan PO qty.', 'warning');
  const p = {grpc_no:a.grpc_no, expected_updated_at:a.updated_at, po_no:String(a.po_no), material_no:String(a.material_no), po_qty:Number(a.po_qty), rcv_qty:Number(a.po_qty)-remain,
    base64Photo:a.base64Photo, skip_checklist:!!isSkip, completion_only:!!window.appState.pendingPrintRef,
    check_by:document.getElementById('insp-checked-by').value, remarks:document.getElementById('insp-remarks').value};
  const fields={pkg:'packaging_cond',qty:'delivery_qty_status',doc:'doc_completion',spec:'mat_specification',qual:'mat_quality',acc:'mat_accessories',prio:'order_status'};
  for (const g of Object.keys(fields)) {
    p[fields[g]] = getRadioVal('chk_'+g,'');
    if (!isSkip && !p[fields[g]]) return showToast('Lengkapi semua checklist dan condition atau pilih Skip.', 'warning');
  }
  if (!isSkip && !p.check_by) return showToast('Pilih pemeriksa.', 'warning');
  if (!isSkip && p.delivery_qty_status !== (remain === 0 ? 'Full Received':'Partial Received')) return showToast('Status quantity tidak sesuai sisa qty.', 'warning');
  const message = 'Simpan PO '+p.po_no+' / Material '+p.material_no+'?\n'+(isSkip?'SKIPPED: checklist akan dilengkapi sebelum cetak.':'Checklist lengkap.')+(a.base64Photo && a.current_photo_id?'\nFoto baru menggantikan foto aktif; maksimal dua revisi.':'');
  if (!await askSave(message)) return;
  window.appState.saving = true; setInspectionBusy(true);
  try {
    const res=await api('saveInspectionPayload',p); upsertRecord(res.data); a.base64Photo=null;
    const printRef=window.appState.pendingPrintRef; window.appState.pendingPrintRef=null;
    showToast(res.message,'success'); populateInspectionPO();
    if(printRef && !isSkip) loadOfficialPrintPreview(res.data); else navigateTo('materialMaster');
  } catch(e) { showToast(e.message,'danger'); }
  finally { window.appState.saving=false; setInspectionBusy(false); }
}

function getRadioVal(name, defaultVal) {
  const r = document.querySelector('input[name="' + name + '"]:checked');
  return r ? r.value : defaultVal;
}

function optimisticSaveInspection() {}

function renderMaterialTable(list) {
  const tbody = document.getElementById('material-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center p-6 text-slate-400 font-sans">Tidak ada data material yang cocok.</td></tr>';
    return;
  }

  list.forEach(function(item) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';

    let statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
      <span class="w-1.5 h-1.5 rounded-full bg-[#1E7E34]"></span> Completed
    </span>`;

    if (item.check_status === 'SKIPPED') {
      statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-[#F57C00] border border-amber-300">
        <span class="w-1.5 h-1.5 rounded-full bg-[#F57C00]"></span> Skipped
      </span>`;
    } else if (item.order_status === 'Emergency' || item.packaging_cond === 'Bad') {
      statusPill = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-[#D32F2F] border border-red-300">
        <span class="w-1.5 h-1.5 rounded-full bg-[#D32F2F]"></span> Defect / Urgent
      </span>`;
    }

    let photoBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-[#0288D1] border border-sky-200">
      <span class="material-symbols-outlined text-[13px]">image</span> ${item.current_photo_url ? '1 Photo' : 'No Photo'}
    </span>`;
    if (item.current_photo_url && item.previous_photo_url) {
      photoBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#1E7E34] border border-emerald-200">
        <span class="material-symbols-outlined text-[13px]">burst_mode</span> 2 Photos
      </span>`;
    }

    const remClass = item.remain_qty > 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300';

    tr.innerHTML = `
      <td class="cell-header-ref py-3 px-3 font-bold text-[var(--text-main)] whitespace-nowrap" data-label="GRPC REF">
        <span class="font-mono font-bold text-[var(--primary)]">${item.grpc_no || 'GRPC-NEW'}</span>
      </td>
      <td class="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap" data-label="NO. PO">
        <span class="font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(item.po_no)}</span>
      </td>
      <td class="py-3 px-3 font-semibold text-[var(--text-main)] whitespace-nowrap" data-label="MATERIAL CODE">
        <span class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[11px]">${escapeHtml(item.material_no)}</span>
      </td>
      <td class="py-3 px-4 font-sans font-medium text-slate-800 dark:text-slate-200" data-label="DESKRIPSI">
        <span>${escapeHtml(item.description)}</span>
      </td>
      <td class="py-3 px-4 text-slate-500 font-sans truncate max-w-[170px]" data-label="VENDOR">
        <span>${item.vendor_name || '-'}</span>
      </td>
      <td class="py-3 px-3 text-center whitespace-nowrap" data-label="PO / RCV / REM">
        <span class="font-mono">${item.po_qty}</span> / <span class="font-mono font-bold text-[var(--primary)]">${item.rcv_qty}</span> / 
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${remClass}">${item.remain_qty} Rem</span>
      </td>
      <td class="py-3 px-3 whitespace-nowrap text-slate-500 text-[11px]" data-label="TANGGAL & RCV BY">
        <span>${(item.rcv_date || '').slice(0, 10)}</span> <span class="text-slate-400">(${item.rcv_by || 'Inspector'})</span>
      </td>
      <td class="py-3 px-3 text-center whitespace-nowrap" data-label="DOKUMENTASI FOTO">
        ${photoBadge}
      </td>
      <td class="py-3 px-3 text-center whitespace-nowrap" data-label="STATUS CHECK">
        ${statusPill}
      </td>
      <td class="cell-actions py-3 px-4 text-right whitespace-nowrap" data-label="AKSI">
        <div class="report-action-btn-group flex items-center justify-end gap-1.5 flex-wrap">
          
          <button type="button" data-ref="${escapeHtml(item.grpc_no)}" data-po="${escapeHtml(item.po_no)}" data-material="${escapeHtml(item.material_no)}" onclick="quickPrintReport(this.dataset.ref, this.dataset.po, this.dataset.material, this)" class="btn-action-report" title="Cetak laporan item ini" aria-label="Cetak laporan item ini">${printIconMarkup()}</button>
          
          
          <button type="button" data-ref="${escapeHtml(item.grpc_no)}" onclick="openDetailDrawer(this.dataset.ref)" class="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center hover:bg-sky-600 hover:text-white transition-colors" title="Lihat / Ubah Detail [W-06]">
            <span class="material-symbols-outlined text-[16px]">visibility</span>
          </button>
          
          
          <button type="button" data-ref="${escapeHtml(item.grpc_no)}" onclick="deleteMaterialRow(this.dataset.ref)" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors delete-btn-action" title="Hapus Data">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const countBadge = document.getElementById('table-showing-count');
  if (countBadge) countBadge.textContent = 'Showing 1 to ' + list.length + ' of ' + window.appState.materials.length + ' entries';
  enforcePermissionGating();
}

function filterMaterialTable(filterTypeOrQuery) {
  let search = (document.getElementById('table-filter-input') ? document.getElementById('table-filter-input').value : '').toLowerCase();
  let statusFilter = document.getElementById('table-status-filter') ? document.getElementById('table-status-filter').value : 'ALL';

  if (filterTypeOrQuery !== undefined && typeof filterTypeOrQuery === 'string') {
    const lower = filterTypeOrQuery.toLowerCase();
    if (['all', 'urgent', 'car', 'partial', 'completed', 'skipped', 'today', 'risk'].indexOf(lower) >= 0) {
      statusFilter = lower.toUpperCase();
      const sel = document.getElementById('table-status-filter');
      if (sel) {
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === statusFilter) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
    } else {
      search = lower;
      const inp = document.getElementById('table-filter-input');
      if (inp) inp.value = filterTypeOrQuery;
    }
  }

  const todayStr = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Jakarta'});
  const filtered = window.appState.materials.filter(function(m) {
    const textMatch = !search ||
                      (m.po_no || '').toLowerCase().indexOf(search) >= 0 ||
                      (m.material_no || '').toLowerCase().indexOf(search) >= 0 ||
                      (m.description || '').toLowerCase().indexOf(search) >= 0 ||
                      (m.vendor_name || '').toLowerCase().indexOf(search) >= 0 ||
                      (m.grpc_no || '').toLowerCase().indexOf(search) >= 0;

    let statusMatch = true;
    if (statusFilter === 'COMPLETED') statusMatch = m.check_status === 'COMPLETED';
    else if (statusFilter === 'SKIPPED') statusMatch = m.check_status === 'SKIPPED';
    else if (statusFilter === 'URGENT') statusMatch = (m.order_status === 'Urgent' || m.order_status === 'Emergency');
    else if (statusFilter === 'CAR') statusMatch = (Boolean(m.id_car && m.id_car.toString().trim() !== '') || m.packaging_cond === 'Bad' || m.mat_quality === 'Bad');
    else if (statusFilter === 'PARTIAL') statusMatch = (m.delivery_qty_status === 'Partial Received' || Number(m.remain_qty) > 0);
    else if (statusFilter === 'TODAY') statusMatch = (m.rcv_date || '').toString().indexOf(todayStr) >= 0;
    else if (statusFilter === 'RISK') statusMatch = (m.packaging_cond === 'Bad' || m.doc_completion === 'Incomplete' || m.mat_specification === 'Unsuitable' || m.mat_quality === 'Bad');

    return textMatch && statusMatch;
  });

  const countDisplay = document.getElementById('master-count-display');
  if (countDisplay) {
    countDisplay.textContent = filtered.length;
  }

  renderMaterialTable(filtered);
}

function handleGlobalSearch(q) {
  navigateTo('materialMaster');
  const input = document.getElementById('table-filter-input');
  if (input) input.value = q;
  filterMaterialTable(q);
}

// ============================================================================
// 9. DRAWER W-06 DETAIL & EDIT
// ============================================================================
function openDetailDrawer(grpcNo) {
  if (!grpcNo && (!isPC() || !hasPermission('can_create'))) return;
  const drawer = document.getElementById('drawer-detailMaterial');
  if (!drawer) return;

  if (grpcNo) {
    const item = window.appState.materials.find(function(m) { return m.grpc_no === grpcNo; });
    if (item) {
      window.appState.currentEditingRef = grpcNo;
      document.getElementById('drawer-grpc-ref').textContent = item.grpc_no;
      document.getElementById('drawer-po-no').value = item.po_no;
      document.getElementById('drawer-mat-code').value = item.material_no;
      document.getElementById('drawer-item-desc').value = item.description;
      document.getElementById('drawer-vendor').value = item.vendor_name;
      document.getElementById('drawer-po-qty').value = item.po_qty;
      document.getElementById('drawer-rcv-qty').value = item.rcv_qty;
      document.getElementById('drawer-rem-qty').value = item.remain_qty;

      const curImg = document.getElementById('drawer-current-photo');
      const prevImg = document.getElementById('drawer-prev-photo');
      if (curImg) curImg.src = item.current_photo_url || emptyPhoto;
      if (prevImg) prevImg.src = item.previous_photo_url || emptyPhoto;
    }
  } else {
    window.appState.currentEditingRef = null;
    document.getElementById('drawer-grpc-ref').textContent = 'NEW MANUAL ENTRY';
    document.getElementById('drawer-po-no').value = '';
    document.getElementById('drawer-mat-code').value = '';
    document.getElementById('drawer-item-desc').value = '';
    document.getElementById('drawer-vendor').value = '';
    document.getElementById('drawer-po-qty').value = 1;
    document.getElementById('drawer-rcv-qty').value = 1;
    document.getElementById('drawer-rem-qty').value = 0;
  }

  drawer.querySelectorAll('input').forEach(el=>el.disabled = !isPC() || !hasPermission(grpcNo?'can_edit':'can_create'));
  drawer.querySelector('[type="submit"]').hidden = !isPC() || !hasPermission(grpcNo?'can_edit':'can_create');
  drawer.classList.add('active');
}

function closeDetailDrawer() {
  const drawer = document.getElementById('drawer-detailMaterial');
  if (drawer) drawer.classList.remove('active');
}

function recalcDrawerRemaining() {
  const po = parseInt(document.getElementById('drawer-po-qty').value, 10) || 0;
  const rcv = parseInt(document.getElementById('drawer-rcv-qty').value, 10) || 0;
  document.getElementById('drawer-rem-qty').value = Math.max(0, po - rcv);
}

async function saveDrawerDetailEdit(e) {
  e.preventDefault();
  const ref=window.appState.currentEditingRef;
  if (!isPC() || !hasPermission(ref?'can_edit':'can_create')) return showToast('Akses tambah/ubah master hanya di PC dengan izin.', 'warning');
  const record = {};
  const ids={po_no:'po-no',material_no:'mat-code',description:'item-desc',vendor_name:'vendor',po_qty:'po-qty',rcv_qty:'rcv-qty'};
  Object.keys(ids).forEach(k => record[k]=document.getElementById('drawer-'+ids[k]).value.trim());
  if (!await askSave('Simpan data master material ini?')) return;
  try { const res=await api('saveMasterRecord', record, ref); upsertRecord(res.data); closeDetailDrawer(); populateInspectionPO(); showToast(res.message,'success'); }
  catch(err) { showToast(err.message,'danger'); }
}

async function deleteMaterialRow(ref) {
  if(!hasPermission('can_delete') || !await askSave('Hapus data '+ref+'?')) return;
  try { await api('deleteMasterRecord',ref); window.appState.materials=window.appState.materials.filter(m=>m.grpc_no!==ref); renderMaterialTable(window.appState.materials); populateInspectionPO(); }
  catch(e) { showToast(e.message,'danger'); }
}

async function handleBulkFileSelect(event) {
  if (!isPC() || !hasPermission('can_upload')) return;
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();
  showToast('Memproses file ' + file.name + '...', 'info');

  const reader = new FileReader();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    try { await ensureExcelLibrary(); } catch(error) { showToast(error.message,'danger'); return; }
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          throw new Error('Pustaka SheetJS belum selesai di-load. Muat ulang halaman (F5).');
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        processImportedRows(rows);
      } catch (err) {
        console.error('XLSX parse error:', err);
        showToast('Gagal memproses file Excel: ' + err.message, 'danger');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = function(e) {
      parseAndImportCsv(e.target.result);
    };
    reader.readAsText(file);
  }
}

function processImportedRows(rows) {
  if (!rows || rows.length === 0) {
    showToast('File tidak memiliki baris data.', 'warning');
    return;
  }

  const nowTime = new Date().toISOString().slice(0, 10);
  const records = [];

  rows.forEach(function(row) {
    const norm = {};
    Object.keys(row).forEach(function(k) {
      norm[k.trim().toLowerCase()] = row[k];
    });

    const poNo = (norm['po_no'] || norm['po'] || norm['no_po'] || norm['po number'] || norm['no po'] || '').toString().trim();
    const matNo = (norm['material_no'] || norm['material'] || norm['mat_code'] || norm['item code'] || norm['item_code'] || '').toString().trim();
    const desc = (norm['description'] || norm['item_name'] || norm['item description'] || norm['nama barang'] || norm['item_desc'] || 'Item Material').toString().trim();
    const vendor = (norm['vendor_name'] || norm['vendor'] || norm['supplier'] || '-').toString().trim();
    const poQty = parseInt(norm['po_qty'] || norm['qty_po'] || norm['po quantity'] || norm['po_quantity'] || 1, 10) || 1;
    const rcvQty = parseInt(norm['rcv_qty'] || norm['qty_rcv'] || norm['rcv quantity'] || 0, 10) || 0;
    const mfg = (norm['mfg'] || norm['manufacturer'] || '').toString().trim();
    const pn = (norm['pn'] || norm['part_no'] || norm['part number'] || '').toString().trim();
    const req = (norm['requestor'] || norm['requestor_name'] || '').toString().trim();

    if (!poNo && !matNo) return; // lewati baris kosong

    const remQty = Math.max(0, poQty - rcvQty);
    const refNo = 'GRPC-IMP-' + Math.floor(1000 + Math.random() * 9000);

    records.push({
      grpc_no: refNo,
      po_no: poNo,
      material_no: matNo,
      description: desc,
      mfg: mfg,
      pn: pn,
      po_qty: poQty,
      rcv_qty: rcvQty,
      remain_qty: remQty,
      vendor_name: vendor,
      rcv_date: nowTime,
      rcv_by: window.appState.currentUser.username || 'Admin',
      check_by: 'RAMSES SITOMP (MMD - PLANNER)',
      requestor: req,
      current_photo_url: '',
      current_photo_id: '',
      previous_photo_url: '',
      previous_photo_id: '',
      check_status: 'PENDING_INSPECTION',
      packaging_cond: '-',
      delivery_qty_status: remQty === 0 ? 'Full Received' : 'Partial Received',
      doc_completion: '-',
      mat_specification: '-',
      mat_quality: '-',
      mat_accessories: '-',
      order_status: 'Normal',
      remarks: 'Hasil impor dari template Excel'
    });
  });

  if (records.length === 0) {
    showToast('Tidak ada data PO / Material valid yang ditemukan di file.', 'warning');
    return;
  }

  if (!isPC() || !hasPermission('can_upload')) return;
  api('batchImportMaterials', records).then(res => {
    closeBulkUploadModal(); showToast(res.message,'success'); loadInitialData();
  }).catch(e => showToast(e.message,'danger'));

}

function parseAndImportCsv(csvText) {
  const lines = csvText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length < 2) {
    showToast('File tidak memiliki baris data.', 'warning');
    return;
  }
  const headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(function(c) { return c.trim(); });
    const obj = {};
    headers.forEach(function(h, idx) { obj[h] = cols[idx] || ''; });
    rows.push(obj);
  }
  processImportedRows(rows);
}

async function downloadSampleXlsx() {
  try { await ensureExcelLibrary(); } catch(error) { showToast(error.message,'danger'); return; }
  if (typeof XLSX === 'undefined') {
    showToast('Memuat pustaka Excel...', 'info');
  }

  const sampleData = [
    {
      po_no: '37848',
      material_no: '193465',
      description: 'DISC, SAFETY VALVE MDL 2755W',
      mfg: 'OSA',
      pn: '2755W-SV',
      po_qty: 10,
      rcv_qty: 5,
      vendor_name: 'OSA INDUSTRIES INDONESIA, PT',
      requestor: 'Mechanical Maint.'
    },
    {
      po_no: '37850',
      material_no: '204911',
      description: 'GASKET SPIRAL WOUND 4 INCH 300#',
      mfg: 'FLOWTECH',
      pn: 'FSW-4-300',
      po_qty: 50,
      rcv_qty: 50,
      vendor_name: 'FLOWTECH SEALS, PT',
      requestor: 'Piping Unit'
    },
    {
      po_no: '37855',
      material_no: '188204',
      description: 'BALL BEARING SKF 6309-2Z',
      mfg: 'SKF',
      pn: '6309-2Z/C3',
      po_qty: 24,
      rcv_qty: 24,
      vendor_name: 'SURYA TEKNIK MANDIRI, CV',
      requestor: 'Rotating Equip.'
    }
  ];

  try {
    const ws = XLSX.utils.json_to_sheet(sampleData, {
      header: ['po_no', 'material_no', 'description', 'mfg', 'pn', 'po_qty', 'rcv_qty', 'vendor_name', 'requestor']
    });

    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 32 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MATERIAL_MASTER_TEMPLATE');
    XLSX.writeFile(wb, 'TEMPLATE_IMPORT_GRPC_MASTER.xlsx');
    showToast('Template Excel (.xlsx) berhasil diunduh!', 'success');
  } catch (err) {
    console.error('Download XLSX error:', err);
  }
}

// ============================================================================
// 11. DYNAMIC OFFICIAL A4 PRINT PREVIEW (LOADS EXACT SELECTED ITEM)
// ============================================================================
function loadOfficialPrintPreview(grpcNo) {
  let source = grpcNo;
  if (!source || typeof source !== 'object') {
    const matches = window.appState.materials.filter(m => reportId(m.grpc_no) === reportId(grpcNo));
    if (matches.length !== 1) { showToast('Pilih satu baris material yang jelas untuk dicetak.', 'warning'); return false; }
    source = matches[0];
  }
  const item = normalizeReportItem(source);
  if (!hasPermission('can_report')) return showToast('Akses cetak tidak tersedia.', 'warning');
  if (!checklistComplete(item)) {
    populateInspectionPO(String(item.po_no), String(item.material_no));
    window.appState.pendingPrintRef = item.grpc_no;
    navigateTo('mobileInspection');
    window.appState.printRef = null; window.appState.printItem = null;
    showToast('PO '+item.po_no+' / Material '+item.material_no+': lengkapi '+missingReportFields(item).join(', ')+', lalu Save untuk cetak.', 'warning'); return false;
  }
  window.appState.pendingPrintRef = null;
  window.appState.printRef = item.grpc_no;
  window.appState.printItem = Object.assign({}, item);
  // 1. Injeksi Data Header Dokumen
  document.getElementById('print-po-no').textContent = ': ' + (item.po_no || '-');
  document.getElementById('print-vendor').textContent = ': ' + (item.vendor_name || '-');
  document.getElementById('print-received-by').textContent = ': ' + String(item.rcv_by || '-').toUpperCase() + ' (MSD - RECEIVING)';
  document.getElementById('print-mat-code').textContent = ': ' + (item.material_no || '-');
  document.getElementById('print-item-desc').textContent = ': ' + (item.description || '-');
  document.getElementById('print-checked-by').textContent = ': ' + String(item.check_by || '-').toUpperCase();
  document.getElementById('print-rcv-date').textContent = ': ' + String(item.rcv_date || '').slice(0, 10);
  document.getElementById('print-id-car').textContent = ': ' + (item.id_car || '\u2014');

  // 2. Injeksi Foto Barang Spesifik
  const photo1 = document.getElementById('print-photo-1');
  if (photo1) {
    if (item.current_photo_url && item.current_photo_url !== '') {
      photo1.src = item.current_photo_url;
    } else {
      photo1.src = emptyPhoto;
    }
  }

  const photo2 = document.getElementById('print-photo-2');
  if (photo2) {
    if (item.previous_photo_url && item.previous_photo_url !== '') {
      photo2.src = item.previous_photo_url;
    } else {
      photo2.src = emptyPhoto;
    }
  }

  // 3. Render Dinamis Checklist Berdasarkan Kondisi Item Terpilih
  renderDynamicChecklistTable(item);

  // 4. Buka Layar Print Preview
  const identity = document.getElementById('print-selected-identity');
  if (identity) identity.textContent = 'PO '+item.po_no+' / Material '+item.material_no+' / '+item.grpc_no;
  navigateTo('printPreview');
  return true;
}

function renderDynamicChecklistTable(item) {
  const container = document.getElementById('official-checklist-tbody');
  if (!container) return;

  const pkgGood = item.packaging_cond === 'Good';
  const qtyFull = item.delivery_qty_status === 'Full Received';
  const docComp = item.doc_completion === 'Complete';
  const specSuit = item.mat_specification === 'Suitable';
  const qualGood = item.mat_quality === 'Good';
  const accNone = item.mat_accessories === 'None' || !item.mat_accessories || item.mat_accessories === '-';
  const accComp = item.mat_accessories === 'Complete';
  const accIncomp = item.mat_accessories === 'Incomplete';
  const prioNormal = item.order_status === 'Normal' || !item.order_status;
  const prioUrgent = item.order_status === 'Urgent';
  const prioEmerg = item.order_status === 'Emergency';

  function markBox(checked, label) {
    if (checked) {
      return `<span class="inline-flex items-center gap-1 font-bold text-black"><span class="w-3.5 h-3.5 border border-black flex items-center justify-center text-[10px] bg-slate-100">\u2713</span> ${label}</span>`;
    } else {
      return `<span class="inline-flex items-center gap-1 text-slate-400"><span class="w-3.5 h-3.5 border border-slate-400 inline-block bg-white"></span> ${label}</span>`;
    }
  }

  container.innerHTML = `
    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">1</td>
      <td class="p-1.5 border-r border-black font-medium">Packaging</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-4 sm:gap-6">
          ${markBox(pkgGood, 'Good')}
          ${markBox(item.packaging_cond === 'Bad', 'Bad')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">${item.packaging_cond === 'Bad' ? 'Kemasan rusak/cacat' : 'Clean packaging intact'}</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">2</td>
      <td class="p-1.5 border-r border-black font-medium">Quantity Delivery</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-3 sm:gap-4 flex-wrap">
          ${markBox(qtyFull, 'Full Received')}
          ${markBox(item.delivery_qty_status === 'Partial Received', 'Partial Received')}
          <span class="text-[10px] sm:text-[11px] bg-slate-100 px-1.5 py-0.5 border border-slate-300">Remaining: <strong id="print-rem-qty">${escapeHtml(item.remain_qty !== undefined && item.remain_qty !== null ? item.remain_qty : 0)}</strong></span>
        </div>
      </td>
      <td class="p-1.5 text-slate-700">Diterima ${item.rcv_qty || 0} dari ${item.po_qty || 0} unit</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">3</td>
      <td class="p-1.5 border-r border-black font-medium">Documents Completion</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-4 sm:gap-6">
          ${markBox(docComp, 'Complete')}
          ${markBox(item.doc_completion === 'Incomplete', 'Incomplete')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">${docComp ? 'Delivery Note & Surat Jalan' : 'Dokumen belum lengkap'}</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">4</td>
      <td class="p-1.5 border-r border-black font-medium">Material Specification</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-4 sm:gap-6">
          ${markBox(specSuit, 'Suitable')}
          ${markBox(item.mat_specification === 'Unsuitable', 'Unsuitable')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">${specSuit ? 'Sesuai spesifikasi PO' : 'Spesifikasi tidak cocok'}</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">5</td>
      <td class="p-1.5 border-r border-black font-medium">Material Quality</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-4 sm:gap-6">
          ${markBox(qualGood, 'Good')}
          ${markBox(item.mat_quality === 'Bad', 'Bad')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">${qualGood ? 'Kondisi fisik prima tanpa cacat' : 'Ditemukan cacat fisik'}</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">6</td>
      <td class="p-1.5 border-r border-black font-medium">Material Accessories Completion</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-3 sm:gap-5 flex-wrap">
          ${markBox(accComp, 'Complete')}
          ${markBox(accIncomp, 'Incomplete')}
          ${markBox(accNone, 'None')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">Aksesoris ${item.mat_accessories || 'None'}</td>
    </tr>

    
    <tr>
      <td class="p-1.5 border-r border-black text-center font-bold">7</td>
      <td class="p-1.5 border-r border-black font-medium">Ordering Status</td>
      <td class="p-1.5 border-r border-black">
        <div class="flex items-center gap-3 sm:gap-5 flex-wrap">
          ${markBox(prioNormal, 'Normal')}
          ${markBox(prioUrgent, 'Urgent')}
          ${markBox(prioEmerg, 'Emergency')}
        </div>
      </td>
      <td class="p-1.5 text-slate-700">${escapeHtml(item.remarks || '')}</td>
    </tr>
  `;
}
// 12. USER & RBAC MANAGEMENT (W-08)
// ============================================================================
async function loadAllUsers() {
  if (!hasPermission('admin')) return;
  try { const res = await api('getAllUsers'); window.appState.users=res.data; renderUsersTable(res.data); }
  catch(e) { showToast(e.message,'danger'); }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  users.forEach(function(u) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors';

    let badges = [];
    if (u.can_create) badges.push('<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 rounded text-[10px]">Create</span>');
    if (u.can_edit) badges.push('<span class="bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded text-[10px]">Edit</span>');
    if (u.can_delete) badges.push('<span class="bg-red-50 text-red-700 border border-red-200 px-1 rounded text-[10px]">Delete</span>');
    if (u.can_view) badges.push('<span class="bg-blue-50 text-blue-700 border border-blue-200 px-1 rounded text-[10px]">View</span>');
    if (u.can_upload) badges.push('<span class="bg-purple-50 text-purple-700 border border-purple-200 px-1 rounded text-[10px]">Upload</span>');
    if (u.can_report) badges.push('<span class="bg-teal-50 text-teal-700 border border-teal-200 px-1 rounded text-[10px]">Report</span>');

    const statusBadge = u.status === 'ACTIVE' 
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">ACTIVE</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 border border-slate-300">INACTIVE</span>';

    tr.innerHTML = `
      <td class="p-3 font-bold text-[var(--text-main)]">${escapeHtml(u.username)}</td>
      <td class="p-3 font-sans font-medium">${escapeHtml(u.full_name)}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.role === 'ADMIN' ? 'bg-black text-white' : 'bg-slate-200 text-slate-700'}">${escapeHtml(u.role)}</span></td>
      <td class="p-3"><div class="flex flex-wrap gap-1 max-w-xs">${badges.join(' ')}</div></td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-right">
        <button type="button" data-username="${escapeHtml(u.username)}" onclick="editUserRbac(this.dataset.username)" class="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-[var(--primary)] hover:text-white font-bold text-[11px] transition-colors">
          Configure
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const badge = document.getElementById('user-count-badge');
  if (badge) badge.textContent = users.length + ' ACCOUNTS';
}

function editUserRbac(username) {
  const u = window.appState.users.find(function(user) { return user.username === username; });
  if (!u) return;

  document.getElementById('rbac-editor-title').textContent = 'Edit User: ' + u.username;
  document.getElementById('edit-username').value = u.username;
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-fullname').value = u.full_name;
  document.getElementById('edit-status').value = u.status;

  if (u.role === 'ADMIN') {
    document.getElementById('role-admin-radio').checked = true;
  } else {
    document.getElementById('role-user-radio').checked = true;
  }

  document.getElementById('perm-view').checked = !!u.can_view;
  document.getElementById('perm-report').checked = !!u.can_report;
  document.getElementById('perm-create').checked = !!u.can_create;
  document.getElementById('perm-edit').checked = !!u.can_edit;
  document.getElementById('perm-upload').checked = !!u.can_upload;
  document.getElementById('perm-delete').checked = !!u.can_delete;
}

function openNewUserDrawer() {
  document.getElementById('rbac-editor-title').textContent = 'Tambah Pengguna Baru';
  document.getElementById('edit-username').value = '';
  document.getElementById('edit-fullname').value = '';
  document.getElementById('edit-password').value = '';
  document.getElementById('role-user-radio').checked = true;
  document.getElementById('perm-view').checked = true;
  document.getElementById('perm-report').checked = true;
  document.getElementById('perm-create').checked = false;
  document.getElementById('perm-edit').checked = false;
  document.getElementById('perm-upload').checked = false;
  document.getElementById('perm-delete').checked = false;
}

async function saveUserPermissionsForm(e) {
  e.preventDefault(); if(!hasPermission('admin')) return;
  const u={username:document.getElementById('edit-username').value.trim(), full_name:document.getElementById('edit-fullname').value.trim(), password:document.getElementById('edit-password').value, role:document.querySelector('input[name="edit_role"]:checked').value, status:document.getElementById('edit-status').value};
  ['view','report','create','edit','upload','delete'].forEach(k => u['can_'+k]=document.getElementById('perm-'+k).checked);
  if(!await askSave('Simpan hak akses pengguna ini?')) return;
  try { await api('saveUser',u); await loadAllUsers(); showToast('Pengguna tersimpan.','success'); } catch(err) { showToast(err.message,'danger'); }
}

function presetRoleLogin() {}

function togglePasswordEye() {
  const p = document.getElementById('login-password');
  const eye = document.getElementById('login-eye-icon');
  if (!p || !eye) return;
  if (p.type === 'password') {
    p.type = 'text';
    eye.textContent = 'visibility_off';
  } else {
    p.type = 'password';
    eye.textContent = 'visibility';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault(); const btn = document.getElementById('login-submit-btn'); btn.disabled = true;
  try {
    const res = await api('loginUser', document.getElementById('login-username').value.trim(), document.getElementById('login-password').value);
    window.appState.sessionToken = res.data.session_token; applyLoggedInUser(res.data);
    document.getElementById('login-password').value = ''; await loadInitialData();
  } catch(err) { showToast(err.message, 'danger'); } finally { btn.disabled = false; }
}

function applyLoggedInUser(user) {
  window.appState.currentUser = user;
  populateInspectionPO();
  
  const headerName = document.getElementById('header-user-name');
  const headerRole = document.getElementById('header-user-role');
  const headerAvatar = document.getElementById('header-user-avatar');

  if (headerName) headerName.textContent = user.full_name || user.username;
  if (headerRole) headerRole.textContent = (user.role === 'ADMIN' ? 'Administrator' : 'Field Inspector') + ' \u00b7 ' + user.username;
  if (headerAvatar) {
    headerAvatar.textContent = (user.full_name || user.username).split(' ').map(function(n) { return n[0]; }).join('').slice(0, 2).toUpperCase();
  }

  showToast('Sesi aktif: ' + (user.full_name || user.username) + ' (' + user.role + ')', 'success');

  enforcePermissionGating();

  navigateTo('mobileInspection');
}

// ============================================================================
// 14. RBAC UI PERMISSION GATING
// ============================================================================
function enforcePermissionGating() {
  document.querySelectorAll('[data-pc-permission]').forEach(btn => { btn.hidden = !isPC() || !hasPermission(btn.dataset.pcPermission); });
  document.querySelectorAll('[onclick*="userAdmin"], #nav-userAdmin').forEach(btn => btn.hidden = !hasPermission('admin'));
  document.querySelectorAll('#nav-printPreview, [data-report-nav]').forEach(btn => { btn.hidden = true; });
  document.querySelectorAll('.delete-btn-action').forEach(btn => btn.hidden = !hasPermission('can_delete'));
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closePhotoOverwriteModal();
      closeBulkUploadModal();
      closeDetailDrawer();
    }
  });
}

// \u2500\u2500 FUNGSI CEPAT: LIHAT DAN CETAK LAPORAN DARI BARIS TABEL \u2500\u2500
async function quickPrintReport(grpcNo, poNo, materialNo, button) {
  if (!hasPermission('can_report')) return showToast('Akses cetak tidak tersedia.', 'warning');
  const ref = reportId(grpcNo);
  let candidates = window.appState.materials.filter(m => reportId(m.grpc_no) === ref);
  if (poNo !== undefined) candidates = candidates.filter(m => reportId(m.po_no) === reportId(poNo));
  if (materialNo !== undefined) candidates = candidates.filter(m => reportId(m.material_no) === reportId(materialNo));
  if (candidates.length !== 1) return showToast('Item tidak dapat dipilih secara unik. Muat ulang Material Master.', 'warning');
  const selected = candidates[0];
  const requestId = ++window.appState.printRequestId;
  window.appState.printRef = null; window.appState.printItem = null; window.appState.pendingPrintRef = null;
  document.body.classList.remove('print-ready');
  if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
  try {
    const res = await api('getMaterialForPrint', reportId(selected.grpc_no), reportId(selected.po_no), reportId(selected.material_no));
    if (requestId !== window.appState.printRequestId) return;
    const item = normalizeReportItem(res.data);
    if (reportKey(item) !== reportKey(selected)) throw new Error('Identitas laporan tidak cocok dengan item yang dipilih. Muat ulang data.');
    upsertRecord(item);
    if (loadOfficialPrintPreview(item)) showToast('Laporan PO '+item.po_no+' / Material '+item.material_no+' siap dicetak.', 'success');
  } catch(error) {
    if (requestId === window.appState.printRequestId) showToast(error.message, 'danger');
  } finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
}

function escapeHtml(v) { return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const emptyPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http:\x2f\x2fwww.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#102033"/><text x="300" y="200" text-anchor="middle" fill="white" font-size="24">Ambil foto barang</text></svg>');
function hasPermission(p) { const u=window.appState.currentUser; return !!u && (u.role==='ADMIN' || (p!=='admin' && (u[p]===true || String(u[p]).toLowerCase()==='true'))); }
function isPC() {
  const ua=navigator.userAgent;
  return !(/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) || (/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1));
}
function updateDeviceMode() { document.body.classList.toggle('pc-device',isPC()); enforcePermissionGating(); }
async function api(name, ...args) {
  if (name !== 'loginUser') {
    args.push(window.appState.sessionToken);
  }
  const requestToken = window.appState.sessionToken;

  if (!CONFIG.GAS_URL || CONFIG.GAS_URL.includes('MASUKKAN_URL')) {
    throw new Error('URL Backend Google Apps Script belum diisi di js/config.js. Buka js/config.js lalu masukkan URL deployment Web App GAS Anda.');
  }

  try {
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({
        action: name,
        args: args
      })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }

    const r = await response.json();
    if (name !== 'loginUser' && requestToken !== window.appState.sessionToken) {
      throw new Error('Sesi berubah.');
    }
    if (r && r.success) {
      return r;
    } else {
      throw new Error((r && r.message) || 'Operasi gagal.');
    }
  } catch (err) {
    throw new Error(err.message || 'Koneksi ke backend Google Apps Script gagal.');
  }
}

function logoutApp() {
  api('logoutUser').catch(()=>{}); stopWebcamStream();
  window.appState.currentUser=null; window.appState.sessionToken=null; window.appState.materials=[]; window.appState.users=[]; window.appState.activeInspection={}; window.appState.printRef=null; window.appState.printItem=null; window.appState.printRequestId++; window.appState.pendingPrintRef=null;
  closeBulkUploadModal(); closeDetailDrawer(); document.getElementById('material-table-body').replaceChildren(); document.getElementById('users-table-body').replaceChildren();
  navigateTo('login');
}
function populateInspectionPO(po='',mat='') {
  const select=document.getElementById('insp-po-no'); select.replaceChildren(new Option('Pilih PO No',''));
  [...new Set(window.appState.materials.map(m=>String(m.po_no)))].sort().forEach(p=>select.add(new Option(p,p)));
  select.value=po; populateInspectionMaterials(mat);
}
function populateInspectionMaterials(mat='') {
  window.appState.pendingPrintRef=null;
  const po=document.getElementById('insp-po-no').value, select=document.getElementById('insp-mat-code');
  select.replaceChildren(new Option('Pilih Material No',''));
  window.appState.materials.filter(m=>String(m.po_no)===po).forEach(m=>select.add(new Option(m.material_no+' \u2014 '+m.description,String(m.material_no))));
  select.value=mat; executeMaterialLookup();
}
function upsertRecord(item) {
  const i = window.appState.materials.findIndex(m => reportKey(m) === reportKey(item));
  if (i < 0) window.appState.materials.push(item); else window.appState.materials[i] = item;
  renderMaterialTable(window.appState.materials); enforcePermissionGating();
}

function setInspectionBusy(busy) { document.querySelectorAll('#section-mobileInspection button, #section-mobileInspection input, #section-mobileInspection select').forEach(el=>el.disabled=busy); }
function openBulkUploadModal() { if(isPC()&&hasPermission('can_upload')) document.getElementById('modal-bulkUpload').classList.add('active'); }
function closeBulkUploadModal() { document.getElementById('modal-bulkUpload').classList.remove('active'); }
function processBulkUploadAction() { if(isPC()&&hasPermission('can_upload')) document.getElementById('bulkFileInput').click(); }
let saveConfirmResolve=null, saveConfirmFocus=null;
function askSave(message) {
  if(saveConfirmResolve) return Promise.resolve(false);
  document.getElementById('save-confirm-message').textContent=message;
  const modal=document.getElementById('modal-saveConfirm'); saveConfirmFocus=document.activeElement;
  modal.showModal(); document.getElementById('save-confirm-cancel').focus();
  return new Promise(resolve=>saveConfirmResolve=resolve);
}
function finishSaveConfirm(ok) { document.getElementById('modal-saveConfirm').close(); const done=saveConfirmResolve; saveConfirmResolve=null; if(done) done(ok); if(saveConfirmFocus) saveConfirmFocus.focus(); }
function printCurrentReport() {
  const item = window.appState.printItem;
  if (!item || !checklistComplete(item) || !hasPermission('can_report')) return showToast('Pilih ikon printer pada item yang sudah lengkap.', 'warning');
  if (document.getElementById('print-po-no').textContent !== ': ' + item.po_no || document.getElementById('print-mat-code').textContent !== ': ' + item.material_no) return showToast('Data preview berubah. Buka kembali laporan dari baris material.', 'warning');
  window.print();
}

async function sendReportEmailPrompt() {
  const item=window.appState.printItem;
  if(!item || !checklistComplete(item) || !hasPermission('can_report')) return;
  const email=window.prompt('Alamat email penerima ringkasan laporan GRPC:');
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if(!await askSave('Kirim ringkasan laporan '+item.grpc_no+' ke '+email+'?')) return;
  try {const res=await api('sendReportEmail',item.grpc_no,email);showToast(res.message,'success');}catch(e){showToast(e.message,'danger');}
} 
function checklistComplete(m) { return missingReportFields(normalizeReportItem(m)).length === 0; }
function reportId(value) { return String(value === undefined || value === null ? '' : value).trim(); }
function reportKey(m) { return JSON.stringify([reportId(m.grpc_no),reportId(m.po_no),reportId(m.material_no)]); }
function normalizeReportItem(source) {
  const item = Object.assign({}, source || {});
  ['grpc_no','po_no','material_no','check_by'].forEach(k => item[k] = reportId(item[k]));
  const options = reportOptions();
  Object.keys(options).forEach(k => {
    const value = reportId(item[k]).replace(/\s+/g,' ').toLowerCase();
    item[k] = options[k].find(v => v.toLowerCase() === value) || reportId(item[k]);
  });
  item.check_status = reportId(item.check_status).toUpperCase();
  ['current','previous'].forEach(k => {
    if (item[k+'_photo_id'] && !reportId(item[k+'_photo_id']).startsWith('DEMO')) item[k+'_photo_url'] = 'https:\x2f\x2fdrive.google.com/thumbnail?id='+encodeURIComponent(item[k+'_photo_id'])+'&sz=w1600';
  });
  return item;
}
function reportOptions() {
  return {packaging_cond:['Good','Bad'],delivery_qty_status:['Full Received','Partial Received'],doc_completion:['Complete','Incomplete'],mat_specification:['Suitable','Unsuitable'],mat_quality:['Good','Bad'],mat_accessories:['Complete','Incomplete','None'],order_status:['Normal','Urgent','Emergency']};
}
function missingReportFields(item) {
  const labels={packaging_cond:'Packaging',delivery_qty_status:'Quantity Delivery',doc_completion:'Documents',mat_specification:'Specification',mat_quality:'Quality',mat_accessories:'Accessories',order_status:'Order Status'};
  const missing=[]; const options=reportOptions();
  Object.keys(options).forEach(k => { if (!options[k].includes(item[k])) missing.push(labels[k]); });
  if (!item.check_by) missing.push('nama pemeriksa');
  if (item.check_status !== 'COMPLETED') missing.push('status pemeriksaan COMPLETED');
  return missing;
}
function printIconMarkup() {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 8V3h12v5M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM17 11h1"/></svg>';
}

document.addEventListener('visibilitychange',()=>{if(document.hidden) stopWebcamStream();});
var grpcExcelLoading = null;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeGrpc, {once:true});
else initializeGrpc();

function ensureExcelLibrary() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (grpcExcelLoading) return grpcExcelLoading;
  grpcExcelLoading = new Promise(function(resolve, reject) {
    var script = document.createElement('script');
    script.src = 'https:\x2f\x2fcdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = function() {
      if (typeof XLSX === 'undefined') { grpcExcelLoading = null; reject(new Error('Pustaka Excel tidak tersedia.')); }
      else resolve();
    };
    script.onerror = function() { grpcExcelLoading = null; script.remove(); reject(new Error('Pustaka Excel diblokir jaringan/browser. Coba unggah CSV atau izinkan CDN untuk fitur Excel.')); };
    document.head.appendChild(script);
  });
  return grpcExcelLoading;
}