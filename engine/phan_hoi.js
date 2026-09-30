// 1.4.3 — Bộ chọn lỗi chính/phụ theo docs/DAC_TA_PHAN_HOI.md mục 2. Luật: web/du_lieu/luat.json.

// Luật khớp (o, ma_loi): ưu tiên luật riêng cho phụ âm, không có thì luật chung (không ghi phu_am)
export function timLuat(LUAT, o, maLoi, phuAm) {
  const khop = LUAT.luat.filter((l) => l.dieu_kien.o === o && l.dieu_kien.ma_loi === maLoi);
  return khop.find((l) => l.dieu_kien.phu_am === phuAm) || khop.find((l) => !l.dieu_kien.phu_am) || null;
}

// o3: {thanh:{trang_thai, loi}, thanh_mau:{...}, van:{...}} ; trả {chinh, phu} (mỗi cái: {o, mau, luat} hoặc null)
export function chonLoi(LUAT, o3, phuAm) {
  const ung = [];
  for (const [o, kq] of Object.entries(o3)) {
    if (!kq || kq.trang_thai === 'xam' || kq.trang_thai === 'xanh' || !kq.loi) continue;   // ô xám không sinh lỗi
    const luat = timLuat(LUAT, o, kq.loi, phuAm);
    if (!luat || luat.muc_tin_cay === 'thap') continue;                                      // mức thấp: chỉ A-B, không tự báo
    let mau = kq.trang_thai;
    if (luat.muc_tin_cay === 'trung_binh' && mau === 'do') mau = 'vang';
    ung.push({ o, mau, luat });
  }
  ung.sort((a, b) => (a.mau === 'do' ? 0 : 1) - (b.mau === 'do' ? 0 : 1) || a.luat.uu_tien - b.luat.uu_tien);
  return { chinh: ung[0] || null, phu: ung[1] || null };
}
