'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'public','admin.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const db=fs.readFileSync(path.join(root,'lib','db.js'),'utf8');

assert.match(html,/id="fundSupport"/,'Trang công khai phải có khối QR ủng hộ');
assert.ok(html.indexOf('id="fundSupport"')<html.indexOf('id="trafficStats"'),'Khối QR phải nằm phía trên thống kê online');
assert.match(admin,/id="set_fund_qr_file"/,'Admin phải upload được ảnh QR');
assert.match(admin,/1000 × 1000 px/,'Admin phải có hướng dẫn kích thước QR hợp lý');
assert.match(admin,/richEditorField\('fundSupportEditor'/,'Nội dung kêu gọi phải là trình soạn nhiều dòng');
assert.match(admin,/fundSupportBold/,'Trình soạn phải hỗ trợ chữ đậm');
assert.match(admin,/fundSupportSize/,'Trình soạn phải hỗ trợ đổi cỡ chữ');
assert.doesNotMatch(admin,/id="set_fund_support_title"/,'Admin không còn ô Tiêu đề riêng cho khối QR');
assert.doesNotMatch(admin,/id="set_fund_support_title_font_size"/,'Admin không còn cỡ chữ tiêu đề QR');
assert.doesNotMatch(html,/fundSupportTitle/,'Trang công khai không còn hiển thị Tiêu đề riêng của khối QR');
assert.match(app,/span\.textContent=token\.text/,'Nội dung định dạng công khai phải dựng bằng textContent an toàn');
assert.match(app,/fund_support_qr_url/,'Trang công khai phải nhận URL ảnh QR từ cài đặt');
assert.match(css,/\.fund-support:hover/,'Khối QR phải có hiệu ứng hover');
assert.match(css,/\.fund-support:hover \.fund-support-qr-frame/,'Ảnh QR phải có hiệu ứng khi hover');
assert.match(css,/\.brand-logo:hover/,'Logo góc trái phải phóng to khi trỏ chuột');
assert.match(css,/prefers-reduced-motion/,'Hiệu ứng phải tôn trọng reduced-motion');
assert.match(server,/fund_qr_image_data/,'API admin phải nhận ảnh QR');
assert.match(server,/fund_support_qr_path/,'API phải lưu đường dẫn QR');
assert.match(server,/readJson\(req, (?:20|80) \* 1024 \* 1024\)/,'Giới hạn request cài đặt phải đủ cho logo, QR và nhiều ảnh nhà thờ Tổ cùng lúc');
assert.match(db,/fund_support_enabled/,'DB phải có cài đặt bật tắt khối QR');
assert.match(db,/normalizeFundSupportContent/,'DB phải chuẩn hóa nội dung định dạng');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1017-'));
fs.mkdirSync(path.join(tmp,'lib'),{recursive:true});
for(const name of ['db.js','security.js'])fs.copyFileSync(path.join(root,'lib',name),path.join(tmp,'lib',name));
try{
  const {Store}=require(path.join(tmp,'lib','db.js'));
  const store=new Store();
  const actor=store.ensureAdmin('admin','Regression-Password-2026!',false);
  assert.equal(store.getSetting('fund_support_enabled'),'0','Khối QR mới phải mặc định ẩn cho đến khi admin bật');
  assert.equal(store.getSetting('fund_support_title'),'Ủng hộ quỹ dòng họ');
  const raw=JSON.stringify([
    {text:'Chung tay\n',bold:true,size:24},
    {text:'Ủng hộ <script>alert(1)</script>',bold:false,size:999},
    {text:'\u0001Dòng cuối',bold:true,size:16},
  ]);
  store.updateSettings({fund_support_enabled:'1',fund_support_title:' Quỹ Tiến Tộc ',fund_support_title_font_size:'99',fund_support_content:raw,fund_support_qr_path:'abc-123.png'},actor.id);
  assert.equal(store.getSetting('fund_support_enabled'),'1');
  assert.equal(store.getSetting('fund_support_title'),'Quỹ Tiến Tộc');
  assert.equal(store.getSetting('fund_support_title_font_size'),'44','Cỡ tiêu đề phải được chặn trong giới hạn');
  assert.equal(store.getSetting('fund_support_qr_path'),'qrcode/abc-123.png');
  const tokens=JSON.parse(store.getSetting('fund_support_content'));
  assert.equal(tokens[0].bold,true);
  assert.equal(tokens[0].size,24);
  assert.equal(tokens[1].size,16,'Cỡ chữ ngoài whitelist phải fallback 16px');
  assert.ok(tokens.some(x=>x.text.includes('<script>alert(1)</script>')),'DB giữ nguyên văn bản; frontend phải render bằng textContent chứ không thực thi HTML');
  assert.ok(!tokens.some(x=>x.text.includes('\u0001')),'Ký tự điều khiển phải bị loại bỏ');
  store.db.close();
  console.log('v1017-fund-support-regression: OK');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
