// ── Config ──
const defaultRoomsText = "ชั้น 1: 101, 102, 103, 104, 105, 106, 107, 108\nชั้น 2: 201, 202, 203, 204, 205, 206, 207, 208";
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
  SUPABASE_URL: 'https://iifmnisoxfbjyhcgabsg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZm1uaXNveGZianloY2dhYnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Nzg0NDYsImV4cCI6MjA5NzI1NDQ0Nn0.C58rM5eeIquTrJ4amI1x0_Bp3Ln0zzKjvZZh98qSGb4',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzWEQ8j9QCfmKV8SkrIVRFZ7lIwACCCoa0zLPeZqXOr6yuQKa5dUKM1W9841DB9XbzrGw/exec',
  ROOM_STRUCTURE: roomData.structure,
  ROOMS: roomData.allRooms,
  ROOMS_TEXT: savedRoomsText,
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

const supabaseClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

function getDirectDriveUrl(url) {
  if (!url || url === 'null') return null;
  if (url.includes('drive.google.com/file/d/')) {
    const id = url.split('/file/d/')[1].split('/')[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return url;
}

// ── State ──
const STATE = {
  currentPage: 'dashboard',
  selectedRoom: null,
  bills: {},     
  allTenants: [], 
  tenants: {}     
};

// ── Load Data ──
async function loadSupabaseData() {
  try {
    const { data: tenantsData, error: errT } = await supabaseClient.from('tenants').select('*');
    if(errT) throw errT;
    if(tenantsData) {
      STATE.allTenants = tenantsData.map(t => ({
          id: t.id, roomId: t.room_id, prefix: t.prefix || 'นาย', name: t.name, phone: t.phone, 
          idNum: t.id_card, moveIn: t.move_in_date, moveOut: t.move_out_date, active: t.active, 
          idCardImage: getDirectDriveUrl(t.id_card_image_url), 
          tenantImage: getDirectDriveUrl(t.tenant_photo_url)
      }));
      STATE.tenants = {};
      STATE.allTenants.forEach(t => { if(t.active) STATE.tenants[t.roomId] = t; });
      if(typeof renderTenantHistory === 'function') renderTenantHistory(); 
    }

    const { data: billsData, error: errB } = await supabaseClient.from('bills').select('*');
    if(errB) throw errB;
    if(billsData) {
      STATE.bills = {};
      billsData.forEach(b => {
        STATE.bills[`${b.room_id}-${b.month_key}`] = {
          roomId: b.room_id, month: b.month_key, elecUnits: b.elec_units, waterUnits: b.water_units,
          elecAmt: b.elec_amt, waterAmt: b.water_amt, lateAmt: b.late_amt, total: b.total_amount,
          paid: b.is_paid, paidDate: b.paid_date
        };
      });
    }
  } catch (e) { console.error(e); }
}

async function saveState() {
  localStorage.setItem('bills', JSON.stringify(STATE.bills));
  try {
    const tenantsPayload = STATE.allTenants.map(t => ({
      id: t.id, room_id: t.roomId, prefix: t.prefix, name: t.name, phone: t.phone, id_card: t.idNum,
      move_in_date: t.moveIn, move_out_date: t.moveOut, active: t.active, 
      id_card_image_url: t.idCardImage, tenant_photo_url: t.tenantImage
    }));
    if(tenantsPayload.length > 0) await supabaseClient.from('tenants').upsert(tenantsPayload, { onConflict: 'id' });

    const billsPayload = Object.entries(STATE.bills).map(([key, b]) => {
      const [roomId, y, m] = key.split('-');
      return {
        room_id: roomId, month_key: `${y}-${m}`, elec_units: b.elecUnits || 0, elec_amt: b.elecAmt || 0,
        water_units: b.waterUnits || 0, water_amt: b.waterAmt || 0, late_amt: b.lateAmt || 0, 
        total_amount: b.total || 0, is_paid: b.paid || false, paid_date: b.paidDate || null
      };
    });
    if(billsPayload.length > 0) await supabaseClient.from('bills').upsert(billsPayload, { onConflict: 'room_id,month_key' });
  } catch (e) { console.error(e); }
}

// ── Image Upload & GAS ──
function compressImage(file, maxWidth = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; } } 
        else { if (height > maxWidth) { width = Math.round((width *= maxWidth / height)); height = maxWidth; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

async function uploadImageToGAS(fileInputId) {
  const file = document.getElementById(fileInputId).files[0]; if(!file) return null;
  try {
    const compressedBase64 = await compressImage(file);
    const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'saveIdCard', roomId: 'TEMP', imageBase64: compressedBase64 }) });
    const data = await res.json(); return data.ok ? getDirectDriveUrl(data.fileUrl) : null;
  } catch(e) { return null; }
}

async function sendTelegram(msg) {
  const token = localStorage.getItem('tg_token'), chatId = localStorage.getItem('tg_chat');
  if (!token || !chatId) return false;
  try {
    const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'notifyTelegram', tgToken: token, tgChatId: chatId, message: msg }) });
    const data = await res.json(); return data.ok;
  } catch(e) { return false; }
}

// ── Add Tenant & Contract ──
async function submitAddTenantAndContract() {
  const roomId = document.getElementById('add-tenant-room').value, prefix = document.getElementById('add-tenant-prefix').value;
  const name = document.getElementById('add-tenant-name').value.trim(), phone = document.getElementById('add-tenant-phone').value.trim();
  const idNum = document.getElementById('add-tenant-id').value.trim(), moveIn = document.getElementById('add-tenant-movein').value, place = document.getElementById('add-tenant-place').value;
  if (!name) { toast('กรุณากรอกชื่อ', 'error'); return; }

  const btn = document.querySelector('button[onclick="submitAddTenantAndContract()"]'); btn.disabled = true; btn.textContent = '⏳ บันทึกข้อมูลและรูปภาพ...';
  let idCardUrl = await uploadImageToGAS('add-tenant-id-img'), tenantUrl = await uploadImageToGAS('add-tenant-photo-img');

  const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  const newTenant = { id: newId, roomId, prefix, name, phone, idNum, moveIn, active: true, idCardImage: idCardUrl, tenantImage: tenantUrl };
  STATE.allTenants.push(newTenant); STATE.tenants[roomId] = newTenant;
  await saveState();

  closeModal('modal-add-tenant'); toast(`เพิ่มผู้เช่าสำเร็จ`, 'success');
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof selectRoom === 'function') selectRoom(roomId);
  renderTenantHistory();
  btn.disabled = false; btn.textContent = '✅ บันทึกและสร้างสัญญา';
  renderContractHTML(newTenant, place);
}

function renderContractHTML(t, place) {
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  const html = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:20px;"><img src="${LOGO_URL}" style="width:120px;"><h2 style="color:#1e3a8a; margin:0;">ฟ้าใสแมนชั่น (Fah Sai Mansion)</h2></div>
    <h2 style="text-align:center; color:#1e3a8a;">สัญญาเช่าห้องพักรายเดือน</h2>
    <p>สัญญาห้อง <b>${t.roomId}</b> ชื่อ <b>${t.prefix}${t.name}</b> เริ่มเข้าอยู่ ${t.moveIn}</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">
      <div style="border:1px dashed #ccc; padding:20px; text-align:center;">${t.idCardImage ? `<img src="${t.idCardImage}" style="max-height:140px;">` : 'บัตรประชาชน'}</div>
      <div style="border:1px dashed #ccc; padding:20px; text-align:center;">${t.tenantImage ? `<img src="${t.tenantImage}" style="max-height:140px;">` : 'รูปถ่ายผู้เช่า'}</div>
    </div>`;
  document.getElementById('contract-output').innerHTML = html; openModal('modal-print-contract');
}

function printContractFromHistory(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId); if(t) renderContractHTML(t, 'ฟ้าใสแมนชั่น');
}

// ── 🆕 ระบบเปิด Popup รับเงินและคำนวณเงินทอนกลาง ──
function openPaymentModal(type, targetId, totalAmount, titleText) {
  document.getElementById('pay-bill-type').value = type;
  document.getElementById('pay-bill-tenant-id').value = targetId;
  document.getElementById('pay-bill-total').textContent = fmt(totalAmount);
  document.getElementById('pay-bill-title').textContent = titleText;
  
  const receivedInput = document.getElementById('pay-bill-received');
  receivedInput.value = totalAmount; // ใส่ยอดพอดีให้ล่วงหน้า
  document.getElementById('pay-bill-change').textContent = "0.00";
  
  // สร้าง Event คำนวณเงินทอนสด
  receivedInput.oninput = () => {
    const r = parseFloat(receivedInput.value) || 0;
    const change = Math.max(0, r - totalAmount);
    document.getElementById('pay-bill-change').textContent = fmt(change);
  };
  
  openModal('modal-pay-bill');
}

// ฟังก์ชันเมื่อกดยืนยันจากใน Popup รับเงิน
async function processPaymentConfirm() {
  const type = document.getElementById('pay-bill-type').value;
  const targetId = document.getElementById('pay-bill-tenant-id').value;
  const received = parseFloat(document.getElementById('pay-bill-received').value) || 0;
  
  closeModal('modal-pay-bill');
  
  if (type === 'monthly') {
    // บันทึกบิลรายเดือนลง Supabase
    const mk = monthKey();
    const key = `${targetId}-${mk}`;
    if (STATE.bills[key]) {
      STATE.bills[key].paid = true; STATE.bills[key].paidDate = isoDate();
      await saveState(); toast(`บันทึกรับเงินห้อง ${targetId} สำเร็จ`, 'success');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (STATE.currentPage === 'history') renderHistory();
      if (STATE.currentPage === 'report') renderReport();
    }
  } else if (type === 'initial') {
    // ออกเอกสารใบเสร็จแรกเข้า
    executePrintInitialReceiptHTML(targetId, received);
  }
}

function printInitialReceipt(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId); if(!t) return;
  const total = CFG.DEPOSIT + CFG.RENT;
  openPaymentModal('initial', tenantId, total, `บิลแรกเข้า ห้อง ${t.roomId} — ${t.name}`);
}

function executePrintInitialReceiptHTML(tenantId, receivedAmt) {
  const t = STATE.allTenants.find(x => x.id === tenantId); if(!t) return;
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  const total = CFG.DEPOSIT + CFG.RENT;
  const change = Math.max(0, receivedAmt - total);

  const html = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" style="width:100px;"><div><h2 style="color:#1e3a8a; margin:0;">${CFG.MANSION_NAME}</h2><p style="font-size:12px; margin:0;">${CFG.ADDRESS}</p></div>
    </div>
    <h3 style="text-align:center; color:#1e3a8a;">ใบเสร็จรับเงินแรกเข้า (Initial Receipt)</h3>
    <p>ห้อง: <b>${t.roomId}</b> | ผู้เช่า: <b>${t.prefix}${t.name}</b></p>
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <tr style="background:#0284c7; color:white;">
        <th style="padding:10px; border:1px solid #bae6fd; text-align:left;">รายการ</th><th style="padding:10px; border:1px solid #bae6fd; text-align:right;">บาท</th>
      </tr>
      <tr><td style="padding:10px; border:1px solid #e2e8f0;">ค่าเช่าล่วงหน้า 1 เดือน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(CFG.RENT)}</td></tr>
      <tr><td style="padding:10px; border:1px solid #e2e8f0;">เงินประกันความเสียหาย</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(CFG.DEPOSIT)}</td></tr>
      <tr style="font-weight:bold; background:#f8fafc;"><td style="padding:10px; border:1px solid #e2e8f0;">รวมเงิน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(total)}</td></tr>
      <tr><td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">รับเงินมา</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right; color:#475569;">${fmt(receivedAmt)}</td></tr>
      <tr style="font-weight:bold; color:#16a34a;"><td style="padding:10px; border:1px solid #e2e8f0;">เงินทอน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(change)}</td></tr>
    </table>`;
  document.getElementById('contract-output').innerHTML = html; openModal('modal-print-contract');
}

function renderTenantHistory() {
  const tbody = document.getElementById('tenant-history-tbody'); if(!tbody) return;
  const list = [...STATE.allTenants].sort((a,b) => (b.moveIn || '').localeCompare(a.moveIn || ''));
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px">ยังไม่มีประวัติ</td></tr>`; return; }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td><strong>${t.roomId}</strong></td><td>${t.prefix}${t.name}</td><td>${t.phone || '-'}</td><td>${t.moveIn}</td><td>${t.moveOut || '-'}</td>
      <td><span class="badge badge-${t.active?'sky':'gray'}">${t.active?'กำลังเช่า':'ย้ายออก'}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="printContractFromHistory('${t.id}')">📄 สัญญา</button>
        <button class="btn btn-outline btn-sm" onclick="printInitialReceipt('${t.id}')">🧾 ใบเสร็จแรกเข้า</button>
      </td>
    </tr>`).join('');
}

function fmt(n) { return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return Number(n).toLocaleString('th-TH'); }
function today() { return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
function isoDate() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function thaiMonth(key) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const [y, m] = key.split('-'); return `${months[parseInt(m)-1]} ${parseInt(y)+543}`;
}
function dayOfMonth() { return new Date().getDate(); }

function getRoomStatus(roomId) {
  const tenant = STATE.tenants[roomId]; if (!tenant || !tenant.active) return 'vacant';
  const mk = monthKey(), bill = STATE.bills[`${roomId}-${mk}`]; if (!bill) return 'occupied';
  if (bill.paid) return 'occupied';
  const d = dayOfMonth(); if (d > CFG.CUT_DAY) return 'overdue'; if (d > CFG.DUE_DAY) return 'warning';
  return 'occupied';
}
function getRoomStatusLabel(s) { return { occupied: 'ปกติ', vacant: 'ว่าง', overdue: 'ค้างชำระ', warning: 'เกินกำหนด' }[s] || s; }