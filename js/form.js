// ── Form Module ──

function initForm() {
  const sel = document.getElementById('room-select');
  sel.innerHTML = '<option value="">-- เลือกห้อง --</option>' +
    CFG.ROOMS.map(r => {
      const t = STATE.tenants[r];
      const label = t?.active ? `${r} — ${t.name}` : `${r} (ว่าง)`;
      return `<option value="${r}">${label}</option>`;
    }).join('');

  sel.addEventListener('change', () => onRoomChange(sel.value));

  ['elec-old','elec-new','water-old','water-new','late-days','received-amount'].forEach(id => {
    const el = document.getElementById(id); if(el) el.addEventListener('input', recalcBill);
  });
  
  const isNewEl = document.getElementById('is-new-tenant'); if(isNewEl) isNewEl.addEventListener('change', recalcBill);
  document.getElementById('btn-save-bill').addEventListener('click', saveBill);
  document.getElementById('btn-send-tg-bill').addEventListener('click', sendBillTelegram);

  clearBillForm();
}

function onRoomChange(roomId) {
  clearBillForm(); if (!roomId) return;
  const tenant = STATE.tenants[roomId], mk = monthKey(), existing = STATE.bills[`${roomId}-${mk}`];

  const infoEl = document.getElementById('form-tenant-info');
  if (tenant?.active) {
    infoEl.innerHTML = `<div class="alert alert-info"><span>👤</span><div><strong>${tenant.name}</strong> · ${tenant.phone || '-'}<br><span style="font-size:12px">เข้าอยู่: ${tenant.moveIn || '-'}</span></div></div>`;
    document.getElementById('is-new-tenant').checked = false;
  } else {
    infoEl.innerHTML = `<div class="alert alert-warning"><span>⚠️</span> ห้องว่าง — เพิ่มผู้เช่าในหน้าภาพรวมก่อน</div>`;
    document.getElementById('is-new-tenant').checked = true;
  }

  const prevMk = getPrevMonthKey(), prevBill = STATE.bills[`${roomId}-${prevMk}`];
  if (prevBill) {
    document.getElementById('elec-old').value = prevBill.elecNew || '';
    document.getElementById('water-old').value = prevBill.waterNew || '';
  }
  if (existing) {
    document.getElementById('elec-old').value = existing.elecOld || '';
    document.getElementById('elec-new').value  = existing.elecNew || '';
    document.getElementById('water-old').value = existing.waterOld || '';
    document.getElementById('water-new').value  = existing.waterNew || '';
    document.getElementById('late-days').value  = existing.lateDays || 0;
  }
  document.getElementById('received-amount').value = ''; recalcBill();
}

function getPrevMonthKey() { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthKey(d); }
function clearBillForm() {
  document.getElementById('form-tenant-info').innerHTML = '';
  document.getElementById('bill-preview').innerHTML = `<div style="text-align:center;color:var(--gray-400);padding:40px 0;">📋 เลือกห้องและกรอกเลขมิเตอร์เพื่อดูบิล</div>`;
  document.getElementById('btn-save-bill').disabled = true; document.getElementById('btn-send-tg-bill').disabled = true;
}

function recalcBill() {
  const roomId = document.getElementById('room-select').value; if (!roomId) return;
  const elecOld = parseFloat(document.getElementById('elec-old').value) || 0, elecNew = parseFloat(document.getElementById('elec-new').value) || 0;
  const waterOld = parseFloat(document.getElementById('water-old').value) || 0, waterNew = parseFloat(document.getElementById('water-new').value) || 0;
  const lateDays = parseInt(document.getElementById('late-days').value) || 0, isNew = document.getElementById('is-new-tenant').checked;

  if (elecNew > 0 && elecNew < elecOld || waterNew > 0 && waterNew < waterOld) {
    document.getElementById('bill-preview').innerHTML = `<div class="alert alert-danger">⚠️ เลขมิเตอร์ใหม่ต้องมากกว่าหรือเท่ากับเลขเก่า</div>`; return;
  }

  const bill = calcBill({ elecOld, elecNew, waterOld, waterNew, lateDays, isNew }), tenant = STATE.tenants[roomId] || {}, mk = monthKey();
  const elecDiff = Math.max(0, elecNew - elecOld), waterDiff = Math.max(0, waterNew - waterOld);

  const receivedInput = parseFloat(document.getElementById('received-amount').value);
  const received = isNaN(receivedInput) ? bill.total : receivedInput, change = Math.max(0, received - bill.total);

  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png'; 

  document.getElementById('bill-preview').innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" style="width:100px;"><div><h2 style="color:#1e3a8a; margin:0;">${CFG.MANSION_NAME}</h2><p style="font-size:12px; margin:0;">${CFG.ADDRESS}</p></div>
    </div>
    <h3 style="text-align:center; color:#1e3a8a; margin-bottom:20px;">ใบเสร็จรับเงิน / ใบแจ้งหนี้</h3>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:14px;">
      <div><strong>ชื่อผู้เช่า:</strong> ${tenant.name || '...................................'}</div><div><strong>ห้อง:</strong> ${roomId}</div>
      <div style="grid-column:1/-1;"><strong>ประจำรอบเดือน:</strong> ${thaiMonth(mk)}</div>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">
      <thead style="background-color:#0284c7; color:white;"><tr><th style="padding:8px;">รายการ</th><th style="padding:8px; text-align:right;">บาท</th></tr></thead>
      <tbody>
        <tr><td style="padding:8px; border-bottom:1px solid #eee;">ค่าเช่าห้องพักรายเดือน</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${fmt(CFG.RENT)}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #eee;">ค่าไฟฟ้า (${elecDiff} หน่วย)</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${fmt(bill.elecAmt)}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #eee;">ค่าน้ำประปา (${waterDiff} หน่วย)</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${fmt(bill.waterAmt)}</td></tr>
        ${lateDays > 0 ? `<tr><td style="padding:8px; color:red;">ค่าปรับล่าช้า (${lateDays} วัน)</td><td style="padding:8px; text-align:right; color:red;">${fmt(bill.lateAmt)}</td></tr>` : ''}
        ${isNew ? `<tr><td style="padding:8px; color:blue;">ค่าแรกเข้า (มัดจำ+ล่วงหน้า)</td><td style="padding:8px; text-align:right; color:blue;">${fmt(bill.depositAmt + bill.advanceAmt)}</td></tr>` : ''}
        <tr style="background:#f8fafc; font-weight:bold;"><td style="padding:10px; color:#1e3a8a;">รวมเงินทั้งสิ้น</td><td style="padding:10px; text-align:right; color:#1e3a8a;">${fmt(bill.total)}</td></tr>
        <tr><td style="padding:6px; color:#475569; text-align:right;">รับเงินมา:</td><td style="padding:6px; text-align:right; color:#475569;">${fmt(received)}</td></tr>
        <tr style="color:#16a34a; font-weight:bold;"><td style="padding:6px; text-align:right;">เงินทอน:</td><td style="padding:6px; text-align:right;">${fmt(change)}</td></tr>
      </tbody>
    </table>`;

  window._currentBillDraft = { roomId, elecOld, elecNew, waterOld, waterNew, lateDays, isNew, ...bill, month: mk };
  document.getElementById('btn-save-bill').disabled = false; document.getElementById('btn-send-tg-bill').disabled = false;
}

async function saveBill() {
  const d = window._currentBillDraft; if (!d) return;
  const btn = document.getElementById('btn-save-bill'); btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...';
  const key = `${d.roomId}-${d.month}`; STATE.bills[key] = { ...d, paid: false, createdAt: isoDate() };
  await saveState(); toast(`บันทึกบิลห้อง ${d.roomId} เรียบร้อย`, 'success');
  btn.textContent = '✅ บันทึกแล้ว'; setTimeout(() => { btn.textContent = '💾 บันทึกบิล'; btn.disabled = false; }, 2000);
}

async function sendBillTelegram() {
  const d = window._currentBillDraft; if (!d) return;
  const tenant = STATE.tenants[d.roomId] || {}, mk = monthKey();
  const msg = `🏠 <b>${CFG.MANSION_NAME}</b> — บิลห้อง ${d.roomId}\nประจำเดือน: ${thaiMonth(mk)}\nยอดรวม: ${fmt(d.total)} บาท\nกำหนดจ่าย: วันที่ ${CFG.DUE_DAY}`;
  const btn = document.getElementById('btn-send-tg-bill'); btn.disabled = true; await sendTelegram(msg); btn.disabled = false;
}