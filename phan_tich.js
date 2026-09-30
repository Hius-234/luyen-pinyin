// Chuỗi xử lý của app — hàm thuần, không dính giao diện (chạy được cả trong trình duyệt lẫn Node để kiểm thử).
//   hieuChuan(): 1.3.3 hồ sơ giọng (khoảng dò, trung vị, độ rộng, mốc cá nhân từ bài hiệu chuẩn)
//   chamMuc():   1.3.2 kiểm tín hiệu -> 1.3.4 ô thanh -> 1.3.5 ô 声母 -> 1.4.3 chọn lỗi
import { doCaoDo } from './engine/cao_do.js';
import { duongF0, dacTrung, hoSoTuDuLieu, mocTu, cham, khoangDo } from './engine/thanh_dieu.js';
import { vot } from './engine/vot.js';
import { kiemTra } from './engine/tin_hieu.js';
import { chamThanhMau, capCua } from './engine/bat_hoi.js';
import { chonLoi } from './engine/phan_hoi.js';

// banGhi: [{x, fs, thanh (0 = lướt giọng)}]. Trả {hs, loi[]}: hs = {san, tran, hoSo, moc, soBan} hoặc null nếu chưa đủ
export function hieuChuan(banGhi, TC, nenMoiTruong = null) {
  const loi = [];
  // lượt 1: dò rộng 60–600 Hz trên mọi bản (kể cả lướt giọng) -> khoảng dò riêng (như scripts/trich_f0.py)
  const mau = [];
  for (const b of banGhi) {
    const { f } = doCaoDo(b.x, b.fs, { cach: 'ac', buoc: 0.01, san: 60, tran: 600 });
    for (const v of f) if (v > 0) mau.push(v);
  }
  if (mau.length < 20) return { hs: null, loi: ['chua_thay_giong'] };
  const [san, tran] = khoangDo(mau);
  // lượt 2: âm tiết có thanh -> hồ sơ + mốc
  const doc = [];
  banGhi.forEach((b, i) => {
    if (!b.thanh) return;
    const th = kiemTra(b.x, b.fs, false, nenMoiTruong);
    if (!th.dat) { loi.push({ i, ly_do: th.ly_do.join(',') }); return; }
    const f = duongF0(b.x, b.fs, san, tran, TC.hang_so);
    if (!f || f.lech2BoDo === null || f.lech2BoDo > TC.hang_so.BAT_DONG_ST) { loi.push({ i, ly_do: 'khong_do_chac_cao_do' }); return; }
    doc.push({ i, thanh: b.thanh, f });
  });
  // bản hữu thanh < 150 ms không cho đặc trưng -> bỏ (người dùng đọc lại bản đó)
  const dung = doc.filter((d) => {
    if (d.f.huuThanh >= TC.hang_so.HUU_THANH_MIN) return true;
    loi.push({ i: d.i, ly_do: 'am_tiet_qua_ngan' });
    return false;
  });
  const thieu = [1, 2, 3, 4].filter((t) => !dung.some((d) => d.thanh === t));
  if (thieu.length) return { hs: null, loi, thieuThanh: thieu };
  const hoSo = hoSoTuDuLieu(dung.map((d) => d.f.hz));
  const banDt = dung.map((d) => ({ thanh: d.thanh, dt: dacTrung(d.f.hz, d.f.huuThanh, hoSo, TC.hang_so) }));
  return { hs: { san, tran, hoSo, moc: mocTu(banDt, TC), soBan: dung.length, nenMoiTruong }, loi };
}

const XAM = (ly_do) => ({ trang_thai: 'xam', loi: '', ly_do_xam: ly_do });

// Chấm một lần đọc của mục `muc` (một phần tử lo_trinh.json). Trả toàn bộ số đo + 3 ô + lỗi chính/phụ.
export function chamMuc(x, fs, muc, hs, TC, BH, LUAT) {
  const tinHieu = kiemTra(x, fs, false, hs.nenMoiTruong);
  if (!tinHieu.dat) {
    return { tinHieu, o3: { thanh_mau: XAM('tin_hieu_kem'), van: XAM('tin_hieu_kem'), thanh: XAM('tin_hieu_kem') },
             chinh: null, phu: null, tinhLanThu: false };
  }
  const f = duongF0(x, fs, hs.san, hs.tran, TC.hang_so);
  const dt = f ? dacTrung(f.hz, f.huuThanh, hs.hoSo, TC.hang_so) : null;
  const oThanh = cham(TC, muc.thanh, dt, f ? f.lech2BoDo : null, true, hs.moc);
  let oTM = XAM('khong_tu_cham'), v = null;
  if (capCua(muc.phu_am, BH)) {
    if (kiemTra(x, fs, true, hs.nenMoiTruong).dat) { v = vot(x, fs, hs.san, hs.tran, BH.hang_so); oTM = chamThanhMau(muc.phu_am, v, BH); }
    else oTM = XAM('giong_chua_du_noi_cho_bat_hoi');
  }
  const o3 = { thanh_mau: oTM, van: XAM('chi_nghe_ab'), thanh: oThanh };
  const { chinh, phu } = chonLoi(LUAT, { thanh: oThanh, thanh_mau: oTM, van: o3.van }, muc.phu_am);
  return { tinHieu, f, dt, vot: v, o3, chinh, phu, tinhLanThu: true,
           dat: !Object.values(o3).some((o) => o.trang_thai === 'do') && oThanh.trang_thai !== 'xam' };
}

// Bậc Chao (1–5) của đường nét đã chuẩn hóa — engine/dac_trung.sang_chao
export const sangChao = (net, H) => net.map((v) => Math.min(5, Math.max(1, 3 + v / (H.DO_RONG_CHUAN * 1.6) * 2)));
