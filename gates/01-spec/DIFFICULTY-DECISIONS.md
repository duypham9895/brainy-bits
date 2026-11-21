# Độ khó 30 màn — quyết định mở (2026-11-21)

Hai bản thiết kế độc lập (Claude, Gemini Orchestrator Neon) đồng ý về khung engine nhưng lệch ở 5 điểm
mà nguồn nghiên cứu không giải được (Quy tắc 12: lệch = spec chưa rõ, leo lên Duy, không bỏ phiếu).
Duy đang ngủ và đã giao "proactive làm mọi thứ", nên build chạy với **mặc định đảo ngược được** dưới đây.
Mọi mặc định là dữ liệu bảng knob hoặc một cờ cấu hình, đổi lại không phải viết lại code.
Chi tiết hai lập luận: `docs/difficulty/MERGED-SPEC.md` §2 và §5.

| # | Câu hỏi cho Duy | Mặc định đang build | Vì sao chọn tạm cái này |
|---|---|---|---|
| E2 | Đoán Cụm Từ: cắt ở 30 màn hay giữ cả 49? | Giữ 49, không xoá màn nào | Không làm mất sao người chơi đã có; brief "30 màn" là mức sàn |
| E3 | Màn cũ lệch đường cong (koi L10, mem L13) có được sửa? | Không sửa, chỉ báo cáo | Sửa làm lệch sao đã ghi theo số màn |
| E1 | L30 khó tới đâu: median qua ~69% (A) hay ~58% (B)? | ~69% (A) | Game thư giãn trên điện thoại; tăng khó sau dễ hơn làm người chơi bỏ |
| E4 | Thắng bằng "bản nhẹ hơn": mấy sao, mở màn kế không? Có "Nhịp chậm 0.85×"? | Tối đa 1 sao, có mở màn kế; có Nhịp chậm như tuỳ chọn trợ năng | Không chặn tiến độ, vẫn giữ giá trị của sao |
| E5 | L11–30 chỉ chỉnh knob hay thêm luật chơi mới? | Chỉ chỉnh knob; luật mới để dành L31+ kèm mockup | Thêm luật là đổi bản chất game, cần Duy duyệt gu (Quy tắc 9, 13) |

## Log — chỉ thêm, không sửa

| Ngày | Sự kiện |
|---|---|
| 2026-11-21 | Mở 5 câu, build với mặc định ở trên. Chờ Duy trả lời từng câu theo thứ tự E2 → E3 → E1 → E4 → E5. |
| 2026-11-21 | E3 đổi: Duy cho phép chỉnh màn cũ để cả 5 game theo cùng một khuôn mở rộng được ("có thể chỉnh sửa các existing game để make it available scaleable trong tương lai" → "yes" cho phương án A). PR #7 merge trước với màn cũ giữ nguyên; PR sau chỉnh L1–old-max theo đường răng cưa, thêm lưới đỡ màn thở cho rain (E4), xếp lại word và gắn sao theo mã ổn định, có migration theo phiên bản bảng màn. |
| 2026-11-21 | Tích hợp PR gỡ E3: cả 5 bảng lên v2, migration giữ số màn đã qua (cờ `bb_tablev_<g>`), word gắn sao theo id cụm (`p<n>`). Ở N đầy đủ chưa game nào xanh hết: train G1 L5; koi G1 L5; mem B L4 + G1 L5; rain B L1–6/11/16/21/26 + G3 L11/16/21/26; word B 49/49. CI để cả 5 bước calibration report-only; test KNOWN-FAIL ghim đúng danh sách này và có chặn. Không nới gate, không sửa `human.mjs`. |
| 2026-11-21 | Mở cho Duy, theo thứ tự: (1) B/G1 xung đột ở L5 — p*(5) = 0.797 buộc median ≤ 0.847 trong khi G1 buộc weak ≥ 0.85; chọn (a) bỏ phần trừ của đỉnh L5, (b) G1 chỉ L1–4, (c) răng cưa từ L10. (2) rain: đưa tier 7–9 trở lại L7–9 để cắt vách L7 (weak 7–19% ở màn bước/đỉnh L7–30)? (3) word: `maxTries` thành knob, miễn B cho game nội dung, hay mở gợi ý từ lượt k? |
| 2026-11-21 | Đo thử "+10 màn" (L31–40, N đầy đủ, chưa ship): mem xanh; train B L40 + G4 L36; koi B cả 10 màn (median thấp hơn p* 7–22 điểm) + G3 L36 + G4 L31/36; rain B/G3 màn thở L31/36 + G2 L37→38. "Thêm 10 màn" chưa chạy thẳng từ luật ở train, koi, rain. |
| 2026-11-21 | Câu (1) chốt: Duy chọn A ("Yess") — bỏ màn đỉnh ở L5. L1–5 tăng đều, màn đỉnh đầu tiên là L10, màn thở đầu tiên là L11. Lý do: người chơi chính là người lớn tuổi/chơi thường, G1 (weak ≥ 85% ở L1–5) là lời hứa với họ. Đảo lại được bằng một hằng số trong `js/difficulty.js`. |
| 2026-11-21 | Câu (2) chốt: Duy chọn A ("Oke") — rain đưa nhóm phép tính 7–9 (bảng nhân 2–9, nhân chia, đủ 4 phép) trở lại L7–9 và dời phần tăng tốc mưa ra sau L10 để bỏ vách L7. Lý do: E5 chỉ cho chỉnh knob, bỏ cả nhóm phép tính là đổi nội dung. Nếu B ở L7–9 đỏ phía "dễ" thì kéo bằng tốc độ, không bỏ nội dung. |
| 2026-11-21 | Câu (3) chốt: Duy chọn A ("Oke") — word được miễn gate B (báo WAIVED, không phải PASS), vẫn phải qua G1–G6 và G8; luật chơi giữ nguyên (6 lượt, gợi ý mở ngay). Lý do: B đỏ theo hướng dễ hơn mục tiêu, và số đó đến từ tham số bot chưa đối chiếu người thật (G7 SKIP). Xem lại khi có dữ liệu G7. |
