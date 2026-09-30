// 1.3.2 — Kiểm tra chất lượng tín hiệu: chuyển nguyên văn engine/tin_hieu.py.
// méo: ≥ 3 mẫu liền chạm trần (≥ 0,99) · độ nổi của giọng so với ồn = phân vị 95 − phân vị 10 năng lượng khung 20 ms
// (≥ 20 dB cho thanh điệu, ≥ 38 dB cho bật hơi). "Không đạt" luôn hiển thị XÁM, không bao giờ đỏ (WBS 1.3.2).
export const SNR_THANH = 20.0;
export const SNR_BAT_HOI = 38.0;

function phanVi(v, p) {
  const s = Array.from(v).sort((a, b) => a - b);
  const h = (p / 100) * (s.length - 1), lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}

export function kiemTra(x, fs, canBatHoi = false, nenMoiTruong = null) {
  const n = Math.floor(fs * 0.02), k = Math.floor(x.length / n);
  if (k < 5) return { dat: false, ly_do: ['qua_ngan'], snr_db: 0, meo: false };
  const e = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    let s = 0;
    for (let j = i * n; j < (i + 1) * n; j++) s += x[j] * x[j];
    e[i] = 10 * Math.log10(s / n + 1e-12);
  }
  let nen = phanVi(e, 10);
  if (nenMoiTruong !== null) nen = Math.max(nen, nenMoiTruong);
  const snr = phanVi(e, 95) - nen;
  let chuoi = 0, meo = false;
  for (let i = 0; i < x.length; i++) { chuoi = Math.abs(x[i]) >= 0.99 ? chuoi + 1 : 0; if (chuoi >= 3) { meo = true; break; } }
  const lyDo = [];
  if (meo) lyDo.push('meo_dinh');
  if (snr < (canBatHoi ? SNR_BAT_HOI : SNR_THANH)) lyDo.push('giong_chua_du_noi');
  return { dat: !lyDo.length, ly_do: lyDo, snr_db: Math.round(snr * 10) / 10, meo };
}
