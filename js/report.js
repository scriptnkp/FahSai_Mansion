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
  // Gather all months from bills
  Object.keys(STATE.bills).forEach(k => { const m = k.split('-').slice(1).join('-'); if(m) months.add(m); });
  // Also generate last 6 months
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
  let countOccupied = 0, countPaid = 0, countPending = 0;

  CFG.ROOMS.forEach(r => {
    const bill = STATE.bills[`${r}-${mk}`];
    const tenant = STATE.tenants[r];
    if (!bill) return;
    countOccupied++;
    if (bill.paid) { countPaid++; totalPaid += bill.total; }
    else { countPending++; totalPending += bill.total; }
    totalBilled += bill.total;
    rows.push({ roomId: r, tenant, bill });
  });

  // Summary cards
  document.getElementById('rpt-total-billed').textContent = fmt(totalBilled);
  document.getElementById('rpt-total-paid').textContent = fmt(totalPaid);
  document.getElementById('rpt-total-pending').textContent = fmt(totalPending);
  document.getElementById('rpt-count-rooms').textContent = countOccupied;
  document.getElementById('rpt-count-paid').textContent = countPaid;
  document.getElementById('rpt-count-pending').textContent = countPending;

  // Table
  const tbody = document.getElementById('report-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:20px">ไม่มีข้อมูลบิลในเดือนนี้</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(({roomId, tenant, bill}) => `
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
        ${!bill.paid ? `<button class="btn btn-success btn-sm" style="margin-top:4px" onclick="markPaid('${roomId}').then(() => renderReport())">รับเงิน</button>` : ''}
      </td>
    </tr>
  `).join('');
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
  
  CFG.ROOMS.forEach(r => {
    const bill = STATE.bills[`${r}-${mk}`];
    if (!bill) return;
    total += bill.total;
    if (bill.paid) { paid += bill.total; paidCount++; }
    else { pending += bill.total; pendCount++; }
  });
  
  const msg = `📊 <b>${CFG.MANSION_NAME}</b>\nสรุปรายงานประจำเดือน ${thaiMonth(mk)}\n\n` +
    `✅ ชำระแล้ว: <b>${paidCount} ห้อง</b> — ${fmt(paid)} บาท\n` +
    `⏳ ยังไม่ชำระ: <b>${pendCount} ห้อง</b> — ${fmt(pending)} บาท\n` +
    `💰 รวมยอดทั้งหมด: <b>${fmt(total)} บาท</b>`;
    
  await sendTelegram(msg);
}