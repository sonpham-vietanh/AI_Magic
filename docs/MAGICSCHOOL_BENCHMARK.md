# ĐỐI CHIẾU & MỔ XẺ MAGICSCHOOL AI vs. MAGICSTUDIO VIỆT ANH

Tài liệu này tổng hợp cấu trúc sản phẩm của **MagicSchool AI** (`app.magicschool.ai`) và cách **MagicStudio Việt Anh** kế thừa toàn bộ ưu điểm UX/UI, đồng thời nâng cấp 4 trụ cột riêng của Trường Việt Anh.

---

## 1. Giải phẫu Kiến trúc MagicSchool AI

Qua phân tích luồng hoạt động của MagicSchool AI, nền tảng này thành công nhờ 5 thành phần cốt lõi:

1. **Catalog ~80 Micro-Tools chia theo danh mục rõ ràng:**
   - Thay vì một ô chat trống trải, mỗi công cụ giải quyết đúng 1 bài toán cụ thể của giáo viên (vd: *Lesson Plan*, *5E Model Lesson Plan*, *Rubric Generator*, *Multiple Choice Assessment*, *Text Leveler*, * IEP Generator*, *Family Email*...).
2. **Form Đầu vào Cố định, Tối giản (3–5 trường/công cụ):**
   - Mỗi tool chỉ hỏi đúng các biến số cần thiết (`Grade Level`, `Topic/Standard`, `Additional Criteria`), phần kỹ thuật prompt phức tạp được ẩn hoàn toàn ở tầng Backend.
3. **System Prompt Đóng gói Chuẩn Sư phạm (Hidden Pedagogical Guardrails):**
   - Mỗi công cụ có một khung cấu trúc đầu ra (Output Template) riêng để kết quả luôn đồng nhất, không bị lan man.
4. **Thanh Hành động Hậu kỳ 1-Click (Post-Generation Actions):**
   - Sau khi sinh kết quả, giáo viên có thể bấm nút rút ngắn, dịch thuật, giảm độ khó văn bản, hoặc tạo câu hỏi mở rộng ngay trên văn bản vừa sinh.
5. **Trợ lý Chatbot Sư phạm (Raina):**
   - Đi kèm kho công cụ là trợ lý hỏi đáp chuyên về phương pháp dạy học và quản lý lớp học.

---

## 2. Bảng Đối chiếu MagicSchool AI vs. MagicStudio Việt Anh

| Tiêu chí | MagicSchool AI (Bản gốc Mỹ) | MagicStudio Việt Anh (Bản nội bộ) |
|---|---|---|
| **Số lượng công cụ** | ~80 công cụ | **82 công cụ** chia làm 8 nhóm sư phạm |
| **Ngôn ngữ & Chuẩn chương trình** | Tiếng Anh · Chuẩn Common Core / NGSS (Mỹ) | **100% Tiếng Việt & Song ngữ** · Chuẩn **GDPT 2018**, **Công văn 5512**, **Thông tư 22 & 27** |
| **Triết lý sư phạm** | Chung cho các trường K-12 | Gắn chặt triết lý **"Vui vẻ và Thực dụng"** của Trường Việt Anh |
| **Ngữ cảnh Lớp học (Class DNA)** | Không có (Giáo viên phải tự gõ tay đặc điểm lớp mỗi lần tạo) | **Tích hợp sẵn Hồ sơ Lớp học (Class DNA)** (Cơ sở AHT & BT, phân hóa 3 mức, mã học sinh cần hỗ trợ `VA-YYYY-NNNNN`) |
| **Liên kết Liên môn** | Các công cụ hoạt động rời rạc theo từng môn | **Gắn trực tiếp Knowledge Graph Liên môn** (kế thừa từ *AI Personal Tutor* của anh Hùng) |
| **Trợ lý Sư phạm** | Raina (Tiếng Anh) | **Trợ lý Sư phạm Việt Anh** (Am hiểu CV 5512, TT 22/27 và hồ sơ lớp học nội bộ) |
| **Quản trị & Dữ liệu** | Lưu trên đám mây bên thứ 3 tại Mỹ | **Tự chủ dữ liệu nội bộ (Supabase/Postgres)** + Báo cáo tự động về **Major OS v2** |

---

## 3. Ánh xạ 8 Nhóm Công cụ (82 Tools)

| Mã nhóm | Tên nhóm tại MagicStudio Việt Anh | Tương ứng bên MagicSchool AI | Nâng cấp riêng cho Trường Việt Anh |
|---|---|---|---|
| `ke_hoach_bai_day` | **Kế hoạch bài dạy & Thiết kế bài giảng (10)** | Lesson Plan, 5E Model, Unit Plan, Hook Generator | Chuẩn hóa 4 bước **Công văn 5512** (Mục tiêu $\rightarrow$ Thiết bị $\rightarrow$ Tiến trình 4 hoạt động) |
| `kiem_tra_danh_gia` | **Kiểm tra, Đánh giá & Rubrics (10)** | Rubric Generator, Multiple Choice, DOK Questions | Ma trận & Bản đặc tả chuẩn **Thông tư 22/2021** & **Thông tư 27/2020** (Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao) |
| `phieu_hoc_tap_hoat_dong` | **Phiếu học tập & Hoạt động "Vui vẻ & Thực dụng" (10)** | Worksheet Generator, Jeopardy Review, Icebreakers | Trò chơi đầu giờ không cần thiết bị phức tạp, trạm học tập thực chiến tại lớp Việt Anh |
| `phan_hoa_ho_tro` | **Phân hóa Lớp học & Hỗ trợ Học sinh (10)** | Accommodation Suggestion, IEP, Behavior Intervention | Tự động lấy tỷ lệ 3 mức độ của lớp và gợi ý hỗ trợ theo mã học sinh `VA-2026-NNNNN` |
| `tich_hop_lien_mon` | **Tích hợp Liên môn, STEAM & PBL (12)** | Project-Based Learning (PBL), Real World Connections | Nối trực tiếp các nút `KnowledgeNode` giữa Toán - KHTN - Ngữ văn - Tiếng Anh - Lịch sử & Địa lý - Tin học |
| `chuyen_doi_hoc_lieu` | **Chuyển đổi Học liệu & Đa phương tiện (10)** | Text Leveler, YouTube Question, Presentation | Phân bậc văn bản tiếng Việt & Song ngữ Anh-Việt (CLIL) theo trình độ tiếng Anh từng lớp |
| `giao_tiep_quan_ly_lop` | **Giao tiếp Phụ huynh & Quản lý Lớp (10)** | Report Card Comments, Family Email, Thank You Note | Nhận xét học bạ chuẩn Thông tư 22/27 & Tin nhắn Zalo phụ huynh ấm áp, thực tế |
| `tro_ly_su_pham` | **Trợ lý Sư phạm & Phát triển Chuyên môn (10)** | Coach, Conceptual Understanding, Misconceptions | Phản biện giáo án CV 5512, thiết kế sinh hoạt chuyên môn theo nghiên cứu bài học (Lesson Study) |
