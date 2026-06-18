// ── Config ──
const defaultRoomsText = "ชั้น 1: 101, 102, 103, 104, 105, 106, 107, 108\nชั้น 2: 201, 202, 203, 204, 205, 206, 207, 208";
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

function getDirectDriveUrl(url) {
  if (!url || url === 'null' || url === '') return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
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
      STATE.allTenants.forEach(t => { if(t.active) STATE.tenants[t.roomId] = t; });
      if(typeof renderTenantHistory === 'function') renderTenantHistory(); 
    }

    const { data: billsData, error: errB } = await supabaseClient.from('bills').select('*');
    if(errB) throw errB;
    
    STATE.bills = {};

    if(billsData && billsData.length > 0) {
      billsData.forEach(b => {
        const key = `${b.room_id}-${b.month_key}`;
        
        // 💡 กู้คืนข้อมูลบิลแรกเข้าอัตโนมัติ
        const isInitialBill = (b.water_amt === 0 && b.elec_amt === 0 && b.total_amount > CFG.RENT);

        STATE.bills[key] = {
          roomId: b.room_id, month: b.month_key, elecUnits: b.elec_units, waterUnits: b.water_units,
          elecAmt: b.elec_amt, waterAmt: b.water_amt, lateAmt: b.late_amt, total: b.total_amount,
          paid: b.is_paid, paidDate: b.paid_date,
          isNew: isInitialBill,
          depositAmt: b.deposit_amt || (isInitialBill ? (b.total_amount - CFG.RENT) : 0),
          advanceAmt: b.advance_amt || (isInitialBill ? CFG.RENT : 0)
        };
        if(b.elec_old !== undefined) STATE.bills[key].elecOld = b.elec_old;
        if(b.elec_new !== undefined) STATE.bills[key].elecNew = b.elec_new;
        if(b.water_old !== undefined) STATE.bills[key].waterOld = b.water_old;
        if(b.water_new !== undefined) STATE.bills[key].waterNew = b.water_new;
      });
    }
    
    localStorage.setItem('bills', JSON.stringify(STATE.bills));
  } catch (e) { console.error("Load Data Error:", e); }
}

async function saveState() {
  localStorage.setItem('bills', JSON.stringify(STATE.bills)); 
  try {
    const tenantsPayload = STATE.allTenants.map(t => ({
      id: t.id, room_id: t.roomId, prefix: t.prefix, name: t.name, phone: t.phone, id_card: t.idNum,
      move_in_date: t.moveIn, move_out_date: t.moveOut, active: t.active, 
      id_card_image_url: t.idCardImage ? t.idCardImage.replace('/thumbnail?id=', '/file/d/').replace('&sz=w1000', '/view') : null, 
      tenant_photo_url: t.tenantImage ? t.tenantImage.replace('/thumbnail?id=', '/file/d/').replace('&sz=w1000', '/view') : null
    }));
    if(tenantsPayload.length > 0) await supabaseClient.from('tenants').upsert(tenantsPayload, { onConflict: 'id' });

    const billsPayload = Object.entries(STATE.bills).map(([key, b]) => {
      const [roomId, y, m] = key.split('-');
      return {
        room_id: roomId, month_key: `${y}-${m}`, 
        elec_old: b.elecOld || 0, elec_new: b.elecNew || 0, elec_units: b.elecUnits || 0, elec_amt: b.elecAmt || 0,
        water_old: b.waterOld || 0, water_new: b.waterNew || 0, water_units: b.waterUnits || 0, water_amt: b.waterAmt || 0, 
        late_amt: b.lateAmt || 0, total_amount: b.total || 0, is_paid: b.paid || false, paid_date: b.paidDate || null
      };
    });
    if(billsPayload.length > 0) await supabaseClient.from('bills').upsert(billsPayload, { onConflict: 'room_id,month_key' });
  } catch (e) { console.error("Sync Error:", e); }
}

function compressImage(file, maxWidth = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; } } 
        else { if (height > maxWidth) { width = Math.round((width *= maxWidth / height)); height = maxWidth; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

async function uploadImageToGAS(fileInputId) {
  const file = document.getElementById(fileInputId).files[0]; if(!file) return { url: null, b64: null };
  const compressedBase64 = await compressImage(file);
  try {
    const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'saveIdCard', roomId: 'TEMP', imageBase64: compressedBase64 }) });
    const data = await res.json();
    return { url: data.ok ? getDirectDriveUrl(data.fileUrl) : null, b64: compressedBase64 };
  } catch(e) { return { url: null, b64: compressedBase64 }; }
}

async function sendTelegram(msg) {
  const token = localStorage.getItem('tg_token'), chatId = localStorage.getItem('tg_chat');
  if (!token || !chatId) return false;
  try {
    const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'notifyTelegram', tgToken: token, tgChatId: chatId, message: msg }) });
    const data = await res.json(); return data.ok;
  } catch(e) { return false; }
}

function imgToBase64(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch { 
        resolve(url); 
      } 
    };
    img.onerror = () => resolve(url); 
    img.src = url;
  });
}

function printHidden(htmlContent, title = 'พิมพ์เอกสาร') {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>
            @page { size: A4 portrait; margin: 10mm; } 
            body { 
                font-family: 'Sarabun', sans-serif; 
                color: #1e293b; 
                line-height: 1.4; 
                font-size: 13px;
                margin: 0; padding: 0;
            }
            .page-break { page-break-after: always; }
            .fill { font-weight: bold; border-bottom: 1px dotted #94a3b8; padding: 0 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 10px; }
            th { background-color: #0284c7; color: white; text-align: left; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            ul { margin: 2px 0 8px 25px; padding: 0; }
            p { margin: 2px 0 8px 0; text-align: justify; }
            
            .image-box {
                border: 2px dashed #94a3b8;
                border-radius: 8px;
                padding: 10px;
                text-align: center;
                min-height: 180px; 
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                background-color: #f8fafc;
                box-sizing: border-box;
                overflow: hidden;
            }
            .image-box img { max-width: 100%; max-height: 135px; object-fit: contain; border-radius: 4px; }
            
            @media print {
              img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .image-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #f8fafc !important; }
            }
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 5000);
  }, 1000);
}

async function submitAddTenantAndContract() {
  const roomId = document.getElementById('add-tenant-room').value, prefix = document.getElementById('add-tenant-prefix').value;
  const name = document.getElementById('add-tenant-name').value.trim(), phone = document.getElementById('add-tenant-phone').value.trim();
  const idNum = document.getElementById('add-tenant-id').value.trim(), moveIn = document.getElementById('add-tenant-movein').value;
  
  const place = document.getElementById('add-tenant-place').value;
  const repName = document.getElementById('add-tenant-rep').value.trim();
  localStorage.setItem('default_place', place);
  localStorage.setItem('default_rep_name', repName);

  if (!name) { toast('กรุณากรอกชื่อ', 'error'); return; }

  const btn = document.querySelector('button[onclick="submitAddTenantAndContract()"]'); btn.disabled = true; btn.textContent = '⏳ บีบอัดรูปและบันทึก...';
  
  const idCardRes = await uploadImageToGAS('add-tenant-id-img');
  const tenantRes = await uploadImageToGAS('add-tenant-photo-img');

  const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  const newTenant = { id: newId, roomId, prefix, name, phone, idNum, moveIn, active: true, idCardImage: idCardRes.url, tenantImage: tenantRes.url };
  
  if (idCardRes.b64) localStorage.setItem(`img_id_${newId}`, idCardRes.b64);
  if (tenantRes.b64) localStorage.setItem(`img_photo_${newId}`, tenantRes.b64);
  
  STATE.allTenants.push(newTenant); 
  STATE.tenants[roomId] = newTenant;
  await saveState();

  closeModal('modal-add-tenant'); toast(`เพิ่มผู้เช่าสำเร็จ`, 'success');
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof selectRoom === 'function') selectRoom(roomId);
  if (typeof renderTenantHistory === 'function') renderTenantHistory();
  
  btn.disabled = false; btn.textContent = '✅ บันทึกและสร้างสัญญา';
  printContractFromHistory(newTenant.id); 
}

function getContractHTML(t, place, repName) {
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  const advAmount = CFG.RENT, totalFirst = CFG.DEPOSIT + advAmount;
  const b = n => Number(n).toLocaleString('th-TH');
  const td = iso => {
    if (!iso) return '...... เดือน ................................ พ.ศ. ..............';
    const d = new Date(iso); const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${d.getDate()} เดือน ${m[d.getMonth()]} พ.ศ. ${d.getFullYear()+543}`;
  };

  const repDisplay = repName ? `<strong><span style="border-bottom:1px dotted #94a3b8; padding:0 5px;">${repName}</span></strong>` : '............................................................................................';

  return `
    <div style="font-family:'Sarabun', sans-serif; color:#1e293b; line-height: 1.5; padding: 0 10px;">
        <div style="display:flex; align-items:center; border-bottom:2px solid #2563eb; padding-bottom:8px; margin-bottom:12px;">
          <img src="${LOGO_URL}" style="height:50px; margin-right:15px;" onerror="this.style.display='none'">
          <div>
            <h2 style="color:#1e3a8a; margin:0; font-size:18px;">${CFG.MANSION_NAME} (Fah Sai Mansion)</h2>
            <div style="font-size:12px; color:#475569;">${CFG.ADDRESS} | ติดต่อสำนักงาน: ${CFG.PHONE}</div>
          </div>
        </div>
        
        <h2 class="text-center" style="color:#1e3a8a; font-size:16px; margin-bottom:12px;">สัญญาเช่าห้องพักรายเดือน</h2>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-weight:bold;">
          <div>ทำที่: <span class="fill" style="font-weight:normal">${place || CFG.MANSION_NAME}</span></div>
          <div>วันที่: <span class="fill" style="font-weight:normal">${td(t.moveIn)}</span></div>
        </div>
        
        <p style="text-indent: 40px;">
          สัญญาฉบับนี้ทำขึ้นระหว่าง <strong>${CFG.MANSION_NAME}</strong> โดย ${repDisplay} ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้ให้เช่า"</strong> ฝ่ายหนึ่ง กับ <strong>${t.prefix || ''}</strong> <span class="fill">${t.name}</span> บัตรประจำตัวประชาชนเลขที่ <span class="fill">${t.idNum || '.........................'}</span> เบอร์โทรศัพท์ <span class="fill">${t.phone || '.........................'}</span> ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้เช่า"</strong> อีกฝ่ายหนึ่ง ทั้งสองฝ่ายได้ตกลงทำสัญญาเช่ากันโดยมีข้อความและเงื่อนไขดังต่อไปนี้:
        </p>
        
        <div style="color:#0284c7; font-weight:bold; margin-top:8px;">ข้อ 1. วัตถุประสงค์และทรัพย์สินที่เช่า</div>
        <p style="margin-left: 20px;">ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพักของ${CFG.MANSION_NAME} <strong>ห้องหมายเลข <span class="fill">${t.roomId}</span> ชั้นที่ <span class="fill">${t.roomId.charAt(0)}</span></strong> เพื่อใช้เป็นที่อยู่อาศัยส่วนตัวเท่านั้น ห้ามมิให้นำไปใช้เพื่อการพาณิชย์ หรือประกอบกิจการใดๆ ที่ผิดกฎหมาย หรือขัดต่อศีลธรรมอันดีงาม</p>
        
        <div style="color:#0284c7; font-weight:bold; margin-top:8px;">ข้อ 2. อัตราค่าเช่า เงินประกัน และการเข้าอยู่ครั้งแรก</div>
        <ul style="margin: 2px 0 0 35px; padding: 0;">
          <li><strong>ค่าเช่าห้องพัก:</strong> คิดในอัตราเดือนละ <strong>${b(CFG.RENT)} บาท</strong></li>
          <li><strong>เงินประกันความเสียหายแรกเข้า:</strong> จำนวน <strong>${b(CFG.DEPOSIT)} บาท</strong></li>
          <li><strong>ค่าเช่าล่วงหน้า:</strong> จำนวน 1 เดือน เป็นเงิน <strong>${b(advAmount)} บาท</strong></li>
          <li><strong>รวมยอดชำระแรกเข้าทั้งสิ้น:</strong> จำนวน <strong>${b(totalFirst)} บาท</strong> ซึ่งผู้เช่าได้ชำระให้แก่ผู้ให้เช่าครบถ้วนแล้วในวันทำสัญญานี้</li>
        </ul>
        
        <div style="color:#0284c7; font-weight:bold; margin-top:8px;">ข้อ 3. การคิดค่าน้ำประปาและค่าไฟฟ้า (สาธารณูปโภค)</div>
        <ul style="margin: 2px 0 0 35px; padding: 0;">
          <li><strong>ค่าน้ำประปา:</strong> คิดในอัตราหน่วยละ <strong>${CFG.WATER_RATE} บาท</strong> โดยมีอัตราขั้นต่ำที่ <strong>${CFG.WATER_MIN} บาทต่อเดือน</strong></li>
          <li><strong>ค่าไฟฟ้า:</strong> คิดในอัตราหน่วยละ <strong>${CFG.ELEC_RATE} บาท</strong> ตามจำนวนหน่วยที่ใช้จริง ไม่มีขั้นต่ำ</li>
        </ul>
        
        <div style="color:#0284c7; font-weight:bold; margin-top:8px;">ข้อ 4. กำหนดการชำระเงินและระบบค่าปรับชำระล่าช้า</div>
        <p style="margin-left: 20px;">ผู้เช่าต้องชำระค่าเช่าห้องพักรวมถึงค่าน้ำ-ค่าไฟ <strong>ภายในวันที่ ${CFG.DUE_DAY} ของทุกเดือน</strong> หากเกินกำหนดเวลาดังกล่าว ให้ถือว่าผู้เช่าผิดนัดชำระและยินยอมปฏิบัติตามมาตรการดังต่อไปนี้:</p>
        <ul style="margin: 2px 0 0 35px; padding: 0;">
          <li><strong>การคิดค่าปรับ:</strong> หากชำระล่าช้าตั้งแต่วันที่ 6 เป็นต้นไป ผู้เช่าตกลงยินยอมเสียค่าปรับให้แก่ผู้ให้เช่าในอัตรา <strong>วันละ ${CFG.LATE_PER_DAY} บาท</strong> นับตั้งแต่วันที่ผิดนัดจนกว่าจะชำระเสร็จสิ้น</li>
          <li><strong>มาตรการขั้นเด็ดขาด:</strong> หากผู้เช่าค้างชำระค่าเช่าหรือค่าปรับรวมกันเกินวันที่ <strong>${CFG.CUT_DAY} ของเดือน</strong> ผู้ให้เช่ามีสิทธิ์เด็ดขาดในการระงับการจ่ายน้ำประปาและไฟฟ้าภายในห้องพักดังกล่าวทันที รวมถึงมีสิทธิ์บอกเลิกสัญญาเช่าและเชิญผู้เช่าให้ออกจากห้องพักได้โดยมิต้องแจ้งล่วงหน้า</li>
        </ul>
        
        <div style="color:#0284c7; font-weight:bold; margin-top:8px;">ข้อ 5. เงินประกันและความรับผิดชอบในความเสียหาย</div>
        <p style="margin-left: 20px;">เงินประกันจำนวน ${b(CFG.DEPOSIT)} บาทนั้น ผู้ให้เช่าจะถือไว้เพื่อเป็นหลักประกันความเสียหายของห้องพักและอุปกรณ์ต่าง ๆ เมื่อผู้เช่าอยู่ครบตามกำหนดเวลาและประสงค์ย้ายออก ผู้ให้เช่าจะคืนเงินประกันนี้ให้โดยไม่มีดอกเบี้ย ภายในหลังจากหักลบค่าเสียหาย ค่าทำความสะอาด หรือค่าใช้จ่ายที่ผู้เช่าค้างชำระแล้ว (หากมี)</p>
        
        <div class="page-break"></div>
        
        <div style="padding-top: 15px;">
          <div style="color:#0284c7; font-weight:bold; margin-top:0;">ข้อ 6. การสิ้นสุดสัญญาเช่าและการย้ายออก</div>
          <p style="margin-left: 20px; margin-bottom: 20px;">หากผู้เช่าประสงค์จะย้ายออกจากห้องพัก จะต้องแจ้งให้ผู้ให้เช่าทราบล่วงหน้าเป็นลายลักษณ์อักษรอย่างน้อย 30 วัน หากย้ายออกก่อนกำหนดโดยไม่แจ้งล่วงหน้า หรือทำผิดข้อสัญญาใดๆ ผู้ให้เช่ามีสิทธิ์ริบเงินประกันความเสียหายทั้งหมดทันที</p>
          
          <p class="text-center" style="font-weight:bold; margin-bottom: 30px;">สัญญาฉบับนี้ทำขึ้นเป็นสองฉบับมีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยละเอียดตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน</p>
          
          <table style="border:none; margin-bottom: 20px; width: 100%;">
            <tr>
              <td style="border:none; text-align:center; width:50%;">
                <div style="margin-bottom:5px;">( ${t.prefix || ''}${t.name} )</div>
                <div style="font-weight:bold;">ผู้เช่า</div>
                <div style="margin-top:40px;">( ............................................................ )</div>
                <div style="margin-top:5px; color:#64748b;">พยาน</div>
              </td>
              <td style="border:none; text-align:center; width:50%;">
                <div style="margin-bottom:5px;">( ${repName ? repName : '............................................................'} )</div>
                <div style="font-weight:bold;">ผู้ให้เช่า (${CFG.MANSION_NAME})</div>
                <div style="margin-top:40px;">( ............................................................ )</div>
                <div style="margin-top:5px; color:#64748b;">พยาน</div>
              </td>
            </tr>
          </table>
          
          <h3 style="color:#1e3a8a; font-size:14px; font-weight:bold; margin:0 0 12px 0; text-align:center;">เอกสารแนบ / รูปถ่ายผู้เช่า</h3>
          <table style="border:none; width: 100%;">
            <tr>
              <td style="border:none; width:50%; padding-right:10px; vertical-align: top;">
                <div class="image-box">
                  <div style="font-size:12px; color:#1e3a8a; font-weight:bold; margin-bottom:8px;">สำเนาบัตรประชาชน</div>
                  ${t.idCardImage ? `<img src="${t.idCardImage}">` : `<div style="color:#94a3b8; font-size:12px; margin-top:8px;">ไม่มีรูปแนบ</div>`}
                </div>
              </td>
              <td style="border:none; width:50%; padding-left:10px; vertical-align: top;">
                <div class="image-box">
                  <div style="font-size:12px; color:#1e3a8a; font-weight:bold; margin-bottom:8px;">รูปถ่ายผู้เช่า</div>
                  ${t.tenantImage ? `<img src="${t.tenantImage}">` : `<div style="color:#94a3b8; font-size:12px; margin-top:8px;">ไม่มีรูปแนบ</div>`}
                </div>
              </td>
            </tr>
          </table>
        </div>
    </div>
  `;
}

function printContractFromHistory(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId);
  if (!t) return;
  
  const place = localStorage.getItem('default_place') || CFG.MANSION_NAME;
  const repName = localStorage.getItem('default_rep_name') || '';

  const idCardB64 = localStorage.getItem(`img_id_${tenantId}`);
  const tenantB64 = localStorage.getItem(`img_photo_${tenantId}`);
  const tPrint = { 
    ...t,
    idCardImage: idCardB64 || t.idCardImage,
    tenantImage: tenantB64 || t.tenantImage
  };
  
  const htmlContent = getContractHTML(tPrint, place, repName);
  
  document.getElementById('contract-output').innerHTML = htmlContent;
  openModal('modal-print-contract');
  
  // 💡 แก้ไข: ใช้ cloneNode ป้องกันคำสั่งพิมพ์ค้างซ้อนทับกัน
  const printBtn = document.querySelector('#modal-print-contract .btn-success');
  if (printBtn) {
    const newBtn = printBtn.cloneNode(true);
    printBtn.parentNode.replaceChild(newBtn, printBtn);
    
    newBtn.addEventListener('click', function() {
      printHidden(htmlContent, `สัญญาเช่าห้อง_${t.roomId}`);
    });
  }
}

// ── ระบบเปิด Popup รับเงิน ──
function openPaymentModal(type, targetId, totalAmount, titleText) {
  document.getElementById('pay-bill-type').value = type;
  document.getElementById('pay-bill-tenant-id').value = targetId;
  document.getElementById('pay-bill-title').textContent = titleText;
  
  let baseTotal = totalAmount;
  let autoLateAmt = 0;
  const lateGroup = document.getElementById('pay-bill-late-group');
  const lateInput = document.getElementById('pay-bill-late-amt');
  const receivedInput = document.getElementById('pay-bill-received');

  // คำนวณค่าปรับอัตโนมัติ (เฉพาะบิลรายเดือน)
  if (type === 'monthly') {
    if (lateGroup) lateGroup.style.display = 'block';
    const d = dayOfMonth();
    if (d > CFG.DUE_DAY) {
      const daysLate = d - CFG.DUE_DAY;
      autoLateAmt = daysLate * CFG.LATE_PER_DAY;
      if (document.getElementById('pay-bill-late-hint')) {
        document.getElementById('pay-bill-late-hint').textContent = `เกินกำหนด ${daysLate} วัน`;
      }
    } else {
      if (document.getElementById('pay-bill-late-hint')) {
        document.getElementById('pay-bill-late-hint').textContent = `ยังไม่เกินกำหนด`;
      }
    }
  } else {
    if (lateGroup) lateGroup.style.display = 'none';
  }

  if (lateInput) lateInput.value = autoLateAmt;

  const updateModalTotals = () => {
    const penalty = type === 'monthly' && lateInput ? (parseFloat(lateInput.value) || 0) : 0;
    const finalTotal = baseTotal + penalty;
    document.getElementById('pay-bill-total').textContent = fmt(finalTotal);
    
    const r = parseFloat(receivedInput.value) || 0;
    document.getElementById('pay-bill-change').textContent = fmt(Math.max(0, r - finalTotal));
  };

  if (lateInput) lateInput.oninput = updateModalTotals;
  receivedInput.oninput = updateModalTotals;

  // เซ็ตยอดเงินเริ่มต้นที่ช่องรับเงิน
  receivedInput.value = baseTotal + autoLateAmt; 
  updateModalTotals();
  
  openModal('modal-pay-bill');
}

async function processPaymentConfirm() {
  const type = document.getElementById('pay-bill-type').value;
  const targetId = document.getElementById('pay-bill-tenant-id').value;
  const received = parseFloat(document.getElementById('pay-bill-received').value) || 0;
  
  const lateInput = document.getElementById('pay-bill-late-amt');
  const lateAmt = lateInput ? (parseFloat(lateInput.value) || 0) : 0;
  
  closeModal('modal-pay-bill');
  
  if (type === 'monthly') {
    const mk = monthKey(), key = `${targetId}-${mk}`;
    if (STATE.bills[key]) {
      STATE.bills[key].paid = true; 
      STATE.bills[key].paidDate = isoDate();
      
      // อัปเดตยอดบิลให้รวมค่าปรับเข้าไปด้วย (ถ้ามี)
      if (lateAmt > 0) {
        STATE.bills[key].lateAmt = lateAmt;
        STATE.bills[key].total += lateAmt;
      }

      await saveState(); 
      toast(`บันทึกรับเงินห้อง ${targetId} สำเร็จ`, 'success');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (STATE.currentPage === 'history' && typeof renderHistory === 'function') renderHistory();
      if (STATE.currentPage === 'report' && typeof renderReport === 'function') renderReport();
    }
  } else if (type === 'initial') {
    // ── บันทึกบิลแรกเข้าลงระบบเพื่อไปคำนวณภาษี ──
    const t = STATE.allTenants.find(x => x.id === targetId);
    if (t) {
      const mk = monthKey();
      const key = `${t.roomId}-${mk}`;
      
      // บันทึกโครงสร้างบิลแรกเข้าลงฐานข้อมูล
      STATE.bills[key] = {
        roomId: t.roomId,
        month: mk,
        elecOld: 0, elecNew: 0, elecUnits: 0, elecAmt: 0,
        waterOld: 0, waterNew: 0, waterUnits: 0, waterAmt: 0,
        lateDays: 0, lateAmt: 0,
        isNew: true,
        depositAmt: CFG.DEPOSIT, // เงินประกัน
        advanceAmt: CFG.RENT,    // ค่าเช่าล่วงหน้า
        total: CFG.RENT + CFG.DEPOSIT,
        paid: true,
        paidDate: isoDate(),
        createdAt: isoDate()
      };
      
      await saveState(); 
      toast(`บันทึกประวัติค่าเช่าแรกเข้าห้อง ${t.roomId} เรียบร้อย`, 'success');
      
      if (typeof renderDashboard === 'function') renderDashboard();
      if (STATE.currentPage === 'history' && typeof renderHistory === 'function') renderHistory();
      if (STATE.currentPage === 'report' && typeof renderReport === 'function') renderReport();
    }
    
    executePrintInitialReceiptHTML(targetId, received);
  }
}

function printInitialReceipt(tenantId) {
  const t = STATE.allTenants.find(x => x.id === tenantId); if(!t) return;
  const total = CFG.DEPOSIT + CFG.RENT;
  openPaymentModal('initial', tenantId, total, `บิลแรกเข้า ห้อง ${t.roomId} — ${t.name}`);
}

function executePrintInitialReceiptHTML(tenantId, receivedAmt) {
  const t = STATE.allTenants.find(x => x.id === tenantId); if(!t) return;
  const LOGO_URL = 'https://raw.githubusercontent.com/scriptnkp/FahSai_Mansion/main/Logo.png';
  const total = CFG.DEPOSIT + CFG.RENT, change = Math.max(0, receivedAmt - total);
  const dateStr = t.moveIn ? new Date(t.moveIn).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : today();
  const repName = localStorage.getItem('default_rep_name') || '........................................................';

  const htmlContent = `
    <div style="display:flex; align-items:center; border-bottom:2px solid #2563eb; padding-bottom:10px; margin-bottom:20px; font-family:'Sarabun', sans-serif;">
      <img src="${LOGO_URL}" style="height:60px; margin-right:15px;" onerror="this.style.display='none'">
      <div>
        <h2 style="color:#1e3a8a; margin:0;">${CFG.MANSION_NAME}</h2>
        <div style="font-size:12px; color:#475569;">${CFG.ADDRESS}</div>
      </div>
    </div>
    <h3 style="text-align:center; color:#1e3a8a; font-family:'Sarabun', sans-serif;">ใบเสร็จรับเงินแรกเข้า (Initial Receipt)</h3>
    <p style="font-family:'Sarabun', sans-serif;">ห้อง: <b>${t.roomId}</b> | ผู้เช่า: <b>${t.prefix || ''}${t.name}</b> | วันที่: ${dateStr}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-family:'Sarabun', sans-serif; font-size: 14px;">
      <thead style="background-color:#0284c7; color:white;"><tr><th style="padding:10px; border:1px solid #bae6fd; text-align:left;">รายการ</th><th style="padding:10px; border:1px solid #bae6fd; text-align:right; width:30%;">บาท</th></tr></thead>
      <tbody>
        <tr><td style="padding:10px; border:1px solid #e2e8f0;">ค่าเช่าห้องล่วงหน้า 1 เดือน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(CFG.RENT)}</td></tr>
        <tr><td style="padding:10px; border:1px solid #e2e8f0;">เงินประกันความเสียหาย</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(CFG.DEPOSIT)}</td></tr>
        <tr style="font-weight:bold; background:#f8fafc;"><td style="padding:10px; border:1px solid #e2e8f0; color:#1e3a8a;">รวมเงิน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right; color:#1e3a8a;">${fmt(total)}</td></tr>
        <tr><td style="padding:10px; border:1px solid #e2e8f0; color:#475569;">รับเงินมา</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right; color:#475569;">${fmt(receivedAmt)}</td></tr>
        <tr style="font-weight:bold; color:#16a34a;"><td style="padding:10px; border:1px solid #e2e8f0;">เงินทอน</td><td style="padding:10px; border:1px solid #e2e8f0; text-align:right;">${fmt(change)}</td></tr>
      </tbody>
    </table>
    <div style="display:flex; justify-content:space-around; text-align:center; font-size:14px; margin-top: 50px; font-family:'Sarabun', sans-serif;">
      <div>
        <div style="margin-bottom:8px;">( ${t.prefix || ''}${t.name} )</div>
        <strong style="color:#1e3a8a;">ผู้จ่ายเงิน / ผู้เช่า</strong>
      </div>
      <div>
        <div style="margin-bottom:8px;">( ${repName} )</div>
        <strong style="color:#1e3a8a;">ผู้รับเงิน / ผู้แทนแมนชั่น</strong>
      </div>
    </div>`;
    
  document.getElementById('contract-output').innerHTML = htmlContent; 
  openModal('modal-print-contract');
  
  // 💡 แก้ไข: ใช้ cloneNode ป้องกันคำสั่งพิมพ์ค้างซ้อนทับกัน
  const printBtn = document.querySelector('#modal-print-contract .btn-success');
  if (printBtn) {
    const newBtn = printBtn.cloneNode(true);
    printBtn.parentNode.replaceChild(newBtn, printBtn);
    
    newBtn.addEventListener('click', function() {
      printHidden(htmlContent, `ใบเสร็จแรกเข้า_${t.roomId}`);
    });
  }
}

function renderTenantHistory() {
  const tbody = document.getElementById('tenant-history-tbody'); if(!tbody) return;
  const list = [...STATE.allTenants].sort((a,b) => (b.moveIn || '').localeCompare(a.moveIn || ''));
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px">ยังไม่มีประวัติ</td></tr>`; return; }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td><strong>${t.roomId}</strong></td><td>${t.prefix || ''}${t.name}</td><td>${t.phone || '-'}</td><td>${t.moveIn}</td><td>${t.moveOut || '-'}</td>
      <td><span class="badge badge-${t.active?'sky':'gray'}">${t.active?'กำลังเช่า':'ย้ายออก'}</span></td>
      <td>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${t.idCardImage || t.tenantImage ? `<div>${t.idCardImage ? `<a href="${t.idCardImage}" target="_blank" style="color:var(--sky); font-size:12px;">💳 บัตร ปชช.</a>` : ''} ${t.tenantImage ? `<a href="${t.tenantImage}" target="_blank" style="color:var(--sky); font-size:12px;">👤 รูปถ่าย</a>` : ''}</div>` : `<div style="color:var(--gray-400); font-size:12px;">ไม่มีรูปแนบ</div>`}
          <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
            <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:11px;" onclick="printContractFromHistory('${t.id}')">🖨 สัญญา</button>
            <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:11px;" onclick="printInitialReceipt('${t.id}')">🖨 บิลแรกเข้า</button>
          </div>
        </div>
      </td>
    </tr>`).join('');
}

// ── UTILITIES ──
function fmt(n) { return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return Number(n).toLocaleString('th-TH'); }
function today() { return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
function isoDate() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function thaiMonth(key) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const [y, m] = key.split('-'); return `${months[parseInt(m)-1]} ${parseInt(y)+543}`;
}
function dayOfMonth() { return new Date().getDate(); }

function calcBill({ elecOld, elecNew, waterOld, waterNew, lateDays = 0, isNew = false }) {
  const elecUnits = Math.max(0, elecNew - elecOld), waterUnits = Math.max(0, waterNew - waterOld);
  const elecAmt = elecUnits * CFG.ELEC_RATE, waterAmt = Math.max(waterUnits * CFG.WATER_RATE, CFG.WATER_MIN);
  const lateAmt = lateDays * CFG.LATE_PER_DAY, depositAmt = isNew ? CFG.DEPOSIT : 0, advanceAmt = isNew ? CFG.RENT : 0;
  const total = CFG.RENT + elecAmt + waterAmt + lateAmt + depositAmt + advanceAmt;
  return { elecUnits, waterUnits, elecAmt, waterAmt, lateAmt, depositAmt, advanceAmt, total };
}

function getRoomStatus(roomId) {
  const tenant = STATE.tenants[roomId]; if (!tenant || !tenant.active) return 'vacant';
  const mk = monthKey(), bill = STATE.bills[`${roomId}-${mk}`]; if (!bill) return 'occupied';
  if (bill.paid) return 'occupied';
  const d = dayOfMonth(); if (d > CFG.CUT_DAY) return 'overdue'; if (d > CFG.DUE_DAY) return 'warning';
  return 'occupied';
}
function getRoomStatusLabel(s) { return { occupied: 'ปกติ', vacant: 'ว่าง', overdue: 'ค้างชำระ', warning: 'เกินกำหนด' }[s] || s; }

function toast(msg, type = 'default', dur = 3000) {
  const el = document.createElement('div'); el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el); setTimeout(() => el.remove(), dur);
}

function navigate(page) {
  STATE.currentPage = page; document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`); if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.toggle('active', n.dataset.page === page); });
  document.querySelector('.topbar-title').textContent = { dashboard: '📊 ภาพรวมหอพัก', form: '📝 บันทึกมิเตอร์', 'tenant-history': '👥 ประวัติผู้เช่า', report: '📄 รายงาน', history: '🕐 ประวัติบิล', settings: '⚙️ ตั้งค่า' }[page] || page;
  closeSidebar();
  if (page === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (page === 'history' && typeof renderHistory === 'function') renderHistory();
  if (page === 'report' && typeof renderReport === 'function') renderReport();
  if (page === 'tenant-history' && typeof renderTenantHistory === 'function') renderTenantHistory();
}

function openSidebar() { document.querySelector('.sidebar').classList.add('open'); document.querySelector('.sidebar-backdrop').classList.add('open'); }
function closeSidebar() { document.querySelector('.sidebar').classList.remove('open'); document.querySelector('.sidebar-backdrop').classList.remove('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }