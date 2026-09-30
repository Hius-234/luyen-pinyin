// Ghi âm cho màn luyện (1.3.2 tự dừng; 1.6.6 micro tự dừng ~1,5–2,5 s).
// Tắt mọi xử lý của trình duyệt (khử vọng, giảm ồn, tự chỉnh mức): chúng đổi chính tín hiệu mà engine đo
// (docs/bao_cao/TUONG_DUONG_JS.md "Giới hạn").

export const muaMicDuoc = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.AudioWorkletNode);

// Mức ồn môi trường (dBFS) = trung vị năng lượng khung 50 ms — giống scripts/ghi_am.py muc_on (CR-006)
export function mucOn(x, fs) {
  const n = Math.floor(fs * 0.05), k = Math.floor(x.length / n);
  const e = [];
  for (let i = 0; i < k; i++) { let s = 0; for (let j = i * n; j < (i + 1) * n; j++) s += x[j] * x[j]; e.push(10 * Math.log10(s / n + 1e-12)); }
  e.sort((a, b) => a - b);
  return e.length ? (e.length % 2 ? e[(e.length - 1) / 2] : 0.5 * (e[e.length / 2 - 1] + e[e.length / 2])) : -90;
}

export class MayGhi {
  async mo() {
    if (this.ctx) return;
    this.luong = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule('ghi_am_worklet.js');
    this.nguon = this.ctx.createMediaStreamSource(this.luong);
    this.nut = new AudioWorkletNode(this.ctx, 'thu-mau');
    this.nguon.connect(this.nut);
    this.fs = this.ctx.sampleRate;
  }

  // Ghi cố định `giay` giây (đo ồn, lướt giọng)
  async ghiCoDinh(giay, moiKhung) {
    await this.mo();
    await this.ctx.resume();
    return new Promise((xong) => {
      const manh = [];
      let dem = 0;
      const can = Math.floor(giay * this.fs);
      this.nut.port.onmessage = (e) => {
        manh.push(e.data); dem += e.data.length;
        if (moiKhung) moiKhung(e.data);
        if (dem >= can) { this.nut.port.onmessage = null; xong(noiMang(manh, can)); }
      };
    });
  }

  // Ghi một âm tiết, tự dừng: bắt đầu tính khi năng lượng > nền + 15 dB; dừng sau `lang` giây im (< nền + 8 dB)
  // hoặc hết `toiDa` giây. Trả Float32Array (kèm 0,25 s trước lúc bắt đầu nói để thấy trọn chỗ đóng miệng).
  async ghiAmTiet({ nenDb = -60, toiDa = 2.5, lang = 0.6, choToiDa = 4.0, moiKhung } = {}) {
    await this.mo();
    await this.ctx.resume();
    return new Promise((xong) => {
      const manh = [];
      let dem = 0, batDau = -1, lanCuoiCoTieng = -1;
      const khung = Math.floor(0.02 * this.fs);
      let dem20 = 0, tong20 = 0;
      const ket = () => {
        this.nut.port.onmessage = null;
        const x = noiMang(manh, dem);
        const a = batDau < 0 ? 0 : Math.max(0, batDau - Math.floor(0.25 * this.fs));
        xong({ x: x.subarray(a), fs: this.fs, coTieng: batDau >= 0 });
      };
      this.nut.port.onmessage = (e) => {
        const d = e.data;
        manh.push(d);
        for (let i = 0; i < d.length; i++) {
          tong20 += d[i] * d[i]; dem20++;
          if (dem20 === khung) {
            const db = 10 * Math.log10(tong20 / khung + 1e-12);
            const viTri = dem + i;
            if (db > nenDb + 15 && batDau < 0) batDau = viTri - khung;
            if (db > nenDb + 8) lanCuoiCoTieng = viTri;
            dem20 = 0; tong20 = 0;
          }
        }
        dem += d.length;
        if (moiKhung) moiKhung(d);
        const t = dem / this.fs;
        if (batDau < 0 && t > choToiDa) return ket();                                   // chờ quá lâu không nói
        if (batDau >= 0 && (dem - batDau) / this.fs > toiDa) return ket();
        if (batDau >= 0 && (dem - batDau) / this.fs > 0.3 && (dem - lanCuoiCoTieng) / this.fs > lang) return ket();
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
