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

  const elecDiff  = elecNew - elecOld;
  const waterDiff = waterNew - waterOld;

  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png'; 

  document.getElementById('bill-preview').innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" alt="Logo" style="width:100px; height:auto; object-fit:contain;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <h3 style="text-align:center; color:#1e3a8a; margin-bottom:24px; font-size:17px;">ใบเสร็จรับเงิน / ใบแจ้งหนี้ (Receipt / Invoice)</h3>

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
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าไฟฟ้า (Electricity)<br><span style="font-size:11.5px; color:#64748b;">[ เลขมิเตอร์ใหม่: ${elecNew || '......'} - เลขมิเตอร์เดิม: ${elecOld || '......'} ]</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${fmtInt(elecDiff) || '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.ELEC_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${elecDiff > 0 ? fmt(bill.elecAmt) : '........................'}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">3</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าน้ำประปา (Water)<br><span style="font-size:11.5px; color:#64748b;">[ เลขมิเตอร์ใหม่: ${waterNew || '......'} - เลขมิเตอร์เดิม: ${waterOld || '......'} ] *ขั้นต่ำ 100 บ.</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${fmtInt(waterDiff) || '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.WATER_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${waterDiff > 0 ? fmt(bill.waterAmt) : '........................'}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">4</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าปรับชำระล่าช้า (Late Payment Penalty) <span style="font-size:11.5px; color:#64748b;">(ตั้งแต่วันที่ 6 เป็นต้นไป)</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${lateDays > 0 ? lateDays + ' วัน' : '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.LATE_PER_DAY.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${lateDays > 0 ? fmt(bill.lateAmt) : '........................'}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">5</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">เงินประกันแรกเข้า / ค่าเช่าล่วงหน้า <span style="font-size:11.5px; color:#64748b;">(เฉพาะผู้เช่าใหม่)</span></td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${isNew ? '1' : '............'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${isNew ? fmt(bill.depositAmt + bill.advanceAmt) : '........................'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${isNew ? fmt(bill.depositAmt + bill.advanceAmt) : '........................'}</td>
        </tr>
        <tr style="background-color:#f8fafc; font-weight:bold;">
          <td colspan="4" style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px;">รวมยอดเงินที่ต้องชำระทั้งสิ้น (Total Amount Due)</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px; text-decoration: underline;">${fmt(bill.total)}</td>
        </tr>
      </tbody>
    </table>

    <div style="background-color:#fefce8; border:1px dashed #ca8a04; border-radius:6px; padding:12px 16px; margin-bottom:32px; font-size:12px; color:#854d0e;">
      <strong style="font-size:13px;">💡 หมายเหตุการชำระเงิน:</strong><br>
      1. กรุณาชำระเงินภายในวันที่ <strong>${CFG.DUE_DAY}</strong> ของเดือน หากชำระตั้งแต่วันที่ 6 เป็นต้นไป ระบบจะคิดค่าปรับวันละ <strong>${CFG.LATE_PER_DAY}</strong> บาทอัตโนมัติ<br>
      2. หากค้างชำระเกินวันที่ <strong>${CFG.CUT_DAY}</strong> ทางหอพักขอสงวนสิทธิ์งดจ่ายน้ำ-ไฟ และดำเนินการตามข้อตกลงในสัญญาเช่าทันที
    </div>

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