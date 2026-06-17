// ── Config ──
const CFG = {
  ROOMS: [...Array(10).keys()].map(i=>`10${i+1}`).concat([...Array(10).keys()].map(i=>`20${i+1}`)),
  RENT: 3500,
  DEPOSIT: 5000,
  WATER_RATE: 18,
  WATER_MIN: 100,
  ELEC_RATE: 8,
  LATE_PER_DAY: 100,
  DUE_DAY: 5,
  CUT_DAY: 10,
  MANSION_NAME: 'ฟ้าใสแมนชั่น',
  ADDRESS: '1059 ซ.ประชาสามัคคี 7 ถ.ประชาสามัคคี ต.สว่างแดนดิน อ.สว่างแดนดิน จ.สกลนคร 47120',
  PHONE: '099-040-8668',
  TG_TOKEN: localStorage.getItem('tg_token') || '',
  TG_CHAT: localStorage.getItem('tg_chat') || '',
  SHEET_URL: localStorage.getItem('sheet_url') || '',
};

// ── State ──
const STATE = {
  currentPage: 'dashboard',
  selectedRoom: null,
  bills: JSON.parse(localStorage.getItem('bills') || '{}'),
  tenants: JSON.parse(localStorage.getItem('tenants') || '{}'),
  payments: JSON.parse(localStorage.getItem('payments') || '[]'),
};

// ── Persistence ──
function saveState() {
  localStorage.setItem('bills', JSON.stringify(STATE.bills));
  localStorage.setItem('tenants', JSON.stringify(STATE.tenants));
  localStorage.setItem('payments', JSON.stringify(STATE.payments));
}

// ── Utils ──
function fmt(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n) {
  return Number(n).toLocaleString('th-TH');
}
function today() {
  return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function isoDate() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function thaiMonth(key) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const [y, m] = key.split('-');
  return `${months[parseInt(m)-1]} ${parseInt(y)+543}`;
}
function dayOfMonth() { return new Date().getDate(); }

// ── Bill Calculator ──
function calcBill({ elecOld, elecNew, waterOld, waterNew, lateDays = 0, isNew = false }) {
  const elecUnits = Math.max(0, elecNew - elecOld);
  const waterUnits = Math.max(0, waterNew - waterOld);
  const elecAmt = elecUnits * CFG.ELEC_RATE;
  const waterAmt = Math.max(waterUnits * CFG.WATER_RATE, CFG.WATER_MIN);
  const lateAmt = lateDays * CFG.LATE_PER_DAY;
  const depositAmt = isNew ? CFG.DEPOSIT : 0;
  const advanceAmt = isNew ? CFG.RENT : 0;
  const total = CFG.RENT + elecAmt + waterAmt + lateAmt + depositAmt + advanceAmt;
  return { elecUnits, waterUnits, elecAmt, waterAmt, lateAmt, depositAmt, advanceAmt, total };
}

// ── Room Status ──
function getRoomStatus(roomId) {
  const tenant = STATE.tenants[roomId];
  if (!tenant || !tenant.active) return 'vacant';
  const mk = monthKey();
  const bill = STATE.bills[`${roomId}-${mk}`];
  const d = dayOfMonth();
  if (!bill) {
    // ยังไม่บันทึกบิลเดือนนี้ — ใช้กำหนดเวลาเดียวกับบิลที่ค้างชำระ
    if (d > CFG.CUT_DAY) return 'overdue';
    if (d > CFG.DUE_DAY) return 'warning';
    return 'occupied';
  }
  if (bill.paid) return 'occupied';
  if (d > CFG.CUT_DAY) return 'overdue';
  if (d > CFG.DUE_DAY) return 'warning';
  return 'occupied';
}
function getRoomStatusLabel(s) {
  return { occupied: 'ปกติ', vacant: 'ว่าง', overdue: 'ค้างชำระ', warning: 'เกินกำหนด' }[s] || s;
}

// ── Toast ──
function toast(msg, type = 'default', dur = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ── Navigation ──
function navigate(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.querySelector('.topbar-title').textContent = {
    dashboard: '📊 ภาพรวมหอพัก',
    form: '📝 บันทึกมิเตอร์',
    report: '📄 รายงาน',
    history: '🕐 ประวัติ',
    settings: '⚙️ ตั้งค่า',
  }[page] || page;
  closeSidebar();

  // Refresh page modules
  if (page === 'dashboard') renderDashboard();
  if (page === 'history')   renderHistory();
  if (page === 'report')    renderReport();
  if (page === 'settings' && typeof loadSettings === 'function') loadSettings();
}

// ── Sidebar mobile ──
function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.querySelector('.sidebar-backdrop').classList.add('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-backdrop').classList.remove('open');
}

// ── Modal ──
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Telegram Notify ──
async function sendTelegram(msg) {
  const token = localStorage.getItem('tg_token');
  const chat  = localStorage.getItem('tg_chat');
  if (!token || !chat) { toast('กรุณาตั้งค่า Telegram ก่อน', 'warning'); return false; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (data.ok) { toast('ส่ง Telegram สำเร็จ ✓', 'success'); return true; }
    else { toast('Telegram Error: ' + data.description, 'error'); return false; }
  } catch(e) {
    toast('ไม่สามารถส่ง Telegram ได้', 'error');
    return false;
  }
}

// ── Google Sheets via Apps Script ──
async function sendToSheet(payload) {
  const url = localStorage.getItem('sheet_url');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch(e) { console.warn('Sheet send failed', e); }
}

// ── Export Bill as Image (html2canvas) ──
async function exportBillImage(roomId) {
  const el = document.getElementById('bill-preview');
  if (!el || typeof html2canvas === 'undefined') { toast('โหลด html2canvas ไม่สำเร็จ', 'error'); return; }
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `bill_${roomId}_${monthKey()}.png`;
  a.click();
  toast('บันทึกรูปบิลสำเร็จ', 'success');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Nav clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(n => {
    n.addEventListener('click', () => navigate(n.dataset.page));
  });

  // Hamburger
  document.querySelector('.btn-hamburger').addEventListener('click', openSidebar);
  document.querySelector('.sidebar-backdrop').addEventListener('click', closeSidebar);

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  // Start on dashboard
  navigate('dashboard');
});
