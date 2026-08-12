'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.version,'1.0.35','package.json phải ở v1.0.35');

const publicPages=['public/index.html','public/gallery.html','public/contact.html','public/contributions.html','public/news.html'];
for(const file of publicPages){
  const html=read(file);
  assert.match(html,/href="\/news\.html"/,`${file} phải có liên kết Tin tức`);
  assert.match(html,/data-shared-latest-news/,`${file} phải có khu vực 6 tin mới nhất dưới phần công khai`);
  assert.match(html,/styles\.css\?v=1\.0\.35/,`${file} phải dùng cache key v1.0.35`);
}
const newsHtml=read('public/news.html');
const newsJs=read('public/news.js');
const adminHtml=read('public/admin.html');
const adminJs=read('public/admin.js');
const publicUi=read('public/public-ui.js');
const server=read('server.js');
const dbCode=read('lib/db.js');
const css=read('public/styles.css');

assert.match(newsHtml,/id="newsPublicGrid"/,'Trang Tin tức phải có lưới bài viết');
assert.match(newsHtml,/id="newsPublicSearch"/,'Trang Tin tức phải có tìm kiếm');
assert.match(newsHtml,/id="newsPublicYear"/,'Trang Tin tức phải có lọc năm');
assert.match(newsHtml,/id="newsPagination"/,'Trang Tin tức phải có phân trang');
assert.match(newsHtml,/id="newsDetailView"/,'Trang Tin tức phải có chế độ đọc chi tiết');
assert.match(newsJs,/pageSize:12/,'Danh sách Tin tức phải phân trang 12 bài/trang');
assert.match(newsJs,/a\.content_html/,'Trang chi tiết phải hiển thị HTML đã được server lọc');

assert.match(adminHtml,/data-view="news"/,'Admin phải có menu Tin tức');
assert.match(adminHtml,/id="view-news"/,'Admin phải có view Tin tức');
assert.match(adminHtml,/id="newsModal"/,'Admin phải có modal thêm/sửa Tin tức');
assert.match(adminHtml,/id="newsContentEditor"[^>]*contenteditable="true"/,'Nội dung Tin tức phải dùng trình soạn thảo rich HTML');
for(const id of ['newsLinkBtn','newsImageBtn','newsTextColor','newsFontSelect','newsFontSize','newsBlockFormat']) assert.match(adminHtml,new RegExp(`id="${id}"`),`Thiếu công cụ editor ${id}`);
assert.match(adminHtml,/data-news-cmd="insertUnorderedList"/,'Editor phải hỗ trợ danh sách chấm');
assert.match(adminHtml,/data-news-cmd="insertOrderedList"/,'Editor phải hỗ trợ danh sách số');
assert.match(adminJs,/\/api\/admin\/news\/images/,'Editor phải upload ảnh nội dung qua API riêng');

assert.match(server,/pathname === '\/api\/public\/news'/,'Thiếu API danh sách Tin tức public');
assert.ok(server.includes('const publicNewsMatch=pathname.match(')&&server.includes("store.getNews(publicNewsMatch[1],{publicOnly:true})"),'Thiếu API chi tiết Tin tức public');
assert.match(server,/pathname === '\/api\/admin\/news'/,'Thiếu API quản trị Tin tức');
assert.match(server,/pathname === '\/api\/admin\/news\/images'/,'Thiếu API upload ảnh Tin tức');
assert.match(dbCode,/CREATE TABLE IF NOT EXISTS news/,'Database phải có bảng news');
assert.match(dbCode,/news:'news'/,'Upload layout phải có thư mục news riêng');
assert.match(dbCode,/BACKUP_TABLES\s*=.*'news'/,'Backup phải bao gồm bảng news');
assert.match(publicUi,/page_size=6/,'Khối tin mới nhất phải yêu cầu tối đa 6 tin');
assert.match(publicUi,/data-latest-news-grid/,'Khối tin mới nhất phải render vào lưới dùng chung');
assert.match(css,/\.news-public-grid\{/,'Thiếu giao diện lưới Tin tức');
assert.match(css,/\.news-article-content/,'Thiếu style nội dung bài Tin tức');
assert.match(css,/\.latest-news-grid\{/,'Thiếu giao diện 6 tin mới nhất');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gia-pha-v1034-news-'));
process.env.DATA_DIR=tmp;
let store;
try{
  const {Store}=require('../lib/db');
  store=new Store();
  const admin=store.ensureAdmin('admin','Regression-Password-2026!',false);
  const article=store.createNews({
    title:'Lễ giỗ Tổ dòng họ năm 2026',
    summary:'',
    content_html:'<h2 style="text-align:center;color:#7a4b18">Thông báo</h2><p>Xin kính mời <strong>bà con</strong> tham dự.</p><ul><li>Thời gian</li><li>Địa điểm</li></ul><p><a href="https://example.com" onclick="alert(1)">Xem bản đồ</a> <a href="javascript:alert(1)">xấu</a></p><script>alert(1)</script><iframe src="https://bad.example"></iframe>',
    published_date:'2026-08-10',
    is_public:true,
    sort_order:5
  },admin.id);
  assert.ok(article.id,'Phải tạo được bài Tin tức');
  assert.equal(article.slug,'le-gio-to-dong-ho-nam-2026','Slug phải bỏ dấu tiếng Việt');
  assert.match(article.content_html,/<h2[^>]*>Thông báo<\/h2>/,'HTML an toàn như tiêu đề phải được giữ');
  assert.match(article.content_html,/<ul><li>Thời gian<\/li><li>Địa điểm<\/li><\/ul>/,'Danh sách phải được giữ');
  assert.match(article.content_html,/href="https:\/\/example\.com"/,'Link HTTPS an toàn phải được giữ');
  assert.doesNotMatch(article.content_html,/onclick|javascript:|<script|<iframe/i,'HTML nguy hiểm phải bị loại bỏ');
  assert.match(article.summary,/Thông báo/,'Để trống tóm tắt phải tự sinh từ nội dung');
  assert.equal(article.cover_image_url,'/assets/logo.png','Không có ảnh phải fallback logo');

  const second=store.createNews({title:'Tin hoạt động tháng 7',summary:'Tin phụ',content_html:'<p>Nội dung phụ</p>',published_date:'2026-07-01',is_public:true,sort_order:0},admin.id);
  const hidden=store.createNews({title:'Tin nội bộ',summary:'Ẩn',content_html:'<p>Không công khai</p>',published_date:'2026-08-11',is_public:false,sort_order:99},admin.id);
  const publicList=store.listNews({publicOnly:true,full:false});
  assert.equal(publicList.length,2,'Public chỉ được thấy tin công khai đã đến ngày đăng');
  assert.equal(publicList[0].id,article.id,'Tin mới hơn phải đứng trước');
  assert.equal(publicList.some(x=>x.id===hidden.id),false,'Tin ẩn không được lộ ra public');
  assert.deepEqual(store.newsYears(),['2026'],'Phải tổng hợp được năm Tin tức');
  assert.equal(store.getNews(article.slug,{publicOnly:true}).id,article.id,'Chi tiết public phải đọc được bằng slug');

  const updated=store.updateNews(second.id,{title:'Tin hoạt động tháng Bảy',content_html:'<p>Nội dung đã cập nhật <em>đầy đủ</em>.</p>',published_date:'2026-07-02'},admin.id);
  assert.equal(updated.title,'Tin hoạt động tháng Bảy','Phải sửa được Tin tức');
  assert.match(updated.content_html,/<em>đầy đủ<\/em>/,'Định dạng nội dung sau sửa phải được giữ');
  assert.ok(store.deleteNews(hidden.id,admin.id),'Phải xóa được Tin tức');
  assert.equal(store.stats().news,2,'Dashboard phải đếm đúng số Tin tức còn lại');

  const backup=store.exportFullBackup();
  assert.ok(Array.isArray(backup.tables.news),'Backup JSON phải có bảng news');
  assert.equal(backup.tables.news.length,2,'Backup phải chứa đủ bản ghi Tin tức');
} finally {
  try{store?.close?.();}catch{}
  try{store?.db?.close?.();}catch{}
  fs.rmSync(tmp,{recursive:true,force:true});
}
console.log('v1034-news-regression: OK');
