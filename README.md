# Luyện Pinyin

App web luyện phát âm pinyin cá nhân, **phi thương mại**, phản hồi bằng tiếng Việt. Chấm mỗi lần đọc theo 3 ô:
phụ âm đầu (bật hơi / rung trước kiểu b-đ tiếng Việt), vần (nghe so sánh A-B) và thanh điệu (đường cao độ chuẩn hóa
theo giọng của chính người học). Không chấm "giống người bản ngữ bao nhiêu %".

Mở: https://hius-234.github.io/luyen-pinyin/ — trên Android dùng Chrome, cho phép micro, rồi "Thêm vào màn hình chính".
Mọi bản ghi, hồ sơ giọng và tiến độ **chỉ lưu trong trình duyệt của máy**, không gửi đi đâu.

## Nguồn & giấy phép

- **Mã nguồn:** GPL-3.0-or-later (xem `LICENSE`). `engine/cao_do.js` chuyển thuật toán dò cao độ của **Praat**
  (Paul Boersma & David Weenink, GPL-3.0+); `engine/vot.js` thiết kế bộ lọc theo cách của **scipy.signal** (BSD-3-Clause).
- **Âm mẫu (`am_mau/`):** MCAE-Monosyllable (osf.io/h3uem), CC BY-NC 4.0 — xem `AM_MAU_GHI_CONG.md`.
- **Bảng số (`du_lieu/`):** thống kê dựng từ giọng bản ngữ: MCAE (CC BY-NC 4.0), Chen Wang / audio-cmn (CC BY-SA),
  Yue Tan / Shtooka (CC BY-SA 3.0 US), Wei Gao / Shtooka (CC BY 2.0 fr), người đọc Lingua Libre (CC BY-SA 4.0 / CC0).
