// ── Form Module ──

// ── Init ──
function initForm() {
  const sel = document.getElementById('room-select');
  sel.innerHTML = '<option value="">-- เลือกห้อง --</option>' +
    CFG.ROOMS.map(r => {
      const t = STATE.tenants[r];
      const label = t?.active ? `${r} — ${t.name}` : `${r} (ว่าง)`;
      return `<option value="${r}">${label}</option>`;
    }).join('');

  sel.addEventListener('change', () => onRoomChange(sel.value));

  ['elec-old','elec-new','water-old','water-new','late-days'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalcBill);
  });
  document.getElementById('is-new-tenant').addEventListener('change', recalcBill);

  document.getElementById('btn-save-bill').addEventListener('click', saveBill);
  document.getElementById('btn-export-img').addEventListener('click', () => {
    const r = document.getElementById('room-select').value;
    if (r) exportBillImage(r);
  });
  document.getElementById('btn-send-tg-bill').addEventListener('click', sendBillTelegram);

  clearBillForm();
}

function onRoomChange(roomId) {
  clearBillForm();
  if (!roomId) return;
  const tenant = STATE.tenants[roomId];
  const mk = monthKey();
  const existing = STATE.bills[`${roomId}-${mk}`];

  // Pre-fill
  const infoEl = document.getElementById('form-tenant-info');
  if (tenant?.active) {
    infoEl.innerHTML = `
      <div class="alert alert-info" style="align-items: center;">
        ${tenant.idCardImage ? `<div style="width:32px;height:32px;background:url('${tenant.idCardImage}') center/cover;border-radius:4px;"></div>` : `<span>👤</span>`}
        <div><strong>${tenant.name}</strong> · ${tenant.phone || '-'}<br>
        <span style="font-size:12px">เข้าอยู่: ${tenant.moveIn || '-'}</span></div>
      </div>`;
    document.getElementById('is-new-tenant').checked = false;
  } else {
    infoEl.innerHTML = `<div class="alert alert-warning"><span>⚠️</span> ห้องว่าง — กรุณาเพิ่มผู้เช่าในหน้าภาพรวมก่อน</div>`;
    document.getElementById('is-new-tenant').checked = true;
  }

  // Pre-fill meter from previous bill
  const prevMk = getPrevMonthKey();
  const prevBill = STATE.bills[`${roomId}-${prevMk}`];
  if (prevBill) {
    document.getElementById('elec-old').value = prevBill.elecNew || prevBill.elecUnits || '';
    document.getElementById('water-old').value = prevBill.waterNew || prevBill.waterUnits || '';
  }
  if (existing) {
    document.getElementById('elec-old').value = existing.elecOld || existing.elecUnits || '';
    document.getElementById('elec-new').value  = existing.elecNew || existing.elecUnits || '';
    document.getElementById('water-old').value = existing.waterOld || existing.waterUnits || '';
    document.getElementById('water-new').value  = existing.waterNew || existing.waterUnits || '';
    document.getElementById('late-days').value  = existing.lateDays || 0;
  }
  recalcBill();
}

function getPrevMonthKey() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

function clearBillForm() {
  document.getElementById('form-tenant-info').innerHTML = '';
  document.getElementById('bill-preview').innerHTML = `<div style="text-align:center;color:var(--gray-400);padding:40px 0;font-size:14px">📋 เลือกห้องและกรอกเลขมิเตอร์เพื่อดูบิล</div>`;
  document.getElementById('btn-save-bill').disabled = true;
  document.getElementById('btn-export-img').disabled = true;
  document.getElementById('btn-send-tg-bill').disabled = true;
}

function recalcBill() {
  const roomId   = document.getElementById('room-select').value;
  if (!roomId) return;

  const elecOld  = parseFloat(document.getElementById('elec-old').value) || 0;
  const elecNew  = parseFloat(document.getElementById('elec-new').value) || 0;
  const waterOld = parseFloat(document.getElementById('water-old').value) || 0;
  const waterNew = parseFloat(document.getElementById('water-new').value) || 0;
  const lateDays = parseInt(document.getElementById('late-days').value) || 0;
  const isNew    = document.getElementById('is-new-tenant').checked;

  if (elecNew > 0 && elecNew < elecOld || waterNew > 0 && waterNew < waterOld) {
    document.getElementById('bill-preview').innerHTML = `<div class="alert alert-danger">⚠️ เลขมิเตอร์ใหม่ต้องมากกว่าหรือเท่ากับเลขเก่า</div>`;
    return;
  }

  const bill = calcBill({ elecOld, elecNew, waterOld, waterNew, lateDays, isNew });
  const tenant = STATE.tenants[roomId] || {};
  const mk = monthKey();

  // Show diff meters
  const elecDiff  = elecNew - elecOld;
  const waterDiff = waterNew - waterOld;

  document.getElementById('bill-preview').innerHTML = `
    <div class="bill-header">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px">
        <span style="font-size:24px">🏠</span>
        <h2>${CFG.MANSION_NAME}</h2>
      </div>
      <p>${CFG.ADDRESS}</p>
      <p>โทร: ${CFG.PHONE}</p>
    </div>
    <div class="bill-meta">
      <div><span class="label">ชื่อผู้เช่า: </span><strong>${tenant.name || '-'}</strong></div>
      <div><span class="label">เลขที่บิล: </span><strong>-</strong></div>
      <div><span class="label">ห้อง: </span><strong>${roomId}</strong></div>
      <div><span class="label">วันที่: </span><strong>${today()}</strong></div>
      <div style="grid-column:1/-1"><span class="label">ประจำเดือน: </span><strong>${thaiMonth(mk)}</strong></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div class="meter-diff">
        <div><div class="diff-label">⚡ ไฟฟ้า (หน่วย)</div><div style="font-size:11px;color:var(--gray-400)">${elecOld} → ${elecNew}</div></div>
        <div class="diff-val">${fmtInt(elecDiff)}</div>
      </div>
      <div class="meter-diff">
        <div><div class="diff-label">💧 น้ำประปา (หน่วย)</div><div style="font-size:11px;color:var(--gray-400)">${waterOld} → ${waterNew}</div></div>
        <div class="diff-val">${fmtInt(waterDiff)}</div>
      </div>
    </div>

    <table class="bill-table">
      <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th class="text-right">จำนวนเงิน</th></tr></thead>
      <tbody>
        <tr><td>ค่าเช่าห้องพักรายเดือน</td><td>1 เดือน</td><td>${fmt(CFG.RENT)}</td><td class="text-right">${fmt(CFG.RENT)}</td></tr>
        <tr><td>ค่าไฟฟ้า</td><td>${fmtInt(elecDiff)} หน่วย</td><td>${CFG.ELEC_RATE}</td><td class="text-right">${fmt(bill.elecAmt)}</td></tr>
        <tr><td>ค่าน้ำประปา ${waterDiff * CFG.WATER_RATE < CFG.WATER_MIN ? '<span style="font-size:11px;color:var(--amber)">(ขั้นต่ำ)</span>' : ''}</td><td>${fmtInt(waterDiff)} หน่วย</td><td>${CFG.WATER_RATE}</td><td class="text-right">${fmt(bill.waterAmt)}</td></tr>
        ${lateDays > 0 ? `<tr style="color:var(--red)"><td>ค่าปรับชำระล่าช้า</td><td>${lateDays} วัน</td><td>${CFG.LATE_PER_DAY}</td><td class="text-right">${fmt(bill.lateAmt)}</td></tr>` : ''}
        ${isNew ? `<tr style="color:var(--sky-dk)"><td>เงินประกันแรกเข้า</td><td>1 ครั้ง</td><td>-</td><td class="text-right">${fmt(bill.depositAmt)}</td></tr>` : ''}
        ${isNew ? `<tr style="color:var(--sky-dk)"><td>ค่าเช่าล่วงหน้า 1 เดือน</td><td>1 เดือน</td><td>-</td><td class="text-right">${fmt(bill.advanceAmt)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="bill-total">
      <div>
        <div style="font-size:12px;color:var(--gray-600)">รวมยอดที่ต้องชำระ</div>
        <div style="font-size:12px;color:var(--gray-400)">กำหนดชำระ: วันที่ ${CFG.DUE_DAY} ของเดือน</div>
      </div>
      <div class="amount">${fmt(bill.total)} <span style="font-size:14px">บาท</span></div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);font-size:13px">
      <div style="text-align:center">
        <div style="border-top:1px solid var(--gray-400);margin-top:28px;padding-top:4px;width:140px">ผู้จ่ายเงิน / ผู้เช่า</div>
      </div>
      <div style="text-align:center">
        <div style="border-top:1px solid var(--gray-400);margin-top:28px;padding-top:4px;width:140px">ผู้รับเงิน / ฟ้าใสแมนชั่น</div>
      </div>
    </div>
  `;

  // Store draft
  window._currentBillDraft = { 
    roomId, elecOld, elecNew, waterOld, waterNew, lateDays, isNew, 
    ...bill, month: mk 
  };

  document.getElementById('btn-save-bill').disabled = false;
  document.getElementById('btn-export-img').disabled = false;
  document.getElementById('btn-send-tg-bill').disabled = false;
}

async function saveBill() {
  const d = window._currentBillDraft;
  if (!d) return;

  const btn = document.getElementById('btn-save-bill');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังบันทึก...';

  const key = `${d.roomId}-${d.month}`;
  STATE.bills[key] = { ...d, paid: false, createdAt: isoDate() };
  
  await saveState(); // บันทึกลง Supabase

  toast(`บันทึกบิลห้อง ${d.roomId} เรียบร้อย`, 'success');
  btn.textContent = '✅ บันทึกแล้ว';
  setTimeout(() => { 
    btn.textContent = '💾 บันทึกบิล'; 
    btn.disabled = false;
  }, 2000);
}

async function sendBillTelegram() {
  const d = window._currentBillDraft;
  if (!d) return;
  const tenant = STATE.tenants[d.roomId] || {};
  const mk = monthKey();
  const msg = `🏠 <b>${CFG.MANSION_NAME}</b> — ใบแจ้งหนี้\n\n` +
    `ห้อง: <b>${d.roomId}</b> | ${tenant.name || '-'}\n` +
    `ประจำเดือน: ${thaiMonth(mk)}\n\n` +
    `⚡ ค่าไฟ: ${fmt(d.elecAmt)} บาท (${d.elecUnits} หน่วย)\n` +
    `💧 ค่าน้ำ: ${fmt(d.waterAmt)} บาท (${d.waterUnits} หน่วย)\n` +
    `🏠 ค่าเช่า: ${fmt(CFG.RENT)} บาท\n` +
    (d.lateAmt > 0 ? `⚠️ ค่าปรับ: ${fmt(d.lateAmt)} บาท\n` : '') +
    `\n💰 <b>รวมทั้งสิ้น: ${fmt(d.total)} บาท</b>\n\n` +
    `📅 กำหนดชำระ: วันที่ ${CFG.DUE_DAY} ของเดือน\n` +
    `📞 สอบถาม: ${CFG.PHONE}`;
    
  const btn = document.getElementById('btn-send-tg-bill');
  btn.disabled = true;
  await sendTelegram(msg);
  btn.disabled = false;
}