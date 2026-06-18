// ── Config ──
const defaultRoomsText = "ชั้น 1: 101, 102, 103, 104, 105, 106, 107, 108, 109, 110\nชั้น 2: 201, 202, 203, 204, 205, 206, 207, 208, 209, 210";
const savedRoomsText = localStorage.getItem('cfg_rooms_text') || defaultRoomsText;

function parseRoomsText(text) {
  const structure = [];
  const allRooms = [];
  text.split('\n').forEach(line => {
     if(!line.trim()) return;
     const parts = line.split(':');
     const floorName = parts[0].trim();
     const roomsStr = parts.length > 1 ? parts[1] : parts[0];
     const rooms = roomsStr.split(',').map(r => r.trim()).filter(r => r);
     structure.push({ floor: floorName, rooms });
     allRooms.push(...rooms);
  });
  return { structure, allRooms };
}

const roomData = parseRoomsText(savedRoomsText);

const CFG = {
  SUPABASE_URL: 'https://iifmnisoxfbjyhcgabsg.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZm1uaXNveGZianloY2dhYnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Nzg0NDYsImV4cCI6MjA5NzI1NDQ0Nn0.C58rM5eeIquTrJ4amI1x0_Bp3Ln0zzKjvZZh98qSGb4',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzWEQ8j9QCfmKV8SkrIVRFZ7lIwACCCoa0zLPeZqXOr6yuQKa5dUKM1W9841DB9XbzrGw/exec',
  ROOM_STRUCTURE: roomData.structure,
  ROOMS: roomData.allRooms,
  ROOMS_TEXT: savedRoomsText,
  RENT: parseFloat(localStorage.getItem('cfg_rent')) || 3500,
  DEPOSIT: 5000,
  WATER_RATE: parseFloat(localStorage.getItem('cfg_water')) || 18,
  WATER_MIN: parseFloat(localStorage.getItem('cfg_water_min')) || 100,
  ELEC_RATE: parseFloat(localStorage.getItem('cfg_elec')) || 8,
  LATE_PER_DAY: parseFloat(localStorage.getItem('cfg_late')) || 100,
  DUE_DAY: parseInt(localStorage.getItem('cfg_due_day')) || 5,
  CUT_DAY: parseInt(localStorage.getItem('cfg_cut_day')) || 10,
  MANSION_NAME: 'ฟ้าใสแมนชั่น',
  ADDRESS: '1059 ซ.ประชาสามัคคี 7 ถ.ประชาสามัคคี ต.สว่างแดนดิน อ.สว่างแดนดิน จ.สกลนคร 47120',
  PHONE: '099-040-8668',
};

const supabaseClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

// ── Helper: แปลงลิงก์ Google Drive เป็นลิงก์รูปตรง ──
function getDirectDriveUrl(url) {
  if (!url || url === 'null') return null;
  if (url.includes('drive.google.com/file/d/')) {
    const id = url.split('/file/d/')[1].split('/')[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return url;
}

// ── State ──
const STATE = {
  currentPage: 'dashboard',
  selectedRoom: null,
  bills: {},     
  allTenants: [], 
  tenants: {}     
};

// ── Load Data ──
async function loadSupabaseData() {
  try {
    const { data: tenantsData, error: errT } = await supabaseClient.from('tenants').select('*');
    if(errT) throw errT;
    if(tenantsData) {
      STATE.allTenants = tenantsData.map(t => ({
          id: t.id, roomId: t.room_id, prefix: t.prefix || 'นาย', name: t.name, phone: t.phone, 
          idNum: t.id_card, moveIn: t.move_in_date, moveOut: t.move_out_date, active: t.active, 
          idCardImage: getDirectDriveUrl(t.id_card_image_url), 
          tenantImage: getDirectDriveUrl(t.tenant_photo_url)
      }));
      STATE.tenants = {};
      STATE.allTenants.forEach(t => {
        if(t.active) STATE.tenants[t.roomId] = t;
      });
      if(typeof renderTenantHistory === 'function') renderTenantHistory(); 
    }

    const { data: billsData, error: errB } = await supabaseClient.from('bills').select('*');
    if(errB) throw errB;
    if(billsData) {
      STATE.bills = {};
      billsData.forEach(b => {
        STATE.bills[`${b.room_id}-${b.month_key}`] = {
          roomId: b.room_id, month: b.month_key, elecUnits: b.elec_units, waterUnits: b.water_units,
          elecAmt: b.elec_amt, waterAmt: b.water_amt, lateAmt: b.late_amt, total: b.total_amount,
          paid: b.is_paid, paidDate: b.paid_date
        };
      });
    }
  } catch (e) {
    console.error("Supabase Load Error:", e);
    toast('ดึงข้อมูลจากฐานข้อมูลไม่สำเร็จ', 'error');
  }
}

// ── Persistence & Supabase Sync ──
async function saveState() {
  localStorage.setItem('bills', JSON.stringify(STATE.bills));
  try {
    const tenantsPayload = STATE.allTenants.map(t => ({
      id: t.id, room_id: t.roomId, prefix: t.prefix, name: t.name, phone: t.phone, id_card: t.idNum,
      move_in_date: t.moveIn, move_out_date: t.moveOut, active: t.active, 
      id_card_image_url: t.idCardImage, tenant_photo_url: t.tenantImage
    }));
    if(tenantsPayload.length > 0) {
      await supabaseClient.from('tenants').upsert(tenantsPayload, { onConflict: 'id' });
    }

    const billsPayload = Object.entries(STATE.bills).map(([key, b]) => {
      const [roomId, y, m] = key.split('-');
      return {
        room_id: roomId, month_key: `${y}-${m}`, elec_units: b.elecUnits || 0, elec_amt: b.elecAmt || 0,
        water_units: b.waterUnits || 0, water_amt: b.waterAmt || 0, late_amt: b.lateAmt || 0, 
        total_amount: b.total || 0, is_paid: b.paid || false, paid_date: b.paidDate || null
      };
    });
    if(billsPayload.length > 0) {
      await supabaseClient.from('bills').upsert(billsPayload, { onConflict: 'room_id,month_key' });
    }
  } catch (e) { console.error("Supabase Sync Failed:", e); }
}

// ── Google Apps Script API (Upload & Telegram) ──
function compressImage(file, maxWidth = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; }
        } else {
          if (height > maxWidth) { width = Math.round((width *= maxWidth / height)); height = maxWidth; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

async function uploadImageToGAS(fileInputId) {
  const file = document.getElementById(fileInputId).files[0];
  if(!file) return null;
  try {
    const compressedBase64 = await compressImage(file);
    const res = await fetch(CFG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveIdCard', roomId: 'TEMP', imageBase64: compressedBase64 })
    });
    const data = await res.json();
    return data.ok ? getDirectDriveUrl(data.fileUrl) : null;
  } catch(e) { return null; }
}

async function sendTelegram(msg) {
  const token = localStorage.getItem('tg_token');
  const chatId = localStorage.getItem('tg_chat');
  if (!token || !chatId) { toast('กรุณาตั้งค่า Telegram ก่อน', 'warning'); return false; }
  try {
    const res = await fetch(CFG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'notifyTelegram', tgToken: token, tgChatId: chatId, message: msg })
    });
    const data = await res.json();
    if (data.ok) { toast('ส่ง Telegram สำเร็จ ✓', 'success'); return true; }
    else { toast('Telegram Error', 'error'); return false; }
  } catch(e) { toast('ไม่สามารถส่ง Telegram ได้', 'error'); return false; }
}

// ── Add Tenant & Generate Contract Function ──
async function submitAddTenantAndContract() {
  const roomId = document.getElementById('add-tenant-room').value;
  const prefix = document.getElementById('add-tenant-prefix').value;
  const name   = document.getElementById('add-tenant-name').value.trim();
  const phone  = document.getElementById('add-tenant-phone').value.trim();
  const idNum  = document.getElementById('add-tenant-id').value.trim();
  const moveIn = document.getElementById('add-tenant-movein').value;
  const place  = document.getElementById('add-tenant-place').value;

  if (!name) { toast('กรุณากรอกชื่อ', 'error'); return; }

  const btn = document.querySelector('button[onclick="submitAddTenantAndContract()"]');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังบันทึกและอัปโหลดรูป...';

  let idCardUrl = await uploadImageToGAS('add-tenant-id-img');
  let tenantUrl = await uploadImageToGAS('add-tenant-photo-img');

  const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15); 
  const newTenant = { 
    id: newId, roomId, prefix, name, phone, idNum, moveIn, 
    active: true, idCardImage: idCardUrl, tenantImage: tenantUrl 
  };
  
  STATE.allTenants.push(newTenant);
  STATE.tenants[roomId] = newTenant;
  await saveState(); 

  closeModal('modal-add-tenant');
  toast(`บันทึกสำเร็จ กำลังสร้างแบบฟอร์มสัญญา`, 'success');
  
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof selectRoom === 'function') selectRoom(roomId);
  if (typeof renderTenantHistory === 'function') renderTenantHistory();

  btn.disabled = false;
  btn.textContent = origText;

  renderContractHTML(newTenant, place);
}

// ── Contract HTML Generation ──
function renderContractHTML(t, place) {
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png'; 
  const advAmount = CFG.RENT;
  const totalFirst = CFG.DEPOSIT + advAmount;
  
  const b = n => Number(n).toLocaleString('th-TH');
  const td = iso => {
    if (!iso) return '...... เดือน ................................ พ.ศ. ..............';
    const d = new Date(iso);
    const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${d.getDate()} เดือน ${m[d.getMonth()]} พ.ศ. ${d.getFullYear()+543}`;
  };

  const html = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:20px;">
      <img src="${LOGO_URL}" alt="Logo" style="width:120px; height:auto; object-fit:contain;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">ฟ้าใสแมนชั่น (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <h2 style="text-align:center; color:#1e3a8a; margin-bottom:20px; font-size:18px;">สัญญาเช่าห้องพักรายเดือน</h2>
    
    <div style="display:flex; justify-content:space-between; margin-bottom:16px; font-weight:bold; font-size:14px;">
      <div>ทำที่: <span class="fill" style="font-weight:normal">${place || 'ฟ้าใสแมนชั่น'}</span></div>
      <div>วันที่: <span class="fill" style="font-weight:normal">${td(t.moveIn)}</span></div>
    </div>

    <p style="text-indent: 40px; margin-bottom:16px; font-size:14px; line-height: 1.8;">
      สัญญาฉบับนี้ทำขึ้นระหว่าง <strong>ฟ้าใสแมนชั่น</strong> โดย ............................................................................................ ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้ให้เช่า"</strong> ฝ่ายหนึ่ง กับ <strong>${t.prefix || ''}</strong> <span class="fill">${t.name}</span> บัตรประจำตัวประชาชนเลขที่ <span class="fill">${t.idNum || '.........................'}</span> เบอร์โทรศัพท์ <span class="fill">${t.phone || '.........................'}</span> ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้เช่า"</strong> อีกฝ่ายหนึ่ง ทั้งสองฝ่ายได้ตกลงทำสัญญาเช่ากันโดยมีข้อความและเงื่อนไขดังต่อไปนี้:
    </p>

    <div style="margin-bottom: 12px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 1. วัตถุประสงค์และทรัพย์สินที่เช่า</div>
      <p style="text-indent: 20px; margin:0; line-height:1.6;">ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพักของฟ้าใสแมนชั่น <strong>ห้องหมายเลข <span class="fill">${t.roomId}</span> ชั้นที่ <span class="fill">${t.roomId.charAt(0)}</span></strong> เพื่อใช้เป็นที่อยู่อาศัยส่วนตัวเท่านั้น ห้ามมิให้นำไปใช้เพื่อการพาณิชย์ หรือประกอบกิจการใดๆ ที่ผิดกฎหมาย หรือขัดต่อศีลธรรมอันดีงาม</p>
    </div>

    <div style="margin-bottom: 12px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 2. อัตราค่าเช่า เงินประกัน และการเข้าอยู่ครั้งแรก</div>
      <ul style="list-style-type: disc; margin: 0 0 0 24px; padding: 0; line-height:1.6;">
        <li><strong>ค่าเช่าห้องพัก:</strong> คิดในอัตราเดือนละ <strong>${b(CFG.RENT)} บาท</strong></li>
        <li><strong>เงินประกันความเสียหายแรกเข้า:</strong> จำนวน <strong>${b(CFG.DEPOSIT)} บาท</strong></li>
        <li><strong>ค่าเช่าล่วงหน้า:</strong> จำนวน 1 เดือน เป็นเงิน <strong>${b(advAmount)} บาท</strong></li>
        <li><strong>รวมยอดชำระแรกเข้าทั้งสิ้น:</strong> จำนวน <strong>${b(totalFirst)} บาท</strong> ซึ่งผู้เช่าได้ชำระให้แก่ผู้ให้เช่าครบถ้วนแล้วในวันทำสัญญานี้</li>
      </ul>
    </div>

    <div style="margin-bottom: 12px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 3. การคิดค่าน้ำประปาและค่าไฟฟ้า (สาธารณูปโภค)</div>
      <ul style="list-style-type: disc; margin: 0 0 0 24px; padding: 0; line-height:1.6;">
        <li><strong>ค่าน้ำประปา:</strong> คิดในอัตราหน่วยละ <strong>${CFG.WATER_RATE} บาท</strong> โดยมีอัตราขั้นต่ำที่ <strong>${CFG.WATER_MIN} บาทต่อเดือน</strong></li>
        <li><strong>ค่าไฟฟ้า:</strong> คิดในอัตราหน่วยละ <strong>${CFG.ELEC_RATE} บาท</strong> ตามจำนวนหน่วยที่ใช้จริง ไม่มีขั้นต่ำ</li>
      </ul>
    </div>

    <div style="margin-bottom: 12px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 4. กำหนดการชำระเงินและระบบค่าปรับชำระล่าช้า</div>
      <p style="text-indent: 20px; margin: 0 0 8px 0; line-height:1.6;">ผู้เช่าต้องชำระค่าเช่าห้องพักรวมถึงค่าน้ำ-ค่าไฟ <strong>ภายในวันที่ ${CFG.DUE_DAY} ของทุกเดือน</strong> หากเกินกำหนดเวลาดังกล่าว ให้ถือว่าผู้เช่าผิดนัดชำระและยินยอมปฏิบัติตามมาตรการดังต่อไปนี้:</p>
      <ul style="list-style-type: disc; margin: 0 0 0 24px; padding: 0; line-height:1.6;">
        <li><strong>การคิดค่าปรับ:</strong> หากชำระล่าช้าตั้งแต่วันที่ 6 เป็นต้นไป ผู้เช่าตกลงยินยอมเสียค่าปรับให้แก่ผู้ให้เช่าในอัตรา <strong>วันละ ${CFG.LATE_PER_DAY} บาท</strong> นับตั้งแต่วันที่ผิดนัดจนกว่าจะชำระเสร็จสิ้น</li>
        <li><strong>มาตรการขั้นเด็ดขาด:</strong> หากผู้เช่าค้างชำระค่าเช่าหรือค่าปรับรวมกันเกินวันที่ <strong>${CFG.CUT_DAY} ของเดือน</strong> ผู้ให้เช่ามีสิทธิ์เด็ดขาดในการระงับการจ่ายน้ำประปาและไฟฟ้าภายในห้องพักดังกล่าวทันที รวมถึงมีสิทธิ์บอกเลิกสัญญาเช่าและเชิญผู้เช่าให้ออกจากห้องพักได้โดยมิต้องแจ้งล่วงหน้า</li>
      </ul>
    </div>

    <div style="margin-bottom: 12px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 5. เงินประกันและความรับผิดชอบในความเสียหาย</div>
      <p style="text-indent: 20px; margin:0; line-height:1.6;">เงินประกันจำนวน ${b(CFG.DEPOSIT)} บาทนั้น ผู้ให้เช่าจะถือไว้เพื่อเป็นหลักประกันความเสียหายของห้องพักและอุปกรณ์ต่าง ๆ เมื่อผู้เช่าอยู่ครบตามกำหนดเวลาและประสงค์ย้ายออก ผู้ให้เช่าจะคืนเงินประกันนี้ให้โดยไม่มีดอกเบี้ย ภายในหลังจากหักลบค่าเสียหาย ค่าทำความสะอาด หรือค่าใช้จ่ายที่ผู้เช่าค้างชำระแล้ว (หากมี)</p>
    </div>

    <div style="margin-bottom: 24px; font-size:14px;">
      <div style="color:#0284c7; font-weight:bold; border-left:4px solid #f97316; padding-left:8px; margin-bottom:8px;">ข้อ 6. การสิ้นสุดสัญญาเช่าและการย้ายออก</div>
      <p style="text-indent: 20px; margin:0; line-height:1.6;">หากผู้เช่าประสงค์จะย้ายออกจากห้องพัก จะต้องแจ้งให้ผู้ให้เช่าทราบล่วงหน้าเป็นลายลักษณ์อักษรอย่างน้อย 30 วัน หากย้ายออกก่อนกำหนดโดยไม่แจ้งล่วงหน้า หรือทำผิดข้อสัญญาใดๆ ผู้ให้เช่ามีสิทธิ์ริบเงินประกันความเสียหายทั้งหมดทันที</p>
    </div>

    <p style="text-align:center; font-weight:bold; margin-bottom:40px; font-size:14px;">สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับมีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยละเอียดตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน</p>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align:center; margin-bottom: 40px; font-size:14px;">
      <div>
        <div>( ............................................................ )</div>
        <div style="margin-top:8px; font-weight:bold;">ผู้เช่า</div>
        <div style="margin-top:32px;">( ............................................................ )</div>
        <div style="margin-top:8px; color:#64748b;">พยาน</div>
      </div>
      <div>
        <div>( ............................................................ )</div>
        <div style="margin-top:8px; font-weight:bold;">ผู้ให้เช่า (ฟ้าใสแมนชั่น)</div>
        <div style="margin-top:32px;">( ............................................................ )</div>
        <div style="margin-top:8px; color:#64748b;">พยาน</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; page-break-inside: avoid;">
      <div style="border: 2px dashed #94a3b8; border-radius:4px; padding: 40px 20px; text-align:center; background-color:#f8fafc; min-height: 180px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        ${t.idCardImage 
          ? `<img src="${t.idCardImage}" style="max-height:150px; object-fit:contain; border-radius:4px; margin-bottom:10px;">` 
          : `<strong style="color:#1e3a8a; font-size:14px;">พื้นที่สำหรับวางบัตรประชาชน<br>(ขนาดเท่าบัตรจริง)</strong>
             <div style="font-size:10px; color:#64748b; margin-top:12px;">(กรุณาวางบัตรประชาชนตัวจริงลงในกรอบนี้ก่อนนำไปถ่ายเอกสาร หรือแนบสำเนาที่เซ็นถูกต้อง)</div>`
        }
      </div>
      <div style="border: 2px dashed #94a3b8; border-radius:4px; padding: 40px 20px; text-align:center; background-color:#f8fafc; min-height: 180px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        ${t.tenantImage 
          ? `<img src="${t.tenantImage}" style="max-height:150px; object-fit:contain; border-radius:4px; margin-bottom:10px;">` 
          : `<strong style="color:#1e3a8a; font-size:14px;">พื้นที่สำหรับติดรูปถ่ายผู้เช่า<br>(ขนาดเท่าบัตรประชาชน)</strong>
             <div style="font-size:10px; color:#64748b; margin-top:12px;">(กรุณาติดรูปถ่ายหน้าตรงขนาดใหญ่เท่าบัตรประชาชนเพื่อความชัดเจนในการบันทึกประวัติ)</div>`
        }
      </div>
    </div>
  `;
  document.getElementById('contract-output').innerHTML = html;
  openModal('modal-print-contract');
}

// ── ฟังก์ชันพิมพ์จากหน้าประวัติ ──
function printContractFromHistory(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId);
  if(!t) return;
  renderContractHTML(t, 'ฟ้าใสแมนชั่น');
}

function printInitialReceipt(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId);
  if(!t) return;

  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  const depositAmt = CFG.DEPOSIT;
  const advanceAmt = CFG.RENT;
  const total = depositAmt + advanceAmt;
  const dateStr = t.moveIn ? new Date(t.moveIn).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : today();

  // ถามยอดรับเงินเพื่อคำนวณเงินทอน
  let receivedStr = prompt(`ยอดชำระทั้งหมด ${fmt(total)} บาท\nกรุณาใส่จำนวนเงินที่รับมา (บาท):`, total);
  if (receivedStr === null) return; 
  let received = parseFloat(receivedStr) || total;
  let change = Math.max(0, received - total);

  const html = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:2px solid #2563eb; padding-bottom:12px; margin-bottom:16px;">
      <img src="${LOGO_URL}" alt="Logo" style="width:100px; height:auto; object-fit:contain;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0; font-size:22px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
        <p style="margin:4px 0 0; font-size:13px; color:#4b5563;">${CFG.ADDRESS}<br>ติดต่อสำนักงาน: ${CFG.PHONE}</p>
      </div>
    </div>

    <h3 style="text-align:center; color:#1e3a8a; margin-bottom:24px; font-size:17px;">ใบเสร็จรับเงินแรกเข้า (Initial Receipt)</h3>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:14px;">
      <div><strong>ชื่อผู้เช่า:</strong> ${t.prefix || ''}${t.name}</div>
      <div><strong>เลขที่บิล (No.):</strong> INT-${t.roomId}-${Date.now().toString().slice(-4)}</div>
      <div><strong>ห้องพักหมายเลข (Room):</strong> ${t.roomId} &nbsp;&nbsp; <strong>ชั้น:</strong> ${t.roomId.charAt(0)}</div>
      <div><strong>วันที่ (Date):</strong> ${dateStr}</div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; font-family:'Sarabun', sans-serif;">
      <thead style="background-color:#0284c7; color:white;">
        <tr>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:center; width: 10%;">ลำดับ</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:left;">รายการรายละเอียด (Description)</th>
          <th style="padding:10px; border:1px solid #bae6fd; text-align:right; width: 30%;">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:center;">1</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0;">ค่าเช่าห้องล่วงหน้า 1 เดือน</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right;">${fmt(advanceAmt)}</td>
        </tr>
        <tr>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:center;">2</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0;">เงินประกันความเสียหายแรกเข้า</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right;">${fmt(depositAmt)}</td>
        </tr>
        <tr style="background-color:#f8fafc; font-weight:bold;">
          <td colspan="2" style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:15px;">รวมยอดเงินที่ต้องชำระทั้งสิ้น (Total Amount)</td>
          <td style="padding:12px 10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a; font-size:15px; text-decoration: underline;">${fmt(total)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:8px 10px; border:1px solid #e2e8f0; text-align:right; color:#475569;">รับเงินมา (Received)</td>
          <td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:right; color:#475569;">${fmt(received)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:8px 10px; border:1px solid #e2e8f0; text-align:right; color:#16a34a; font-weight:bold;">เงินทอน (Change)</td>
          <td style="padding:8px 10px; border:1px solid #e2e8f0; text-align:right; color:#16a34a; font-weight:bold;">${fmt(change)}</td>
        </tr>
      </tbody>
    </table>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; font-size:14px; margin-top:60px; margin-bottom:32px;">
      <div>
        <div style="margin-bottom:8px;">( ${t.prefix || ''}${t.name} )</div>
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

// ── Render Tenant History ──
function renderTenantHistory() {
  const tbody = document.getElementById('tenant-history-tbody');
  if(!tbody) return;

  const list = [...STATE.allTenants].sort((a,b) => (b.moveIn || '').localeCompare(a.moveIn || ''));
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px">ยังไม่มีประวัติผู้เช่า</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => {
    let filesHtml = '<div style="display:flex; flex-direction:column; gap:6px;">';
    
    let links = [];
    if(t.idCardImage) links.push(`<a href="${t.idCardImage}" target="_blank" style="color:var(--sky); font-size:12px;">💳 บัตร ปชช.</a>`);
    if(t.tenantImage) links.push(`<a href="${t.tenantImage}" target="_blank" style="color:var(--sky); font-size:12px;">👤 รูปถ่าย</a>`);
    
    if(links.length > 0) filesHtml += `<div>${links.join(' | ')}</div>`;
    else filesHtml += `<div style="color:var(--gray-400); font-size:12px;">ไม่มีรูปแนบ</div>`;

    filesHtml += `
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
        <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:11px;" onclick="printContractFromHistory('${t.id}')">📄 สัญญา</button>
        <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:11px;" onclick="printInitialReceipt('${t.id}')">🧾 ใบเสร็จแรกเข้า</button>
      </div>
    </div>`;

    return `
    <tr>
      <td><strong>${t.roomId}</strong></td>
      <td>${t.prefix || ''}${t.name}</td>
      <td>${t.phone || '-'}</td>
      <td>${t.moveIn || '-'}</td>
      <td>${t.moveOut || '-'}</td>
      <td><span class="badge badge-${t.active ? 'sky' : 'gray'}">${t.active ? 'กำลังเช่า' : 'ย้ายออกแล้ว'}</span></td>
      <td>${filesHtml}</td>
    </tr>
  `}).join('');
}

// ── Utils ──
function fmt(n) { return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return Number(n).toLocaleString('th-TH'); }
function today() { return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
function isoDate() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function thaiMonth(key) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const [y, m] = key.split('-');
  return `${months[parseInt(m)-1]} ${parseInt(y)+543}`;
}
function dayOfMonth() { return new Date().getDate(); }

// ── Bill Calculator ──
function calcBill({ elecOld, elecNew, waterOld, waterNew, lateDays = 0, isNew = false }) {
  const elecUnits = Math.max(0, elecNew - elecOld);
  const waterUnits = Math.max(0, waterNew - waterOld);
  const elecAmt = elecUnits * CFG.ELEC_RATE;
  const waterAmt = Math.max(waterUnits * CFG.WATER_RATE, CFG.WATER_MIN);
  const lateAmt = lateDays * CFG.LATE_PER_DAY;
  const depositAmt = isNew ? CFG.DEPOSIT : 0;
  const advanceAmt = isNew ? CFG.RENT : 0;
  const total = CFG.RENT + elecAmt + waterAmt + lateAmt + depositAmt + advanceAmt;
  return { elecUnits, waterUnits, elecAmt, waterAmt, lateAmt, depositAmt, advanceAmt, total };
}

// ── Room Status ──
function getRoomStatus(roomId) {
  const tenant = STATE.tenants[roomId];
  if (!tenant || !tenant.active) return 'vacant';
  const mk = monthKey();
  const bill = STATE.bills[`${roomId}-${mk}`];
  if (!bill) return 'occupied'; // เปลี่ยนตรงนี้: ถ้ายังไม่มีบิล ถือว่า ปกติ เสมอ
  
  if (bill.paid) return 'occupied';
  const d = dayOfMonth();
  if (d > CFG.CUT_DAY) return 'overdue';
  if (d > CFG.DUE_DAY) return 'warning';
  return 'occupied';
}
function getRoomStatusLabel(s) { return { occupied: 'ปกติ', vacant: 'ว่าง', overdue: 'ค้างชำระ', warning: 'เกินกำหนด' }[s] || s; }

// ── UI Helpers ──
function toast(msg, type = 'default', dur = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

function navigate(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.querySelector('.topbar-title').textContent = {
    dashboard: '📊 ภาพรวมหอพัก', form: '📝 บันทึกมิเตอร์', 'tenant-history': '👥 ประวัติผู้เช่า',
    report: '📄 รายงาน', history: '🕐 ประวัติบิล', settings: '⚙️ ตั้งค่า',
  }[page] || page;
  closeSidebar();

  if (page === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (page === 'history' && typeof renderHistory === 'function')   renderHistory();
  if (page === 'report' && typeof renderReport === 'function')    renderReport();
  if (page === 'tenant-history' && typeof renderTenantHistory === 'function') renderTenantHistory();
}

function openSidebar() { document.querySelector('.sidebar').classList.add('open'); document.querySelector('.sidebar-backdrop').classList.add('open'); }
function closeSidebar() { document.querySelector('.sidebar').classList.remove('open'); document.querySelector('.sidebar-backdrop').classList.remove('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }