// Ô 声母 (thanh mẫu) từ kết quả VOT — 1.3.5.2 (ngưỡng từng cặp) + 1.3.5.3 (âm tắc xát: tối đa vàng).
// Ngưỡng từ web/du_lieu/bat_hoi.json. Vùng vàng: trong ±VUNG_VANG_MS quanh ngưỡng (đặt trước, không dò theo dữ liệu).
const VUNG_VANG_MS = 10;
const KHONG_BAT_HOI = new Set(['b', 'd', 'g', 'z', 'zh', 'j']);
const BAT_HOI = new Set(['p', 't', 'k', 'c', 'ch', 'q']);

export function capCua(phuAm, BH) {
  for (const cap of Object.keys(BH.nguong_ms)) if (cap.split('/').includes(phuAm)) return cap;
  return null;
}

// phuAm: phụ âm đầu của âm tiết đích; v: kết quả vot() (hoặc null nếu chưa đo)
export function chamThanhMau(phuAm, v, BH) {
  const cap = capCua(phuAm, BH);
  if (!cap) return { trang_thai: 'xam', loi: '', ly_do_xam: 'khong_tu_cham' };         // m f n l h s sh r x, không phụ âm
  if (!v || v.ly_do) return { trang_thai: 'xam', loi: '', ly_do_xam: v ? v.ly_do : 'chua_do' };
  const tacXat = BH.tac_xat.includes(cap);
  const nguong = BH.nguong_ms[cap];
  let kq;
  if (KHONG_BAT_HOI.has(phuAm)) {
    if (v.am && !tacXat) kq = { trang_thai: 'do', loi: 'rung_truoc' };
    else if (v.vot_ms >= nguong + VUNG_VANG_MS) kq = { trang_thai: 'do', loi: tacXat ? 'tac_xat_hoi_dai' : 'bat_hoi_thua' };
    else if (v.vot_ms >= nguong - VUNG_VANG_MS) kq = { trang_thai: 'vang', loi: tacXat ? 'tac_xat_hoi_dai' : 'bat_hoi_thua' };
    else kq = { trang_thai: 'xanh', loi: '' };
  } else if (BAT_HOI.has(phuAm)) {
    if (v.am || v.vot_ms < nguong - VUNG_VANG_MS) kq = { trang_thai: 'do', loi: tacXat ? 'tac_xat_hoi_ngan' : 'chua_bat_hoi' };
    else if (v.vot_ms < nguong + VUNG_VANG_MS) kq = { trang_thai: 'vang', loi: tacXat ? 'tac_xat_hoi_ngan' : 'chua_bat_hoi' };
    else kq = { trang_thai: 'xanh', loi: '' };
  } else return { trang_thai: 'xam', loi: '', ly_do_xam: 'khong_tu_cham' };
  if (tacXat && kq.trang_thai === 'do') kq.trang_thai = 'vang';                          // WBS 1.3.5.3: chỉ vàng
  return { ...kq, ly_do_xam: '', vot_ms: v.vot_ms, nguong_ms: nguong };
}

// Phụ âm đầu của một âm tiết pinyin (không dấu): zh/ch/sh trước z/c/s; 'y', 'w' và vần đứng riêng -> ''
export function phuAmDau(amTiet) {
  for (const pa of ['zh', 'ch', 'sh']) if (amTiet.startsWith(pa)) return pa;
  const c = amTiet[0];
  return 'bpmfdtnlgkhjqxrzcs'.includes(c) ? c : '';
}
