// Service worker (1.6.1): chạy khi không có mạng. Mã + dữ liệu: mạng trước (hỏi lại máy chủ, không dùng bản HTTP cũ,
// để bản sửa mới luôn tới được), hỏng mạng thì dùng bản đã lưu; âm mẫu: bản đã lưu trước (không đổi, nặng).
const MA = 'lp-ma-v2';
const AM_MAU = 'lp-am-mau-v1';
const KHUNG = ['./', 'index.html', 'app.css', 'app.js', 'ghi_am.js', 'ghi_am_worklet.js', 'phan_tich.js',
  'engine/cao_do.js', 'engine/thanh_dieu.js', 'engine/vot.js', 'engine/tin_hieu.js', 'engine/bat_hoi.js', 'engine/phan_hoi.js',
  'du_lieu/tham_chieu_thanh.json', 'du_lieu/bat_hoi.json', 'du_lieu/luat.json', 'du_lieu/lo_trinh.json',
  'manifest.webmanifest', 'bieu_tuong.svg'];

self.addEventListener('install', (e) => e.waitUntil(
  caches.open(MA).then((c) => c.addAll(KHUNG.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ds) => Promise.all(ds.filter((k) => k !== MA && k !== AM_MAU).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/am_mau/')) {
    // thẻ <audio> hay xin từng khúc (Range → 206, không lưu được): tải trọn tệp (200) bằng URL trần rồi lưu
    e.respondWith(caches.match(url.href).then((r) => r || fetch(url.href).then((res) => {
      if (res.status === 200) { const ban = res.clone(); caches.open(AM_MAU).then((c) => c.put(url.href, ban)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const ban = res.clone(); caches.open(MA).then((c) => c.put(e.request, ban)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
