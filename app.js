// App luyện pinyin — màn hiệu chuẩn (1.3.3), lộ trình chặng 1–4 (1.5.3), luyện một mục (1.4.4 / 1.6.6), thông tin.
// Chấm bằng engine JS tương đương 100% với Python (docs/bao_cao/TUONG_DUONG_JS.md). Lưu cục bộ (localStorage).
// Mọi lúc app đang làm gì đều phải thấy được trên màn hình: thanh mức micro, đếm ngược, vòng xoay khi tính,
// nhịp khi ghi/phát, và lời chẩn đoán cụ thể khi micro không nghe thấy (chạy thử trên điện thoại 01/10/2026).
import { MayGhi, muaMicDuoc, mucOn, sangWav, docTep, bienDoMax, IM_TUYET_DOI, NOI_HON_NEN_DB } from './ghi_am.js';
import { hieuChuan, chamMuc, sangChao } from './phan_tich.js';
import { doCaoDo } from './engine/cao_do.js';

const PHIEN_BAN = '1.1 (01/10/2026)';
const $ = (id) => document.getElementById(id);
const tai = async (p) => { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
let TC, BH, LUAT, LT;
try {
  [TC, BH, LUAT, LT] = await Promise.all(
    ['du_lieu/tham_chieu_thanh.json', 'du_lieu/bat_hoi.json', 'du_lieu/luat.json', 'du_lieu/lo_trinh.json'].map(tai));
} catch (e) {
  document.querySelector('#dang_tai .xoay').style.display = 'none';
  $('loi_tai').textContent = `Không tải được dữ liệu của app (${e.message}). Kiểm tra mạng rồi đóng hẳn app và mở lại.`;
  throw e;
}

// ---------------------------------------------------------------- lưu trữ cục bộ
const KHOA = { hs: 'lp_ho_so', td: 'lp_tien_do', nk: 'lp_nhat_ky', giong: 'lp_giong' };
const docLS = (k, md) => { try { return JSON.parse(localStorage.getItem(k)) ?? md; } catch { return md; } };
const ghiLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* đầy bộ nhớ: bỏ qua */ } };
let hs = docLS(KHOA.hs, null);
const tienDo = docLS(KHOA.td, {});             // muc -> {ngayDat: [yyyy-mm-dd], lanThu, lanSaiLienTiep}
let giong = docLS(KHOA.giong, 'nu');
const homNay = () => new Date().toISOString().slice(0, 10);
const themNhatKy = (muc) => { const nk = docLS(KHOA.nk, []); nk.push({ t: new Date().toISOString(), ...muc }); ghiLS(KHOA.nk, nk.slice(-2000)); };

function ghiNhatKy(muc, kq, mic) {           // 1.5.2: mỗi lần thử: số đo, 3 ô, thông điệp (không lưu âm thanh)
  themNhatKy({ muc: muc.muc, snr: kq.tinHieu.snr_db, vot: kq.vot?.vot_ms ?? null,
    o3: Object.fromEntries(Object.entries(kq.o3).map(([o, v]) => [o, [v.trang_thai, v.loi || v.ly_do_xam || '']])),
    z: kq.o3.thanh.z || {}, chinh: kq.chinh?.luat.id ?? null, phu: kq.phu?.luat.id ?? null, mic });
}
const soMic = (r) => r ? { dinh: Math.round(r.dinhDb), nguong: Math.round(r.nguongDb), tay: r.tay, im: r.imTuyetDoi } : null;

// Lỗi bất ngờ: hiện ra màn hình (không im lặng treo) và ghi vào nhật ký để gửi Claude xem
function baoLoi(e) {
  const chu = (e && (e.message || e.reason)) || String(e);
  const p = $('loi_chung');
  p.hidden = false; p.textContent = `Có lỗi: ${chu} — chạm để ẩn. (Đã ghi vào nhật ký luyện.)`;
  themNhatKy({ loi: chu, stack: e && e.stack ? String(e.stack).slice(0, 500) : '' });
}
$('loi_chung').addEventListener('click', () => { $('loi_chung').hidden = true; });
window.addEventListener('error', (e) => baoLoi(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => baoLoi(e.reason));

// ---------------------------------------------------------------- micro + thanh mức
const mayGhi = new MayGhi();
const coMic = muaMicDuoc();
if (!coMic) { $('loi_mic').hidden = false; $('loi_mic').textContent = 'Trình duyệt này không cho dùng micro (cần mở bằng https hoặc localhost).'; }
if (!coMic || new URLSearchParams(location.search).has('thu')) $('thu_tep').hidden = false;

const HUONG_DAN_IM = `<b>Micro đang gửi về im lặng tuyệt đối</b> — điện thoại đang chặn micro, hoặc app khác đang giữ micro. Thử lần lượt:
<ol><li>Vuốt thanh thông báo xuống hết cỡ. Nếu có ô <b>"Quyền truy cập micrô"</b> (hoặc "Micrô") đang tắt thì bấm để bật.</li>
<li>Tắt app khác đang dùng micro: cuộc gọi, ghi âm, Zalo/Messenger đang gọi, trợ lý Google.</li>
<li>Mở Cài đặt → Ứng dụng → Chrome → Quyền → Micrô → chọn <b>Chỉ cho phép khi đang dùng ứng dụng</b>.</li>
<li>Đóng hẳn app này (vuốt khỏi danh sách app gần đây) rồi mở lại.</li></ol>`;

function loiMoMic(e) {
  const ten = e && e.name;
  if (ten === 'NotAllowedError' || ten === 'SecurityError')
    return `<b>Micro đang bị chặn cho trang này.</b> Mở Chrome → ⋮ → Cài đặt → Cài đặt trang web → Micrô → chọn ${location.host} → Cho phép. Rồi đóng hẳn app và mở lại.`;
  if (ten === 'NotReadableError' || ten === 'AbortError')
    return '<b>Micro đang bị app khác dùng</b> (cuộc gọi, ghi âm, trợ lý giọng nói). Tắt app đó rồi thử lại.';
  if (ten === 'NotFoundError' || ten === 'OverconstrainedError') return '<b>Không tìm thấy micro</b> trên máy này.';
  return `Không mở được micro: ${(e && e.message) || e}`;
}

// Khi một lượt ghi không bắt được tiếng: nói rõ vì sao (micro bị chặn hay giọng chưa vượt vạch)
function khongNgheThay(r) {
  const tt = mayGhi.tinhTrang();
  if (r.imTuyetDoi || tt === 'he_thong_tat' || tt === 'im_tuyet_doi') return HUONG_DAN_IM;
  if (tt === 'mat') return '<b>Micro bị ngắt giữa chừng</b> (chuyển app hoặc có cuộc gọi). Bấm Đọc để mở lại.';
  const thieu = Math.max(1, Math.round(r.nguongDb - r.dinhDb));
  return `<b>Chưa nghe thấy bạn đọc.</b> Tiếng to nhất còn thấp hơn vạch đen trên thanh mức khoảng ${thieu} dB. ` +
    'Đọc to hơn, hoặc đưa điện thoại gần miệng hơn (khoảng một gang tay).';
}

const vuMuc = (db) => Math.max(0, Math.min(1, (db + 80) / 70));          // −80 dBFS → trống, −10 dBFS → đầy
const CHU_VU = {
  chua_mo: 'Micro chưa mở.',
  tot: 'Thanh mức micro — nhảy lên khi bạn nói.',
  he_thong_tat: '⚠ Điện thoại đang tắt micro cho app này.',
  im_tuyet_doi: '⚠ Micro đang gửi về im lặng tuyệt đối — điện thoại chặn micro?',
  mat: '⚠ Micro bị ngắt — bấm nút để mở lại.',
};
let vuHien = -120;
function chayVu() {
  const tt = mayGhi.tinhTrang();
  const db = tt === 'chua_mo' ? -120 : mayGhi.db;
  vuHien = db >= vuHien ? db : Math.max(db, vuHien - 0.8);                // lên ngay, xuống từ từ cho dễ nhìn
  for (const v of document.querySelectorAll('.vu')) {
    if (!v.offsetParent) continue;
    v.firstElementChild.style.transform = `scaleX(${vuMuc(vuHien).toFixed(3)})`;
    const coVach = v.dataset.vach !== undefined;
    v.classList.toggle('qua', tt === 'tot' && vuHien > (coVach ? +v.dataset.vach : mayGhi.sanDb + NOI_HON_NEN_DB));
    const chu = v.nextElementSibling, moi = CHU_VU[tt] + (tt === 'tot' && coVach ? ' Vạch đen = mức cần vượt khi đọc.' : '');
    if (chu.textContent !== moi) chu.textContent = moi;
    chu.classList.toggle('canh_bao', tt !== 'tot' && tt !== 'chua_mo');
  }
  requestAnimationFrame(chayVu);
}
requestAnimationFrame(chayVu);
function datVach(id, db) {
  const v = $(id);
  if (db == null) { delete v.dataset.vach; v.classList.remove('co_vach'); return; }
  v.dataset.vach = db; v.classList.add('co_vach');
  v.querySelector('.vu_vach').style.left = `${(vuMuc(db) * 100).toFixed(1)}%`;
}
// Nhường một khung hình để màn hình kịp vẽ (vòng xoay, chữ mới) trước khi tính nặng
// (trang bị ẩn thì không có khung hình nào -> chờ tối đa 120 ms rồi làm tiếp)
const nhuong = () => new Promise((r) => {
  let xong = false;
  const di = () => { if (!xong) { xong = true; setTimeout(r, 0); } };
  requestAnimationFrame(di); setTimeout(di, 120);
});
const doi = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- điều hướng
const MAN = ['chao', 'hieu_chuan', 'lo_trinh', 'luyen', 'nguon'];
let manHienTai = null, luotHC = 0;
function moMan(ten) {
  $('dang_tai').hidden = true;
  if (ten !== 'hieu_chuan') luotHC++;                                    // rời màn hiệu chuẩn: huỷ luồng đang dở
  if (ten !== 'luyen' && ten !== 'hieu_chuan') mayGhi.dong();            // tắt micro khi không cần
  dungPhat();
  manHienTai = ten;
  for (const m of MAN) $(`man_${m}`).hidden = m !== ten;
  if (ten === 'lo_trinh') veLoTrinh();
  if (ten === 'nguon') veNguon();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => moMan(hs ? b.dataset.man : 'chao')));

// ---------------------------------------------------------------- âm mẫu
let dangPhat = null;
function dungPhat() { if (dangPhat) dangPhat.pause(); }
function phatAm(src, cham = false, nut = null) {
  return new Promise((xong) => {
    dungPhat();
    const a = new Audio(src);
    a.playbackRate = cham ? 0.7 : 1;
    a.preservesPitch = true;
    dangPhat = a;
    const ket = () => { if (nut) nut.classList.remove('dang_phat'); if (dangPhat === a) dangPhat = null; xong(); };
    a.onended = ket; a.onerror = ket; a.onpause = ket;
    if (nut) nut.classList.add('dang_phat');
    a.play().catch(ket);
  });
}
const tepMau = (muc, g = giong) => (muc.mau[g] || muc.mau[g === 'nu' ? 'nam' : 'nu'] || {}).tep;
const mauCua = (muc, g = giong) => muc.mau[g] || muc.mau[g === 'nu' ? 'nam' : 'nu'];

// ---------------------------------------------------------------- hiệu chuẩn (1.3.3)
const MUC_HC = [1, 2, 3, 4, 1, 2, 3, 4].map((t) => LT.muc.find((m) => m.muc === `ma${t}`));
const HUY = Symbol('huy');
const hc = {
  buoc(a, b) { $('hc_buoc').textContent = a; $('hc_huong_dan').innerHTML = b; },
  // kieu: '' | 'xoay' (vòng xoay) | 'dang_phat' | 'dang_ghi' | 'tot' | 'loi'
  trangThai(chu, kieu = '') {
    const p = $('hc_trang_thai');
    p.className = 'trang_thai ' + kieu;
    p.innerHTML = (kieu === 'xoay' ? '<span class="xoay"></span>' : '') + chu;
  },
  daXong: [],
  ketQua(loiHtml = '', nang = true) {
    $('hc_ket_qua').innerHTML = hc.daXong.map((d) => `<p class="xong">✓ ${d}</p>`).join('') +
      (loiHtml ? `<div class="hop ${nang ? 'loi' : ''}">${loiHtml}</div>` : '');
  },
};
function choNut(chu, chuPhu = null) {                                     // trả 0 (nút chính) hoặc 1 (nút phụ)
  return new Promise((xong) => {
    const n = $('hc_nut'), p = $('hc_nut_phu');
    const an = (k) => { n.hidden = true; p.hidden = true; n.onclick = null; p.onclick = null; xong(k); };
    n.textContent = chu; n.hidden = false; n.disabled = false; n.classList.remove('dang_ghi');
    p.hidden = !chuPhu; if (chuPhu) p.textContent = chuPhu;
    n.onclick = () => an(0); p.onclick = () => an(1);
  });
}
function veCham(dang) {
  $('hc_cham').innerHTML = MUC_HC.map((_, i) => `<span class="${i < dang ? 'xong' : i === dang ? 'dang' : ''}"></span>`).join('');
}
async function ghiDemNguoc(giay, chu) {                                  // ghi cố định, có thanh thời gian + đếm ngược
  const khung = $('hc_tien_trinh'), thanh = khung.firstElementChild;
  khung.hidden = false;
  thanh.style.transition = 'none'; thanh.style.transform = 'scaleX(0)';
  void thanh.offsetWidth;
  thanh.style.transition = `transform ${giay}s linear`; thanh.style.transform = 'scaleX(1)';
  const t0 = performance.now();
  const ve = () => hc.trangThai(`${chu} — còn ${Math.max(1, Math.ceil(giay - (performance.now() - t0) / 1000))} giây`, 'dang_ghi');
  ve();
  const dh = setInterval(ve, 200);
  try { return await mayGhi.ghiCoDinh(giay); } finally { clearInterval(dh); khung.hidden = true; }
}
async function ghiCoNutDung(nenDb) {                                       // ghi một âm tiết; nút đổi thành "Dừng"
  const n = $('hc_nut');
  n.hidden = false; n.disabled = false; n.classList.add('dang_ghi'); n.textContent = '● Đang nghe… (bấm để dừng)';
  n.onclick = () => mayGhi.dung();
  try { return await mayGhi.ghiAmTiet({ nenDb }); } finally { n.hidden = true; n.onclick = null; n.classList.remove('dang_ghi'); }
}

async function hieuChuanGiong() {
  const luot = ++luotHC;
  moMan('hieu_chuan');
  const cho = async (p) => { const v = await p; if (luot !== luotHC) throw HUY; return v; };
  try { await chayHieuChuan(cho); } catch (e) { if (e !== HUY) baoLoi(e); }
}

async function chayHieuChuan(cho) {
  hc.daXong = []; hc.ketQua(); hc.trangThai('');
  $('hc_muc_am').textContent = ''; $('hc_cham').hidden = true; $('hc_tien_trinh').hidden = true;
  $('hc_nut').hidden = true; $('hc_nut_phu').hidden = true;
  datVach('hc_vu', null);
  const chanDoan = {};

  // Bước 1: thử micro — thấy giọng nổi hơn ồn ≥ 20 dB là đạt (ngưỡng tối thiểu để chấm thanh, tin_hieu.js)
  hc.buoc('Bước 1/4: thử micro', 'Nói <b>"a… a… a…"</b> vài tiếng. Thanh mức bên dưới nhảy lên, chuyển xanh là micro nghe được bạn.');
  for (;;) {
    hc.trangThai('Đang mở micro…', 'xoay');
    try { await cho(mayGhi.mo()); } catch (e) {
      if (e === HUY) throw e;
      hc.trangThai(''); hc.ketQua(loiMoMic(e));
      await cho(choNut('Thử lại')); hc.ketQua(); continue;
    }
    hc.trangThai('Đang nghe micro — nói "a… a…"', 'dang_ghi');
    const t = await cho(mayGhi.thuMic());
    chanDoan.thu_mic = { nhay_db: Math.round(t.nhayDb), im: t.imTuyetDoi, dat: t.dat };
    if (t.dat) break;
    hc.trangThai('');
    const tt = mayGhi.tinhTrang();
    hc.ketQua(t.imTuyetDoi || tt === 'he_thong_tat' || tt === 'im_tuyet_doi' ? HUONG_DAN_IM
      : tt === 'mat' ? '<b>Micro bị ngắt</b> (chuyển app hoặc có cuộc gọi). Bấm Thử lại.'
      : `<b>Micro có nghe, nhưng giọng mới nổi hơn tiếng ồn ${Math.round(t.nhayDb)} dB</b> (cần 20). Nói to hơn, đưa điện thoại gần miệng hơn, hoặc ra chỗ yên hơn.`);
    if (await cho(choNut('Thử lại', 'Bỏ qua, làm tiếp')) === 1) break;
    hc.ketQua();
  }
  hc.daXong.push('Micro nghe được bạn'); hc.ketQua(); hc.trangThai('');

  // Bước 2: đo tiếng ồn
  let nen;
  for (;;) {
    hc.buoc('Bước 2/4: đo tiếng ồn', 'Bấm nút rồi <b>IM LẶNG 3 giây</b>.');
    await cho(choNut('Bắt đầu đo'));
    hc.ketQua();
    const lang = await cho(ghiDemNguoc(3, 'Đang đo — im lặng nhé'));
    nen = mucOn(lang, mayGhi.fs);
    hc.trangThai('');
    if (bienDoMax(lang) < IM_TUYET_DOI) { hc.ketQua(HUONG_DAN_IM); await cho(choNut('Đo lại')); continue; }
    if (nen > -45) {
      hc.ketQua(`<b>Ồn quá (${nen.toFixed(0)} dB)</b> — hoặc có tiếng nói lúc đo. Tắt quạt/TV, đóng cửa rồi đo lại. Ồn nhiều thì app sẽ hay báo "chưa nghe rõ".`, false);
      if (await cho(choNut('Đo lại', 'Vẫn làm tiếp')) === 0) continue;
    }
    break;
  }
  chanDoan.nen_db = Math.round(nen);
  hc.daXong.push(`Tiếng ồn phòng: ${nen.toFixed(0)} dB (${nen < -65 ? 'rất yên' : nen < -50 ? 'bình thường' : 'hơi ồn'})`); hc.ketQua();
  datVach('hc_vu', nen + NOI_HON_NEN_DB);

  // Bước 3: lướt giọng — kiểm ngay xem có nghe ra giọng không (≥ 0,3 s hữu thanh)
  let luot;
  for (;;) {
    hc.buoc('Bước 3/4: lướt giọng', 'Bấm nút rồi nói <b>"aaaa"</b> liền một hơi, trượt từ THẤP NHẤT lên CAO NHẤT (4 giây).');
    await cho(choNut('Bắt đầu lướt giọng'));
    hc.ketQua();
    luot = await cho(ghiDemNguoc(4, 'Đang ghi — trượt từ thấp lên cao'));
    hc.trangThai('Đang kiểm tra…', 'xoay'); await cho(nhuong());
    const hz = Array.from(doCaoDo(luot, mayGhi.fs, { cach: 'ac', buoc: 0.01, san: 60, tran: 600 }).f).filter((v) => v > 0).sort((a, b) => a - b);
    hc.trangThai('');
    if (hz.length >= 30) {
      const lo = hz[Math.floor(0.05 * hz.length)], hi = hz[Math.floor(0.95 * hz.length)];
      chanDoan.luot = { khung: hz.length, lo_hz: Math.round(lo), hi_hz: Math.round(hi) };
      hc.daXong.push(`Lướt giọng: nghe được giọng bạn (${lo.toFixed(0)}–${hi.toFixed(0)} Hz)`); hc.ketQua();
      break;
    }
    hc.ketQua(bienDoMax(luot) < IM_TUYET_DOI ? HUONG_DAN_IM
      : '<b>Chưa nghe ra giọng trong 4 giây vừa rồi.</b> Nói "aaaa" to, rõ, liền một hơi — không cần hay, chỉ cần trượt từ thấp lên cao.');
    if (await cho(choNut('Làm lại', 'Bỏ qua, làm tiếp')) === 1) break;
  }

  // Bước 4: 8 âm tiết
  const banGhi = [{ x: luot, fs: mayGhi.fs, thanh: 0 }];
  $('hc_cham').hidden = false;
  const docMot = async (i, loiDan = 'Nghe mẫu, rồi bấm <b>Đọc</b> và đọc giống mẫu.') => {
    const muc = MUC_HC[i];
    $('hc_muc_am').textContent = muc.pinyin;
    veCham(i);
    hc.buoc(`Bước 4/4: đọc âm tiết ${i + 1}/8`, loiDan);
    let phat = true;
    for (;;) {
      if (phat) { hc.trangThai('🔊 Đang phát mẫu…', 'dang_phat'); await cho(phatAm('am_mau/' + tepMau(muc))); }
      hc.trangThai('Đến lượt bạn.');
      if (await cho(choNut('🎤 Đọc', '🔊 Nghe lại mẫu')) === 1) { phat = true; continue; }
      phat = false;
      hc.ketQua();
      hc.trangThai('Đọc đi — đọc xong app tự dừng', 'dang_ghi');
      const r = await cho(ghiCoNutDung(nen));
      if (r.coTieng) {
        hc.trangThai(`✓ Đã ghi ${muc.pinyin}`, 'tot');
        await cho(doi(500));
        return { x: r.x, fs: r.fs, thanh: muc.thanh, mic: soMic(r) };
      }
      hc.trangThai('');
      hc.ketQua(khongNgheThay(r));
      themNhatKy({ hieu_chuan: muc.muc, khong_tieng: true, mic: soMic(r), tinh_trang: mayGhi.tinhTrang() });
    }
  };
  for (let i = 0; i < MUC_HC.length; i++) banGhi.push(await docMot(i));
  veCham(MUC_HC.length);

  // Tính hồ sơ; bản nào hỏng thì đọc lại đúng bản đó (tối đa 3 vòng)
  for (let vong = 0; vong < 3; vong++) {
    $('hc_muc_am').textContent = '';
    hc.buoc('Đang tính hồ sơ giọng', 'Mất vài giây, chờ chút nhé.');
    hc.trangThai('Đang tính…', 'xoay'); await cho(nhuong());
    const { hs: moi, loi } = hieuChuan(banGhi, TC, nen);
    hc.trangThai('');
    if (moi) {
      hs = { ...moi, ngay: homNay(), chanDoan: { ...chanDoan, mic: mayGhi.thongTin(), may: navigator.userAgent, phien_ban: PHIEN_BAN } };
      ghiLS(KHOA.hs, hs);
      themNhatKy({ hieu_chuan_xong: true, chan_doan: hs.chanDoan });
      hc.daXong.push('Đọc 8 âm tiết'); hc.ketQua();
      hc.buoc('Xong!', `Giọng của bạn: trung vị ${hs.hoSo.trung_vi_hz.toFixed(0)} Hz, độ rộng ${hs.hoSo.do_rong_st.toFixed(1)} nửa cung.`);
      hc.trangThai('✓ Hiệu chuẩn xong', 'tot');
      $('hc_cham').hidden = true;
      await cho(choNut('Vào lộ trình'));
      moMan('lo_trinh');
      return;
    }
    themNhatKy({ hieu_chuan_loi: loi });
    let hong = loi.filter((l) => typeof l === 'object' && l.i > 0).map((l) => l.i);
    if (!hong.length) hong = MUC_HC.map((_, i) => i + 1);
    hc.ketQua(`Có ${hong.length} bản chưa dùng được (nhỏ, rè, quá ngắn hoặc chưa đo chắc) — đọc lại các bản đó.`, false);
    for (const i of hong) banGhi[i] = await docMot(i - 1, 'Đọc lại bản này — rõ và kéo dài hơn một chút.');
    veCham(MUC_HC.length);
  }
  hc.buoc('Chưa hiệu chuẩn được', 'Thử chỗ yên hơn, nói rõ và dài hơn một chút, rồi làm lại.');
  await cho(choNut('Làm lại'));
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
let mucHienTai = null, lanThu = 0, banGhiCuoi = null, dangGhi = false;
const DAU = { xanh: '✓', vang: '~', do: '✗', xam: '?' };
const GIAI_XAM = {
  tin_hieu_kem: '', huu_thanh_ngan: 'Âm tiết ngắn quá — kéo dài hơn một chút.', hai_bo_do_bat_dong: '',
  khong_tu_cham: '', chi_nghe_ab: '', giong_chua_du_noi_cho_bat_hoi: 'Để chấm bật hơi, giọng cần nổi hơn tiếng ồn nhiều hơn — nói gần micro hơn.',
};
const GIAI_TIN_HIEU = { meo_dinh: 'tiếng bị rè vì to quá — đưa điện thoại ra xa miệng hơn một chút',
  giong_chua_du_noi: 'giọng chưa đủ rõ so với tiếng ồn — nói gần micro hơn hoặc tìm chỗ yên hơn', qua_ngan: 'bản ghi quá ngắn' };
function trangThaiLuyen(html, kieu = '') {
  const p = $('luyen_trang_thai');
  p.className = 'trang_thai ' + kieu;
  p.innerHTML = (kieu === 'xoay' ? '<span class="xoay"></span>' : '') + html;
}

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
  trangThaiLuyen('');
  ['o_thanh_mau', 'o_van', 'o_thanh'].forEach((id) => datO(id, null));
  $('thong_diep').innerHTML = '';
  $('nut_ab').disabled = true; $('nut_tiep').hidden = true; $('nut_doc').disabled = false;
  veDoThi(mauCua(m)?.net, null);
  datVach('luyen_vu', (hs.nenMoiTruong ?? -60) + NOI_HON_NEN_DB);
  moMan('luyen');
  if (coMic) mayGhi.mo().catch(() => {});        // mở micro sẵn để thanh mức chạy ngay (lỗi thì báo khi bấm Đọc)
}
$('nut_nghe').addEventListener('click', (e) => phatAm('am_mau/' + tepMau(mucHienTai), false, e.currentTarget));
$('nut_nghe_cham').addEventListener('click', (e) => phatAm('am_mau/' + tepMau(mucHienTai), true, e.currentTarget));
$('nut_giong').addEventListener('click', () => {
  giong = giong === 'nu' ? 'nam' : 'nu'; ghiLS(KHOA.giong, giong);
  $('nut_giong').textContent = giong === 'nu' ? 'Giọng nữ' : 'Giọng nam';
  phatAm('am_mau/' + tepMau(mucHienTai), false, $('nut_nghe'));
});

async function xuLy(x, fs, mic = null) {
  trangThaiLuyen('Đang chấm…', 'xoay');
  await nhuong();
  const kq = chamMuc(x, fs, mucHienTai, hs, TC, BH, LUAT);
  banGhiCuoi = URL.createObjectURL(sangWav(x, fs));
  $('nut_ab').disabled = false;
  if (!kq.tinhLanThu) {
    ['o_thanh_mau', 'o_van', 'o_thanh'].forEach((id) => datO(id, { trang_thai: 'xam' }));
    trangThaiLuyen('Chưa nghe rõ: ' + kq.tinHieu.ly_do.map((l) => GIAI_TIN_HIEU[l] || l).join('; ') + '. Lần này không tính.', 'loi');
    $('thong_diep').innerHTML = '';
    themNhatKy({ muc: mucHienTai.muc, khong_tinh: kq.tinHieu.ly_do, snr: kq.tinHieu.snr_db, mic });
    return;
  }
  ghiNhatKy(mucHienTai, kq, mic);
  lanThu++;
  $('luyen_lan').textContent = `Lần thử ${lanThu}/3`;
  datO('o_thanh_mau', kq.o3.thanh_mau, kq.vot ? `VOT ${kq.vot.vot_ms ?? '—'} ms` : '');
  datO('o_van', kq.o3.van, 'Vần chưa tự chấm — nghe so sánh A-B');
  datO('o_thanh', kq.o3.thanh);
  veDoThi(mauCua(mucHienTai)?.net, kq.dt?.net);
  const ghiChu = Object.values(kq.o3).map((o) => GIAI_XAM[o.ly_do_xam]).filter(Boolean);
  trangThaiLuyen(ghiChu.join(' '));
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
    }
  }
  ghiLS(KHOA.td, tienDo);
  $('thong_diep').innerHTML = html;
  if (!kq.dat && lanThu >= 3) await phatAm('am_mau/' + tepMau(mucHienTai), true, $('nut_nghe_cham'));
}

$('nut_doc').addEventListener('click', async () => {
  const nut = $('nut_doc');
  if (dangGhi) { mayGhi.dung(); return; }                                  // đang ghi: bấm lần nữa = dừng
  dungPhat();
  trangThaiLuyen('Đang mở micro…', 'xoay');
  try { await mayGhi.mo(); } catch (e) { trangThaiLuyen(loiMoMic(e), 'loi'); return; }
  dangGhi = true;
  nut.classList.add('dang_ghi'); nut.textContent = '● Đang nghe… (bấm để dừng)';
  trangThaiLuyen('Đọc đi — đọc xong app tự dừng.', 'dang_ghi');
  let r;
  try { r = await mayGhi.ghiAmTiet({ nenDb: hs.nenMoiTruong ?? -60 }); }
  finally { dangGhi = false; nut.classList.remove('dang_ghi'); nut.textContent = '🎤 Đọc'; }
  if (!r.coTieng) {
    trangThaiLuyen(khongNgheThay(r) + ' Lần này không tính.', 'loi');
    themNhatKy({ muc: mucHienTai.muc, khong_tieng: true, mic: soMic(r), tinh_trang: mayGhi.tinhTrang() });
    return;
  }
  await xuLy(r.x, r.fs, soMic(r));
});
$('chon_tep').addEventListener('change', async (e) => {
  if (!e.target.files[0]) return;
  const { x, fs } = await docTep(e.target.files[0]);
  await xuLy(x, fs);
  e.target.value = '';
});
$('nut_ab').addEventListener('click', async (e) => {
  const nut = e.currentTarget;
  nut.classList.add('dang_phat');
  await phatAm('am_mau/' + tepMau(mucHienTai));
  if (banGhiCuoi) await phatAm(banGhiCuoi);
  await phatAm('am_mau/' + tepMau(mucHienTai));
  nut.classList.remove('dang_phat');
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
  const cd = hs?.chanDoan;
  $('nguon_ho_so').textContent = hs
    ? `Hiệu chuẩn ngày ${hs.ngay}: trung vị ${hs.hoSo.trung_vi_hz.toFixed(0)} Hz, độ rộng ${hs.hoSo.do_rong_st.toFixed(1)} nửa cung, khoảng dò ${hs.san.toFixed(0)}–${hs.tran.toFixed(0)} Hz, ồn phòng ${hs.nenMoiTruong?.toFixed(0) ?? '—'} dB.` +
      (cd?.mic ? ` Micro: ${cd.mic.ten || 'không tên'}, ${cd.mic.sampleRate || cd.mic.fs_ctx} Hz, tự chỉnh mức ${cd.mic.autoGainControl ? 'BẬT' : 'tắt'}, giảm ồn ${cd.mic.noiseSuppression ? 'BẬT' : 'tắt'}.` : '')
    : 'Chưa hiệu chuẩn.';
}
$('nut_xuat').addEventListener('click', () => {
  const b = new Blob([JSON.stringify({ phien_ban: PHIEN_BAN, ho_so: hs, tien_do: tienDo, nhat_ky: docLS(KHOA.nk, []) }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = `luyen_pinyin_${homNay()}.json`; a.click();
});
$('phien_ban').textContent = `Phiên bản ${PHIEN_BAN}`;

// ---------------------------------------------------------------- cửa thử (chỉ khi ?thu=1)
if (new URLSearchParams(location.search).has('thu')) {
  window.__thu = {
    datHoSo: (h) => { hs = h; ghiLS(KHOA.hs, h); },
    moMuc: (ma) => moMuc(LT.muc.find((m) => m.muc === ma)),
    // đưa tệp âm thanh vào đúng chỗ micro (bỏ qua bộ ghi)
    docUrl: async (url) => {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const x = new Float32Array(buf.length + Math.floor(0.6 * buf.sampleRate));   // thêm 0,3 s lặng hai đầu như bản ghi thật
      x.set(buf.getChannelData(0), Math.floor(0.3 * buf.sampleRate));
      await xuLy(x, buf.sampleRate);
      return $('luyen_trang_thai').textContent;
    },
    // Micro giả: thay getUserMedia bằng một luồng do trang tự tạo (ồn trắng + tệp/âm lướt bơm vào lúc cần) — để kiểm
    // trọn đường ghi âm thật (AudioWorklet, tự dừng, thanh mức, chẩn đoán) trên máy không có micro.
    micGia: async () => {
      const ctx = new AudioContext();
      const dich = ctx.createMediaStreamDestination();
      const gOn = ctx.createGain(); gOn.gain.value = 0; gOn.connect(dich);
      const b = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const on = ctx.createBufferSource(); on.buffer = b; on.loop = true; on.connect(gOn); on.start();
      navigator.mediaDevices.getUserMedia = async () => { await ctx.resume(); return new MediaStream([dich.stream.getAudioTracks()[0].clone()]); };
      return {
        ctx,
        on: (db) => { gOn.gain.value = db == null ? 0 : 10 ** (db / 20) * Math.sqrt(3); },   // ồn trắng đều có RMS = 1/√3
        phat: async (url, tre = 0.3, heSo = 0.5) => {
          const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
          const s = ctx.createBufferSource(), g = ctx.createGain();
          s.buffer = buf; g.gain.value = heSo; s.connect(g).connect(dich); s.start(ctx.currentTime + tre);
          return buf.duration;
        },
        luot: (tre = 0.3, giay = 3.4) => {                                    // âm lướt 110 → 330 Hz như người lướt giọng
          const o = ctx.createOscillator(), loc = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'sawtooth'; loc.type = 'lowpass'; loc.frequency.value = 2500; g.gain.value = 0.15;
          const t = ctx.currentTime + tre;
          o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(330, t + giay);
          o.connect(loc).connect(g).connect(dich); o.start(t); o.stop(t + giay);
        },
      };
    },
  };
}

// ---------------------------------------------------------------- khởi động
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const coCu = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // bản mới vừa được cài: tải lại một lần để chạy mã mới (chỉ khi đang không ghi/hiệu chuẩn)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (coCu && ['chao', 'lo_trinh', 'nguon'].includes(manHienTai)) location.reload();
  });
}
moMan(hs ? 'lo_trinh' : 'chao');
