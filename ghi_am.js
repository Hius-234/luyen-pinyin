// Ghi âm cho màn luyện (1.3.2 tự dừng; 1.6.6 micro tự dừng ~1,5–2,5 s) + thanh mức và tự chẩn đoán micro.
// Tắt mọi xử lý của trình duyệt (khử vọng, giảm ồn, tự chỉnh mức): chúng đổi chính tín hiệu mà engine đo
// (docs/bao_cao/TUONG_DUONG_JS.md "Giới hạn").

export const muaMicDuoc = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode);

const KHUNG_S = 0.02;              // khung 20 ms để dò lúc bắt đầu / dừng nói
const BO_QUA_DAU_S = 0.15;         // bỏ qua tiếng chạm màn hình lúc bấm nút
const KHUNG_LIEN_TIEP = 3;         // to liền 60 ms mới tính là bắt đầu nói (tiếng "tách" khi chạm máy < 20 ms)
export const NOI_HON_NEN_DB = 15;  // bắt đầu nói: to hơn nền 15 dB (như scripts/ghi_am.py)
const HET_NOI_DB = 8;              // hết nói: dưới nền + 8 dB
export const IM_TUYET_DOI = 1e-6;  // biên độ lớn nhất dưới mức này = micro trả về toàn số 0 (máy chặn micro / app khác chiếm)

// Mức ồn môi trường (dBFS) = trung vị năng lượng khung 50 ms — giống scripts/ghi_am.py muc_on (CR-006)
export function mucOn(x, fs) {
  const n = Math.floor(fs * 0.05), k = Math.floor(x.length / n);
  const e = [];
  for (let i = 0; i < k; i++) { let s = 0; for (let j = i * n; j < (i + 1) * n; j++) s += x[j] * x[j]; e.push(10 * Math.log10(s / n + 1e-12)); }
  e.sort((a, b) => a - b);
  return e.length ? (e.length % 2 ? e[(e.length - 1) / 2] : 0.5 * (e[e.length / 2 - 1] + e[e.length / 2])) : -90;
}

export const bienDoMax = (x) => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };

// Duyệt tín hiệu theo khung 20 ms: gọi moiKhung(dB, vịTríCuốiKhung) — dùng chung cho thử micro và ghi âm tiết
function boKhung(fs, moiKhung) {
  const khung = Math.floor(KHUNG_S * fs);
  let dem = 0, dem20 = 0, tong20 = 0;
  return (d) => {
    for (let i = 0; i < d.length; i++) {
      tong20 += d[i] * d[i];
      if (++dem20 === khung) { moiKhung(10 * Math.log10(tong20 / khung + 1e-12), dem + i + 1); dem20 = 0; tong20 = 0; }
    }
    dem += d.length;
    return dem;
  };
}

export class MayGhi {
  constructor() { this.db = -120; this.sanDb = -120; this.tieuThu = null; this.dungSom = null; this.lanCoMau = 0; this.lanMo = 0; }

  async mo() {
    const r = this.luong && this.luong.getAudioTracks()[0];
    if (this.ctx && r && r.readyState === 'live') { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    this.dong();
    this.luong = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule('ghi_am_worklet.js');
    this.nguon = ctx.createMediaStreamSource(this.luong);
    this.nut = new AudioWorkletNode(ctx, 'thu-mau');
    this.nguon.connect(this.nut);
    this.fs = ctx.sampleRate;
    let p = 0;
    this.nut.port.onmessage = (e) => {
      const d = e.data;
      let s = 0, m = 0;
      for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; const a = Math.abs(d[i]); if (a > m) m = a; }
      const a = Math.exp(-d.length / (0.05 * this.fs));             // làm mượt ~50 ms cho thanh mức
      p = a * p + (1 - a) * s / d.length;
      this.db = 10 * Math.log10(p + 1e-12);
      this.sanDb = this.db < this.sanDb ? this.db : this.sanDb + 0.01;   // nền ồn ước lượng: xuống ngay, lên chậm (~4 dB/s)
      if (m >= IM_TUYET_DOI) this.lanCoMau = performance.now();
      if (this.tieuThu) this.tieuThu(d);
    };
    // micro bị ngắt giữa chừng (chuyển app, cuộc gọi đến): kết thúc lượt ghi đang dở thay vì treo
    this.luong.getAudioTracks()[0].addEventListener('ended', () => { if (this.dungSom) this.dungSom(); });
    this.ctx = ctx;
    this.sanDb = 0;
    this.lanMo = performance.now();
    await ctx.resume();
  }

  // Tắt micro (rời màn ghi âm) — đèn báo micro của điện thoại tắt theo
  dong() {
    if (this.dungSom) this.dungSom();
    if (this.luong) this.luong.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null; this.luong = null; this.db = -120;
  }

  // 'chua_mo' | 'tot' | 'he_thong_tat' (máy báo micro bị tắt) | 'im_tuyet_doi' (toàn số 0 > 1,5 s) | 'mat' (micro bị ngắt)
  tinhTrang() {
    const r = this.luong && this.luong.getAudioTracks()[0];
    if (!this.ctx || !r) return 'chua_mo';
    if (r.readyState !== 'live') return 'mat';
    if (r.muted) return 'he_thong_tat';
    const bay = performance.now();
    if (bay - this.lanMo > 1500 && bay - this.lanCoMau > 1500) return 'im_tuyet_doi';
    return 'tot';
  }

  // Thông số micro thật (ghi vào nhật ký để chẩn đoán; không có dữ liệu cá nhân)
  thongTin() {
    const r = this.luong && this.luong.getAudioTracks()[0];
    if (!r) return null;
    const c = r.getSettings ? r.getSettings() : {};
    const ket = { ten: r.label, fs_ctx: this.fs };
    for (const k of ['sampleRate', 'channelCount', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency']) if (k in c) ket[k] = c[k];
    return ket;
  }

  dung() { if (this.dungSom) this.dungSom(); }        // người dùng bấm "Dừng"

  // Ghi cố định `giay` giây (đo ồn, lướt giọng)
  async ghiCoDinh(giay) {
    await this.mo();
    return new Promise((xong) => {
      const manh = [];
      let dem = 0;
      const can = Math.floor(giay * this.fs);
      const ket = () => { this.tieuThu = null; this.dungSom = null; xong(noiMang(manh, can)); };
      this.dungSom = ket;
      this.tieuThu = (d) => { manh.push(d); dem += d.length; if (dem >= can) ket(); };
    });
  }

  // Thử micro: chờ tới khi thấy giọng nổi hơn nền ≥ canNhay dB liền 60 ms. Trả {dat, nhayDb, imTuyetDoi}.
  async thuMic({ toiDa = 10, canNhay = 20 } = {}) {
    await this.mo();
    return new Promise((xong) => {
      const fs = this.fs, boQua = BO_QUA_DAU_S * fs;
      let san = Infinity, nhay = 0, dinhMau = 0;
      const ba = [];
      const ket = (dat) => { this.tieuThu = null; this.dungSom = null; xong({ dat, nhayDb: nhay, imTuyetDoi: dinhMau < IM_TUYET_DOI }); };
      const khung = boKhung(fs, (db, viTri) => {
        if (viTri <= boQua) return;
        san = Math.min(san, db);
        ba.push(db); if (ba.length > KHUNG_LIEN_TIEP) ba.shift();
        if (ba.length === KHUNG_LIEN_TIEP) nhay = Math.max(nhay, Math.min(...ba) - san);
      });
      this.dungSom = () => ket(false);
      this.tieuThu = (d) => {
        dinhMau = Math.max(dinhMau, bienDoMax(d));
        const t = khung(d) / fs;
        if (nhay >= canNhay) return ket(true);
        if ((t > 3 && dinhMau < IM_TUYET_DOI) || t > toiDa) return ket(false);
      };
    });
  }

  // Ghi một âm tiết, tự dừng. Nền = min(ồn lúc hiệu chuẩn, ồn đo ngay trong lượt này + 3 dB) — nếu lúc hiệu chuẩn
  // đo ồn bị lẫn tiếng nói thì ngưỡng vẫn tự hạ theo phòng thật. Bắt đầu nói: > nền + 15 dB liền 60 ms (bỏ 0,15 s đầu
  // vì tiếng chạm máy); dừng sau `lang` giây < nền + 8 dB, hoặc hết `toiDa` giây, hoặc khi người dùng bấm Dừng.
  // Trả {x (kèm 0,25 s trước lúc nói), fs, coTieng, dinhDb, nguongDb, imTuyetDoi, tay}.
  async ghiAmTiet({ nenDb = -60, toiDa = 2.5, lang = 0.6, choToiDa = 6.0 } = {}) {
    await this.mo();
    return new Promise((xong) => {
      const fs = this.fs, boQua = Math.floor(BO_QUA_DAU_S * fs), khungN = Math.floor(KHUNG_S * fs);
      const manh = [];
      let dem = 0, batDau = -1, lanCuoiCoTieng = -1, lienTiep = 0, dauChuoi = -1;
      let san = Infinity, dinh = -120, dinhMau = 0;
      const nen = () => Math.min(nenDb, san + 3);
      const ket = (tay) => {
        this.tieuThu = null; this.dungSom = null;
        const x = noiMang(manh, dem);
        let coTieng = batDau >= 0;
        const a = coTieng ? Math.max(0, batDau - Math.floor(0.25 * fs)) : Math.min(boQua, x.length);
        if (!coTieng && tay && dinh >= nen() + 10) coTieng = true;      // bấm Dừng mà có tiếng: đưa đi chấm, bộ kiểm tín hiệu quyết
        xong({ x: x.subarray(a), fs, coTieng, dinhDb: dinh, nguongDb: nen() + NOI_HON_NEN_DB, imTuyetDoi: dinhMau < IM_TUYET_DOI, tay: !!tay });
      };
      const khung = boKhung(fs, (db, viTri) => {
        if (viTri <= boQua) return;
        san = Math.min(san, db); dinh = Math.max(dinh, db);
        if (db > nen() + NOI_HON_NEN_DB) {
          if (lienTiep++ === 0) dauChuoi = viTri - khungN;
          if (lienTiep >= KHUNG_LIEN_TIEP && batDau < 0) batDau = dauChuoi;
        } else lienTiep = 0;
        if (db > nen() + HET_NOI_DB) lanCuoiCoTieng = viTri;
      });
      this.dungSom = () => ket(true);
      this.tieuThu = (d) => {
        manh.push(d);
        dinhMau = Math.max(dinhMau, bienDoMax(d));
        dem = khung(d);
        const t = dem / fs;
        if (batDau < 0 && t > choToiDa) return ket(false);                                  // chờ quá lâu không nói
        if (batDau >= 0 && (dem - batDau) / fs > toiDa) return ket(false);
        if (batDau >= 0 && (dem - batDau) / fs > 0.3 && (dem - lanCuoiCoTieng) / fs > lang) return ket(false);
      };
    });
  }
}

function noiMang(manh, n) {
  const x = new Float32Array(n);
  let o = 0;
  for (const m of manh) { const k = Math.min(m.length, n - o); x.set(m.subarray(0, k), o); o += k; if (o >= n) break; }
  return x;
}

// Float32Array -> WAV (để nghe lại A-B và cho người dùng tải bản ghi)
export function sangWav(x, fs) {
  const b = new ArrayBuffer(44 + x.length * 2), v = new DataView(b);
  const ghi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ghi(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); ghi(8, 'WAVE'); ghi(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, fs, true);
  v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ghi(36, 'data');
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}

// Đọc tệp âm thanh người dùng chọn (thử trên máy tính không có micro) -> Float32 một kênh
export async function docTep(tep) {
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await tep.arrayBuffer());
  const x = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels; }
  const fs = buf.sampleRate;
  ctx.close();
  return { x, fs };
}
