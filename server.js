'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { URL } = require('node:url');

// Load .env before lib/db so DATA_DIR can also be configured outside Docker.
loadDotEnv(path.join(__dirname, '.env'));

const { Store, DATA_DIR, UPLOAD_DIR, UPLOAD_LAYOUT, uuid, safeUploadSegment, normalizeUploadPath, uploadUrl, uploadFullPath } = require('./lib/db');
const { createEncryptedBackup, decryptBackupToDirectory, inspectBackupFile, validateBackupPassword } = require('./lib/data-backup');
const { randomToken, sha256, verifyPassword, parseCookies, cookie, safeEqualText } = require('./lib/security');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT || 8787)));
const SESSION_DAYS = Math.max(1, Math.min(30, Number(process.env.SESSION_DAYS || 7)));
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '0') === '1';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '0') === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BACKUP_FILE_BYTES = Math.max(64, Math.min(4096, Number(process.env.MAX_BACKUP_MB || 1024))) * 1024 * 1024;
const RICH_SETTING_KEYS = ['tree_subtitle_content','tree_footer_content','gallery_intro_content','gallery_footer_content','fund_support_content','footer_author_content','contact_intro_content','contact_footer_content','contact_map_address_content','welcome_popup_content'];
const store = new Store();

const requestedAdminPassword = String(process.env.ADMIN_PASSWORD || '');
const generatedAdminPassword = requestedAdminPassword ? null : strongHumanPassword();
const adminInfo = store.ensureAdmin(
  String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin',
  requestedAdminPassword || generatedAdminPassword,
  !requestedAdminPassword,
);
store.seedDemoIfEmpty(adminInfo?.id || null);
store.cleanupSessions();

const loginAttempts = new Map();
const commentAttempts = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(res);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (pathname.startsWith('/uploads/')) {
      serveUpload(res, pathname);
      return;
    }
    serveStatic(res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Lỗi máy chủ nội bộ.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nCay Gia Pha Web dang chay tai: http://${HOST}:${PORT}`);
  console.log(`Trang quan tri: http://${HOST}:${PORT}/admin.html`);
  if (adminInfo) {
    console.log('\n=== TAI KHOAN QUAN TRI LAN DAU ===');
    console.log(`Username: ${adminInfo.username}`);
    console.log(`Password: ${adminInfo.password}`);
    if (adminInfo.generatedPassword) console.log(`Da luu tam tai: ${path.join(DATA_DIR, 'INITIAL_ADMIN.txt')}`);
    console.log('Hay dang nhap va doi mat khau ngay.\n');
  }
});

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;
  const sessionCtx = ensureSession(req, res);

  if (method === 'GET' && pathname === '/api/auth/me') {
    const s = sessionCtx.session;
    return json(res, 200, {
      authenticated: !!s?.user_id,
      csrf_token: s?.csrf_token || null,
      user: s?.user_id ? publicUser(s) : null,
    });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    requireCsrf(req, sessionCtx.session);
    const ip = clientIp(req);
    if (isRateLimited(loginAttempts, ip, 8, 10 * 60_000)) return json(res, 429, { error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.' });
    const body = await readJson(req, 64 * 1024);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const user = store.getUserByUsername(username);
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      recordAttempt(loginAttempts, ip);
      await delay(180 + Math.floor(Math.random() * 160));
      return json(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }
    clearAttempts(loginAttempts, ip);
    // Rotate the session token after authentication to prevent session fixation.
    store.deleteSession(sessionCtx.tokenHash);
    const loginToken = randomToken(32);
    const loginHash = sha256(loginToken);
    const loginCsrf = randomToken(24);
    const loginExpiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    store.createSession(loginHash, loginCsrf, loginExpiresAt, user.id);
    res.setHeader('Set-Cookie', cookie('ft_session', loginToken, { maxAge: SESSION_DAYS * 86400, secure: COOKIE_SECURE }));
    store.markLogin(user.id);
    store.audit(user.id, 'auth.login', 'session', null, `IP ${sha256(ip).slice(0, 16)}`);
    const fresh = store.getSession(loginHash);
    return json(res, 200, { ok: true, user: publicUser(fresh), csrf_token: fresh.csrf_token });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    requireCsrf(req, sessionCtx.session);
    if (sessionCtx.session?.user_id) store.audit(sessionCtx.session.user_id, 'auth.logout', 'session', null, null);
    store.deleteSession(sessionCtx.tokenHash);
    res.setHeader('Set-Cookie', cookie('ft_session', '', { maxAge: 0, secure: COOKIE_SECURE }));
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/auth/change-password') {
    const actor = requireAuth(req, res, sessionCtx); if (!actor) return;
    requireCsrf(req, sessionCtx.session);
    const body = await readJson(req, 64 * 1024);
    const current = String(body.current_password || '');
    const next = String(body.new_password || '');
    const validation = validatePassword(next);
    if (validation) return json(res, 400, { error: validation });
    const ok = store.changeOwnPassword(actor.id, current, next, verifyPassword);
    if (!ok) return json(res, 400, { error: 'Mật khẩu hiện tại không đúng.' });
    res.setHeader('Set-Cookie', cookie('ft_session', '', { maxAge: 0, secure: COOKIE_SECURE }));
    return json(res, 200, { ok: true, relogin: true });
  }

  if (method === 'GET' && pathname === '/api/public/traffic') {
    if (String(url.searchParams.get('record') || '') === '1') {
      store.recordPublicVisit(sessionCtx.tokenHash, sessionCtx.session?.user_id || null);
    }
    return json(res, 200, { traffic: store.trafficStats(5) });
  }

  if (method === 'GET' && pathname === '/api/public/tree') {
    const requestedBranch = String(url.searchParams.get('branch') || '').trim();
    const branches = store.listBranches({ publicOnly: true });
    let activeBranch = null;
    let people;
    if (requestedBranch) {
      activeBranch = store.getBranch(requestedBranch, { publicOnly: true });
      if (!activeBranch) return json(res, 404, { error: 'Không tìm thấy Chi gia phả công khai này.' });
      people = store.peopleForBranch(activeBranch.id, { publicOnly: true });
    } else {
      people = store.listPeople({ publicOnly: true });
    }
    return json(res, 200, {
      settings: publicSettings(store.settings()),
      people,
      branches,
      active_branch: activeBranch,
      stats: store.treeStats(people),
    });
  }
  if (method === 'GET' && pathname === '/api/public/gallery') {
    store.syncGalleryFromFilesystem();
    return json(res, 200, { settings: publicSettings(store.settings()), albums: store.listGalleryAlbums({ publicOnly:true }), videos: store.listGalleryVideos({ publicOnly:true }) });
  }
  const publicGalleryMatch = pathname.match(/^\/api\/public\/gallery\/([^/]+)$/);
  if (method === 'GET' && publicGalleryMatch) {
    store.syncGalleryFromFilesystem();
    const album = store.getGalleryAlbum(publicGalleryMatch[1], { publicOnly:true });
    if (!album) return json(res, 404, { error:'Không tìm thấy thư mục ảnh công khai này.' });
    return json(res, 200, { album, photos: store.listGalleryPhotos(album.id, { publicOnly:true }) });
  }
  if (method === 'GET' && pathname === '/api/public/contact') {
    return json(res, 200, { settings: publicSettings(store.settings()), contacts: store.listContacts({ publicOnly:true }) });
  }

  if (method === 'GET' && pathname === '/api/public/comments') {
    return json(res, 200, { comments: store.listComments(false, 200) });
  }
  if (method === 'POST' && pathname === '/api/public/comments') {
    if (store.getSetting('public_comments_enabled', '1') !== '1') return json(res, 403, { error: 'Bình luận công khai đang tắt.' });
    const ip = clientIp(req);
    if (isRateLimited(commentAttempts, ip, 8, 10 * 60_000)) return json(res, 429, { error: 'Bạn gửi bình luận quá nhanh. Vui lòng thử lại sau.' });
    const body = await readJson(req, 24 * 1024);
    const actor = sessionCtx.session?.user_id ? store.getUserById(sessionCtx.session.user_id) : null;
    const displayName = actor ? actor.display_name : sanitizeText(body.display_name, 60);
    const message = sanitizeText(body.message, 600);
    if (displayName.length < 2) return json(res, 400, { error: 'Vui lòng nhập tên hiển thị từ 2 ký tự.' });
    if (message.length < 1) return json(res, 400, { error: 'Bình luận không được để trống.' });
    recordAttempt(commentAttempts, ip);
    const created = store.addComment(displayName, message, actor?.id || null, sha256(ip));
    return json(res, 201, { comment: created });
  }

  if (pathname.startsWith('/api/admin/')) {
    const actor = requireAuth(req, res, sessionCtx); if (!actor) return;
    if (['POST','PUT','PATCH','DELETE'].includes(method)) requireCsrf(req, sessionCtx.session);

    if (method === 'GET' && pathname === '/api/admin/dashboard') {
      return json(res, 200, { stats: store.stats(), settings: store.settings(), recent_audit: actor.role === 'admin' ? store.listAudit(20) : [] });
    }
    if (method === 'GET' && pathname === '/api/admin/people') {
      if (!hasRole(actor, ['admin','editor','viewer'])) return forbidden(res);
      return json(res, 200, { people: store.listPeople({ publicOnly: false }) });
    }
    if (method === 'POST' && pathname === '/api/admin/people') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const body = await readJson(req, 8 * 1024 * 1024);
      try {
        body.image_path = saveImageData(body.image_data, null, UPLOAD_LAYOUT.profiles);
        delete body.image_data;
        const person = store.createPerson(body, actor.id);
        return json(res, 201, { person });
      } catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
    }
    const personMatch = pathname.match(/^\/api\/admin\/people\/([^/]+)$/);
    if (personMatch && method === 'PUT') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const id = personMatch[1]; const current = store.getPerson(id); if (!current) return json(res, 404, { error: 'Không tìm thấy cá thể.' });
      const body = await readJson(req, 8 * 1024 * 1024); let newImage=''; let removeOld=false;
      try {
        if (body.remove_image) { body.image_path = null; removeOld=!!current.image_path; }
        else if (body.image_data) { newImage=writeImageData(body.image_data,UPLOAD_LAYOUT.profiles); body.image_path=newImage; removeOld=!!current.image_path; }
        delete body.image_data; delete body.remove_image;
        const person = store.updatePerson(id, body, actor.id);
        if(removeOld && current.image_path!==body.image_path)deleteImageFile(current.image_path);
        return json(res, 200, { person });
      } catch (e) { if(newImage)deleteImageFile(newImage); return json(res, 400, { error: friendlyDbError(e) }); }
    }
    if (personMatch && method === 'DELETE') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const ok = store.deletePerson(personMatch[1], actor.id);
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Không tìm thấy cá thể.' });
    }

    if (method === 'GET' && pathname === '/api/admin/branches') {
      if (!hasRole(actor, ['admin','editor','viewer'])) return forbidden(res);
      return json(res, 200, { branches: store.listBranches({ publicOnly: false }) });
    }
    if (method === 'POST' && pathname === '/api/admin/branches') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const body = await readJson(req, 128 * 1024);
      try { return json(res, 201, { branch: store.createBranch(body, actor.id) }); }
      catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
    }
    const branchMatch = pathname.match(/^\/api\/admin\/branches\/([^/]+)$/);
    if (branchMatch && method === 'PUT') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const body = await readJson(req, 128 * 1024);
      try {
        const branch = store.updateBranch(branchMatch[1], body, actor.id);
        return branch ? json(res, 200, { branch }) : json(res, 404, { error: 'Không tìm thấy Chi gia phả.' });
      } catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
    }
    if (branchMatch && method === 'DELETE') {
      if (!hasRole(actor, ['admin','editor'])) return forbidden(res);
      const ok = store.deleteBranch(branchMatch[1], actor.id);
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Không tìm thấy Chi gia phả.' });
    }

    if (method === 'GET' && pathname === '/api/admin/gallery') {
      if (!canManageGallery(actor)) return forbidden(res);
      store.syncGalleryFromFilesystem();
      return json(res, 200, { albums: store.listGalleryAlbums({ publicOnly:false }), videos: store.listGalleryVideos({ publicOnly:false }), can_delete: actor.role === 'admin' });
    }
    if (method === 'POST' && pathname === '/api/admin/gallery/albums') {
      if (!canManageGallery(actor)) return forbidden(res);
      const body = await readJson(req, 256 * 1024);
      try { return json(res, 201, { album: store.createGalleryAlbum(body, actor.id) }); }
      catch (e) { return json(res, 400, { error:friendlyDbError(e) }); }
    }
    const galleryAlbumMatch = pathname.match(/^\/api\/admin\/gallery\/albums\/([^/]+)$/);
    if (galleryAlbumMatch && method === 'PUT') {
      if (!canManageGallery(actor)) return forbidden(res);
      const body = await readJson(req, 256 * 1024);
      try { const album=store.updateGalleryAlbum(galleryAlbumMatch[1],body,actor.id); return album?json(res,200,{album}):json(res,404,{error:'Không tìm thấy thư mục ảnh.'}); }
      catch (e) { return json(res, 400, { error:friendlyDbError(e) }); }
    }
    if (galleryAlbumMatch && method === 'DELETE') {
      if (!hasRole(actor,['admin'])) return forbidden(res);
      const deleted=store.deleteGalleryAlbum(galleryAlbumMatch[1],actor.id);
      if(!deleted)return json(res,404,{error:'Không tìm thấy thư mục ảnh.'});
      for(const imagePath of deleted.image_paths||[])deleteImageFile(imagePath);
      deleteGalleryAlbumFolder(deleted.storage_folder);
      return json(res,200,{ok:true});
    }
    const galleryPhotosMatch = pathname.match(/^\/api\/admin\/gallery\/albums\/([^/]+)\/photos$/);
    if (galleryPhotosMatch && method === 'GET') {
      if (!canManageGallery(actor)) return forbidden(res);
      store.syncGalleryFromFilesystem();
      const album=store.getGalleryAlbum(galleryPhotosMatch[1]);
      if(!album)return json(res,404,{error:'Không tìm thấy thư mục ảnh.'});
      return json(res,200,{album,photos:store.listGalleryPhotos(album.id),can_delete:actor.role==='admin'});
    }
    if (method === 'POST' && pathname === '/api/admin/gallery/photos') {
      if (!canManageGallery(actor)) return forbidden(res);
      const body=await readJson(req,8*1024*1024); let newImage='';
      try {
        const album=store.getGalleryAlbumRaw(String(body.album_id||'')); if(!album)return json(res,404,{error:'Không tìm thấy thư mục ảnh.'});
        const albumDir=store.galleryAlbumUploadDir(album);
        newImage=writeImageData(body.image_data,albumDir); delete body.image_data; body.image_path=newImage;
        const photo=store.createGalleryPhoto(body,actor.id); return json(res,201,{photo});
      } catch(e) { if(newImage)deleteImageFile(newImage); return json(res,400,{error:friendlyDbError(e)}); }
    }
    const galleryPhotoMatch = pathname.match(/^\/api\/admin\/gallery\/photos\/([^/]+)$/);
    if (galleryPhotoMatch && method === 'PUT') {
      if (!canManageGallery(actor)) return forbidden(res);
      const current=store.getGalleryPhotoRaw(galleryPhotoMatch[1]); if(!current)return json(res,404,{error:'Không tìm thấy ảnh.'});
      const body=await readJson(req,8*1024*1024); let newImage=''; let movedImage='';
      const targetAlbumId=String(body.album_id||current.album_id); const targetAlbum=store.getGalleryAlbumRaw(targetAlbumId); if(!targetAlbum)return json(res,404,{error:'Không tìm thấy thư mục ảnh.'});
      const targetDir=store.galleryAlbumUploadDir(targetAlbum);
      try {
        if(body.image_data){newImage=writeImageData(body.image_data,targetDir);body.image_path=newImage;}
        else if(targetAlbumId!==current.album_id){movedImage=moveImageFile(current.image_path,targetDir);body.image_path=movedImage;}
        delete body.image_data;
        const photo=store.updateGalleryPhoto(galleryPhotoMatch[1],body,actor.id);
        if(newImage&&current.image_path!==newImage)deleteImageFile(current.image_path);
        return json(res,200,{photo});
      } catch(e){
        if(newImage)deleteImageFile(newImage);
        if(movedImage){try{moveImageFile(movedImage,path.posix.dirname(normalizeUploadPath(current.image_path)),path.basename(normalizeUploadPath(current.image_path)));}catch{}}
        return json(res,400,{error:friendlyDbError(e)});
      }
    }
    if (galleryPhotoMatch && method === 'DELETE') {
      if (!hasRole(actor,['admin'])) return forbidden(res);
      const deleted=store.deleteGalleryPhoto(galleryPhotoMatch[1],actor.id);
      if(!deleted)return json(res,404,{error:'Không tìm thấy ảnh.'});
      deleteImageFile(deleted.image_path); return json(res,200,{ok:true});
    }
    if (method === 'POST' && pathname === '/api/admin/gallery/videos') {
      if (!canManageGallery(actor)) return forbidden(res);
      const body=await readJson(req,256*1024); const yt=extractYouTubeId(body.youtube_url); if(!yt)return json(res,400,{error:'Link YouTube không hợp lệ. Hỗ trợ youtube.com/watch, youtu.be, shorts và embed.'});
      try { body.youtube_id=yt; return json(res,201,{video:store.createGalleryVideo(body,actor.id)}); } catch(e){ return json(res,400,{error:friendlyDbError(e)}); }
    }
    const galleryVideoMatch=pathname.match(/^\/api\/admin\/gallery\/videos\/([^/]+)$/);
    if (galleryVideoMatch && method === 'PUT') {
      if (!canManageGallery(actor)) return forbidden(res);
      const body=await readJson(req,256*1024); if(body.youtube_url!==undefined){const yt=extractYouTubeId(body.youtube_url);if(!yt)return json(res,400,{error:'Link YouTube không hợp lệ.'});body.youtube_id=yt;}
      try { const video=store.updateGalleryVideo(galleryVideoMatch[1],body,actor.id); return video?json(res,200,{video}):json(res,404,{error:'Không tìm thấy video.'}); } catch(e){ return json(res,400,{error:friendlyDbError(e)}); }
    }
    if (galleryVideoMatch && method === 'DELETE') {
      if (!canManageGallery(actor)) return forbidden(res);
      const deleted=store.deleteGalleryVideo(galleryVideoMatch[1],actor.id); return deleted?json(res,200,{ok:true}):json(res,404,{error:'Không tìm thấy video.'});
    }

    if (method === 'GET' && pathname === '/api/admin/contacts') {
      if (!hasRole(actor,['admin'])) return forbidden(res);
      return json(res,200,{contacts:store.listContacts({publicOnly:false})});
    }
    if (method === 'POST' && pathname === '/api/admin/contacts') {
      if (!hasRole(actor,['admin'])) return forbidden(res);
      const body=await readJson(req,8*1024*1024); let image='';
      try { if(body.image_data){image=writeImageData(body.image_data,UPLOAD_LAYOUT.contacts);body.image_path=image;} delete body.image_data; return json(res,201,{contact:store.createContact(body,actor.id)}); } catch(e){if(image)deleteImageFile(image);return json(res,400,{error:friendlyDbError(e)});}
    }
    const contactMatch=pathname.match(/^\/api\/admin\/contacts\/([^/]+)$/);
    if(contactMatch && method==='PUT'){
      if(!hasRole(actor,['admin']))return forbidden(res); const current=store.getContactRaw(contactMatch[1]);if(!current)return json(res,404,{error:'Không tìm thấy người liên hệ.'}); const body=await readJson(req,8*1024*1024);let image='';
      try{if(body.remove_image)body.image_path='';else if(body.image_data){image=writeImageData(body.image_data,UPLOAD_LAYOUT.contacts);body.image_path=image;}delete body.image_data;delete body.remove_image;const contact=store.updateContact(contactMatch[1],body,actor.id);if(image&&current.image_path&&current.image_path!==image)deleteImageFile(current.image_path);if(body.image_path===''&&current.image_path)deleteImageFile(current.image_path);return json(res,200,{contact});}catch(e){if(image)deleteImageFile(image);return json(res,400,{error:friendlyDbError(e)});}
    }
    if(contactMatch && method==='DELETE'){
      if(!hasRole(actor,['admin']))return forbidden(res);const deleted=store.deleteContact(contactMatch[1],actor.id);if(!deleted)return json(res,404,{error:'Không tìm thấy người liên hệ.'});if(deleted.image_path)deleteImageFile(deleted.image_path);return json(res,200,{ok:true});
    }

    if (method === 'GET' && pathname === '/api/admin/comments') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      return json(res, 200, { comments: store.listComments(true, 0) });
    }
    const commentMatch = pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
    if (commentMatch && method === 'DELETE') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const ok = store.deleteComment(commentMatch[1], actor.id);
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Không tìm thấy bình luận.' });
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      return json(res, 200, { users: store.listUsers() });
    }
    if (method === 'POST' && pathname === '/api/admin/users') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const body = await readJson(req, 64 * 1024);
      const issue = validateUserInput(body, true); if (issue) return json(res, 400, { error: issue });
      try { return json(res, 201, { user: publicUser(store.createUser(body, actor.id)) }); }
      catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
    }
    const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch && method === 'PUT') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const id = userMatch[1]; const current = store.getUserById(id); if (!current) return json(res, 404, { error: 'Không tìm thấy user.' });
      const body = await readJson(req, 64 * 1024);
      if (id === actor.id && body.is_active === false) return json(res, 400, { error: 'Bạn không thể tự khóa tài khoản đang dùng.' });
      if (id === actor.id && body.role && body.role !== 'admin') return json(res, 400, { error: 'Bạn không thể tự hạ quyền admin của chính mình.' });
      const issue = validateUserInput({ ...current, ...body }, false); if (issue) return json(res, 400, { error: issue });
      if (body.password) { const pIssue = validatePassword(String(body.password)); if (pIssue) return json(res, 400, { error: pIssue }); }
      try { return json(res, 200, { user: publicUser(store.updateUser(id, body, actor.id)) }); }
      catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
    }

    if (method === 'GET' && pathname === '/api/admin/settings') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      return json(res, 200, { settings: store.settings() });
    }
    if (method === 'PUT' && pathname === '/api/admin/settings') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const body = await readJson(req, 80 * 1024 * 1024);
      const oldLogo = store.getSetting('site_logo_path','');
      const oldQr = store.getSetting('fund_support_qr_path','');
      const legacyTemple = store.getSetting('contact_temple_image_path','');
      const oldTemplePaths = [...new Set([...settingPathArray(store.getSetting('contact_temple_image_paths','[]')), ...(legacyTemple?[legacyTemple]:[])])].filter((p)=>normalizeUploadPath(p)?.startsWith(`${UPLOAD_LAYOUT.temple}/`)).slice(0,10);
      const oldRichPaths = collectRichImagePathsFromSettings(store.settings());
      const createdFiles = [];
      try {
        if (body.remove_logo) body.site_logo_path='';
        else if (body.logo_image_data) { body.site_logo_path=writeImageData(body.logo_image_data,UPLOAD_LAYOUT.logo); createdFiles.push(body.site_logo_path); }
        if (body.remove_fund_qr) body.fund_support_qr_path='';
        else if (body.fund_qr_image_data) { body.fund_support_qr_path=writeImageData(body.fund_qr_image_data,UPLOAD_LAYOUT.qrcode); createdFiles.push(body.fund_support_qr_path); }
        const removeTemple = new Set(settingPathArray(body.remove_contact_temple_images).map(normalizeUploadPath).filter(Boolean));
        let nextTemplePaths = oldTemplePaths.filter((p)=>!removeTemple.has(p));
        const templeUploads = Array.isArray(body.contact_temple_image_data_list)?body.contact_temple_image_data_list.slice(0,10):[];
        if (nextTemplePaths.length + templeUploads.length > 10) throw new Error('Không gian thờ tự chỉ được tối đa 10 ảnh.');
        for (const data of templeUploads) { const rel=writeImageData(data,UPLOAD_LAYOUT.temple); createdFiles.push(rel); nextTemplePaths.push(rel); }
        nextTemplePaths=[...new Set(nextTemplePaths)].slice(0,10);
        body.contact_temple_image_paths=JSON.stringify(nextTemplePaths);
        body.contact_temple_image_path=nextTemplePaths[0]||'';
        for (const key of RICH_SETTING_KEYS) if (body[key] !== undefined) body[key] = materializeRichImages(body[key], createdFiles);
        delete body.logo_image_data; delete body.remove_logo; delete body.fund_qr_image_data; delete body.remove_fund_qr; delete body.contact_temple_image_data; delete body.remove_contact_temple_image; delete body.contact_temple_image_data_list; delete body.remove_contact_temple_images;
        const settings = store.updateSettings(body, actor.id);
        const keptTemple=new Set(settingPathArray(settings.contact_temple_image_paths));
        if (oldLogo && settings.site_logo_path !== oldLogo && settings.fund_support_qr_path !== oldLogo && !keptTemple.has(oldLogo)) deleteImageFile(oldLogo);
        if (oldQr && settings.fund_support_qr_path !== oldQr && settings.site_logo_path !== oldQr && !keptTemple.has(oldQr)) deleteImageFile(oldQr);
        for (const oldTemple of oldTemplePaths) if (!keptTemple.has(oldTemple)) deleteImageFile(oldTemple);
        const keptRichPaths=collectRichImagePathsFromSettings(settings); for(const oldPath of oldRichPaths) if(!keptRichPaths.has(oldPath)) deleteImageFile(oldPath);
        return json(res, 200, { settings });
      } catch (e) {
        for (const file of createdFiles) deleteImageFile(file);
        return json(res, 400, { error: friendlyDbError(e) });
      }
    }
    if (method === 'GET' && pathname === '/api/admin/audit') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      return json(res, 200, { audit: store.listAudit(0) });
    }
    if (method === 'POST' && pathname === '/api/admin/backup/export') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const body = await readJson(req, 32 * 1024);
      let snapshot = null;
      const backupFile = path.join(os.tmpdir(), `cay-gia-pha-${uuid()}.gpbak`);
      try {
        const password = validateBackupPassword(String(body.password || ''));
        snapshot = store.createDataSnapshot();
        await createEncryptedBackup(snapshot.dataDir, password, backupFile);
        store.audit(actor.id, 'backup.export', 'backup', null, JSON.stringify({ mode:'data-folder-encrypted', gallery_excluded:true }));
        if (snapshot?.holder) { fs.rmSync(snapshot.holder, { recursive:true, force:true }); snapshot = null; }
        return downloadFileAndDelete(res, backupFile, 'application/octet-stream', `gia-pha-data-${dateStamp()}.gpbak`);
      } catch (e) {
        try { fs.rmSync(backupFile, { force:true }); } catch {}
        if (snapshot?.holder) { try { fs.rmSync(snapshot.holder, { recursive:true, force:true }); } catch {} }
        return json(res, 400, { error: friendlyDbError(e) });
      }
    }
    if (method === 'POST' && pathname === '/api/admin/backup/restore') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      const incoming = path.join(os.tmpdir(), `cay-gia-pha-upload-${uuid()}.gpbak`);
      const stagingHolder = path.join(path.dirname(DATA_DIR), `.data-restore-stage-${uuid()}`);
      const stagedData = path.join(stagingHolder, 'data');
      try {
        const password = decodeBackupPasswordHeader(req.headers['x-backup-password-b64']);
        validateBackupPassword(password);
        await readBodyToFile(req, incoming, MAX_BACKUP_FILE_BYTES);
        if (!inspectBackupFile(incoming)) throw new Error('Tệp này không phải bản sao lưu data mã hóa của Cây Gia Phả Web v1.0.16 trở lên.');
        fs.mkdirSync(stagingHolder, { recursive:false, mode:0o700 });
        await decryptBackupToDirectory(incoming, password, stagedData);
        const result = store.restoreDataDirectory(stagedData, actor.id, sessionCtx.tokenHash);
        return json(res, 200, result);
      } catch (e) { return json(res, 400, { error: friendlyDbError(e) }); }
      finally {
        try { fs.rmSync(incoming, { force:true }); } catch {}
        try { if (fs.existsSync(stagingHolder)) fs.rmSync(stagingHolder, { recursive:true, force:true }); } catch {}
      }
    }
    if (method === 'GET' && pathname === '/api/admin/export/gedcom') {
      if (!hasRole(actor, ['admin'])) return forbidden(res);
      store.audit(actor.id, 'export.gedcom', 'backup', null, null);
      return download(res, store.exportGedcom(), 'text/plain; charset=utf-8', `gia-pha-${dateStamp()}.ged`);
    }
    return json(res, 404, { error: 'API không tồn tại.' });
  }

  return json(res, 404, { error: 'API không tồn tại.' });
}

function ensureSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let rawToken = cookies.ft_session || '';
  let tokenHash = rawToken ? sha256(rawToken) : '';
  let session = tokenHash ? store.getSession(tokenHash) : null;
  if (!session) {
    rawToken = randomToken(32);
    tokenHash = sha256(rawToken);
    const csrfToken = randomToken(24);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    store.createSession(tokenHash, csrfToken, expiresAt, null);
    session = store.getSession(tokenHash);
    res.setHeader('Set-Cookie', cookie('ft_session', rawToken, { maxAge: SESSION_DAYS * 86400, secure: COOKIE_SECURE }));
  }
  return { rawToken, tokenHash, session };
}

function requireAuth(req, res, ctx) {
  const s = ctx.session;
  if (!s?.user_id || !s?.is_active) { json(res, 401, { error: 'Bạn cần đăng nhập.' }); return null; }
  return { id:s.user_id, username:s.username, display_name:s.display_name, role:s.role, can_manage_gallery:!!s.can_manage_gallery, must_change_password:!!s.must_change_password };
}
function hasRole(actor, roles) { return !!actor && roles.includes(actor.role); }
function canManageGallery(actor) { return !!actor && (actor.role === 'admin' || !!actor.can_manage_gallery); }
function forbidden(res) { return json(res, 403, { error: 'Bạn không có quyền thực hiện thao tác này.' }); }
function requireCsrf(req, session) {
  const got = String(req.headers['x-csrf-token'] || '');
  if (!session?.csrf_token || !got || !safeEqualText(got, session.csrf_token)) {
    const err = new Error('CSRF token không hợp lệ. Hãy tải lại trang.'); err.statusCode = 403; throw err;
  }
}

async function readJson(req, limitBytes) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('application/json')) { const e=new Error('Content-Type phải là application/json.'); e.statusCode=415; throw e; }
  let size=0; const chunks=[];
  for await (const chunk of req) { size += chunk.length; if (size > limitBytes) { const e=new Error('Dữ liệu gửi lên quá lớn.'); e.statusCode=413; throw e; } chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const e=new Error('JSON không hợp lệ.'); e.statusCode=400; throw e; }
}

async function readBodyToFile(req, targetFile, limitBytes) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type && !type.startsWith('application/octet-stream') && !type.startsWith('application/x-cay-gia-pha-backup')) {
    const e = new Error('Tệp restore phải được gửi ở dạng dữ liệu nhị phân.'); e.statusCode = 415; throw e;
  }
  const out = fs.createWriteStream(targetFile, { flags:'wx', mode:0o600 });
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limitBytes) { const e = new Error(`Tệp sao lưu vượt giới hạn ${Math.round(limitBytes/1024/1024)} MB.`); e.statusCode = 413; throw e; }
      if (!out.write(chunk)) await new Promise((resolve, reject) => { out.once('drain', resolve); out.once('error', reject); });
    }
    await new Promise((resolve, reject) => { out.end(resolve); out.once('error', reject); });
    if (!size) throw new Error('Tệp sao lưu rỗng.');
    return size;
  } catch (error) {
    try { out.destroy(); } catch {}
    try { fs.rmSync(targetFile, { force:true }); } catch {}
    throw error;
  }
}

function decodeBackupPasswordHeader(value) {
  const raw = String(value || '');
  if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error('Thiếu mật khẩu để mở tệp backup.');
  try { return Buffer.from(raw, 'base64').toString('utf8'); }
  catch { throw new Error('Mật khẩu backup không hợp lệ.'); }
}

function json(res, status, payload) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
function download(res, content, contentType, filename) {
  res.statusCode=200; res.setHeader('Content-Type',contentType); res.setHeader('Content-Disposition',`attachment; filename="${filename}"`); res.setHeader('Cache-Control','no-store'); res.end(content);
}
function downloadFileAndDelete(res, filePath, contentType, filename) {
  const cleanup = () => { try { fs.rmSync(filePath, { force:true }); } catch {} };
  try {
    const stat = fs.statSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => { cleanup(); if (!res.headersSent) json(res, 500, { error:'Không thể đọc tệp backup.' }); else res.destroy(error); });
    res.on('close', cleanup);
    res.on('finish', cleanup);
    stream.pipe(res);
  } catch (error) { cleanup(); throw error; }
}
function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/admin') rel = '/admin.html';
  const target = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!target.startsWith(PUBLIC_DIR + path.sep)) return text404(res);
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return text404(res);
    res.statusCode=200; res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', path.extname(target)==='.html'?'no-cache':'public, max-age=3600');
    fs.createReadStream(target).pipe(res);
  });
}
function serveUpload(res, pathname) {
  let requested=''; try{requested=decodeURIComponent(pathname.slice('/uploads/'.length));}catch{return text404(res);}
  const rel=normalizeUploadPath(requested);
  if(!rel)return text404(res);
  const allowed=[`${UPLOAD_LAYOUT.logo}/`,`${UPLOAD_LAYOUT.qrcode}/`,`${UPLOAD_LAYOUT.profiles}/`,`${UPLOAD_LAYOUT.gallery}/`,`${UPLOAD_LAYOUT.contacts}/`,`${UPLOAD_LAYOUT.temple}/`,`${UPLOAD_LAYOUT.richtext}/`];
  if(!allowed.some((prefix)=>rel.startsWith(prefix)))return text404(res);
  const target=uploadFullPath(rel);
  if(!target||!fs.existsSync(target)||!fs.statSync(target).isFile())return text404(res);
  res.statusCode=200; res.setHeader('Content-Type',MIME[path.extname(target).toLowerCase()]||'application/octet-stream'); res.setHeader('Cache-Control','public, max-age=86400'); fs.createReadStream(target).pipe(res);
}
function text404(res){ res.statusCode=404; res.setHeader('Content-Type','text/plain; charset=utf-8'); res.end('404 - Khong tim thay'); }

function safeUploadDir(relativeDir) {
  const rel=String(relativeDir||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
  if(!rel||rel.split('/').some((part)=>!safeUploadSegment(part)))throw new Error('Thư mục upload không hợp lệ.');
  const full=path.resolve(UPLOAD_DIR,...rel.split('/')),root=path.resolve(UPLOAD_DIR)+path.sep;
  if(!full.startsWith(root))throw new Error('Thư mục upload không hợp lệ.');
  fs.mkdirSync(full,{recursive:true}); return {rel,full};
}
function writeImageData(dataUrl, relativeDir) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Ảnh phải là PNG, JPG hoặc WEBP.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length < 12 || buffer.length > 5 * 1024 * 1024) throw new Error('Ảnh phải nhỏ hơn 5 MB.');
  if (!isValidImageMagic(buffer, match[1])) throw new Error('Nội dung tệp ảnh không hợp lệ.');
  const ext = match[1] === 'image/png' ? '.png' : match[1] === 'image/webp' ? '.webp' : '.jpg';
  const dir=safeUploadDir(relativeDir); const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir.full, filename), buffer, { flag:'wx', mode:0o600 });
  return `${dir.rel}/${filename}`;
}
function saveImageData(dataUrl, oldPath, relativeDir) {
  if (!dataUrl) return oldPath || null;
  const filename = writeImageData(dataUrl,relativeDir);
  if (oldPath) deleteImageFile(oldPath);
  return filename;
}
function deleteImageFile(filePath){ if(!filePath)return; try{const full=uploadFullPath(filePath);if(full&&fs.existsSync(full))fs.unlinkSync(full);}catch{} }
function moveImageFile(filePath,targetDir,preferredName=''){
  const sourceRel=normalizeUploadPath(filePath); if(!sourceRel)throw new Error('Đường dẫn ảnh nguồn không hợp lệ.');
  const source=uploadFullPath(sourceRel); if(!source||!fs.existsSync(source))throw new Error('Không tìm thấy tệp ảnh nguồn.');
  const dir=safeUploadDir(targetDir); const ext=path.extname(sourceRel).toLowerCase();
  let filename=preferredName&&/^[a-f0-9-]+\.(?:png|jpg|jpeg|webp)$/i.test(preferredName)?preferredName:path.basename(sourceRel);
  let dest=path.join(dir.full,filename); if(path.resolve(dest)===path.resolve(source))return sourceRel;
  if(fs.existsSync(dest)){filename=`${crypto.randomUUID()}${ext}`;dest=path.join(dir.full,filename);}
  fs.renameSync(source,dest); return `${dir.rel}/${filename}`;
}
function deleteGalleryAlbumFolder(storageFolder){
  const folder=String(storageFolder||''); if(!safeUploadSegment(folder))return;
  const target=path.join(UPLOAD_DIR,UPLOAD_LAYOUT.gallery,folder); try{fs.rmSync(target,{recursive:true,force:true});}catch{}
}
function isValidImageMagic(buf,mime){ if(mime==='image/png') return buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])); if(mime==='image/jpeg') return buf[0]===0xff&&buf[1]===0xd8&&buf[buf.length-2]===0xff&&buf[buf.length-1]===0xd9; if(mime==='image/webp') return buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP'; return false; }

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://i.ytimg.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function clientIp(req){ if(TRUST_PROXY){ const f=String(req.headers['x-forwarded-for']||'').split(',')[0].trim(); if(f)return f; } return req.socket.remoteAddress || 'unknown'; }
function recordAttempt(map,key){ const now=Date.now(); const arr=(map.get(key)||[]).filter((t)=>now-t<10*60_000); arr.push(now); map.set(key,arr); }
function clearAttempts(map,key){ map.delete(key); }
function isRateLimited(map,key,max,windowMs){ const now=Date.now(); const arr=(map.get(key)||[]).filter((t)=>now-t<windowMs); map.set(key,arr); return arr.length>=max; }
function delay(ms){ return new Promise((r)=>setTimeout(r,ms)); }
function sanitizeText(v,max){ return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }
function extractYouTubeId(value){const raw=String(value||'').trim();if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;try{const u=new URL(raw);const h=u.hostname.toLowerCase().replace(/^www\./,'');let id='';if(h==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';else if(h==='youtube.com'||h==='m.youtube.com'||h==='music.youtube.com'||h==='youtube-nocookie.com'){id=u.searchParams.get('v')||'';if(!id){const parts=u.pathname.split('/').filter(Boolean);const i=parts.findIndex(x=>['embed','shorts','live'].includes(x));if(i>=0)id=parts[i+1]||'';}}return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';}catch{return '';}}
function validatePassword(p){ if(p.length<12)return 'Mật khẩu mới cần ít nhất 12 ký tự.'; if(p.length>200)return 'Mật khẩu quá dài.'; if(!/[A-Za-zÀ-ỹ]/u.test(p)||!/[0-9]/.test(p))return 'Mật khẩu nên có chữ và số.'; return null; }
function validateUserInput(body,isNew){ const u=String(body.username||'').trim(); if(isNew&&!/^[a-zA-Z0-9._-]{3,40}$/.test(u))return 'Username cần 3-40 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.'; if(!String(body.display_name||'').trim())return 'Tên hiển thị không được để trống.'; if(!['admin','editor','viewer'].includes(body.role))return 'Role không hợp lệ.'; if(isNew){ const p=validatePassword(String(body.password||'')); if(p)return p; } return null; }
function publicUser(u){ if(!u)return null; return { id:u.id||u.user_id, username:u.username, display_name:u.display_name, role:u.role, is_active:u.is_active==null?true:!!u.is_active, can_manage_gallery:u.role==='admin'||!!u.can_manage_gallery, must_change_password:!!u.must_change_password, last_login_at:u.last_login_at||null }; }
function settingPathArray(value){ if(Array.isArray(value))return value.map(String).filter(Boolean);try{const parsed=JSON.parse(String(value||'[]'));return Array.isArray(parsed)?parsed.map(String).filter(Boolean):[];}catch{return [];} }
function parseRichArray(value){try{const a=JSON.parse(String(value||'[]'));return Array.isArray(a)?a:[];}catch{return [];}}
function collectRichImagePaths(value){const out=new Set();for(const item of parseRichArray(value)){if(item?.type!=='image')continue;const rel=normalizeUploadPath(item.image_path);if(rel&&rel.startsWith(`${UPLOAD_LAYOUT.richtext}/`))out.add(rel);}return out;}
function collectRichImagePathsFromSettings(settings){const out=new Set();for(const key of RICH_SETTING_KEYS)for(const rel of collectRichImagePaths(settings?.[key]))out.add(rel);return out;}
function materializeRichImages(value,createdFiles){const items=parseRichArray(value),out=[];for(const item of items.slice(0,800)){if(!item||typeof item!=='object')continue;if(item.type==='image'){let rel=normalizeUploadPath(item.image_path);if(item.image_data){rel=writeImageData(item.image_data,UPLOAD_LAYOUT.richtext);createdFiles.push(rel);}if(!rel||!rel.startsWith(`${UPLOAD_LAYOUT.richtext}/`))continue;out.push({type:'image',image_path:rel,alt:String(item.alt||'').slice(0,240),width:[25,33,50,66,75,100].includes(Number(item.width))?Number(item.width):100,align:['left','center','right','justify'].includes(String(item.align||''))?String(item.align):'center'});continue;}out.push(item);}return JSON.stringify(out);}
function publicRichContent(value){const out=[];for(const item of parseRichArray(value).slice(0,800)){if(item?.type==='image'){const rel=normalizeUploadPath(item.image_path);if(!rel||!rel.startsWith(`${UPLOAD_LAYOUT.richtext}/`))continue;const copy={...item,image_url:uploadUrl(rel)||''};delete copy.image_path;out.push(copy);}else out.push(item);}return JSON.stringify(out);}
function publicSettings(s){ const templePaths=[...new Set([...settingPathArray(s.contact_temple_image_paths), ...(s.contact_temple_image_path?[s.contact_temple_image_path]:[])])].map(normalizeUploadPath).filter((p)=>p&&p.startsWith(`${UPLOAD_LAYOUT.temple}/`)).slice(0,10); const templeUrls=templePaths.map(uploadUrl).filter(Boolean); return { tree_title:s.tree_title, tree_subtitle:s.tree_subtitle, tree_subtitle_content:publicRichContent(s.tree_subtitle_content||'[]'), clan_name:s.clan_name, tree_footer_content:publicRichContent(s.tree_footer_content||'[]'), gallery_intro_content:publicRichContent(s.gallery_intro_content||'[]'), gallery_footer_content:publicRichContent(s.gallery_footer_content||'[]'), public_comments_enabled:s.public_comments_enabled, accent_theme:s.accent_theme, tree_font:s.tree_font||'system', tree_title_font_size:s.tree_title_font_size||'28', clan_name_font_size:s.clan_name_font_size||'66', logo_url:s.site_logo_path?(uploadUrl(s.site_logo_path)||'/assets/logo.png'):'/assets/logo.png', fund_support_enabled:s.fund_support_enabled||'0', fund_support_content:publicRichContent(s.fund_support_content||'[]'), fund_support_qr_url:s.fund_support_qr_path?(uploadUrl(s.fund_support_qr_path)||''):'', footer_author_text:s.footer_author_text||'', footer_author_content:publicRichContent(s.footer_author_content||'[]'), footer_author_font:s.footer_author_font||'system', contact_intro_content:publicRichContent(s.contact_intro_content||'[]'), contact_footer_content:publicRichContent(s.contact_footer_content||'[]'), contact_map_url:s.contact_map_url||'', contact_map_address_content:publicRichContent(s.contact_map_address_content||'[]'), contact_temple_image_urls:templeUrls, contact_temple_image_url:templeUrls[0]||'', welcome_popup_enabled:s.welcome_popup_enabled||'0', welcome_popup_content:publicRichContent(s.welcome_popup_content||'[]') }; }
function friendlyDbError(e){ const m=String(e?.message||e); if(m.includes('UNIQUE constraint failed: users.username'))return 'Username đã tồn tại.'; return m.slice(0,500); }
function dateStamp(){ return new Date().toISOString().slice(0,10); }
function strongHumanPassword(){ return `GiaPha-${randomToken(9)}-7a!`; }
function loadDotEnv(file){ if(!fs.existsSync(file))return; for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){ const line=raw.trim(); if(!line||line.startsWith('#'))continue; const i=line.indexOf('='); if(i<1)continue; const k=line.slice(0,i).trim(); const v=line.slice(i+1).trim().replace(/^['"]|['"]$/g,''); if(process.env[k]===undefined)process.env[k]=v; } }

process.on('SIGINT',()=>{ console.log('\nDang dung server...'); server.close(()=>process.exit(0)); });
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));

process.on('uncaughtException',(err)=>console.error('uncaughtException',err));
process.on('unhandledRejection',(err)=>console.error('unhandledRejection',err));
