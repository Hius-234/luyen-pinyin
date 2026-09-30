// 1.6.2.1 — Bộ dò cao độ JS: chuyển thuật toán của Praat (Sound_to_Pitch, Boersma 1993) để engine trên điện thoại
// cho CÙNG kết luận với engine Python (parselmouth). Hai cách như Praat:
//   'ac' = tự tương quan, cửa sổ Hanning 3 chu kỳ (to_pitch_ac)
//   'cc' = tương quan chéo "forward", cửa sổ 1 chu kỳ (to_pitch_cc)
// Theo mã nguồn Praat: chuẩn hóa tự tương quan cho cửa sổ, ứng viên = cực đại (nội suy parabol rồi sinc 70),
// ứng viên "vô thanh" theo độ to cục bộ, chọn đường bằng Viterbi (phạt nhảy quãng tám, phạt đổi hữu/vô thanh).
// Mọi chỉ số trong file này bắt đầu từ 0 (Praat bắt đầu từ 1) — đã đổi cẩn thận ở từng chỗ.

const MAC_DINH = {
  ac: { soChuKy: 3.0, doSauNoiSuy: 0.5, nguongHuuThanh: 0.45, phatNhayQuangTam: 0.35 },
  cc: { soChuKy: 1.0, doSauNoiSuy: 1.0, nguongHuuThanh: 0.45, phatNhayQuangTam: 0.35 },
};

// ---------------------------------------------------------------- FFT thực (qua FFT phức cơ số 2)
function fftPhuc(re, im, nguoc) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const goc = (2 * Math.PI / len) * (nguoc ? 1 : -1);
    const wr = Math.cos(goc), wi = Math.sin(goc);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * ur - im[b] * ui, ti = re[b] * ui + im[b] * ur;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const t = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = t;
      }
    }
  }
}

// Tự tương quan tuyến tính của x (đã đệm 0 tới nFFT) — trả mảng r[lag], lag = 0..nFFT-1 (chưa chuẩn hóa)
function tuTuongQuan(x, nFFT) {
  const re = new Float64Array(nFFT), im = new Float64Array(nFFT);
  re.set(x.subarray(0, Math.min(x.length, nFFT)));
  fftPhuc(re, im, false);
  for (let i = 0; i < nFFT; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fftPhuc(re, im, true);
  for (let i = 0; i < nFFT; i++) re[i] /= nFFT;
  return re;
}

// ---------------------------------------------------------------- nội suy sinc (NUM_interpolate_sinc của Praat)
// y: mảng, x: vị trí tính theo chỉ số 1 (như Praat), doSau: độ sâu tối đa
function noiSuySinc(y, x, doSau) {
  const n = y.length;
  const giua = Math.floor(x), phai = giua + 1;
  if (x > n) return y[n - 1];
  if (x < 1) return y[0];
  if (x === giua) return y[giua - 1];
  let d = doSau;
  if (d > phai - 1) d = phai - 1;
  if (d > n - giua) d = n - giua;
  if (d <= 0) return y[Math.round(x) - 1];
  if (d === 1) return y[giua - 1] + (x - giua) * (y[phai - 1] - y[giua - 1]);
  const trai = phai - d, phaiCung = giua + d;
  let kq = 0;
  let a = Math.PI * (x - giua), halfsina = 0.5 * Math.sin(a);
  let aa = a / (x - trai + 1), daa = Math.PI / (x - trai + 1);
  let cosaa = Math.cos(aa), sinaa = Math.sin(aa);
  const cosdaa = Math.cos(daa), sindaa = Math.sin(daa);
  for (let ix = giua; ix >= trai; ix--) {
    kq += y[ix - 1] * (halfsina / a * (1 + cosaa));
    a += Math.PI;
    const h = cosaa * cosdaa - sinaa * sindaa;
    sinaa = cosaa * sindaa + sinaa * cosdaa; cosaa = h;
    halfsina = -halfsina;
  }
  a = Math.PI * (phai - x); halfsina = 0.5 * Math.sin(a);
  aa = a / (phaiCung - x + 1);
  const daa2 = Math.PI / (phaiCung - x + 1);
  cosaa = Math.cos(aa); sinaa = Math.sin(aa);
  const cosdaa2 = Math.cos(daa2), sindaa2 = Math.sin(daa2);
  for (let ix = phai; ix <= phaiCung; ix++) {
    kq += y[ix - 1] * (halfsina / a * (1 + cosaa));
    a += Math.PI;
    const h = cosaa * cosdaa2 - sinaa * sindaa2;
    sinaa = cosaa * sindaa2 + sinaa * cosdaa2; cosaa = h;
    halfsina = -halfsina;
  }
  return kq;
}

// Tìm cực đại của đường sinc trong [ix-1, ix+1] (NUMimproveMaximum): tìm kiếm Brent (parabol + tỉ lệ vàng)
function caiThienCucDai(y, ix, doSau) {
  const n = y.length;
  if (ix <= 1) return { x: 1, y: y[0] };
  if (ix >= n) return { x: n, y: y[n - 1] };
  const f = (x) => -noiSuySinc(y, x, doSau);
  // Brent (Numerical Recipes / Praat NUMminimize_brent), tol 1e-10
  const C = 0.3819660112501051;
  let a = ix - 1, b = ix + 1, x = ix, w = x, v = x;
  let fx = f(x), fw = fx, fv = fx, d = 0, e = 0;
  for (let it = 0; it < 60; it++) {
    const m = 0.5 * (a + b), tol1 = 1e-10 * Math.abs(x) + 1e-10, tol2 = 2 * tol1;
    if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) break;
    let dung = false;
    if (Math.abs(e) > tol1) {
      let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p; else q = -q;
      const eTam = e;
      e = d;
      if (!(Math.abs(p) >= Math.abs(0.5 * q * eTam) || p <= q * (a - x) || p >= q * (b - x))) {
        d = p / q;
        const u = x + d;
        if (u - a < tol2 || b - u < tol2) d = m - x >= 0 ? tol1 : -tol1;
        dung = true;
      }
    }
    if (!dung) { e = (x >= m ? a : b) - x; d = C * e; }
    const u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1);
    const fu = f(u);
    if (fu <= fx) {
      if (u >= x) a = x; else b = x;
      v = w; fv = fw; w = x; fw = fx; x = u; fx = fu;
    } else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; }
      else if (fu <= fv || v === x || v === w) { v = u; fv = fu; }
    }
  }
  return { x, y: -fx };
}

// ---------------------------------------------------------------- chính
export function doCaoDo(mau, fs, tuyChon) {
  const cach = tuyChon.cach || 'ac';
  const md = MAC_DINH[cach];
  const buoc = tuyChon.buoc ?? 0.01;
  const san = tuyChon.san ?? 75;
  let tran = tuyChon.tran ?? 600;
  const nguongHuuThanh = tuyChon.nguongHuuThanh ?? md.nguongHuuThanh;
  const phatNhay = tuyChon.phatNhayQuangTam ?? md.phatNhayQuangTam;
  const nguongLang = 0.03, phatQuangTam = 0.01, phatDoiHuuVo = 0.14, soUngVienToiDa = 15;
  const soChuKy = md.soChuKy;
  const doSauBrent = 70;
  const dx = 1 / fs, nx = mau.length;
  const x = mau;   // chỉ số 0

  const thoiLuong = nx * dx;
  if (tran > 0.5 * fs) tran = 0.5 * fs;
  const nMauChuKy = Math.floor(1 / dx / san);
  const nuaChuKy = Math.floor(nMauChuKy / 2) + 1;
  const dtCuaSo = soChuKy / san;
  let nCuaSo = Math.floor(dtCuaSo / dx);
  const nuaCuaSo = Math.floor(nCuaSo / 2) - 1;
  nCuaSo = nuaCuaSo * 2;
  let treMin = Math.floor(1 / dx / tran);
  if (treMin < 2) treMin = 2;
  let treMax = Math.floor(nCuaSo / soChuKy) + 2;
  if (treMax > nCuaSo) treMax = nCuaSo;

  // Sampled_shortTermAnalysis
  const dtPhanTich = cach === 'cc' ? 1 / san + dtCuaSo : dtCuaSo;
  const soKhung = Math.floor((thoiLuong - dtPhanTich) / buoc) + 1;
  if (soKhung < 1) return { t: new Float64Array(0), f: new Float64Array(0) };
  const t1 = 0.5 * thoiLuong - 0.5 * soKhung * buoc + 0.5 * buoc;
  const x1 = 0.5 * dx;   // thời điểm mẫu đầu

  // đỉnh toàn cục (sau khi trừ trung bình cả tệp)
  let tb = 0;
  for (let i = 0; i < nx; i++) tb += x[i];
  tb /= nx;
  let dinhToanCuc = 0;
  for (let i = 0; i < nx; i++) { const v = Math.abs(x[i] - tb); if (v > dinhToanCuc) dinhToanCuc = v; }
  const t = new Float64Array(soKhung), f = new Float64Array(soKhung);
  for (let k = 0; k < soKhung; k++) t[k] = t1 + k * buoc;
  if (dinhToanCuc === 0) return { t, f };

  const brentIxmax = Math.floor(nCuaSo * md.doSauNoiSuy);
  let nFFT = 1, cuaSo = null, rCuaSo = null;
  if (cach === 'ac') {
    while (nFFT < nCuaSo * (1 + md.doSauNoiSuy)) nFFT *= 2;
    cuaSo = new Float64Array(nCuaSo);
    for (let i = 1; i <= nCuaSo; i++) cuaSo[i - 1] = 0.5 - 0.5 * Math.cos(i * 2 * Math.PI / (nCuaSo + 1));
    rCuaSo = tuTuongQuan(cuaSo, nFFT);
    const r0 = rCuaSo[0];
    for (let i = 0; i < nFFT; i++) rCuaSo[i] /= r0;
  }

  const khung = [];   // mỗi khung: {cuongDo, ungVien:[{f, s}]}
  const khungMau = new Float64Array(Math.max(nFFT, nCuaSo));
  // r theo chỉ số lag: rMang[lag + brentIxmax], lag từ -brentIxmax..brentIxmax (đủ cho nội suy)
  const rMang = new Float64Array(2 * brentIxmax + 1);

  for (let k = 0; k < soKhung; k++) {
    const tk = t[k];
    const trai1 = Math.floor((tk - x1) / dx) + 1;   // Sampled_xToLowIndex (chỉ số 1)
    const phai1 = trai1 + 1;
    // trung bình cục bộ: một chu kỳ dài nhất về mỗi phía
    let s0 = phai1 - nMauChuKy, s1 = trai1 + nMauChuKy;
    let tbCucBo = 0;
    for (let i = s0; i <= s1; i++) tbCucBo += x[Math.min(Math.max(i, 1), nx) - 1];
    tbCucBo /= 2 * nMauChuKy;
    // chép cửa sổ, trừ trung bình cục bộ
    s0 = phai1 - nuaCuaSo;
    khungMau.fill(0);
    for (let j = 0; j < nCuaSo; j++) {
      const v = x[Math.min(Math.max(s0 + j, 1), nx) - 1] - tbCucBo;
      khungMau[j] = cach === 'ac' ? v * cuaSo[j] : v;
    }
    // đỉnh cục bộ: nửa chu kỳ dài nhất về mỗi phía (chỉ số 1 trong khung)
    let a0 = nuaCuaSo + 1 - nuaChuKy, a1 = nuaCuaSo + nuaChuKy;
    if (a0 < 1) a0 = 1;
    if (a1 > nCuaSo) a1 = nCuaSo;
    let dinhCucBo = 0;
    for (let j = a0; j <= a1; j++) { const v = Math.abs(khungMau[j - 1]); if (v > dinhCucBo) dinhCucBo = v; }
    const cuongDo = dinhCucBo > dinhToanCuc ? 1 : dinhCucBo / dinhToanCuc;

    // tương quan -> rMang
    rMang.fill(0);
    rMang[brentIxmax] = 1;
    if (cach === 'ac') {
      const ac = tuTuongQuan(khungMau.subarray(0, nFFT), nFFT);
      for (let i = 1; i <= brentIxmax; i++) {
        const v = ac[i] / (ac[0] * rCuaSo[i]);
        rMang[brentIxmax + i] = v; rMang[brentIxmax - i] = v;
      }
    } else {
      const tBatDau = tk - 0.5 * (1 / san + dtCuaSo);
      let batDau = Math.floor((tBatDau - x1) / dx) + 1;
      if (batDau < 1) batDau = 1;
      let span = treMax + nCuaSo;
      if (span > nx + 1 - batDau) span = nx + 1 - batDau;
      const treMaxCucBo = span - nCuaSo;
      const off = batDau - 1;   // amp[i] (i từ 1) = x[off + i - 1]
      const amp = (i) => x[off + i - 1] - tbCucBo;
      let sumx2 = 0;
      for (let i = 1; i <= nCuaSo; i++) { const v = amp(i); sumx2 += v * v; }
      let sumy2 = sumx2;
      for (let i = 1; i <= treMaxCucBo && i <= brentIxmax; i++) {
        const y0 = amp(i), yZ = amp(i + nCuaSo);
        sumy2 += yZ * yZ - y0 * y0;
        let tich = 0;
        for (let j = 1; j <= nCuaSo; j++) tich += amp(j) * amp(i + j);
        const v = tich / Math.sqrt(sumx2 * sumy2);
        rMang[brentIxmax + i] = v; rMang[brentIxmax - i] = v;
      }
    }

    const uv = [{ f: 0, s: 0 }];
    const imax = [0];
    if (dinhCucBo !== 0) {
      const r = (lag) => rMang[brentIxmax + lag];
      for (let i = 2; i < treMax && i < brentIxmax; i++) {
        if (r(i) > 0.5 * nguongHuuThanh && r(i) > r(i - 1) && r(i) >= r(i + 1)) {
          const dr = 0.5 * (r(i + 1) - r(i - 1)), d2r = 2 * r(i) - r(i - 1) - r(i + 1);
          const tanSo = 1 / dx / (i + dr / d2r);
          // vị trí trong rMang theo chỉ số 1: lag + brentIxmax + 1
          let doManh = noiSuySinc(rMang, 1 / dx / tanSo + brentIxmax + 1, 30);
          if (doManh > 1) doManh = 1 / doManh;
          let cho = -1;
          if (uv.length < soUngVienToiDa) { cho = uv.length; uv.push({ f: 0, s: 0 }); imax.push(0); }
          else {
            let yeuNhat = 2;
            for (let w = 1; w < soUngVienToiDa; w++) {
              const ls = uv[w].s - phatQuangTam * Math.log2(san / uv[w].f);
              if (ls < yeuNhat) { yeuNhat = ls; cho = w; }
            }
            if (doManh - phatQuangTam * Math.log2(san / tanSo) <= yeuNhat) cho = -1;
          }
          if (cho >= 0) { uv[cho] = { f: tanSo, s: doManh }; imax[cho] = i; }
        }
      }
      // lượt 2: cực đại sinc chính xác
      for (let c = 1; c < uv.length; c++) {
        const kq = caiThienCucDai(rMang, imax[c] + brentIxmax + 1, doSauBrent);
        const lag = kq.x - brentIxmax - 1;
        uv[c].f = 1 / dx / lag;
        uv[c].s = kq.y > 1 ? 1 / kq.y : kq.y;
      }
    }
    khung.push({ cuongDo, uv });
  }

  // ---------------- Viterbi (Pitch_pathFinder)
  const hieuChinh = 0.01 / buoc;
  const pNhay = phatNhay * hieuChinh, pDoi = phatDoiHuuVo * hieuChinh;
  const huu = (fr) => fr > 0 && fr < tran;
  const delta = khung.map((kh) => {
    let vo = nguongLang <= 0 ? 0 : 2 - kh.cuongDo / (nguongLang / (1 + nguongHuuThanh));
    vo = nguongHuuThanh + (vo > 0 ? vo : 0);
    return kh.uv.map((u) => (huu(u.f) ? u.s - phatQuangTam * Math.log2(tran / u.f) : vo));
  });
  const psi = khung.map((kh) => new Int32Array(kh.uv.length));
  for (let k = 1; k < soKhung; k++) {
    const truoc = khung[k - 1].uv, nay = khung[k].uv, dTruoc = delta[k - 1], dNay = delta[k];
    const moi = new Float64Array(nay.length);
    for (let c2 = 0; c2 < nay.length; c2++) {
      const f2 = nay[c2].f;
      let tot = -1e30, cho = 0;
      for (let c1 = 0; c1 < truoc.length; c1++) {
        const f1 = truoc[c1].f;
        const voTruoc = !huu(f1), voNay = !huu(f2);
        let phi;
        if (voNay) phi = voTruoc ? 0 : pDoi;
        else phi = voTruoc ? pDoi : pNhay * Math.abs(Math.log2(f1 / f2));
        const g = dTruoc[c1] - phi + dNay[c2];
        if (g > tot) { tot = g; cho = c1; }
      }
      moi[c2] = tot; psi[k][c2] = cho;
    }
    delta[k] = Array.from(moi);
  }
  let cho = 0;
  const dCuoi = delta[soKhung - 1];
  for (let c = 1; c < dCuoi.length; c++) if (dCuoi[c] > dCuoi[cho]) cho = c;
  for (let k = soKhung - 1; k >= 0; k--) {
    const fr = khung[k].uv[cho].f;
    f[k] = huu(fr) ? fr : 0;
    cho = psi[k][cho];
  }
  return { t, f };
}
