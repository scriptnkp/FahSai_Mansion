// ── History Module ──

function renderHistory() {
  const search  = (document.getElementById('hist-search')?.value || '').toLowerCase();
  const room    = document.getElementById('hist-room')?.value || '';
  const month   = document.getElementById('hist-month-filter')?.value || '';
  const status  = document.getElementById('hist-status')?.value || '';

  populateHistoryFilters();

  const rows = [];
  Object.entries(STATE.bills).forEach(([key, bill]) => {
    const [roomId, ...mParts] = key.split('-');
    const mk = mParts.join('-');
    const tenant = STATE.tenants[roomId] || {};
    rows.push({ key, roomId, mk, bill, tenant });
  });

  // Sort newest first
  rows.sort((a, b) => b.mk.localeCompare(a.mk) || a.roomId.localeCompare(b.roomId));

  // Filter
  const filtered = rows.filter(({roomId, mk, bill, tenant}) => {
    if (room   && roomId !== room) return false;
    if (month  && mk !== month) return false;
    if (status === 'paid'    && !bill.paid) return false;
    if (status === 'pending' && bill.paid) return false;
    if (search && !roomId.includes(search) && !(tenant.name||'').toLowerCase().includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('history-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px">ไม่พบข้อมูล</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(({roomId, mk, bill, tenant}) => `
    <tr>
      <td><strong>${roomId}</strong></td>
      <td>${tenant.name || '-'}</td>
      <td>${thaiMonth(mk)}</td>
      <td class="text-right">${fmt(bill.total)}</td>
      <td><span class="badge badge-${bill.paid ? 'success' : 'danger'}">${bill.paid ? '✅ ชำระแล้ว' : '⏳ ค้างชำระ'}</span></td>
      <td>${bill.paid ? (bill.paidDate || '-') : '-'}</td>
      <td>
        ${!bill.paid
          ? `<button class="btn btn-success btn-sm" onclick="markPaid('${roomId}').then(() => renderHistory())">รับเงิน</button>
             <button class="btn btn-outline btn-sm" onclick="sendOverdueNotice('${roomId}')">📤 TG</button>`
          : `<button class="btn btn-outline btn-sm" onclick="viewBillDetail('${roomId}','${mk}')">👁 ดูบิล</button>`
        }
      </td>
    </tr>
  `).join('');
}

function populateHistoryFilters() {
  // Room filter
  const rs = document.getElementById('hist-room');
  if (rs && rs.options.length <= 1) {
    rs.innerHTML = '<option value="">ทุกห้อง</option>' + CFG.ROOMS.map(r => `<option value="${r}">${r}</option>`).join('');
  }
  // Month filter
  const ms = document.getElementById('hist-month-filter');
  const months = new Set();
  Object.keys(STATE.bills).forEach(k => { const m = k.split('-').slice(1).join('-'); if(m) months.add(m); });
  const sorted = [...months].sort().reverse();
  if (ms) ms.innerHTML = '<option value="">ทุกเดือน</option>' + sorted.map(m => `<option value="${m}">${thaiMonth(m)}</option>`).join('');
}

function initHistory() {
  document.getElementById('hist-search').addEventListener('input', renderHistory);
  document.getElementById('hist-room').addEventListener('change', renderHistory);
  document.getElementById('hist-month-filter').addEventListener('change', renderHistory);
  document.getElementById('hist-status').addEventListener('change', renderHistory);
  document.getElementById('btn-export-history').addEventListener('click', exportHistoryCSV);
}

function exportHistoryCSV() {
  const header = ['ห้อง','ชื่อผู้เช่า','เดือน','ค่าเช่า','ค่าไฟ','ค่าน้ำ','ค่าปรับ','รวม','สถานะ','วันที่ชำระ'];
  const rows = [header];
  Object.entries(STATE.bills).forEach(([key, bill]) => {
    const [roomId, ...mParts] = key.split('-');
    const mk = mParts.join('-');
    const tenant = STATE.tenants[roomId] || {};
    rows.push([
      roomId, tenant.name || '-', thaiMonth(mk),
      CFG.RENT, bill.elecAmt, bill.waterAmt, bill.lateAmt || 0, bill.total,
      bill.paid ? 'ชำระแล้ว' : 'ค้างชำระ', bill.paidDate || '-'
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fahsai_history_${monthKey()}.csv`;
  a.click();
  toast('ส่งออก CSV สำเร็จ', 'success');
}

function viewBillDetail(roomId, mk) {
  const bill = STATE.bills[`${roomId}-${mk}`];
  const tenant = STATE.tenants[roomId] || {};
  if (!bill) return;
  const el = document.getElementById('history-bill-detail');
  el.innerHTML = `
    <div class="bill-header"><h2>${CFG.MANSION_NAME}</h2><p>${thaiMonth(mk)}</p></div>
    <div class="bill-meta">
      <div><span class="label">ห้อง: </span><strong>${roomId}</strong></div>
      <div><span class="label">ชื่อ: </span><strong>${tenant.name||'-'}</strong></div>
    </div>
    <table class="bill-table">
      <tr><td>ค่าเช่า</td><td class="text-right">${fmt(CFG.RENT)}</td></tr>
      <tr><td>ค่าไฟฟ้า (${bill.elecUnits} หน่วย)</td><td class="text-right">${fmt(bill.elecAmt)}</td></tr>
      <tr><td>ค่าน้ำประปา (${bill.waterUnits} หน่วย)</td><td class="text-right">${fmt(bill.waterAmt)}</td></tr>
      ${bill.lateAmt > 0 ? `<tr><td>ค่าปรับ (${bill.lateDays} วัน)</td><td class="text-right">${fmt(bill.lateAmt)}</td></tr>` : ''}
      <tr class="total-row"><td><strong>รวม</strong></td><td class="text-right"><strong>${fmt(bill.total)}</strong></td></tr>
    </table>
    <div style="margin-top:12px;font-size:13px;color:var(--green)">✅ ชำระแล้ววันที่ ${bill.paidDate||'-'}</div>
  `;
  openModal('modal-bill-detail');
}