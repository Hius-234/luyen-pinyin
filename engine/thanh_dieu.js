// 1.6.2.1 — Engine thanh điệu JS: chuyển nguyên văn engine/f0.py (làm sạch F0), engine/dac_trung.py (chuẩn hóa +
// đặc trưng), engine/tham_chieu.py (z cải biên quanh mốc cá nhân), engine/cham_thanh.py (luật 4 màu).
// Hằng số KHÔNG chép tay: đọc từ web/du_lieu/tham_chieu_thanh.json (xuất bởi scripts/xuat_tham_chieu.py).
import { doCaoDo } from './cao_do.js';

// ---------------------------------------------------------------- tiện ích kiểu numpy
export function trungVi(v) {
  const s = Array.from(v).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}
const trungBinh = (v) => v.reduce((a, b) => a + b, 0) / v.length;

// np.interp(x, xp, fp) với xp tăng dần
function noiSuy(x, xp, fp) {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
  let lo = 0, hi = xp.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xp[m] <= x) lo = m; else hi = m; }
  return fp[lo] + (x - xp[lo]) * (fp[hi] - fp[lo]) / (xp[hi] - xp[lo]);
}

// ---------------------------------------------------------------- engine/f0.py
function phanViTT(v, p) {                     // np.percentile, nội suy tuyến tính
  const s = Array.from(v).sort((a, b) => a - b);
  const h = (p / 100) * (s.length - 1), lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}

// Khoảng dò theo giọng (Hirst, 2 lượt): sàn 0,75·Q1; trần 2,0·Q3 — engine/f0.khoang_do
export function khoangDo(f0Mau) {
  return [Math.max(50, 0.75 * phanViTT(f0Mau, 25)), Math.min(800, 2.0 * phanViTT(f0Mau, 75))];
}

function doan(f, buoc) {
  const idx = [];
  for (let i = 0; i < f.length; i++) if (f[i] > 0) idx.push(i);
  if (idx.length < 5) return { s: null, huu: 0 };
  const s = Array.from(f.slice(idx[0], idx[idx.length - 1] + 1));
  const xp = [], fp = [];
  s.forEach((v, i) => { if (v > 0) { xp.push(i); fp.push(v); } });
  return { s: s.map((v, i) => noiSuy(i, xp, fp)), huu: (idx[idx.length - 1] - idx[0] + 1) * buoc };
}

export function suaQuangTam(st) {
  const ra = st.slice();
  for (let i = 0; i < st.length; i++) {
    const tv = trungVi(st.slice(Math.max(0, i - 3), i + 4));
    const lech = st[i] - tv;
    if (Math.abs(lech) >= 9 && Math.abs(lech) <= 15) ra[i] = st[i] - 12 * Math.sign(lech);
    else if (Math.abs(lech) > 5) ra[i] = tv;
  }
  return ra;
}

function lechCungLuc(stAc, tAc, tCc, cc, boDau) {
  const k = Math.floor(stAc.length * boDau);
  const s = stAc.slice(k), t = tAc.slice(k);
  const chon = [], giaTri = [];
  let dem = 0;
  for (let i = 0; i < t.length; i++) {
    // np.searchsorted(t_cc, t) rồi kẹp vào [1, n-1], chọn khung gần hơn
    let lo = 0, hi = tCc.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tCc[m] < t[i]) lo = m + 1; else hi = m; }
    let j = Math.min(Math.max(lo, 1), tCc.length - 1);
    if (Math.abs(tCc[j - 1] - t[i]) < Math.abs(tCc[j] - t[i])) j -= 1;
    const co = Math.abs(tCc[j] - t[i]) <= 0.006 && cc[j] > 0;
    if (co) { dem++; chon.push(i); giaTri.push(12 * Math.log2(cc[j] / 100)); }
  }
  const phu = t.length ? dem / t.length : 0;
  if (dem < 3) return { lech: null, phu };
  const c = suaQuangTam(giaTri);
  let tong = 0;
  chon.forEach((i, m) => { tong += (s[i] - c[m]) ** 2; });
  return { lech: Math.sqrt(tong / dem), phu };
}

// Trả {hz, huuThanh, lech2BoDo, phuChung} hoặc null — như engine/f0.duong_f0
export function duongF0(mau, fs, san, tran, H) {
  const ac = doCaoDo(mau, fs, { cach: 'ac', buoc: H.BUOC, san, tran, nguongHuuThanh: 0.5, phatNhayQuangTam: 0.6 });
  const cc = doCaoDo(mau, fs, { cach: 'cc', buoc: H.BUOC, san, tran });
  const { s, huu } = doan(ac.f, H.BUOC);
  if (!s || s.length < 3) return null;
  const st = suaQuangTam(s.map((v) => 12 * Math.log2(v / 100)));
  let dau = 0;
  while (!(ac.f[dau] > 0)) dau++;
  const tAc = Array.from(ac.t.slice(dau, dau + st.length));
  const { lech, phu } = lechCungLuc(st, tAc, cc.t, cc.f, H.BO_DAU);   // khung CC lệch khung AC 5 ms -> ghép theo thời điểm
  return { hz: st.map((v) => 100 * 2 ** (v / 12)), huuThanh: huu, lech2BoDo: phu >= H.PHU_CHUNG_TOI_THIEU ? lech : null, phuChung: phu };
}

// ---------------------------------------------------------------- engine/dac_trung.py
export function hoSoTuDuLieu(dsHz) {
  const tatCa = dsHz.filter((h) => h && h.length).flat();
  const tv = trungVi(tatCa);
  const st = tatCa.map((v) => 12 * Math.log2(v / tv));
  const tb = trungBinh(st);
  return { trung_vi_hz: tv, do_rong_st: Math.sqrt(trungBinh(st.map((v) => (v - tb) ** 2))) };
}

function duongNet(hz, hoSo, H, n = 10) {
  let st = hz.map((v) => 12 * Math.log2(v / hoSo.trung_vi_hz) * H.DO_RONG_CHUAN / Math.max(hoSo.do_rong_st, 1e-6));
  st = st.slice(Math.floor(st.length * H.BO_DAU));
  const xp = st.map((_, i) => i);
  return Array.from({ length: n }, (_, k) => noiSuy(k * (st.length - 1) / (n - 1), xp, st));
}

export function dacTrung(hz, huuThanh, hoSo, H) {
  if (!hz || huuThanh < H.HUU_THANH_MIN) return null;
  const n = duongNet(hz, hoSo, H);
  let iMin = 0;
  n.forEach((v, i) => { if (v < n[iMin]) iMin = i; });
  const dau = (n[0] + n[1]) / 2, cuoi = (n[n.length - 2] + n[n.length - 1]) / 2;
  return {
    muc: trungBinh(n), dau, cuoi, thap_nhat: n[iMin], vi_tri_thap: iMin / (n.length - 1),
    do_roi: dau - cuoi, do_len: cuoi - n[iMin], bien_do: Math.max(...n) - n[iMin], net: n,
  };
}

// ---------------------------------------------------------------- engine/tham_chieu.py + cham_thanh.py
export function mocTu(banGhi, TC) {
  const d = {};
  for (const b of banGhi) {
    if (!b.dt) continue;
    for (const f of TC.dac_trung_theo_thanh[b.thanh]) (d[`${b.thanh}:${f}`] ||= []).push(b.dt[f]);
  }
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, trungVi(v)]));
}

export function diemZ(TC, thanh, dt, moc) {
  const H = TC.hang_so, out = {};
  for (const f of TC.dac_trung_theo_thanh[thanh]) {
    const [lo, hi, tv] = TC.khoang[`${thanh}:${f}`];
    let m = moc && `${thanh}:${f}` in moc ? moc[`${thanh}:${f}`] : tv;
    m = Math.min(Math.max(m, lo - H.BIEN_MOC), hi + H.BIEN_MOC);
    out[f] = 0.6745 * (dt[f] - m) / TC.mad[`${thanh}:${f}`];
  }
  return out;
}

export function cham(TC, thanh, dt, lech2BoDo, tinHieuDat, moc) {
  const H = TC.hang_so;
  if (!tinHieuDat) return { trang_thai: 'xam', loi: '', z: {}, ly_do_xam: 'tin_hieu_kem' };
  if (!dt) return { trang_thai: 'xam', loi: '', z: {}, ly_do_xam: 'huu_thanh_ngan' };
  if (lech2BoDo === null || lech2BoDo === undefined || lech2BoDo > H.BAT_DONG_ST)
    return { trang_thai: 'xam', loi: '', z: {}, ly_do_xam: 'hai_bo_do_bat_dong' };
  const z = diemZ(TC, thanh, dt, moc);
  if (Math.max(...Object.values(z).map(Math.abs)) <= H.XANH) return { trang_thai: 'xanh', loi: '', z, ly_do_xam: '' };
  const khop = TC.loi_da_biet[thanh].filter(([f, h]) => f in z && z[f] * h > H.DO).map(([f, h, ma]) => [z[f] * h, ma]);
  if (khop.length) {
    khop.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));   // như max() của Python trên tuple
    return { trang_thai: 'do', loi: khop[khop.length - 1][1], z, ly_do_xam: '' };
  }
  return { trang_thai: 'vang', loi: '', z, ly_do_xam: '' };
}
