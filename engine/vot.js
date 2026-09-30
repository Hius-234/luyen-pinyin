// 1.6.2.2 — Bộ đo VOT JS: chuyển nguyên văn scripts/do_am.py (co_chu_ky, vot) để điện thoại cho CÙNG kết luận bật hơi
// với Python. Gồm: bộ lọc Butterworth bậc 4 (biến đổi song tuyến như scipy.signal.butter) + lọc hai chiều có đệm biên
// kiểu "odd" và trạng thái đầu như scipy.signal.sosfiltfilt; bộ dò cao độ = cao_do.js (Praat AC, bước 2 ms).
// Hằng số (TANG_BURST, DAI_CAO_HZ, ...) đọc từ web/du_lieu/bat_hoi.json (xuất bởi scripts/danh_gia_bat_hoi.py).
import { doCaoDo } from './cao_do.js';
import { trungVi } from './thanh_dieu.js';

// ---------------------------------------------------------------- tiện ích kiểu numpy
const trungBinh = (v, a = 0, b = v.length) => { let s = 0; for (let i = a; i < b; i++) s += v[i]; return s / (b - a); };
function phanVi(v, p) {                     // np.percentile, nội suy tuyến tính
  const s = Array.from(v).sort((a, b) => a - b);
  const h = (p / 100) * (s.length - 1), lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}

// ---------------------------------------------------------------- bộ lọc (scipy.signal.butter + sosfiltfilt)
// Số phức dạng [thực, ảo]
const nhan = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const chia = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

export function butterSos(tanSoCat, fs, loai) {
  const N = 4;
  const wn = 2 * tanSoCat / fs;                      // chuẩn hóa theo Nyquist
  const wo = 4 * Math.tan(Math.PI * wn / 2);         // làm cong trước, fs_song_tuyen = 2
  const cuc = [];                                     // cực tương tự nguyên mẫu: -exp(iπm/2N), m = -N+1, ..., N-1
  for (let m = -N + 1; m < N; m += 2) cuc.push([-Math.cos(Math.PI * m / (2 * N)), -Math.sin(Math.PI * m / (2 * N))]);
  const cucS = cuc.map((p) => (loai === 'cao' ? chia([wo, 0], p) : [wo * p[0], wo * p[1]]));
  let kS = [1, 0];
  if (loai === 'cao') { let tich = [1, 0]; for (const p of cuc) tich = nhan(tich, [-p[0], -p[1]]); kS = chia([1, 0], tich); }
  else kS = [wo ** N, 0];
  // song tuyến: z = (4 + s) / (4 - s); k_z = k * prod(4 - z_s) / prod(4 - p_s)
  let mau = [1, 0];
  for (const p of cucS) mau = nhan(mau, [4 - p[0], -p[1]]);
  const tuS = loai === 'cao' ? 4 ** N : 1;           // thông cao: N zero ở s = 0 -> prod(4 - 0) = 4^N
  const kZ = chia(nhan(kS, [tuS, 0]), mau)[0];
  const sos = [];
  for (const p of cucS) {
    if (p[1] < 0) continue;                           // mỗi cặp liên hợp lấy một lần
    const pz = chia([4 + p[0], p[1]], [4 - p[0], -p[1]]);
    const b = loai === 'cao' ? [1, -2, 1] : [1, 2, 1];
    sos.push([...b, 1, -2 * pz[0], pz[0] * pz[0] + pz[1] * pz[1]]);
  }
  sos[0][0] *= kZ; sos[0][1] *= kZ; sos[0][2] *= kZ;
  return sos;
}

function sosfilt(sos, x, zi) {
  const y = new Float64Array(x.length);
  const z = zi.map((r) => r.slice());
  for (let n = 0; n < x.length; n++) {
    let v = x[n];
    for (let s = 0; s < sos.length; s++) {
      const [b0, b1, b2, , a1, a2] = sos[s];
      const o = b0 * v + z[s][0];
      z[s][0] = b1 * v - a1 * o + z[s][1];
      z[s][1] = b2 * v - a2 * o;
      v = o;
    }
    y[n] = v;
  }
  return y;
}

function sosfiltZi(sos) {
  let thang = 1;
  return sos.map(([b0, b1, b2, , a1, a2]) => {
    // lfilter_zi bậc 2: (I - A^T) zi = b[1:] - a[1:] b0, với A^T = [[-a1, 1], [-a2, 0]]
    const B0 = b1 - a1 * b0, B1 = b2 - a2 * b0;
    const m00 = 1 + a1, m01 = -1, m10 = a2, m11 = 1, det = m00 * m11 - m01 * m10;
    const zi = [thang * (B0 * m11 - m01 * B1) / det, thang * (m00 * B1 - m10 * B0) / det];
    thang *= (b0 + b1 + b2) / (1 + a1 + a2);
    return zi;
  });
}

export function sosfiltfilt(sos, x) {
  const bien = 3 * (2 * sos.length + 1);              // padlen mặc định (b2, a2 khác 0)
  const n = x.length;
  const ext = new Float64Array(n + 2 * bien);
  for (let i = 0; i < bien; i++) ext[i] = 2 * x[0] - x[bien - i];
  for (let i = 0; i < n; i++) ext[bien + i] = x[i];
  for (let i = 0; i < bien; i++) ext[bien + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  const zi = sosfiltZi(sos);
  const y1 = sosfilt(sos, ext, zi.map((r) => r.map((v) => v * ext[0])));
  const nguoc = y1.slice().reverse();
  const y2 = sosfilt(sos, nguoc, zi.map((r) => r.map((v) => v * nguoc[0]))).reverse();
  return y2.slice(bien, bien + n);
}

// ---------------------------------------------------------------- co_chu_ky, năng lượng
export function coChuKy(x, fs, nguong = 0.5) {
  if (x.length < Math.floor(fs * 0.02)) return false;
  const tb = trungBinh(x);
  const y = Array.from(x, (v) => v - tb);
  let a0 = 0;
  for (const v of y) a0 += v * v;
  if (a0 <= 0) return false;
  const lo = Math.floor(fs / 400), hi = Math.min(y.length - 1, Math.floor(fs / 60));
  if (!(hi > lo)) return false;
  let lon = -Infinity;
  for (let lag = lo; lag < hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < y.length; i++) s += y[i] * y[i + lag];
    if (s / a0 > lon) lon = s / a0;
  }
  return lon > nguong;
}

function duongBaoDb(x, fs) {                          // _duong_bao_db, khung 1 ms
  const n = Math.max(1, Math.floor(fs * 0.001)), m = Math.floor(x.length / n);
  const e = new Float64Array(m);
  for (let k = 0; k < m; k++) { let s = 0; for (let i = k * n; i < (k + 1) * n; i++) s += x[i] * x[i]; e[k] = 20 * Math.log10(Math.sqrt(s / n + 1e-12)); }
  return { e, buoc: n / fs };
}

function lamMuot3(e) { return Float64Array.from(e, (_, k) => trungVi(e.slice(Math.max(0, k - 1), k + 2))); }

// 10·log10(np.convolve(s², ones(w)/w, 'same')[::n1][:dai] + 1e-12)
function nangLuongTruot(x, w, n1, dai) {
  const P = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) P[i + 1] = P[i] + x[i] * x[i];
  const lui = Math.ceil((w - 1) / 2), toi = Math.floor((w - 1) / 2);
  const ra = new Float64Array(dai);
  for (let k = 0; k < dai; k++) {
    const i = k * n1, a = Math.max(0, i - lui), b = Math.min(x.length - 1, i + toi);
    ra[k] = 10 * Math.log10((b >= a ? P[b + 1] - P[a] : 0) / w + 1e-12);
  }
  return ra;
}

const lamTron = (v, so) => Math.round(v * 10 ** so) / 10 ** so;

// ---------------------------------------------------------------- vot (scripts/do_am.vot)
export function vot(x, fs, san, tran, HS) {
  const rong = { vot_ms: null, am: false, t_burst: null, t_rung: null, ly_do: '' };
  const p = doCaoDo(x, fs, { cach: 'ac', buoc: 0.002, san, tran, nguongHuuThanh: 0.5 });
  const f = p.f, tt = p.t;
  const idx = [];
  for (let i = 0; i < f.length; i++) if (f[i] > 0) idx.push(i);
  if (idx.length < 10) return { ...rong, ly_do: 'khong_thay_huu_thanh' };
  const doan = [];
  let d0 = idx[0];
  for (let k = 1; k <= idx.length; k++) {
    if (k === idx.length || idx[k] - idx[k - 1] > 5) {
      const a = tt[d0], b = tt[idx[k - 1]];
      if (b - a >= 0.030) doan.push([a, b]);
      if (k < idx.length) d0 = idx[k];
    }
  }
  if (!doan.length) return { ...rong, ly_do: 'huu_thanh_qua_ngan' };

  const locCao = (hz) => sosfiltfilt(butterSos(Math.min(hz, 0.45 * fs), fs, 'cao'), x);
  const duongCao = (sig) => { const { e, buoc } = duongBaoDb(sig, fs); return { ec: lamMuot3(e), buoc }; };
  const caoHz = locCao(HS.DAI_CAO_HZ);
  const { ec, buoc: dt } = duongCao(caoHz);
  const thap = sosfiltfilt(butterSos(400, fs, 'thap'), x);
  const tE = Float64Array.from(ec, (_, i) => (i + 0.5) * dt);
  const n1 = Math.max(1, Math.floor(fs * 0.001)), w = Math.floor(fs * 0.010);
  const el = nangLuongTruot(thap, w, n1, ec.length);
  const tong = nangLuongTruot(x, w, n1, ec.length);
  let iDinh = 0;
  for (let i = 1; i < tong.length; i++) if (tong[i] > tong[iDinh]) iDinh = i;
  const tDinh = tE[iDinh];
  let maxTong = -Infinity;
  for (const v of tong) if (v > maxTong) maxTong = v;

  function timBurst(ec2, moRong = false) {
    const n = ec2.length;
    const k0 = Math.max(5, Math.floor(tDinh / dt));
    let minTruoc = Infinity, maxEc = -Infinity;
    for (let i = 0; i < Math.min(k0, n); i++) if (ec2[i] < minTruoc) minTruoc = ec2[i];
    for (const v of ec2) if (v > maxEc) maxEc = v;
    const nguong = Math.max(minTruoc + 15, maxEc - 40);
    const vuot = Array.from(ec2, (v, i) => v > nguong && tE[i] < tDinh);
    const ben = [];
    for (let i = 0; i + 2 < n; i++) ben.push(vuot[i] && vuot[i + 1] && vuot[i + 2]);
    let tim = [];
    ben.forEach((b, i) => { if (b) tim.push(i); });
    if (HS.TANG_BURST !== null && tim.length) {
      const nen = new Float64Array(n).fill(Infinity);
      for (let i = 25; i < n; i++) nen[i] = trungVi(ec2.slice(i - 25, i - 5));
      for (let i = 10; i < Math.min(25, n); i++) nen[i] = trungVi(ec2.slice(0, i - 5));
      const dot = new Array(n).fill(false);
      for (let i = 0; i < ben.length; i++) {
        const tang = (ec2[i] + ec2[i + 1] + ec2[i + 2]) / 3 - nen[i];
        dot[i] = ben[i] && tang >= HS.TANG_BURST;
        if (!moRong && i >= 1 && ben[i - 1]) dot[i] = false;       // chỉ chỗ bắt đầu đợt vượt ngưỡng
      }
      const dotNgot = [];
      dot.forEach((v, i) => { if (v && (i === 0 || !dot[i - 1])) dotNgot.push(i); });
      if (moRong) return dotNgot;
      const dau = tim.filter((i) => i === 0 || !ben[i - 1]);
      const dauSom = dau.filter((i) => i < 10);
      tim = dotNgot.length ? dotNgot : dauSom.length ? dauSom : tim;
    }
    return tim;
  }

  let tim = timBurst(ec);
  if (HS.RUNG_KIN_DB !== null) {
    const tim2 = timBurst(duongCao(locCao(HS.DAI_CAO_PHAN_XU_HZ)).ec);
    if (tim.length && tim2.length && tim2[0] - tim[0] > 15) {
      const t1 = tE[tim[0]], t2 = tE[tim2[0]];
      let dem = 0, huu = 0;
      for (let i = 0; i < tt.length; i++) if (tt[i] >= t1 && tt[i] <= t2) { dem++; if (f[i] > 0) huu++; }
      const nho = trungBinh(tong, tim[0], tim2[0]) < maxTong - HS.RUNG_KIN_DB;
      if (dem && huu / dem >= 0.8 && nho) tim = tim2;
    } else if (!tim.length) tim = tim2;
  }
  if (!tim.length) return { ...rong, ly_do: 'khong_thay_burst' };

  const w10 = Math.floor(fs * 0.010);
  const soKhung10 = Math.floor(caoHz.length / w10);
  const khungCao = Float64Array.from({ length: soKhung10 }, (_, k) => trungBinh(caoHz.map ? caoHz.subarray(k * w10, (k + 1) * w10).map((v) => v * v) : [], 0, w10));
  const onCao = soKhung10 ? phanVi(khungCao, 10) : 0;

  function miengDong(a, b) {
    const w5 = Math.floor(0.005 * fs);
    const i0 = Math.floor(a * fs), i1 = Math.floor((b - 0.005) * fs);
    const m = Math.floor((i1 - i0) / w5);
    if (m < 2) return true;
    const tl = [];
    for (let k = 0; k < m; k++) {
      let hc = 0, tg = 0;
      for (let i = i0 + k * w5; i < i0 + (k + 1) * w5; i++) { hc += caoHz[i] * caoHz[i]; tg += x[i] * x[i]; }
      hc = hc / w5 - onCao; tg /= w5;
      tl.push(10 * Math.log10(Math.max(hc, 1e-15)) - 10 * Math.log10(tg + 1e-15));
    }
    return trungVi(tl) <= -HS.MIENG_DONG_DB;
  }

  const nenThap = Math.max(phanVi(el, 10), Math.max(...el) - 70);

  function doTu(tBurst) {
    const kq = { vot_ms: null, am: false, t_burst: lamTron(tBurst, 4), t_rung: null, ly_do: '' };
    if (tBurst < 0.005) kq.ly_do = 'tep_cat_sat_burst';
    for (const [a, b] of doan) {
      if (a <= tBurst - 0.010 && b >= tBurst) {
        const i0 = Math.floor(a / dt), i1 = Math.max(i0 + 1, Math.floor(tBurst / dt));
        if (trungBinh(tong, i0, i1) > maxTong - 10) return { ...kq, ly_do: 'burst_khong_ro' };
        if (!miengDong(a, tBurst)) return { ...kq, ly_do: 'burst_khong_ro' };
        return { ...kq, vot_ms: lamTron((a - tBurst) * 1000, 1), am: true, t_rung: lamTron(a, 4) };
      }
    }
    const j = [];
    for (let i = 0; i < el.length; i++) if (el[i] > nenThap + 15 && tE[i] < tBurst - 0.002) j.push(i);
    if (j.length) {
      let dau2 = j[0];
      for (let k = 1; k < j.length; k++) if (j[k] - j[k - 1] > 3) dau2 = j[k];
      const cuoi2 = j[j.length - 1];
      if ((cuoi2 - dau2 + 1) * dt >= 0.020 && tBurst - tE[cuoi2] < 0.015 &&
          coChuKy(thap.subarray(Math.floor(tE[dau2] * fs), Math.floor(tBurst * fs)), fs)) {
        if (!miengDong(tE[dau2], tBurst)) return { ...kq, ly_do: 'burst_khong_ro' };
        return { ...kq, vot_ms: lamTron(-(tBurst - tE[dau2]) * 1000, 1), am: true, t_rung: lamTron(tE[dau2], 4) };
      }
    }
    const sau = doan.filter(([a]) => a >= tBurst - 0.005);
    if (!sau.length) return { ...kq, ly_do: 'khong_thay_rung_sau_burst' };
    const tRung = sau[0][0];
    kq.t_rung = lamTron(tRung, 4);
    kq.vot_ms = lamTron((tRung - tBurst) * 1000, 1);
    const iB = Math.floor(tBurst / dt), iR = Math.floor(tRung / dt);
    if (iR - iB > 20) {
      const nenB = trungVi(ec.slice(Math.max(0, iB - 25), Math.max(1, iB - 5)));
      let tren = 0;
      for (let i = iB + 5; i < iR; i++) if (ec[i] > nenB + HS.LIEN_MACH_DB) tren++;
      if (tren / (iR - iB - 5) < 0.8) return { ...kq, ly_do: 'burst_roi_rac' };
    }
    if (kq.vot_ms < -5) kq.ly_do = 'burst_sau_rung';
    else if (kq.vot_ms > 200) kq.ly_do = 'vot_qua_dai';
    return kq;
  }

  const kq = doTu(tE[tim[0]]);
  if (kq.ly_do === 'vot_qua_dai' || kq.ly_do === 'burst_roi_rac') {
    for (const i of timBurst(ec, true)) {
      const t = tE[i];
      if (t <= tE[tim[0]] + 0.005 || doan.some(([a, b]) => a - 0.005 <= t && t <= b)) continue;
      const k2 = doTu(t);
      if (!k2.ly_do) return k2;
    }
  }
  return kq;
}
