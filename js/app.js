// ── Config ──
// ดึงข้อมูลห้องพักจาก LocalStorage (ถ้ายังไม่มีให้ใช้ค่าเริ่มต้น)
const defaultRoomsText = "ชั้น 1: 101, 102, 103, 104, 105, 106, 107, 108, 109, 110\nชั้น 2: 201, 202, 203, 204, 205, 206, 207, 208, 209, 210";
const savedRoomsText = localStorage.getItem('cfg_rooms_text') || defaultRoomsText;

function parseRoomsText(text) {
  const structure = [];
  const allRooms = [];
  text.split('\n').forEach(line => {
     if(!line.trim()) return;
     const parts = line.split(':');
     const floorName = parts[0].trim();
     const roomsStr = parts.length > 1 ? parts[1] : parts[0];
     const rooms = roomsStr.split(',').map(r => r.trim()).filter(r => r);
     structure.push({ floor: floorName, rooms });
     allRooms.push(...rooms);
  });
  return { structure, allRooms };
}

const roomData = parseRoomsText(savedRoomsText);

const CFG = {
  // URLs & Tokens
  SUPABASE_URL: 'https://iifmnisoxfbjyhcgabsg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZm1uaXNveGZianloY2dhYnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Nzg0NDYsImV4cCI6MjA5NzI1NDQ0Nn0.C58rM5eeIquTrJ4amI1x0_Bp3Ln0zzKjvZZh98qSGb4',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzWEQ8j9QCfmKV8SkrIVRFZ7lIwACCCoa0zLPeZqXOr6yuQKa5dUKM1W9841DB9XbzrGw/exec',
  
  // Mansion Config
  ROOM_STRUCTURE: roomData.structure,
  ROOMS: roomData.allRooms,
  ROOMS_TEXT: savedRoomsText,
  
  // ดึงค่าการเงินจาก LocalStorage หากไม่มีให้ใช้ค่าตั้งต้น (||)
  RENT: parseFloat(localStorage.getItem('cfg_rent')) || 3500,
  DEPOSIT: 5000,
  WATER_RATE: parseFloat(localStorage.getItem('cfg_water')) || 18,
  WATER_MIN: parseFloat(localStorage.getItem('cfg_water_min')) || 100,
  ELEC_RATE: parseFloat(localStorage.getItem('cfg_elec')) || 8,
  LATE_PER_DAY: parseFloat(localStorage.getItem('cfg_late')) || 100,
  DUE_DAY: parseInt(localStorage.getItem('cfg_due_day')) || 5,
  CUT_DAY: parseInt(localStorage.getItem('cfg_cut_day')) || 10,
  
  MANSION_NAME: 'ฟ้าใสแมนชั่น',
  ADDRESS: '1059 ซ.ประชาสามัคคี 7 ถ.ประชาสามัคคี ต.สว่างแดนดิน อ.สว่างแดนดิน จ.สกลนคร 47120',
  PHONE: '099-040-8668',
};

// ── Supabase Init (แก้ชื่อตัวแปรเป็น supabaseClient) ──
const supabaseClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

// ── State ──
const STATE = {
  currentPage: 'dashboard',
  selectedRoom: null,
  bills: {},     
  tenants: {},   
  payments: []   
};

// ── Load Data (Supabase) ──
async function loadSupabaseData() {
  try {
    const { data: tenantsData, error: errT } = await supabaseClient.from('tenants').select('*');
    if(errT) throw errT;
    if(tenantsData) {
      STATE.tenants = {};
      tenantsData.forEach(t => {
        STATE.tenants[t.room_id] = {
          name: t.name, phone: t.phone, idNum: t.id_card, 
          moveIn: t.move_in_date, active: t.active, idCardImage: t.id_card_image_url
        };
      });
    }

    const { data: billsData, error: errB } = await supabaseClient.from('bills').select('*');
    if(errB) throw errB;
    if(billsData) {
      STATE.bills = {};
      billsData.forEach(b => {
        STATE.bills[`${b.room_id}-${b.month_key}`] = {
          roomId: b.room_id, month: b.month_key,
          elecUnits: b.elec_units, waterUnits: b.water_units,
          elecAmt: b.elec_amt, waterAmt: b.water_amt,
          lateAmt: b.late_amt, total: b.total_amount,
          paid: b.is_paid, paidDate: b.paid_date
        };
      });
    }
  } catch (e) {
    console.error("Supabase Load Error:", e);
    toast('ดึงข้อมูลจากฐานข้อมูลไม่สำเร็จ', 'error');
  }
}

// ── Persistence & Supabase Sync ──
async function saveState() {
  localStorage.setItem('bills', JSON.stringify(STATE.bills));
  localStorage.setItem('tenants', JSON.stringify(STATE.tenants));

  try {
    const tenantsPayload = Object.entries(STATE.tenants).map(([roomId, t]) => ({
      room_id: roomId, name: t.name, phone: t.phone, id_card: t.idNum,
      move_in_date: t.moveIn, active: t.active, id_card_image_url: t.idCardImage || null
    }));
    if(tenantsPayload.length > 0) {
      await supabaseClient.from('tenants').upsert(tenantsPayload, { onConflict: 'room_id' });
    }

    const billsPayload = Object.entries(STATE.bills).map(([key, b]) => {
      const [roomId, y, m] = key.split('-');
      return {
        room_id: roomId, month_key: `${y}-${m}`,
        elec_units: b.elecUnits || 0, elec_amt: b.elecAmt || 0,
        water_units: b.waterUnits || 0, water_amt: b.waterAmt || 0,
        late_amt: b.lateAmt || 0, total_amount: b.total || 0,
        is_paid: b.paid || false, paid_date: b.paidDate || null
      };
    });
    if(billsPayload.length > 0) {
      await supabaseClient.from('bills').upsert(billsPayload, { onConflict: 'room_id,month_key' });
    }
  } catch (e) {
    console.error("Supabase Sync Failed:", e);
  }
}

// ── Google Apps Script API (Upload & Telegram) ──
async function uploadIdCardImage(roomId, fileInputId) {
  const file = document.getElementById(fileInputId).files[0];
  if(!file) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        toast('กำลังอัปโหลดรูปลง Google Drive...', 'default', 5000);
        const res = await fetch(CFG.GAS_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'saveIdCard', roomId: roomId, imageBase64: reader.result })
        });
        const data = await res.json();
        if(data.ok) {
          toast('อัปโหลดไฟล์สำเร็จ', 'success');
          resolve(data.fileUrl);
        } else resolve(null);
      } catch(e) {
        console.error(e);
        toast('อัปโหลดล้มเหลว', 'error');
        resolve(null);
      }
    };
    reader.readAsDataURL(file);
  });
}

async function sendTelegram(msg) {
  const token = localStorage.getItem('tg_token');
  const chatId = localStorage.getItem('tg_chat');
  if (!token || !chatId) { toast('กรุณาตั้งค่า Telegram ก่อน', 'warning'); return false; }
  
  try {
    const res = await fetch(CFG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'notifyTelegram', tgToken: token, tgChatId: chatId, message: msg })
    });
    const data = await res.json();
    if (data.ok) { toast('ส่ง Telegram สำเร็จ ✓', 'success'); return true; }
    else { toast('Telegram Error', 'error'); return false; }
  } catch(e) {
    toast('ไม่สามารถส่ง Telegram ได้', 'error'); return false;
  }
}

// ── Add Tenant Function ──
async function submitAddTenantWithImage() {
  const roomId = document.getElementById('add-tenant-room').value;
  const name   = document.getElementById('add-tenant-name').value.trim();
  const phone  = document.getElementById('add-tenant-phone').value.trim();
  const idNum  = document.getElementById('add-tenant-id').value.trim();
  const moveIn = document.getElementById('add-tenant-movein').value;

  if (!name) { toast('กรุณากรอกชื่อ', 'error'); return; }

  const btn = document.querySelector('button[onclick="submitAddTenantWithImage()"]');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังบันทึก...';

  let idCardUrl = await uploadIdCardImage(roomId, 'add-tenant-id-img');

  STATE.tenants[roomId] = { name, phone, idNum, moveIn, active: true, idCardImage: idCardUrl };
  await saveState(); 

  closeModal('modal-add-tenant');
  toast(`เพิ่มผู้เช่าห้อง ${roomId} สำเร็จ`, 'success');
  
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof selectRoom === 'function') selectRoom(roomId);

  btn.disabled = false;
  btn.textContent = origText;
}

// ── Utils ──
function fmt(n) { return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return Number(n).toLocaleString('th-TH'); }
function today() { return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
function isoDate() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
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
    if (d > CFG.CUT_DAY) return 'overdue';
    if (d > CFG.DUE_DAY) return 'warning';
    return 'occupied';
  }
  if (bill.paid) return 'occupied';
  if (d > CFG.CUT_DAY) return 'overdue';
  if (d > CFG.DUE_DAY) return 'warning';
  return 'occupied';
}
function getRoomStatusLabel(s) { return { occupied: 'ปกติ', vacant: 'ว่าง', overdue: 'ค้างชำระ', warning: 'เกินกำหนด' }[s] || s; }

// ── UI Helpers ──
function toast(msg, type = 'default', dur = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

function navigate(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.querySelector('.topbar-title').textContent = {
    dashboard: '📊 ภาพรวมหอพัก', form: '📝 บันทึกมิเตอร์', contract: '📄 ทำสัญญาเช่า',
    report: '📄 รายงาน', history: '🕐 ประวัติ', settings: '⚙️ ตั้งค่า',
  }[page] || page;
  closeSidebar();

  if (page === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (page === 'history' && typeof renderHistory === 'function')   renderHistory();
  if (page === 'report' && typeof renderReport === 'function')    renderReport();
}

function openSidebar() { document.querySelector('.sidebar').classList.add('open'); document.querySelector('.sidebar-backdrop').classList.add('open'); }
function closeSidebar() { document.querySelector('.sidebar').classList.remove('open'); document.querySelector('.sidebar-backdrop').classList.remove('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }