# Laya Sales Voucher v6

ระบบนี้เป็น **repo ใหม่แยกจาก Free Voucher เดิม** สำหรับบัตรขายแบบมีมูลค่าคงเหลือ (Stored Value / Prepaid Beverage Card)

## จุดสำคัญของเวอร์ชันนี้
- ใช้ Firebase project เดียวกับระบบเดิม เพื่อรองรับ **auto-login from old repo mode**
- ใช้ข้อมูล auth และ role จาก collection เดิม:
  - `users`
  - `employee_login_index`
- ใช้ collection ใหม่สำหรับระบบขายบัตรเท่านั้น:
  - `sale_cards`
  - `sale_card_transactions`
  - `sale_settings`
- พนักงานเปิดจากปุ่ม **For Sales Voucher** ในเว็บเดิมแล้วเข้าใช้งานต่อได้เลย ถ้ายังมี session อยู่
- ถ้า session หมด จะเด้งไป `login.html` ซึ่งเป็นหน้า login สำรอง

## โครงหน้า
- `index.html` เมนูหลัก
- `dashboard.html` รายงานยอดขาย / ยอดใช้
- `create-card.html` สร้าง draft card
- `sell-card.html` Activate & Sell
- `scan-deduct.html` สแกนแล้วตัดยอด
- `check-balance.html` เช็กยอดอย่างเดียว
- `search-card.html` ค้นหาบัตร
- `card-detail.html` ดูรายละเอียดและ transaction ของบัตรใบนั้น
- `transactions.html` ดูรายการทั้งหมด
- `settings.html` ตั้งค่า outlet / URL / validity
- `admin-users.html` อ่าน role จากระบบเดิม
- `login.html` หน้า fallback เท่านั้น

## ก่อนใช้งานจริง
1. อัปไฟล์ทั้งโฟลเดอร์ขึ้น GitHub Pages ของ repo ใหม่
2. ใน Firebase Console ใช้ project เดียวกับระบบเดิม (`aroonsawat-ca537`)
3. Publish Firestore Rules โดยใช้ไฟล์ `firestore.rules.txt` **ที่ merge ของเดิม + ของใหม่แล้ว**
4. ตรวจค่า URL ใน `firebase-config.js`
   - `backToFreeVoucherUrl`
   - `saleCardRepoUrl`
5. เพิ่มปุ่ม `For Sales Voucher` ใน repo เก่าให้เปิด repo ใหม่นี้แบบแท็บใหม่

## Auto-login ทำงานเมื่อใด
Auto-login จะทำงานได้เมื่อ:
- repo เก่าและ repo ใหม่ใช้ Firebase Auth project เดียวกัน
- เปิดจากโดเมนเดียวกันในตระกูล GitHub Pages เดียวกัน
- user ยังมี session ค้างอยู่จากระบบเดิม

## หมายเหตุ
- ระบบใหม่นี้ **ไม่ใช้ collection `vouchers` เดิม**
- แต่ยังอ่าน `users` ของเดิมเพื่อเอา role เดิมมาใช้
- ถ้าต้องการแยก role ของระบบขายในอนาคต ค่อยเพิ่ม collection เช่น `sale_users` ได้ภายหลัง
