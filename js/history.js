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

  rows.sort((a, b) => b.mk.localeCompare(a.mk) || a.roomId.localeCompare(b.roomId));

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
          ? `<button class="btn btn-success btn-sm" onclick="markPaid('${roomId}')">รับเงิน</button>
             <button class="btn btn-outline btn-sm" onclick="sendOverdueNotice('${roomId}')">📤 TG</button>`
          : `<button class="btn btn-outline btn-sm" onclick="viewBillDetail('${roomId}','${mk}')">🖨 พิมพ์ใบเสร็จ</button>`
        }
      </td>
    </tr>
  `).join('');
}

function populateHistoryFilters() {
  const rs = document.getElementById('hist-room');
  if (rs && rs.options.length <= 1) {
    rs.innerHTML = '<option value="">ทุกห้อง</option>' + CFG.ROOMS.map(r => `<option value="${r}">${r}</option>`).join('');
  }
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

// 💡 เปิดหน้าใบเสร็จสวยงาม แทน Modal ตัวเก่าที่หน้าตาจืดชืด
function viewBillDetail(roomId, mk) {
  const bill = STATE.bills[`${roomId}-${mk}`];
  const tenant = STATE.tenants[roomId] || { name: '.............................................' };
  if (!bill) return;

  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png'; 

  const html = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" alt="Logo" style="width:100px; height:auto; object-fit:contain;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <h3 style="text-align:center; color:#1e3a8a; margin-bottom:24px; font-size:17px;">ใบเสร็จรับเงิน (Receipt)</h3>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:14px;">
      <div><strong>ชื่อผู้เช่า:</strong> ${tenant.name || '.............................................'}</div>
      <div><strong>เลขที่บิล (No.):</strong> INV-${roomId}-${mk.replace('-','')}</div>
      <div><strong>ห้องพักหมายเลข (Room):</strong> ${roomId} &nbsp;&nbsp; <strong>ชั้น:</strong> ${roomId.charAt(0)}</div>
      <div><strong>วันที่ชำระ (Paid Date):</strong> ${bill.paidDate || '-'}</div>
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
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าไฟฟ้า (Electricity)</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${fmtInt(bill.elecUnits)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.ELEC_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(bill.elecAmt)}</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">3</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าน้ำประปา (Water) *ขั้นต่ำ ${CFG.WATER_MIN} บ.</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${fmtInt(bill.waterUnits)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">${CFG.WATER_RATE.toFixed(2)}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(bill.waterAmt)}</td>
        </tr>
        ${bill.lateAmt > 0 ? `
        <tr>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">4</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">ค่าปรับชำระล่าช้า (Late Payment Penalty)</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">-</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:center;">-</td>
          <td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(bill.lateAmt)}</td>
        </tr>` : ''}
        <tr style="background-color:#f8fafc; font-weight:bold;">
          <td colspan="4" style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px;">รวมยอดเงินที่ชำระแล้วทั้งสิ้น (Total Paid)</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:14px; text-decoration: underline;">${fmt(bill.total)}</td>
        </tr>
      </tbody>
    </table>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; font-size:14px; margin-top: 40px; margin-bottom:32px;">
      <div>
        <div style="margin-bottom:8px;">( ${tenant.name || '........................................................'} )</div>
        <strong style="color:#1e3a8a;">ผู้จ่ายเงิน / ผู้เช่า</strong>
      </div>
      <div>
        <div style="margin-bottom:8px;">( ........................................................ )</div>
        <strong style="color:#1e3a8a;">ผู้รับเงิน / ผู้แทนฟ้าใสแมนชั่น</strong>
      </div>
    </div>
  `;

  document.getElementById('contract-output').innerHTML = html; 
  openModal('modal-print-contract');
}