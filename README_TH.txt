Laya Voucher v5 - Reusable Card Mode

ไฟล์ชุดนี้เป็นเวอร์ชันสำหรับอัปขึ้น GitHub Pages โดยเปลี่ยนจาก Guest QR แบบชั่วคราวมาเป็น Reusable Card Mode แล้ว

แนวคิดหลักของ v5
- การ์ดแข็ง 1 ใบ = QR ถาวร 1 อัน
- Front Desk ไม่ต้อง Generate Guest QR อีกแล้ว
- แขกถือการ์ดจริงไปที่จุดใช้สิทธิ์
- พนักงานสแกน QR จากการ์ดจริงในหน้า Redeem
- หลังใช้แล้ว สถานะจะเป็น redeemed
- เมื่อ Front Desk ได้การ์ดคืน ให้กด Reuse เพื่อเปลี่ยนกลับเป็น issued และใช้ใหม่ได้

หน้าหลักในเวอร์ชันนี้
- login.html
- dashboard.html = สรุปการ์ดถาวร
- issue.html = Add Card / สร้างการ์ดใหม่เข้าระบบ
- frontdesk.html = Card Desk / คุมสต็อกการ์ดและกด Reuse
- search.html = ค้นหาการ์ดแล้วสั่ง Reuse / Disable / Enable / Delete
- redeem.html = สแกนการ์ดจริงเพื่อ Redeem
- voucher-detail.html = ดูรายละเอียดและ timeline ของการ์ด
- view.html = เปิด QR / Code ของการ์ด
- guest-claim.html = retired notice แล้ว

โครงสร้างข้อมูลที่ใช้กับ v5
- collection: vouchers
- field สำคัญใหม่:
  - voucher_mode = "reusable_card"
  - card_label
  - card_group
  - reset_count
  - last_reset_at
  - last_reset_by_uid
  - last_reset_by_name
  - disabled_reason

การตีความสถานะใน v5
- issued = Available
- redeemed = Used / Awaiting Return
- disabled = Disabled

สิทธิ์ใช้งาน
- staff = Redeem only
- supervisor / manager / admin = Dashboard / Add Card / Card Desk / Search / Detail
- admin = จัดการ Users และ Delete Card ได้

หมายเหตุสำคัญก่อนใช้งานจริง
1) firebase-config.js ต้องใส่ค่าจริงของโปรเจกต์ Firebase
2) ต้อง publish firestore.rules.txt เวอร์ชันนี้ใน Firebase Console > Firestore Rules
3) ถ้า Firestore แจ้งให้สร้าง index ให้กดสร้างตามลิงก์ที่ระบบแจ้ง
4) guest-claim flow ถูก retire แล้ว ไม่ควรใช้งานจริงอีก
5) การ์ดใหม่ที่สร้างจาก issue.html จะใส่ voucher_mode = reusable_card อัตโนมัติ

ลำดับทดสอบที่แนะนำ
1) Login ด้วย supervisor / manager / admin
2) ไปหน้า Add Card แล้วสร้างการ์ดใหม่ 1 ใบ
3) เปิด view.html หรือพิมพ์การ์ดจริงจาก QR / Code
4) ไปหน้า Redeem แล้วสแกนหรือพิมพ์ Voucher Code
5) ตรวจว่า status เปลี่ยนจาก issued เป็น redeemed
6) ไปหน้า Card Desk หรือ Search แล้วกด Reuse
7) ตรวจว่า status กลับเป็น issued และ reset_count เพิ่มขึ้น
