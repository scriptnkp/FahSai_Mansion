// ── Dashboard Module ──

function renderDashboard() {
  renderStats();
  renderRoomGrid();
  renderOverdueList();
}

// ── Stats ──
function renderStats() {
  const mk = monthKey();
  let occupied = 0, paid = 0, overdue = 0, totalIncome = 0;

  CFG.ROOMS.forEach(r => {
    const t = STATE.tenants[r];
    if (!t || !t.active) return;
    occupied++;
    const bill = STATE.bills[`${r}-${mk}`];
    if (!bill) return;
    if (bill.paid) { paid++; totalIncome += bill.total; }
    else {
      const d = dayOfMonth();
      if (d > CFG.DUE_DAY) overdue++;
    }
  });

  // ใช้จำนวนห้องทั้งหมดแบบ Dynamic แทนการล็อกค่าตายตัว
  const vacant = CFG.ROOMS.length - occupied; 
  const expectedMonthly = occupied * CFG.RENT;

  document.getElementById('stat-occupied').textContent = occupied;
  document.getElementById('stat-vacant').textContent = `${vacant} ห้องว่าง`;
  document.getElementById('stat-paid').textContent = paid;
  document.getElementById('stat-overdue').textContent = overdue;
  document.getElementById('stat-income').textContent = fmtInt(totalIncome);
  document.getElementById('stat-expected').textContent = fmtInt(expectedMonthly);

  // Update nav badge
  const badge = document.getElementById('overdue-badge');
  if (badge) { badge.textContent = overdue; badge.style.display = overdue ? '' : 'none'; }
}

// ── Room Grid (Dynamic Structure) ──
function renderRoomGrid() {
  const container = document.getElementById('dashboard-room-grids-container');
  if (!container) return;
  container.innerHTML = ''; // ล้างค่าเดิม

  // วนลูปวาดตารางห้องตามโครงสร้าง (ROOM_STRUCTURE) ที่ตั้งค่าไว้
  CFG.ROOM_STRUCTURE.forEach(floorData => {
    // 1. เพิ่มชื่อชั้น
    const label = document.createElement('div');
    label.className = 'floor-label';
    label.textContent = floorData.floor;
    container.appendChild(label);

    // 2. สร้างกริดสำหรับห้องในชั้นนั้น
    const grid = document.createElement('div');
    grid.className = 'room-grid';
    
    // 3. วนลูปห้อง
    floorData.rooms.forEach(r => {
      const status = getRoomStatus(r);
      const cell = document.createElement('div');
      cell.className = `room-cell ${status}${STATE.selectedRoom === r ? ' selected' : ''}`;
      cell.dataset.room = r;
      cell.innerHTML = `<span class="room-num">${r}</span><span class="badge badge-${statusBadge(status)}" style="font-size:9px;padding:2px 5px;min-height:unset;">${getRoomStatusLabel(status)}</span>`;
      cell.addEventListener('click', () => selectRoom(r));
      grid.appendChild(cell);
    });

    container.appendChild(grid);
  });
}

function statusBadge(s) {
  return { occupied: 'sky', vacant: 'success', overdue: 'danger', warning: 'amber' }[s] || 'gray';
}

// ── Select Room ──
function selectRoom(roomId) {
  STATE.selectedRoom = roomId;
  renderRoomGrid();
  showRoomPanel(roomId);
}

function showRoomPanel(roomId) {
  const mk = monthKey();
  const tenant = STATE.tenants[roomId] || {};
  const bill = STATE.bills[`${roomId}-${mk}`];
  const status = getRoomStatus(roomId);

  const panel = document.getElementById('room-panel');
  panel.innerHTML = `
    <div class="card-header" style="padding:16px 20px;">
      <div>
        <span class="card-title">ห้อง ${roomId}</span>
        <span class="badge badge-${statusBadge(status)}" style="margin-left:8px">${getRoomStatusLabel(status)}</span>
      </div>
      <button class="modal-close" onclick="document.getElementById('room-panel').innerHTML=''">✕</button>
    </div>
    <div class="card-body">
      ${tenant.active ? `
        <div style="margin-bottom:12px; display: flex; gap: 12px; align-items: flex-start;">
          ${tenant.idCardImage ? `<a href="${tenant.idCardImage}" target="_blank" title="ดูรูปบัตรประชาชน"><div style="width:40px;height:40px;background:var(--gray-200) url('${tenant.idCardImage}') center/cover;border-radius:8px;"></div></a>` : `<div style="width:40px;height:40px;background:var(--gray-200);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>`}
          <div>
            <div style="font-weight:700;font-size:15px">${tenant.name || '-'}</div>
            <div style="font-size:13px;color:var(--gray-400)">${tenant.phone || ''}</div>
            <div style="font-size:12px;color:var(--gray-400)">เข้าอยู่: ${tenant.moveIn || '-'}</div>
          </div>
        </div>
        ${bill ? renderBillSummary(bill) : `<div class="alert alert-info">ยังไม่ได้บันทึกบิลเดือนนี้</div>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="navigate('form');preselectRoom('${roomId}')">📝 บันทึกมิเตอร์</button>
          ${bill && !bill.paid ? `<button class="btn btn-success btn-sm" onclick="markPaid('${roomId}')">✅ รับชำระแล้ว</button>` : ''}
          ${bill && !bill.paid ? `<button class="btn btn-outline btn-sm" onclick="sendOverdueNotice('${roomId}')">📤 แจ้งเตือน TG</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="confirmVacate('${roomId}')">🚪 ย้ายออก</button>
        </div>
      ` : `
        <div class="alert alert-success">ห้องว่าง</div>
        <button class="btn btn-primary btn-sm" onclick="openAddTenantModal('${roomId}')">➕ เพิ่มผู้เช่า</button>
      `}
    </div>
  `;
}

function renderBillSummary(bill) {
  const items = [
    ['ค่าเช่า', '1 เดือน', fmt(CFG.RENT)],
    ['ค่าไฟฟ้า', `${bill.elecUnits} หน่วย`, fmt(bill.elecAmt)],
    ['ค่าน้ำประปา', `${bill.waterUnits} หน่วย`, fmt(bill.waterAmt)],
  ];
  if (bill.lateAmt > 0) items.push(['ค่าปรับล่าช้า', `${bill.lateDays || 0} วัน`, fmt(bill.lateAmt)]);

  return `
    <table class="bill-table" style="margin-bottom:8px">
      <tr><th>รายการ</th><th>จำนวน</th><th class="text-right">บาท</th></tr>
      ${items.map(([l,q,a])=>`<tr><td>${l}</td><td style="color:var(--gray-400)">${q}</td><td class="text-right">${a}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2"><strong>รวม</strong></td><td class="text-right"><strong>${fmt(bill.total)}</strong></td></tr>
    </table>
    <div style="font-size:12px;color:var(--gray-400)">กำหนดชำระ: วันที่ ${CFG.DUE_DAY} ของเดือน · ${bill.paid ? `<span style="color:var(--green)">✅ ชำระแล้ว ${bill.paidDate||''}</span>` : `<span style="color:var(--red)">⏳ ยังไม่ชำระ</span>`}</div>
  `;
}

// ── Overdue List ──
function renderOverdueList() {
  const mk = monthKey();
  const list = [];
  CFG.ROOMS.forEach(r => {
    const s = getRoomStatus(r);
    if (s === 'overdue' || s === 'warning') {
      const bill = STATE.bills[`${r}-${mk}`];
      const tenant = STATE.tenants[r];
      if (!tenant?.active) return;
      if (bill && bill.paid) return;
      list.push({ roomId: r, tenant, bill, status: s });
    }
  });
  const el = document.getElementById('overdue-list');
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--gray-400);padding:16px;font-size:14px">✅ ไม่มีห้องค้างชำระ</div>';
    return;
  }
  el.innerHTML = list.map(({roomId, tenant, bill, status}) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-100)">
      <div class="room-cell ${status}" style="min-height:44px;width:52px;flex-shrink:0;border-radius:8px">
        <span class="room-num">${roomId}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px">${tenant?.name||'-'}</div>
        <div style="font-size:12px;color:var(--gray-400)">${bill ? (tenant?.phone||'') : '⚠️ ยังไม่บันทึกบิลเดือนนี้'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;font-size:15px;color:var(--red)">${bill ? fmt(bill.total) : '-'}</div>
        <div style="font-size:11px;color:var(--gray-400)">${bill ? 'บาท' : ''}</div>
      </div>
      ${bill
        ? `<button class="btn btn-outline btn-sm" onclick="sendOverdueNotice('${roomId}')">📤</button>`
        : `<button class="btn btn-primary btn-sm" onclick="navigate('form');preselectRoom('${roomId}')">📝</button>`}
    </div>
  `).join('');
}

// ── Actions (Async) ──
async function markPaid(roomId) {
  const mk = monthKey();
  const key = `${roomId}-${mk}`;
  if (!STATE.bills[key]) return;
  
  // อัปเดต State ภายใน
  STATE.bills[key].paid = true;
  STATE.bills[key].paidDate = isoDate();
  
  // ให้ UI อัปเดตก่อน
  renderDashboard();
  if(STATE.currentPage === 'dashboard') showRoomPanel(roomId);
  
  // บันทึกลง Supabase
  await saveState();
  toast(`ห้อง ${roomId} บันทึกรับเงินแล้ว`, 'success');
}

async function sendOverdueNotice(roomId) {
  const mk = monthKey();
  const bill = STATE.bills[`${roomId}-${mk}`];
  const tenant = STATE.tenants[roomId];
  if (!bill || !tenant) { toast('ไม่พบข้อมูลบิล', 'error'); return; }
  
  const d = dayOfMonth();
  const lateDays = Math.max(0, d - CFG.DUE_DAY);
  const lateAmt = lateDays * CFG.LATE_PER_DAY;
  
  const msg = `🏠 <b>${CFG.MANSION_NAME}</b>\n📋 แจ้งยอดค้างชำระ\n\n` +
    `ห้อง: <b>${roomId}</b>\n` +
    `ชื่อ: ${tenant.name}\n` +
    `ประจำเดือน: ${thaiMonth(mk)}\n\n` +
    `💰 ยอดที่ต้องชำระ: <b>${fmt(bill.total)} บาท</b>\n` +
    (lateDays > 0 ? `⚠️ ค่าปรับล่าช้า ${lateDays} วัน: ${fmt(lateAmt)} บาท\n` : '') +
    `\n📞 ติดต่อสำนักงาน: ${CFG.PHONE}`;
    
  await sendTelegram(msg);
}

async function sendAllOverdueTelegram() {
  const mk = monthKey();
  const overdue = [];
  CFG.ROOMS.forEach(r => {
    const bill = STATE.bills[`${r}-${mk}`];
    const tenant = STATE.tenants[r];
    if (bill && !bill.paid && tenant?.active) overdue.push({ r, bill, tenant });
  });
  
  if (!overdue.length) { toast('ไม่มีห้องค้างชำระ', 'success'); return; }
  
  const lines = overdue.map(({r, bill, tenant}) => `  • ห้อง ${r} (${tenant.name}): ${fmt(bill.total)} บาท`).join('\n');
  const msg = `⚠️ <b>${CFG.MANSION_NAME}</b> — รายการค้างชำระ\nเดือน ${thaiMonth(mk)}\n\n${lines}\n\n` +
    `📞 กรุณาติดต่อ: ${CFG.PHONE}`;
    
  await sendTelegram(msg);
}

async function confirmVacate(roomId) {
  if (!confirm(`ยืนยันการย้ายออกห้อง ${roomId}?`)) return;
  if (STATE.tenants[roomId]) {
    STATE.tenants[roomId].active = false;
    STATE.tenants[roomId].moveOut = isoDate();
  }
  
  renderDashboard();
  document.getElementById('room-panel').innerHTML = '';
  
  await saveState(); // บันทึกลง Supabase
  toast(`ห้อง ${roomId} ย้ายออกแล้ว`, 'success');
}

function preselectRoom(roomId) {
  setTimeout(() => {
    const sel = document.getElementById('room-select');
    if (sel) { sel.value = roomId; sel.dispatchEvent(new Event('change')); }
  }, 100);
}

// ── Add Tenant Modal ──
function openAddTenantModal(roomId) {
  document.getElementById('modal-add-room').textContent = roomId;
  document.getElementById('add-tenant-room').value = roomId;
  document.getElementById('add-tenant-name').value = '';
  document.getElementById('add-tenant-phone').value = '';
  document.getElementById('add-tenant-id').value = '';
  document.getElementById('add-tenant-movein').value = isoDate();
  document.getElementById('add-tenant-id-img').value = '';
  openModal('modal-add-tenant');
}