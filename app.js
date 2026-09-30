// App luyện pinyin — màn hiệu chuẩn (1.3.3), lộ trình chặng 1–4 (1.5.3), luyện một mục (1.4.4 / 1.6.6), thông tin.
// Chấm bằng engine JS tương đương 100% với Python (docs/bao_cao/TUONG_DUONG_JS.md). Lưu cục bộ (localStorage).
import { MayGhi, muaMicDuoc, mucOn, sangWav, docTep } from './ghi_am.js';
import { hieuChuan, chamMuc, sangChao } from './phan_tich.js';

const $ = (id) => document.getElementById(id);
const tai = async (p) => (await fetch(p)).json();
const [TC, BH, LUAT, LT] = await Promise.all(
  ['du_lieu/tham_chieu_thanh.json', 'du_lieu/bat_hoi.json', 'du_lieu/luat.json', 'du_lieu/lo_trinh.json'].map(tai));

// ---------------------------------------------------------------- lưu trữ cục bộ
const KHOA = { hs: 'lp_ho_so', td: 'lp_tien_do', nk: 'lp_nhat_ky', giong: 'lp_giong' };
const docLS = (k, md) => { try { return JSON.parse(localStorage.getItem(k)) ?? md; } catch { return md; } };
const ghiLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* đầy bộ nhớ: bỏ qua */ } };
let hs = docLS(KHOA.hs, null);
const tienDo = docLS(KHOA.td, {});             // muc -> {ngayDat: [yyyy-mm-dd], lanThu, lanSaiLienTiep}
let giong = docLS(KHOA.giong, 'nu');
const homNay = () => new Date().toISOString().slice(0, 10);

function ghiNhatKy(muc, kq) {                 // 1.5.2: mỗi lần thử: số đo, 3 ô, thông điệp (không lưu âm thanh)
  const nk = docLS(KHOA.nk, []);
  nk.push({ t: new Date().toISOString(), muc: muc.muc, snr: kq.tinHieu.snr_db, vot: kq.vot?.vot_ms ?? null,
    o3: Object.fromEntries(Object.entries(kq.o3).map(([o, v]) => [o, [v.trang_thai, v.loi || v.ly_do_xam || '']])),
    z: kq.o3.thanh.z || {}, chinh: kq.chinh?.luat.id ?? null, phu: kq.phu?.luat.id ?? null });
  ghiLS(KHOA.nk, nk.slice(-2000));
}

// ---------------------------------------------------------------- điều hướng
const MAN = ['chao', 'hieu_chuan', 'lo_trinh', 'luyen', 'nguon'];
function moMan(ten) {
  for (const m of MAN) $(`man_${m}`).hidden = m !== ten;
  if (ten === 'lo_trinh') veLoTrinh();
  if (ten === 'nguon') veNguon();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => moMan(hs ? b.dataset.man : 'chao')));

const mayGhi = new MayGhi();
const coMic = muaMicDuoc();
if (!coMic) { $('loi_mic').hidden = false; $('loi_mic').textContent = 'Trình duyệt này không cho dùng micro (cần mở bằng https hoặc localhost).'; }
if (!coMic || new URLSearchParams(location.search).has('thu')) $('thu_tep').hidden = false;

// ---------------------------------------------------------------- âm mẫu
let dangPhat = null;
function phatAm(src, cham = false) {
  return new Promise((xong) => {
    if (dangPhat) dangPhat.pause();
    const a = new Audio(src);
    a.playbackRate = cham ? 0.7 : 1;
    a.preservesPitch = true;
    dangPhat = a;
    a.onended = () => xong(); a.onerror = () => xong();
    a.play().catch(() => xong());
  });
}
const tepMau = (muc, g = giong) => (muc.mau[g] || muc.mau[g === 'nu' ? 'nam' : 'nu'] || {}).tep;
const mauCua = (muc, g = giong) => muc.mau[g] || muc.mau[g === 'nu' ? 'nam' : 'nu'];

// ---------------------------------------------------------------- hiệu chuẩn (1.3.3)
const MUC_HC = [1, 2, 3, 4, 1, 2, 3, 4].map((t) => LT.muc.find((m) => m.muc === `ma${t}`));
async function hieuChuanGiong() {
  moMan('hieu_chuan');
  const buoc = (a, b) => { $('hc_buoc').textContent = a; $('hc_huong_dan').textContent = b; };
  const choNut = (chu) => new Promise((xong) => { const n = $('hc_nut'); n.hidden = false; n.textContent = chu; n.onclick = () => { n.hidden = true; xong(); }; });
  $('hc_ket_qua').textContent = ''; $('hc_muc_am').textContent = '';
  try { await mayGhi.mo(); } catch (e) { buoc('Không mở được micro', 'Hãy cho phép dùng micro rồi thử lại. (' + e.message + ')'); return; }

  buoc('Bước 1/3: đo tiếng ồn', 'Bấm nút rồi IM LẶNG 3 giây.');
  await choNut('Bắt đầu đo');
  $('hc_huong_dan').textContent = 'Đang đo… (im lặng)';
  const lang = await mayGhi.ghiCoDinh(3.0);
  const nen = mucOn(lang, mayGhi.fs);
  $('hc_ket_qua').textContent = `Tiếng ồn phòng: ${nen.toFixed(0)} dB (${nen < -65 ? 'rất yên' : nen < -50 ? 'bình thường' : 'ỒN — nên tắt quạt, đóng cửa'}).`;

  buoc('Bước 2/3: lướt giọng', 'Bấm nút rồi nói "aaaa" trượt từ THẤP NHẤT lên CAO NHẤT (4 giây).');
  await choNut('Bắt đầu lướt giọng');
  $('hc_huong_dan').textContent = 'Đang ghi… trượt từ thấp lên cao';
  const luot = await mayGhi.ghiCoDinh(4.0);
  const banGhi = [{ x: luot, fs: mayGhi.fs, thanh: 0 }];

  const docMot = async (i) => {
    const muc = MUC_HC[i];
    $('hc_muc_am').textContent = muc.pinyin;
    buoc(`Bước 3/3: âm tiết ${i + 1}/8`, 'Nghe mẫu, rồi bấm "Đọc" và đọc giống mẫu.');
    await phatAm('am_mau/' + tepMau(muc));
    await choNut('🎤 Đọc');
    $('hc_huong_dan').textContent = 'Đang nghe…';
    const r = await mayGhi.ghiAmTiet({ nenDb: nen });
    return { x: r.x, fs: r.fs, thanh: muc.thanh, coTieng: r.coTieng };
  };
  for (let i = 0; i < MUC_HC.length; i++) {
    let b = await docMot(i);
    while (!b.coTieng) { $('hc_huong_dan').textContent = 'Chưa nghe thấy gì — đọc lại nhé.'; b = await docMot(i); }
    banGhi.push(b);
  }
  // chạy hiệu chuẩn; bản nào hỏng thì đọc lại đúng bản đó (tối đa 3 vòng)
  for (let vong = 0; vong < 3; vong++) {
    $('hc_huong_dan').textContent = 'Đang tính hồ sơ giọng…';
    await new Promise((r) => setTimeout(r, 30));
    const { hs: moi, loi } = hieuChuan(banGhi, TC, nen);
    if (moi) {
      hs = { ...moi, ngay: homNay() };
      ghiLS(KHOA.hs, hs);
      $('hc_muc_am').textContent = '';
      buoc('Xong!', `Giọng của bạn: trung vị ${hs.hoSo.trung_vi_hz.toFixed(0)} Hz, độ rộng ${hs.hoSo.do_rong_st.toFixed(1)} nửa cung.`);
      await choNut('Vào lộ trình');
      moMan('lo_trinh');
      return;
    }
    const hong = loi.filter((l) => typeof l === 'object' && l.i > 0).map((l) => l.i);
    $('hc_ket_qua').textContent = `Có ${hong.length} bản chưa dùng được (nhỏ, rè, quá ngắn hoặc chưa đo chắc) — đọc lại các bản đó.`;
    for (const i of hong) banGhi[i] = await docMot(i - 1);
  }
  buoc('Chưa hiệu chuẩn được', 'Thử chỗ yên hơn, nói rõ và dài hơn một chút, rồi làm lại.');
  await choNut('Làm lại');
  hieuChuanGiong();
}
$('nut_bat_dau_hc').addEventListener('click', hieuChuanGiong);
$('nut_hc_lai').addEventListener('click', hieuChuanGiong);

// ---------------------------------------------------------------- lộ trình (1.5.3)
function trangThaiMuc(m) {
  const t = tienDo[m.muc];
  if (!t) return '';
  if (new Set(t.ngayDat).size >= 3) return 'thanh_thao';            // 1.6.4: đúng vào 3 ngày khác nhau
  if (t.ngayDat.length) return 'da_dat';
  return t.lanSaiLienTiep >= 2 ? 'dang_hoc' : '';
}
function veLoTrinh() {
  const ds = $('lt_danh_sach');
  ds.innerHTML = '';
  for (const c of LT.chang) {
    const h = document.createElement('div');
    h.className = 'chang'; h.textContent = `Chặng ${c}`;
    ds.appendChild(h);
    const luoi = document.createElement('div');
    luoi.className = 'luoi';
    for (const m of LT.muc.filter((x) => x.chang === c)) {
      const b = document.createElement('button');
      b.textContent = m.pinyin; b.className = trangThaiMuc(m);
      b.title = m.vi_du || '';
      b.addEventListener('click', () => moMuc(m));
      luoi.appendChild(b);
    }
    ds.appendChild(luoi);
  }
  const dat = LT.muc.filter((m) => trangThaiMuc(m) === 'da_dat' || trangThaiMuc(m) === 'thanh_thao').length;
  const tt = LT.muc.filter((m) => trangThaiMuc(m) === 'thanh_thao').length;
  $('lt_tong').textContent = `Đã đạt ${dat}/${LT.muc.length} mục · thành thạo (đúng vào 3 ngày khác nhau) ${tt}.`;
}
const mucTiep = () => LT.muc.find((m) => !['da_dat', 'thanh_thao'].includes(trangThaiMuc(m))) || LT.muc[0];
$('nut_luyen_tiep').addEventListener('click', () => moMuc(mucTiep()));
$('nut_ve_lo_trinh').addEventListener('click', () => moMan('lo_trinh'));

// ---------------------------------------------------------------- luyện một mục (1.4.4)
let mucHienTai = null, lanThu = 0, banGhiCuoi = null;
const DAU = { xanh: '✓', vang: '~', do: '✗', xam: '?' };
const GIAI_XAM = {
  tin_hieu_kem: '', huu_thanh_ngan: 'Âm tiết ngắn quá — kéo dài hơn một chút.', hai_bo_do_bat_dong: '',
  khong_tu_cham: '', chi_nghe_ab: '', giong_chua_du_noi_cho_bat_hoi: 'Để chấm bật hơi, giọng cần nổi hơn tiếng ồn nhiều hơn — nói gần micro hơn.',
};
const GIAI_TIN_HIEU = { meo_dinh: 'tiếng bị rè vì to quá — đưa điện thoại ra xa miệng hơn một chút',
  giong_chua_du_noi: 'giọng chưa đủ rõ so với tiếng ồn — nói gần micro hơn hoặc tìm chỗ yên hơn', qua_ngan: 'bản ghi quá ngắn' };

function datO(id, kq, chuNho = '') {
  const o = $(id);
  o.className = 'o ' + (kq ? kq.trang_thai : '');
  o.querySelector('.dau').textContent = kq ? DAU[kq.trang_thai] : '·';
  o.title = chuNho;
}
function moMuc(m) {
  if (!hs) { moMan('chao'); return; }
  mucHienTai = m; lanThu = 0; banGhiCuoi = null;
  $('luyen_pinyin').textContent = m.pinyin;
  $('luyen_vi_du').textContent = m.vi_du ? `ví dụ: ${m.vi_du}` : '';
  $('nut_giong').textContent = giong === 'nu' ? 'Giọng nữ' : 'Giọng nam';
  $('luyen_lan').textContent = 'Lần thử 0/3';
  $('luyen_trang_thai').textContent = '';
  ['o_thanh_mau', 'o_van', 'o_thanh'].forEach((id) => datO(id, null));
  $('thong_diep').innerHTML = '';
  $('nut_ab').disabled = true; $('nut_tiep').hidden = true; $('nut_doc').disabled = false;
  veDoThi(mauCua(m)?.net, null);
  moMan('luyen');
}
$('nut_nghe').addEventListener('click', () => phatAm('am_mau/' + tepMau(mucHienTai)));
$('nut_nghe_cham').addEventListener('click', () => phatAm('am_mau/' + tepMau(mucHienTai), true));
$('nut_giong').addEventListener('click', () => {
  giong = giong === 'nu' ? 'nam' : 'nu'; ghiLS(KHOA.giong, giong);
  $('nut_giong').textContent = giong === 'nu' ? 'Giọng nữ' : 'Giọng nam';
  phatAm('am_mau/' + tepMau(mucHienTai));
});

async function xuLy(x, fs) {
  $('luyen_trang_thai').textContent = 'Đang chấm…';
  await new Promise((r) => setTimeout(r, 20));
  const kq = chamMuc(x, fs, mucHienTai, hs, TC, BH, LUAT);
  banGhiCuoi = URL.createObjectURL(sangWav(x, fs));
  $('nut_ab').disabled = false;
  if (!kq.tinhLanThu) {
    ['o_thanh_mau', 'o_van', 'o_thanh'].forEach((id) => datO(id, { trang_thai: 'xam' }));
    $('luyen_trang_thai').textContent = 'Chưa nghe rõ: ' + kq.tinHieu.ly_do.map((l) => GIAI_TIN_HIEU[l] || l).join('; ') + '. Lần này không tính.';
    $('thong_diep').innerHTML = '';
    return;
  }
  ghiNhatKy(mucHienTai, kq);
  lanThu++;
  $('luyen_lan').textContent = `Lần thử ${lanThu}/3`;
  datO('o_thanh_mau', kq.o3.thanh_mau, kq.vot ? `VOT ${kq.vot.vot_ms ?? '—'} ms` : '');
  datO('o_van', kq.o3.van, 'Vần chưa tự chấm — nghe so sánh A-B');
  datO('o_thanh', kq.o3.thanh);
  veDoThi(mauCua(mucHienTai)?.net, kq.dt?.net);
  const ghiChu = Object.values(kq.o3).map((o) => GIAI_XAM[o.ly_do_xam]).filter(Boolean);
  $('luyen_trang_thai').textContent = ghiChu.join(' ');
  let html = '';
  for (const [k, l] of [['chinh', kq.chinh], ['phu', kq.phu]]) {
    if (!l) continue;
    html += `<div class="loi_chinh ${l.mau === 'vang' ? 'vang' : ''}">${k === 'chinh' ? '<b>' : ''}${l.luat.thong_diep}${k === 'chinh' ? '</b>' : ''}` +
            `<div class="bai_tap">Bài tập: ${l.luat.bai_tap}</div></div>`;
  }
  const t = (tienDo[mucHienTai.muc] ||= { ngayDat: [], lanThu: 0, lanSaiLienTiep: 0 });
  t.lanThu++;
  if (kq.dat) {
    t.ngayDat.push(homNay()); t.lanSaiLienTiep = 0;
    html = '<p class="dat">Đạt — không ô nào đỏ.</p>' + html;
    $('nut_tiep').hidden = false; $('nut_doc').disabled = true;
  } else {
    t.lanSaiLienTiep++;
    if (lanThu >= 3) {                                                     // hết lượt: mẫu chậm + mẹo, chuyển mục
      html += '<p class="nho">Hết 3 lần thử — nghe lại mẫu chậm, đọc mẹo ở trên, rồi sang mục tiếp (mục này sẽ quay lại sau).</p>';
      $('nut_tiep').hidden = false; $('nut_doc').disabled = true;
      await phatAm('am_mau/' + tepMau(mucHienTai), true);
    }
  }
  ghiLS(KHOA.td, tienDo);
  $('thong_diep').innerHTML = html;
}

$('nut_doc').addEventListener('click', async () => {
  const nut = $('nut_doc');
  try { await mayGhi.mo(); } catch (e) { $('luyen_trang_thai').textContent = 'Không mở được micro: ' + e.message; return; }
  nut.disabled = true; nut.classList.add('dang_ghi'); nut.textContent = '● Đang nghe… (tự dừng)';
  const r = await mayGhi.ghiAmTiet({ nenDb: hs.nenMoiTruong ?? -60 });
  nut.classList.remove('dang_ghi'); nut.textContent = '🎤 Đọc'; nut.disabled = false;
  if (!r.coTieng) { $('luyen_trang_thai').textContent = 'Chưa nghe thấy gì — lần này không tính.'; return; }
  await xuLy(r.x, r.fs);
});
$('chon_tep').addEventListener('change', async (e) => {
  if (!e.target.files[0]) return;
  const { x, fs } = await docTep(e.target.files[0]);
  await xuLy(x, fs);
  e.target.value = '';
});
$('nut_ab').addEventListener('click', async () => {
  await phatAm('am_mau/' + tepMau(mucHienTai));
  if (banGhiCuoi) await phatAm(banGhiCuoi);
  await phatAm('am_mau/' + tepMau(mucHienTai));
});
$('nut_tiep').addEventListener('click', () => {
  const i = LT.muc.indexOf(mucHienTai);
  const sau = LT.muc.slice(i + 1).find((m) => !['da_dat', 'thanh_thao'].includes(trangThaiMuc(m))) || mucTiep();
  moMuc(sau);
});

// Đường cao độ trên lưới 5 bậc Chao (mẫu nhạt, người học đậm). Máy đổi sáng/tối thì vẽ lại theo màu mới.
let doThiCuoi = [null, null];
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => veDoThi(...doThiCuoi));
function veDoThi(netMau, netBan) {
  doThiCuoi = [netMau, netBan];
  const c = $('do_thi'), g = c.getContext('2d');
  const W = c.width, H = c.height, trai = 34, phai = 12, tren = 14, duoi = 16;
  const css = getComputedStyle(document.documentElement);
  g.clearRect(0, 0, W, H);
  g.font = '13px system-ui'; g.fillStyle = css.getPropertyValue('--phu'); g.strokeStyle = css.getPropertyValue('--vien');
  const y = (bac) => tren + (5 - bac) / 4 * (H - tren - duoi);
  for (let b = 1; b <= 5; b++) {
    g.beginPath(); g.moveTo(trai, y(b)); g.lineTo(W - phai, y(b)); g.lineWidth = 1; g.stroke();
    g.fillText(String(b), 12, y(b) + 4);
  }
  const ve = (net, mau, day) => {
    if (!net) return;
    const bac = sangChao(net, TC.hang_so);
    g.beginPath();
    bac.forEach((v, i) => { const xx = trai + i / (bac.length - 1) * (W - trai - phai); i ? g.lineTo(xx, y(v)) : g.moveTo(xx, y(v)); });
    g.strokeStyle = css.getPropertyValue(mau); g.lineWidth = day; g.lineCap = 'round'; g.stroke();
  };
  ve(netMau, '--mau_duong', 7);
  ve(netBan, '--ban_duong', 4);
}

// ---------------------------------------------------------------- thông tin
function veNguon() {
  $('nguon_ho_so').textContent = hs
    ? `Hiệu chuẩn ngày ${hs.ngay}: trung vị ${hs.hoSo.trung_vi_hz.toFixed(0)} Hz, độ rộng ${hs.hoSo.do_rong_st.toFixed(1)} nửa cung, khoảng dò ${hs.san.toFixed(0)}–${hs.tran.toFixed(0)} Hz, ồn phòng ${hs.nenMoiTruong?.toFixed(0) ?? '—'} dB.`
    : 'Chưa hiệu chuẩn.';
}
$('nut_xuat').addEventListener('click', () => {
  const b = new Blob([JSON.stringify({ ho_so: hs, tien_do: tienDo, nhat_ky: docLS(KHOA.nk, []) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = `luyen_pinyin_${homNay()}.json`; a.click();
});

// ---------------------------------------------------------------- cửa thử (chỉ khi ?thu=1): đưa tệp âm thanh vào đúng chỗ micro
if (new URLSearchParams(location.search).has('thu')) {
  window.__thu = {
    datHoSo: (h) => { hs = h; ghiLS(KHOA.hs, h); },
    moMuc: (ma) => moMuc(LT.muc.find((m) => m.muc === ma)),
    docUrl: async (url) => {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const x = new Float32Array(buf.length + Math.floor(0.6 * buf.sampleRate));   // thêm 0,3 s lặng hai đầu như bản ghi thật
      x.set(buf.getChannelData(0), Math.floor(0.3 * buf.sampleRate));
      await xuLy(x, buf.sampleRate);
      return $('luyen_trang_thai').textContent;
    },
  };
}

// ---------------------------------------------------------------- khởi động
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
moMan(hs ? 'lo_trinh' : 'chao');
