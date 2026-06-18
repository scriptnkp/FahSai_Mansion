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

  // ดักจับเฉพาะช่องน้ำและไฟ
  ['elec-old','elec-new','water-old','water-new'].forEach(id => {
    const el = document.getElementById(id); if(el) el.addEventListener('input', recalcBill);
  });
  
  document.getElementById('btn-save-bill').addEventListener('click', saveBill);
  document.getElementById('btn-send-tg-bill').addEventListener('click', sendBillTelegram);

  clearBillForm();
}

function onRoomChange(roomId) {
  clearBillForm(); if (!roomId) return;
  const tenant = STATE.tenants[roomId], mk = monthKey(), existing = STATE.bills[`${roomId}-${mk}`];

  const infoEl = document.getElementById('form-tenant-info');
  if (tenant?.active) {
    infoEl.innerHTML = `<div class="alert alert-info" style="align-items:center;"><span>👤</span><div><strong>${tenant.name}</strong> · ${tenant.phone || '-'}<br><span style="font-size:12px">เข้าอยู่: ${tenant.moveIn || '-'}</span></div></div>`;
  } else {
    infoEl.innerHTML = `<div class="alert alert-warning"><span>⚠️</span> ห้องว่าง — เพิ่มผู้เช่าในหน้าภาพรวมก่อน</div>`;
  }

  // ไม่ดึงเอา "จำนวนหน่วยที่ใช้ (elecUnits)" มาใส่เป็นเลขมิเตอร์เด็ดขาด ป้องกันบั๊กเลข 20/30 โผล่มา
  const prevMk = getPrevMonthKey(), prevBill = STATE.bills[`${roomId}-${prevMk}`];
  if (prevBill) {
    document.getElementById('elec-old').value = prevBill.elecNew !== undefined ? prevBill.elecNew : '';
    document.getElementById('water-old').value = prevBill.waterNew !== undefined ? prevBill.waterNew : '';
  }
  if (existing) {
    document.getElementById('elec-old').value = existing.elecOld !== undefined ? existing.elecOld : '';
    document.getElementById('elec-new').value  = existing.elecNew !== undefined ? existing.elecNew : '';
    document.getElementById('water-old').value = existing.waterOld !== undefined ? existing.waterOld : '';
    document.getElementById('water-new').value  = existing.waterNew !== undefined ? existing.waterNew : '';
  }
  recalcBill();
}

function getPrevMonthKey() { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthKey(d); }

function clearBillForm() {
  document.getElementById('form-tenant-info').innerHTML = '';
  document.getElementById('bill-preview').innerHTML = `<div style="text-align:center;color:var(--gray-400);padding:40px 0;">📋 เลือกห้องและกรอกเลขมิเตอร์เพื่อดูบิล</div>`;
  document.getElementById('btn-save-bill').disabled = true; document.getElementById('btn-send-tg-bill').disabled = true;
  
  document.getElementById('elec-old').value = '';
  document.getElementById('elec-new').value = '';
  document.getElementById('water-old').value = '';
  document.getElementById('water-new').value = '';
}

function recalcBill() {
  const roomId = document.getElementById('room-select').value; if (!roomId) return;
  
  const elecNewStr = document.getElementById('elec-new').value.trim();
  const waterNewStr = document.getElementById('water-new').value.trim();
  
  const elecOld = parseFloat(document.getElementById('elec-old').value) || 0;
  const waterOld = parseFloat(document.getElementById('water-old').value) || 0;

  const hasElecNew = elecNewStr !== '';
  const hasWaterNew = waterNewStr !== '';

  const elecNew = hasElecNew ? parseFloat(elecNewStr) : 0;
  const waterNew = hasWaterNew ? parseFloat(waterNewStr) : 0;

  // ดักจับ Error เฉพาะตอนที่ผู้ใช้พิมพ์ตัวเลขเข้าไปแล้ว และค่าน้อยกว่าของเก่าจริงๆ
  if ((hasElecNew && elecNew < elecOld) || (hasWaterNew && waterNew < waterOld)) {
    document.getElementById('bill-preview').innerHTML = `<div class="alert alert-danger">⚠️ เลขมิเตอร์ใหม่ต้องมากกว่าหรือเท่ากับเลขเก่า</div>`; 
    document.getElementById('btn-save-bill').disabled = true;
    document.getElementById('btn-send-tg-bill').disabled = true;
    return;
  }

  // คำนวณความต่าง
  const elecDiff = hasElecNew ? Math.max(0, elecNew - elecOld) : null;
  const waterDiff = hasWaterNew ? Math.max(0, waterNew - waterOld) : null;

  // คำนวณยอดเงิน
  const elecAmt = hasElecNew ? (elecDiff * CFG.ELEC_RATE) : 0;
  const waterAmt = hasWaterNew ? Math.max(waterDiff * CFG.WATER_RATE, CFG.WATER_MIN) : 0;

  // ยอดรวมบิลปกติ ไม่รวมค่าปรับและค่าแรกเข้า
  const total = CFG.RENT + elecAmt + waterAmt;

  const tenant = STATE.tenants[roomId] || {};
  const mk = monthKey();
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png'; 

  document.getElementById('bill-preview').innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" alt="Logo" style="width:100px; height:auto; object-fit:contain;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <h3 style="text-align:center; color:#1e3a8a; margin-bottom:24px; font-size:17px;">ใบแจ้งหนี้ (Invoice)</h3>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:14px;">
      <div><strong>ชื่อผู้เช่า:</strong> ${tenant.name || '.............................................'}</div>
      <div><strong>เลขที่บิล (No.):</strong> .............................................</div>
      <div><strong>ห้องพักหมายเลข (Room):</strong> ${roomId} &nbsp;&nbsp; <strong>ชั้น:</strong> ${roomId.charAt(0)}</div>
      <div><strong>วันที่ (Date):</strong> ${today()}</div>
      <div style="grid-column:1/-1;"><strong>ประจำรอบเดือน (Billing Period):</strong> ${thaiMonth(mk)}</div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px; font-family:'Sarabun', sans-serif;">
      <thead style="background-color:#0284c7; color:white;">
        <tr>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:center;">ลำดับ</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:left;">รายการรายละเอียด (Description)</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:center;">จำนวนหน่วย</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:center;">ราคา/หน่วย</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">1</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าเช่าห้องพักรายเดือน (Room Rent)</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">1 เดือน</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${fmt(CFG.RENT)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(CFG.RENT)}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">2</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าไฟฟ้า (Electricity)<br><span style="font-size:11.5px; color:#64748b;">[ เลขมิเตอร์ใหม่: ${hasElecNew ? elecNew : '......'} - เลขมิเตอร์เดิม: ${elecOld} ]</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${hasElecNew ? fmtInt(elecDiff) : '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.ELEC_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${hasElecNew ? fmt(elecAmt) : '........................'}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">3</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าน้ำประปา (Water)<br><span style="font-size:11.5px; color:#64748b;">[ เลขมิเตอร์ใหม่: ${hasWaterNew ? waterNew : '......'} - เลขมิเตอร์เดิม: ${waterOld} ] *ขั้นต่ำ ${CFG.WATER_MIN} บ.</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${hasWaterNew ? fmtInt(waterDiff) : '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.WATER_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${hasWaterNew ? fmt(waterAmt) : '........................'}</td>
        </tr>
        <tr style="background-color:#f8fafc; font-weight:bold;">
          <td colspan="4" style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px;">รวมยอดเงินที่ต้องชำระทั้งสิ้น (Total Amount Due)</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px; text-decoration: underline;">${fmt(total)}</td>
        </tr>
      </tbody>
    </table>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; font-size:14px; margin-bottom:32px;">
      <div>
        <div style="margin-bottom:8px;">( ........................................................ )</div>
        <strong style="color:#1e3a8a;">ผู้จ่ายเงิน / ผู้เช่า</strong>
      </div>
      <div>
        <div style="margin-bottom:8px;">( ........................................................ )</div>
        <strong style="color:#1e3a8a;">ผู้รับเงิน / ผู้แทนฟ้าใสแมนชั่น</strong>
      </div>
    </div>
  `;

  // บันทึกค่า Draft โดยกำหนดให้ค่าปรับเป็น 0 เสมอ
  window._currentBillDraft = { 
    roomId, 
    elecOld, elecNew: hasElecNew ? elecNew : elecOld, elecUnits: elecDiff || 0, elecAmt,
    waterOld, waterNew: hasWaterNew ? waterNew : waterOld, waterUnits: waterDiff || 0, waterAmt,
    lateDays: 0, lateAmt: 0, 
    isNew: false, depositAmt: 0, advanceAmt: 0, 
    total, month: mk 
  };
  
  // ปุ่มเซฟจะกดได้ก็ต่อเมื่อกรอกเลขมิเตอร์ครบทั้ง 2 ช่องแล้วเท่านั้น
  if (hasElecNew && hasWaterNew) {
    document.getElementById('btn-save-bill').disabled = false; 
    document.getElementById('btn-send-tg-bill').disabled = false;
  } else {
    document.getElementById('btn-save-bill').disabled = true; 
    document.getElementById('btn-send-tg-bill').disabled = true;
  }
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
  
  // ถอดข้อความเรื่องค่าปรับใน Telegram ออกจากหน้านี้ด้วย
  const msg = `🏠 <b>${CFG.MANSION_NAME}</b> — ใบแจ้งหนี้\n\n` +
    `ห้อง: <b>${d.roomId}</b> | ${tenant.name || '-'}\n` +
    `ประจำเดือน: ${thaiMonth(mk)}\n\n` +
    `⚡ ค่าไฟ: ${fmt(d.elecAmt)} บาท (${d.elecUnits} หน่วย)\n` +
    `💧 ค่าน้ำ: ${fmt(d.waterAmt)} บาท (${d.waterUnits} หน่วย)\n` +
    `🏠 ค่าเช่า: ${fmt(CFG.RENT)} บาท\n` +
    `\n💰 <b>รวมทั้งสิ้น: ${fmt(d.total)} บาท</b>\n\n` +
    `📅 กำหนดชำระ: วันที่ ${CFG.DUE_DAY} ของเดือน\n` +
    `📞 สอบถาม: ${CFG.PHONE}`;
    
  const btn = document.getElementById('btn-send-tg-bill'); btn.disabled = true; await sendTelegram(msg); btn.disabled = false;
}