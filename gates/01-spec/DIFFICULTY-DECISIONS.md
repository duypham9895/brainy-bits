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
