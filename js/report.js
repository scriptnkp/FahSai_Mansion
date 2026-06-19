// ── Report Module ──

function renderReport() {
  populateMonthSelect();
  const sel = document.getElementById('report-month-select');
  sel.removeEventListener('change', onReportMonthChange);
  sel.addEventListener('change', onReportMonthChange);
  buildReport(sel.value || monthKey());
}

function populateMonthSelect() {
  const sel = document.getElementById('report-month-select');
  const months = new Set([monthKey()]);
  Object.keys(STATE.bills).forEach(k => { 
    const m = k.split('-').slice(1, 3).join('-'); 
    if(m) months.add(m); 
  });
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.add(monthKey(d));
  }
  const sorted = [...months].sort().reverse();
  sel.innerHTML = sorted.map(m => `<option value="${m}" ${m === monthKey() ? 'selected' : ''}>${thaiMonth(m)}</option>`).join('');
}

function onReportMonthChange() {
  buildReport(document.getElementById('report-month-select').value);
}

function buildReport(mk) {
  const rows = [];
  let totalBilled = 0, totalPaid = 0, totalPending = 0;
  let countPaid = 0, countPending = 0;
  const roomSet = new Set(); // ใช้ Set เพื่อนับจำนวนห้องไม่ให้ซ้ำกัน

  // ลูปหาบิลทั้งหมด เพื่อให้เจอบิลแรกเข้า (-IN) ที่ซ่อนอยู่ด้วย
  Object.values(STATE.bills).forEach(bill => {
    if (bill.month.startsWith(mk)) { 
      const r = bill.roomId;
      const tenant = STATE.tenants[r];
      
      roomSet.add(r);
      if (bill.paid) { countPaid++; totalPaid += bill.total; }
      else { countPending++; totalPending += bill.total; }
      totalBilled += bill.total;
      
      rows.push({ roomId: r, tenant, bill });
    }
  });

  // เรียงลำดับห้องให้สวยงาม
  rows.sort((a, b) => a.roomId.localeCompare(b.roomId));

  document.getElementById('rpt-total-billed').textContent = fmt(totalBilled);
  document.getElementById('rpt-total-paid').textContent = fmt(totalPaid);
  document.getElementById('rpt-total-pending').textContent = fmt(totalPending);
  document.getElementById('rpt-count-rooms').textContent = roomSet.size;
  document.getElementById('rpt-count-paid').textContent = countPaid;
  document.getElementById('rpt-count-pending').textContent = countPending;

  const tbody = document.getElementById('report-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:20px">ไม่มีข้อมูลบิลในเดือนนี้</td></tr>`;
    return;
  }
  
  tbody.innerHTML = rows.map(({roomId, tenant, bill}) => {
    if (bill.isNew) {
      const adv = bill.advanceAmt || CFG.RENT;
      const dep = bill.depositAmt || (bill.total - adv);
      return `
        <tr class="${!bill.paid && dayOfMonth() > CFG.CUT_DAY ? 'overdue-row' : ''}">
          <td><strong>${roomId}</strong></td>
          <td>${tenant?.name || '-'}</td>
          <td>${tenant?.phone || '-'}</td>
          <td colspan="3" class="text-center" style="color:var(--sky-dk); font-size:13px; background:var(--sky-lt);">
            ✨ บิลแรกเข้า (ล่วงหน้า ${fmtInt(adv)} + ประกัน ${fmtInt(dep)})
          </td>
          <td class="text-right"><strong>${fmt(bill.total)}</strong></td>
          <td>
            <span class="badge badge-${bill.paid ? 'success' : 'danger'}">${bill.paid ? '✅ ชำระแล้ว' : '⏳ ค้างชำระ'}</span>
            ${!bill.paid ? `<button class="btn btn-success btn-sm" style="margin-top:4px" onclick="markPaid('${roomId}')">รับเงิน</button>` : ''}
          </td>
        </tr>
      `;
    } else {
      return `
        <tr class="${!bill.paid && dayOfMonth() > CFG.CUT_DAY ? 'overdue-row' : ''}">
          <td><strong>${roomId}</strong></td>
          <td>${tenant?.name || '-'}</td>
          <td>${tenant?.phone || '-'}</td>
          <td class="text-right">${fmt(CFG.RENT)}</td>
          <td class="text-right">${fmt(bill.elecAmt)} <span style="font-size:11px;color:var(--gray-400)">(${bill.elecUnits}u)</span></td>
          <td class="text-right">${fmt(bill.waterAmt)} <span style="font-size:11px;color:var(--gray-400)">(${bill.waterUnits}u)</span></td>
          <td class="text-right"><strong>${fmt(bill.total)}</strong></td>
          <td>
            <span class="badge badge-${bill.paid ? 'success' : 'danger'}">${bill.paid ? '✅ ชำระแล้ว' : '⏳ ค้างชำระ'}</span>
            ${!bill.paid ? `<button class="btn btn-success btn-sm" style="margin-top:4px" onclick="markPaid('${roomId}')">รับเงิน</button>` : ''}
          </td>
        </tr>
      `;
    }
  }).join('');
}

function exportReportImage() {
  const el = document.getElementById('report-section');
  if (!el || typeof html2canvas === 'undefined') { toast('โหลด html2canvas ไม่สำเร็จ', 'error'); return; }
  const mk = document.getElementById('report-month-select').value;
  html2canvas(el, { scale: 2, backgroundColor: '#fff' }).then(canvas => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `report_${mk}.png`;
    a.click();
    toast('ส่งออกรายงานสำเร็จ', 'success');
  });
}

async function sendReportTelegram() {
  const mk = document.getElementById('report-month-select').value;
  let total = 0, paid = 0, pending = 0, paidCount = 0, pendCount = 0;
  
  const roomSet = new Set();
  Object.values(STATE.bills).forEach(bill => {
    if (bill.month.startsWith(mk)) {
      roomSet.add(bill.roomId);
      total += bill.total;
      if (bill.paid) { paid += bill.total; paidCount++; }
      else { pending += bill.total; pendCount++; }
    }
  });
  
  const msg = `📊 <b>${CFG.MANSION_NAME}</b>\nสรุปรายงานประจำเดือน ${thaiMonth(mk)}\n\n` +
    `✅ ชำระแล้ว: <b>${paidCount} บิล</b> — ${fmt(paid)} บาท\n` +
    `⏳ ยังไม่ชำระ: <b>${pendCount} บิล</b> — ${fmt(pending)} บาท\n` +
    `💰 รวมยอดทั้งหมด: <b>${fmt(total)} บาท</b>`;
    
  await sendTelegram(msg);
}

// ── ระบบประเมินภาษีประจำปี ──
function openTaxReportModal() {
  const mk = document.getElementById('report-month-select').value || monthKey();
  const year = mk.split('-')[0];
  document.getElementById('tax-year-label').textContent = year;

  let totalIncome = 0;
  let taxableIncome = 0; // ยอดที่นำไปคำนวณภาษี (ไม่รวมเงินประกัน)

  Object.values(STATE.bills).forEach(bill => {
    if (bill.paid && bill.month.startsWith(year)) {
      totalIncome += bill.total;
      
      // ถ้าเป็นบิลแรกเข้า ให้หักเงินประกันออก เพราะไม่ต้องนำไปเสียภาษี
      const deposit = bill.isNew ? (bill.depositAmt || CFG.DEPOSIT) : 0;
      taxableIncome += (bill.total - deposit);
    }
  });

  // หักค่าใช้จ่ายเหมา 30% และลดหย่อนส่วนตัว (ดึงค่าจาก CFG)
  const expense = taxableIncome * 0.30; 
  const deduction = CFG.TAX_DEDUCTION; 
  let netIncome = taxableIncome - expense - deduction;
  if (netIncome < 0) netIncome = 0;

  // คำนวณภาษีขั้นบันได
  let tax = 0;
  let remaining = netIncome;

  if (remaining > 5000000) { tax += (remaining - 5000000) * 0.35; remaining = 5000000; }
  if (remaining > 2000000) { tax += (remaining - 2000000) * 0.30; remaining = 2000000; }
  if (remaining > 1000000) { tax += (remaining - 1000000) * 0.25; remaining = 1000000; }
  if (remaining > 750000)  { tax += (remaining - 750000) * 0.20; remaining = 750000; }
  if (remaining > 500000)  { tax += (remaining - 500000) * 0.15; remaining = 500000; }
  if (remaining > 300000)  { tax += (remaining - 300000) * 0.10; remaining = 300000; }
  if (remaining > 150000)  { tax += (remaining - 150000) * 0.05; remaining = 150000; }

  document.getElementById('tax-report-body').innerHTML = `
    <table class="bill-table" style="margin-bottom: 0;">
      <tr><td style="color:var(--gray-600)">เงินหมุนเวียนรับเข้าทั้งหมดปี ${year}</td><td class="text-right">${fmt(totalIncome)}</td></tr>
      <tr style="background:var(--sky-lt)"><td><b>รายได้สุทธิ (ไม่รวมเงินประกัน)</b></td><td class="text-right" style="color:var(--sky-dk)"><b>${fmt(taxableIncome)}</b></td></tr>
      <tr><td>หัก ค่าใช้จ่ายเหมา (30%)</td><td class="text-right" style="color:var(--red)">- ${fmt(expense)}</td></tr>
      <tr><td>หัก ค่าลดหย่อนส่วนตัว</td><td class="text-right" style="color:var(--red)">- ${fmt(deduction)}</td></tr>
      <tr style="background:var(--gray-100)"><td><b>เงินได้เพื่อคำนวณภาษี</b></td><td class="text-right"><b>${fmt(netIncome)}</b></td></tr>
      <tr class="total-row"><td><b>ภาษีที่ต้องชำระโดยประมาณ</b></td><td class="text-right" style="color:var(--sky-dk)"><b>${fmt(tax)}</b></td></tr>
    </table>
    <div style="font-size:12px; color:var(--gray-400); margin-top:16px; text-align:center; line-height: 1.4;">
      * ข้อมูลนี้เป็นการประเมินภาษีเงินได้บุคคลธรรมดาเบื้องต้น (ภ.ง.ด. 90)<br>
      อ้างอิงจากการหักค่าใช้จ่ายเหมา 30% และค่าลดหย่อนส่วนตัว ${fmtInt(CFG.TAX_DEDUCTION)} บาท
    </div>
    
    <div style="margin-top: 24px; text-align: center;">
      <button class="btn btn-primary" style="width:100%" onclick="printYearlyTaxReport('${year}')">🖨 พิมพ์รายงานสรุปรายปี (PDF)</button>
    </div>
  `;
  
  openModal('modal-tax-report');
}

// ── ฟังก์ชันสร้างรายงาน PDF แยกเดือน ──
function printYearlyTaxReport(year) {
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  
  // ใช้ Set() เพื่อเก็บเลขห้อง มันจะไม่นับเลขห้องที่ซ้ำกัน
  const monthsData = Array.from({length: 12}, () => ({ rooms: new Set(), rent: 0, elec: 0, water: 0, late: 0, total: 0 }));
  let grandTotal = 0;

  // จัดกลุ่มข้อมูลบิลตามเดือน
  Object.values(STATE.bills).forEach(b => {
    if (b.paid && b.month.startsWith(year)) {
      const mIndex = parseInt(b.month.split('-')[1]) - 1; // หา index เดือน (0-11)
      if (mIndex >= 0 && mIndex < 12) {
         const rent = b.isNew ? (b.advanceAmt || CFG.RENT) : CFG.RENT;
         const elec = b.elecAmt || 0;
         const water = b.waterAmt || 0;
         const late = b.lateAmt || 0;
         const taxable = rent + elec + water + late; // รวมเฉพาะรายได้ ไม่เอาเงินมัดจำ

         // เอาเลขห้องใส่เข้าไปใน Set ถ้าเลขห้องซ้ำ มันจะนับแค่ 1
         monthsData[mIndex].rooms.add(b.roomId); 
         
         monthsData[mIndex].rent += rent;
         monthsData[mIndex].elec += elec;
         monthsData[mIndex].water += water;
         monthsData[mIndex].late += late;
         monthsData[mIndex].total += taxable;
         
         grandTotal += taxable;
      }
    }
  });

  // คำนวณภาษีบุคคลธรรมดา (ภ.ง.ด. 90) ดึงค่าลดหย่อนจากตั้งค่า
  const expense = grandTotal * 0.30; 
  const deduction = CFG.TAX_DEDUCTION; 
  let netIncome = grandTotal - expense - deduction;
  if (netIncome < 0) netIncome = 0;

  let tax = 0;
  let remaining = netIncome;

  if (remaining > 5000000) { tax += (remaining - 5000000) * 0.35; remaining = 5000000; }
  if (remaining > 2000000) { tax += (remaining - 2000000) * 0.30; remaining = 2000000; }
  if (remaining > 1000000) { tax += (remaining - 1000000) * 0.25; remaining = 1000000; }
  if (remaining > 750000)  { tax += (remaining - 750000) * 0.20; remaining = 750000; }
  if (remaining > 500000)  { tax += (remaining - 500000) * 0.15; remaining = 500000; }
  if (remaining > 300000)  { tax += (remaining - 300000) * 0.10; remaining = 300000; }
  if (remaining > 150000)  { tax += (remaining - 150000) * 0.05; remaining = 150000; }

  // วาดตารางรายเดือน
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  let tbody = '';
  
  monthsData.forEach((d, i) => {
    if (d.total > 0) {
        tbody += `
          <tr>
            <td class="text-center">${thaiMonths[i]}</td>
            <td class="text-center">${d.rooms.size}</td>
            <td class="text-right">${fmt(d.rent)}</td>
            <td class="text-right">${fmt(d.elec)}</td>
            <td class="text-right">${fmt(d.water)}</td>
            <td class="text-right">${fmt(d.late)}</td>
            <td class="text-right" style="font-weight:bold;">${fmt(d.total)}</td>
          </tr>
        `;
    }
  });

  if (tbody === '') {
      tbody = `<tr><td colspan="7" class="text-center" style="padding:20px;">ไม่มีข้อมูลรายรับในปีนี้</td></tr>`;
  }

  // วาดโครงสร้างเอกสาร PDF
  const html = `
    <div style="display:flex; align-items:center; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px; font-family:'Sarabun', sans-serif;">
      <img src="${LOGO_URL}" alt="Logo" style="width:100px; height:auto; object-fit:contain; margin-right:15px;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <div style="text-align:center; margin-bottom:20px; font-family:'Sarabun', sans-serif;">
        <h3 style="margin:10px 0; font-size:18px;">รายงานสรุปรายรับเพื่อประเมินภาษี ประจำปี ${year}</h3>
        <p style="font-size:13px; color:#64748b; margin:0;">(ข้อมูลเฉพาะรายได้ที่เรียกเก็บจริง ไม่รวมเงินมัดจำ/ประกันความเสียหาย)</p>
    </div>
    
    <table style="width:100%; border-collapse:collapse; font-size:14px; font-family:'Sarabun', sans-serif;">
        <thead style="background-color:#0284c7; color:white;">
            <tr>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:center;">เดือน</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:center;">จำนวนห้อง</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">ค่าเช่า/ล่วงหน้า</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">ค่าไฟฟ้า</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">ค่าน้ำประปา</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">ค่าปรับล่าช้า</th>
                <th style="padding:10px; border:1px solid #bae6fd; text-align:right;">รวมรายได้สุทธิ (บาท)</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
            <tr style="background-color:#f8fafc; font-weight:bold; font-size:15px;">
                <td colspan="6" style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a;">รวมรายได้สุทธิทั้งปี</td>
                <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; text-decoration:underline;">${fmt(grandTotal)}</td>
            </tr>
        </tbody>
    </table>

    <div style="margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family:'Sarabun', sans-serif;">
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:0;">
            <tr style="background-color:#e0f2fe;">
              <td style="padding:10px; border-bottom:1px solid #e2e8f0;"><b>รายได้สุทธิ (ไม่รวมเงินประกัน)</b></td>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; color:#0369a1;"><b>${fmt(grandTotal)}</b></td>
            </tr>
            <tr>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0;">หัก ค่าใช้จ่ายเหมา (30%)</td>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; color:#ef4444;">- ${fmt(expense)}</td>
            </tr>
            <tr>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0;">หัก ค่าลดหย่อนส่วนตัว</td>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right; color:#ef4444;">- ${fmt(deduction)}</td>
            </tr>
            <tr style="background-color:#f1f5f9;">
              <td style="padding:10px; border-bottom:1px solid #e2e8f0;"><b>เงินได้เพื่อคำนวณภาษี</b></td>
              <td style="padding:10px; border-bottom:1px solid #e2e8f0; text-align:right;"><b>${fmt(netIncome)}</b></td>
            </tr>
            <tr>
              <td style="padding:12px 10px; color:#0369a1; font-size:16px;"><b>ภาษีที่ต้องชำระโดยประมาณ</b></td>
              <td style="padding:12px 10px; text-align:right; color:#0369a1; font-size:16px;"><b>${fmt(tax)}</b></td>
            </tr>
        </table>
    </div>
    <div style="font-size:12px; color:#64748b; margin-top:10px; text-align:center; line-height: 1.4; font-family:'Sarabun', sans-serif;">
      * ข้อมูลนี้เป็นการประเมินภาษีเงินได้บุคคลธรรมดาเบื้องต้น (ภ.ง.ด. 90)<br>
      อ้างอิงจากการหักค่าใช้จ่ายเหมา 30% และค่าลดหย่อนส่วนตัว ${fmtInt(CFG.TAX_DEDUCTION)} บาท
    </div>
    
    <div style="margin-top: 40px; text-align: right; font-size: 13px; font-family:'Sarabun', sans-serif;">
        พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>
  `;

  printHidden(html, `Tax_Report_${year}`);
}