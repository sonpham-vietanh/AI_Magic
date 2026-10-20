# PRD: HỆ THỐNG AI HỖ TRỢ GIÁO VIÊN & HỌC LIỆU LIÊN MÔN TRƯỜNG VIỆT ANH (VIỆT ANH MAGICSTUDIO)

> Tài liệu Product Requirements Document (PRD) & Báo cáo Đối chiếu Kế thừa (dành cho Hùng cập nhật với Anh và Sơn), chứng minh cách sản phẩm kế thừa trực tiếp Knowledge Graph của AI Personal Tutor và giải quyết trọn vẹn 4 lý do không dùng MagicSchool AI.

## 1. Đối chiếu 4 Yêu cầu Cốt lõi từ Đề bài Ban đầu

1. **Lý do 1 — Ngôn ngữ (MagicSchool bằng tiếng Anh):**
   - **Đã giải quyết:** 100% giao diện, thuật ngữ sư phạm và đầu ra đều bằng tiếng Việt chuẩn mực; đồng thời hỗ trợ chế độ **Song ngữ Anh - Việt (CLIL / Oxford English)** chỉ với 1 nút bấm cho các tiết hội nhập của Trường Việt Anh.
2. **Lý do 2 — Tiêu chuẩn học liệu customize riêng cho Việt Nam & Trường Việt Anh:**
   - **Đã giải quyết:** Toàn bộ 82 công cụ được thiết kế bám sát **Công văn 5512** (4 hoạt động x 4 bước), **Thông tư 22/2021**, **Công văn 7991**, **Định dạng đề thi mới 2025+ (Đúng/Sai, Trả lời ngắn)** và triết lý **"Vui vẻ & Thực dụng"** của Trường Việt Anh.
   - Tích hợp **Hồ sơ Lớp học Việt Anh (Class DNA)** tại Cơ sở AHT và Cơ sở BT (`lib/classes/profiles.ts`): tự động phân hóa bài tập theo 3 nhóm trình độ của lớp (*Cơ bản - Đạt chuẩn - Nâng cao*), sở thích tập thể lớp và mã học sinh cần hỗ trợ đặc biệt.
3. **Lý do 3 — Liên kết các môn học tạo bối cảnh Integrated Learning (Kế thừa Knowledge Graph của AI Personal Tutor):**
   - **Đã giải quyết:** Kế thừa trực tiếp **12.908 Đơn vị kiến thức (`atoms`)** và **8.968 Cạnh liên kết (`edges`)** từ Supabase của dự án AI Personal Tutor (`lib/supabase.ts` & `app/api/generate/route.ts`).
   - Khi giáo viên chọn 1 bài dạy, hệ thống tự động truy xuất các **bài học liên môn / tiên quyết (`edges`)**, **câu hỏi đánh giá (`questions`)** và **kịch bản Socratic 4 bậc (`socratic`)** để đưa thẳng vào giáo án.
4. **Lý do 4 — Giữ chủ quyền dữ liệu (Data Ownership):**
   - **Đã giải quyết:** 100% học liệu do giáo viên tạo ra, lịch sử sử dụng, biên bản thẩm định đều được lưu trực tiếp về cơ sở dữ liệu Supabase của nhà trường (`studio_kv.resources`, `studio_kv.activity`, `studio_kv.reviews`) và xuất báo cáo chuẩn **Major OS v2** (`/api/major-os/usage`).
