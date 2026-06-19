// ── Dashboard Module ──

function renderDashboard() {
  renderStats();
  renderRoomGrid();
  renderOverdueList();
}

function renderStats() {
  const mk = monthKey();
  let occupied = 0, paid = 0, overdue = 0, totalIncome = 0;

  CFG.ROOMS.forEach(r => {
    const t = STATE.tenants[r]; if (!t || !t.active) return;
    occupied++;
    
    // 💡 แก้ไข: ดึงบิลทั้งหมดของห้องนี้ในเดือนนี้ (รวมทั้งบิลแรกเข้า -IN และบิลปกติ)
    const roomBills = Object.values(STATE.bills).filter(b => b.roomId === r && b.month.startsWith(mk));
    if (roomBills.length === 0) return;

    let roomAllPaid = true;
    let roomHasOverdue = false;

    roomBills.forEach(bill => {
      if (bill.paid) { 
        totalIncome += bill.total; // นำยอดเงินทุกบิลมาบวกกัน
      } else {
        roomAllPaid = false;
        if (dayOfMonth() > CFG.DUE_DAY) roomHasOverdue = true;
      }
    });

    if (roomAllPaid) paid++;
    else if (roomHasOverdue) overdue++;
  });

  const vacant = CFG.ROOMS.length - occupied, expectedMonthly = occupied * CFG.RENT;
  document.getElementById('stat-occupied').textContent = occupied;
  document.getElementById('stat-vacant').textContent = `${vacant} ห้องว่าง`;
  document.getElementById('stat-paid').textContent = paid;
  document.getElementById('stat-overdue').textContent = overdue;
  
  // ยอดรายรับอัปเดตให้ดึงจาก totalIncome ที่บวกครบทุกบิลแล้ว
  document.getElementById('stat-income').textContent = fmtInt(totalIncome);
  document.getElementById('stat-expected').textContent = fmtInt(expectedMonthly);

  const badge = document.getElementById('overdue-badge');
  if (badge) { badge.textContent = overdue; badge.style.display = overdue ? '' : 'none'; }
}

function renderRoomGrid() {
  const container = document.getElementById('dashboard-room-grids-container'); if (!container) return;
  container.innerHTML = '';

  CFG.ROOM_STRUCTURE.forEach(floorData => {
    const label = document.createElement('div'); label.className = 'floor-label'; label.textContent = floorData.floor; container.appendChild(label);
    const grid = document.createElement('div'); grid.className = 'room-grid';
    
    floorData.rooms.forEach(r => {
      const status = getRoomStatus(r), cell = document.createElement('div');
      cell.className = `room-cell ${status}${STATE.selectedRoom === r ? ' selected' : ''}`;
      cell.innerHTML = `<span class="room-num">${r}</span><span class="badge badge-${statusBadge(status)}" style="font-size:9px;padding:2px 5px;">${getRoomStatusLabel(status)}</span>`;
      cell.addEventListener('click', () => selectRoom(r)); grid.appendChild(cell);
    });
    container.appendChild(grid);
  });
}

function statusBadge(s) { return { occupied: 'sky', vacant: 'success', overdue: 'danger', warning: 'amber' }[s] || 'gray'; }
function selectRoom(roomId) { STATE.selectedRoom = roomId; renderRoomGrid(); showRoomPanel(roomId); }

function showRoomPanel(roomId) {
  const mk = monthKey(), tenant = STATE.tenants[roomId] || {}, status = getRoomStatus(roomId);
  
  // 💡 แก้ไข: ถ้ามีทั้งบิลแรกเข้าและบิลปกติ ให้แสดงบิลปกติ แต่ถ้ามีแค่แรกเข้าก็โชว์แรกเข้า
  const normalBill = STATE.bills[`${roomId}-${mk}`];
  const initBill = STATE.bills[`${roomId}-${mk}-IN`];
  const bill = normalBill || initBill; 

  const panel = document.getElementById('room-panel');
  panel.innerHTML = `
    <div class="card-header" style="padding:16px 20px;">
      <div><span class="card-title">ห้อง ${roomId}</span><span class="badge badge-${statusBadge(status)}" style="margin-left:8px">${getRoomStatusLabel(status)}</span></div>
      <button class="modal-close" onclick="document.getElementById('room-panel').innerHTML=''">✕</button>
    </div>
    <div class="card-body">
      ${tenant.active ? `
        <div style="margin-bottom:12px; display:flex; gap:12px;">
          <div style="width:40px;height:40px;background:var(--gray-200);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>
          <div><div style="font-weight:700;">${tenant.name}</div><div style="font-size:12px;color:var(--gray-400)">เข้าอยู่: ${tenant.moveIn}</div></div>
        </div>
        ${bill ? renderBillSummary(bill) : `<div class="alert alert-info">ยังไม่ได้บันทึกบิลเดือนนี้</div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="navigate('form');preselectRoom('${roomId}')">📝 บันทึกมิเตอร์</button>
          ${bill && !bill.paid ? `<button class="btn btn-success btn-sm" onclick="markPaid('${roomId}')">💵 รับเงินชำระบิล</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="confirmVacate('${roomId}')">🚪 ย้ายออก</button>
        </div>` : `
        <div class="alert alert-success">ห้องว่าง</div><button class="btn btn-primary btn-sm" onclick="openAddTenantModal('${roomId}')">➕ เพิ่มผู้เช่า</button>
      `}
    </div>`;
}

function renderBillSummary(bill) {
  // 💡 ปรับให้หน้าต่างห้องแสดงข้อมูลบิลแรกเข้าได้ถูกต้อง
  if (bill.isNew) {
     return `<table class="bill-table" style="margin-bottom:8px">
      <tr><td>ค่าเช่าล่วงหน้า</td><td class="text-right">${fmt(bill.advanceAmt || CFG.RENT)}</td></tr>
      <tr><td>เงินประกัน</td><td class="text-right">${fmt(bill.depositAmt || (bill.total - (bill.advanceAmt || CFG.RENT)))}</td></tr>
      <tr class="total-row"><td><b>รวมยอดแรกเข้า</b></td><td class="text-right"><b>${fmt(bill.total)}</b></td></tr>
    </table><div style="font-size:12px;">${bill.paid ? `<span style="color:var(--green)">✅ ชำระแล้ว ${bill.paidDate}</span>` : `<span style="color:var(--red)">⏳ ค้างชำระ</span>`}</div>`;
  } else {
     return `<table class="bill-table" style="margin-bottom:8px">
      <tr><td>ค่าเช่า</td><td class="text-right">${fmt(CFG.RENT)}</td></tr>
      <tr><td>ค่าไฟ (${bill.elecUnits}u)</td><td class="text-right">${fmt(bill.elecAmt)}</td></tr>
      <tr><td>ค่าน้ำ (${bill.waterUnits}u)</td><td class="text-right">${fmt(bill.waterAmt)}</td></tr>
      <tr class="total-row"><td><b>รวม</b></td><td class="text-right"><b>${fmt(bill.total)}</b></td></tr>
    </table><div style="font-size:12px;">${bill.paid ? `<span style="color:var(--green)">✅ ชำระแล้ว ${bill.paidDate}</span>` : `<span style="color:var(--red)">⏳ ค้างชำระ</span>`}</div>`;
  }
}

function renderOverdueList() {
  const mk = monthKey(), list = [];
  CFG.ROOMS.forEach(r => {
    if (getRoomStatus(r) === 'overdue' || getRoomStatus(r) === 'warning') {
      const unpaidBill = Object.values(STATE.bills).find(b => b.roomId === r && b.month.startsWith(mk) && !b.paid);
      const tenant = STATE.tenants[r];
      if (tenant?.active && unpaidBill) list.push({ roomId: r, tenant, bill: unpaidBill });
    }
  });
  const el = document.getElementById('overdue-list');
  if (!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:16px;">✅ ไม่มีห้องค้างชำระ</div>'; return; }
  el.innerHTML = list.map(({roomId, tenant, bill}) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-100)">
      <div class="room-cell overdue" style="width:52px;min-height:44px;"><span class="room-num">${roomId}</span></div>
      <div style="flex:1;"><b>${tenant.name}</b><div style="font-size:12px;color:var(--gray-400)">ยอดรวม: ${fmt(bill.total)} บาท</div></div>
      <button class="btn btn-success btn-sm" onclick="markPaid('${roomId}')">💵 รับเงิน</button>
    </div>`).join('');
}

function markPaid(roomId) {
  const mk = monthKey();
  const unpaidBill = Object.values(STATE.bills).find(b => b.roomId === roomId && b.month.startsWith(mk) && !b.paid);
  if (!unpaidBill) return;
  openPaymentModal('monthly', roomId, unpaidBill.total, `ห้อง ${roomId} รอบเดือน ${thaiMonth(unpaidBill.month)}`);
}

async function confirmVacate(roomId) {
  if (!confirm(`ยืนยันย้ายออกห้อง ${roomId}?`)) return;
  const t = STATE.allTenants.find(x => x.roomId === roomId && x.active);
  if(t) { t.active = false; t.moveOut = isoDate(); await saveState(); toast(`ห้อง ${roomId} ย้ายออกแล้ว`, 'success'); renderDashboard(); document.getElementById('room-panel').innerHTML=''; }
}

function preselectRoom(roomId) {
  setTimeout(() => { const sel = document.getElementById('room-select'); if (sel) { sel.value = roomId; sel.dispatchEvent(new Event('change')); } }, 100);
}

function openAddTenantModal(roomId) {
  document.getElementById('modal-add-room').textContent = roomId; document.getElementById('add-tenant-room').value = roomId;
  document.getElementById('add-tenant-name').value = ''; document.getElementById('add-tenant-phone').value = '';
  document.getElementById('add-tenant-id').value = ''; document.getElementById('add-tenant-movein').value = isoDate();
  document.getElementById('add-tenant-id-img').value = ''; document.getElementById('add-tenant-photo-img').value = ''; openModal('modal-add-tenant');
}