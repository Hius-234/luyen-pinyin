// Service worker (1.6.1): chạy khi không có mạng. Mã + dữ liệu: mạng trước, hỏng mạng thì dùng bản đã lưu (để bản
// sửa mới luôn tới được); âm mẫu: bản đã lưu trước (không đổi, nặng).
const BO_NHO = 'luyen-pinyin-v1';
const KHUNG = ['./', 'index.html', 'app.css', 'app.js', 'ghi_am.js', 'ghi_am_worklet.js', 'phan_tich.js',
  'engine/cao_do.js', 'engine/thanh_dieu.js', 'engine/vot.js', 'engine/tin_hieu.js', 'engine/bat_hoi.js', 'engine/phan_hoi.js',
  'du_lieu/tham_chieu_thanh.json', 'du_lieu/bat_hoi.json', 'du_lieu/luat.json', 'du_lieu/lo_trinh.json',
  'manifest.webmanifest', 'bieu_tuong.svg'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(BO_NHO).then((c) => c.addAll(KHUNG)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/am_mau/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const ban = res.clone();
      caches.open(BO_NHO).then((c) => c.put(e.request, ban));
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => {
    const ban = res.clone();
    caches.open(BO_NHO).then((c) => c.put(e.request, ban));
    return res;
  }).catch(() => caches.match(e.request)));
});
