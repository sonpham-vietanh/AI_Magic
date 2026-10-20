# TÀI LIỆU YÊU CẦU SẢN PHẨM (PRD)
## Hệ thống AI Sinh Tài nguyên Dạy học Liên môn Trường Việt Anh (Việt Anh MagicStudio)

- **Mã dự án:** `VA-MAGICSTUDIO-2026`
- **Người lập:** Nguyễn Sơn (`son.nguyen@truongvietanh.com`)
- **Định hướng sản phẩm & Phê duyệt:** Anh Nguyễn Mạnh Dương (`duong@truongvietanh.com`) & Anh Hùng (Kế thừa Knowledge Graph & AI Personal Tutor)
- **Ngày cập nhật:** 19/10/2026
- **Trạng thái:** Phiên bản v1.0 hoàn chỉnh (82 công cụ sư phạm · Knowledge Graph GDPT 2018 · Class DNA · Major OS v2)

---

## 1. Bối cảnh & Lý do ra đời

Giáo viên Trường Việt Anh (Cơ sở AHT & Cơ sở BT) hàng tuần phải chuẩn bị khối lượng lớn học liệu cho tất cả các môn học từ lớp 1 đến lớp 12: Kế hoạch bài dạy (giáo án), Ma trận & Đề kiểm tra định kỳ, Phiếu học tập, Rubric đánh giá, Chủ đề tích hợp liên môn và Thông báo phụ huynh.

Trên thế giới, **MagicSchool AI** (`app.magicschool.ai`) đã chứng minh mô hình **~80 công cụ đóng gói sẵn theo từng tác vụ sư phạm (Guided Pedagogical Micro-tools)** hiệu quả hơn gấp nhiều lần so với việc để giáo viên tự gõ câu lệnh (prompt) vào ChatGPT thông thường.

Tuy nhiên, theo định hướng của anh **Nguyễn Mạnh Dương**, Trường Việt Anh **tự xây dựng nền tảng nội bộ riêng** thay vì mua tài khoản MagicSchool AI vì **4 lý do cốt lõi**:

1. **Ngôn ngữ & Chuẩn Sư phạm Việt Nam:** MagicSchool dùng tiếng Anh và chuẩn Common Core (Mỹ), trong khi giáo viên Việt Anh cần học liệu **100% tiếng Việt (hoặc song ngữ Anh - Việt)**, bám sát **Chương trình GDPT 2018**, **Công văn 5512/BGDĐT-GDTrH** (cấu trúc giáo án 4 hoạt động: *Mở đầu, Hình thành kiến thức, Luyện tập, Vận dụng*), **Thông tư 22/2021** & **Thông tư 27/2020** (đánh giá học sinh), cùng triết lý **"Vui vẻ và Thực dụng"** của Trường Việt Anh.
2. **Cá nhân hóa theo Đặc điểm Học sinh Từng Lớp (Class DNA):** Giáo viên không chỉ tạo bài giảng chung chung mà cần học liệu khớp với sĩ số, nhịp độ học tập, sở thích chủ đạo, tỉ lệ phân hóa 3 mức độ (*Cơ bản / Chuẩn / Nâng cao*) và học sinh cần hỗ trợ đặc biệt của từng lớp cụ thể tại trường.
3. **Liên kết Liên môn & Học tích hợp (Cross-subject Knowledge Graph):** Học liệu trên MagicSchool rời rạc theo từng môn. Công cụ của Việt Anh kế thừa **Cây kiến thức (Knowledge Graph)** từ dự án *AI Personal Tutor* của anh Hùng để liên kết các môn học theo cùng tuần học, cùng chủ đề thực tiễn và dự án STEAM/PBL.
4. **Quyền Quản lý & Tự chủ Dữ liệu Nội bộ:** Toàn bộ học liệu, hồ sơ lớp học (ẩn danh theo mã `VA-YYYY-NNNNN` chuẩn Nghị định 13/2023/NĐ-CP) và nhật ký sử dụng được lưu trữ nội bộ trên hạ tầng của trường và đồng bộ trực tiếp về **Major OS v2**.

---

## 2. Mục tiêu Sản phẩm (Goals & KPIs)

| Mục tiêu | Chỉ số đo lường (KPI) trên Major OS |
|---|---|
| **Tiết kiệm thời gian soạn giảng** | Giảm 60%–75% thời gian soạn Kế hoạch bài dạy CV 5512, Ma trận đề và Phiếu học tập (trung bình tiết kiệm 15–35 phút/lượt). |
| **Chuẩn hóa chất lượng học liệu** | 100% học liệu sinh ra tự động đi kèm bảng kiểm tuân thủ Bộ GD&ĐT (`moetComplianceChecklist`) và hoạt động *"Vui vẻ & Thực dụng"*. |
| **Thúc đẩy dạy học liên môn & phân hóa** | Tối thiểu 40% học liệu được tạo có gắn ngữ cảnh **Lớp học (Class DNA)** hoặc **Nút kiến thức liên môn (Knowledge Graph)**. |
| **Tái sử dụng tri thức toàn trường** | Xây dựng Thư viện Học liệu Dùng chung chia sẻ giữa các tổ bộ môn hai cơ sở AHT & BT. |

---

## 3. Phạm vi Tính năng (4 Phân khu & 82 Công cụ)

### 3.1. Phân khu 1: Kho 82 Công cụ AI & Studio Sinh Học liệu (`/`)
- **8 Danh mục · 82 Công cụ chuyên sâu:**
  1. **Kế hoạch bài dạy & Thiết kế bài giảng (10 công cụ):** Giáo án Công văn 5512, Bài giảng 5E, Lớp học đảo ngược, Chuỗi bài học theo chủ đề, Móc nối mở đầu tiết học (Hook)...
  2. **Kiểm tra, Đánh giá & Rubrics (10 công cụ):** Ma trận & Bản đặc tả Thông tư 22, Đề kiểm tra định kỳ 4 mức độ, Rubric đánh giá sản phẩm, Ngân hàng câu hỏi trắc nghiệm khách quan, Exit Ticket 5 phút...
  3. **Phiếu học tập & Hoạt động lớp "Vui vẻ & Thực dụng" (10 công cụ):** Phiếu học tập trạm (Station Rotation), Trò chơi học tập đầu giờ, Tình huống thực tiễn Việt Nam, Thí nghiệm vật liệu dễ tìm...
  4. **Phân hóa Lớp học & Hỗ trợ Học sinh (10 công cụ):** Phân hóa bài tập 3 mức độ (*Cơ bản / Chuẩn / Nâng cao*), Điều chỉnh học liệu cho học sinh cần lưu ý (`VA-YYYY-NNNNN`), Giàn giáo tư duy (Scaffolding), Chuyển đổi đa phong cách học VARK...
  5. **Tích hợp Liên môn, STEAM & Dự án PBL (12 công cụ):** Thiết kế chủ đề tích hợp liên môn từ Knowledge Graph, Dự án STEAM 5 bước, Bài toán thực tế kết nối Toán - KHTN - Địa lý, Ngày hội trải nghiệm liên môn...
  6. **Chuyển đổi Học liệu & Đa phương tiện (10 công cụ):** Phân bậc độ khó văn bản (Text Leveler), Song ngữ Anh - Việt (CLIL), Kịch bản Slide trình chiếu, Sơ đồ tư duy & Infographic, Podcast học tập...
  7. **Giao tiếp Phụ huynh & Quản lý Lớp học (10 công cụ):** Nhận xét học bạ chuẩn Thông tư 22/27, Thư/Tin nhắn Zalo gửi phụ huynh tinh tế, Kế hoạch đồng hành cùng gia đình, Nội quy lớp học tích cực...
  8. **Trợ lý Sư phạm & Phát triển Chuyên môn (10 công cụ):** Phản biện giáo án trước giờ lên lớp, Gợi ý câu hỏi phát triển tư duy bậc cao (Bloom), Phân tích lỗi sai thường gặp của học sinh, Thiết kế sinh hoạt chuyên môn theo nghiên cứu bài học...
- **Bộ chọn Ngữ cảnh Kép (Dual Context Selector):**
  - Chọn **Lớp học (Class DNA)** $\rightarrow$ tự động nạp sĩ số, phân hóa 3 mức và danh sách mã học sinh cần hỗ trợ vào prompt.
  - Chọn **Mạch kiến thức (Knowledge Graph Node)** $\rightarrow$ tự động nạp yêu cầu cần đạt GDPT 2018 và các môn liên kết cùng tuần học.
- **Thanh Tinh chỉnh Hậu kỳ 1-Click (7 thao tác):**
  - *Rút ngắn 30%*, *Tăng độ khó (Vận dụng cao)*, *Giảm độ khó (Cơ bản)*, *Tạo Rubric chấm*, *Tạo Phiếu học tập*, *Song ngữ Anh - Việt*, *Thêm hoạt động Vui vẻ & Thực dụng*.
- **Xuất bản & Chia sẻ:** Xuất file Word (`.doc`), Markdown (`.md`), In/PDF chuẩn A4 và Lưu vào Thư viện trường.

### 3.2. Phân khu 2: Sơ đồ Liên môn — Knowledge Graph Explorer (`/so-do-lien-mon`)
- Trực quan hóa mạng lưới `KnowledgeNode` (nút kiến thức theo khối lớp, môn học, tuần học) và `KnowledgeEdge` (cạnh liên kết liên môn: *Cùng chủ đề tuần*, *Ứng dụng thực tế*, *Kiến thức tiên quyết*, *Dự án STEAM liên môn*).
- Cho phép tổ trưởng chuyên môn và giáo viên bấm chọn bất kỳ cặp liên kết nào để mở ngay công cụ sinh Kế hoạch bài dạy tích hợp liên môn.

### 3.3. Phân khu 3: Hồ sơ Lớp học — Class DNA Manager (`/ho-so-lop-hoc`)
- Quản lý hồ sơ đặc điểm sư phạm của các lớp thuộc Cơ sở AHT và Cơ sở BT.
- Hiển thị tỷ lệ 3 nhóm năng lực (*Cơ bản / Chuẩn / Nâng cao*), sở thích tập thể, ghi chú sư phạm của giáo viên và danh sách học sinh cần hỗ trợ đặc biệt (tuân thủ nghiêm ngặt quy tắc chỉ dùng mã định danh `VA-2026-NNNNN`, không lưu PII nhạy cảm).

### 3.4. Phân khu 4: Thư viện Học liệu & Báo cáo Major OS (`/thu-vien`)
- Lưu trữ, tìm kiếm và tải lại các học liệu đã được giáo viên tạo và chia sẻ.
- Tích hợp bảng kiểm tra trực tiếp dữ liệu sự kiện gửi về **Major OS v2** (`GET /api/major-os/usage`).

---

## 4. Yêu cầu Phi chức năng & Quy chuẩn Thiết kế

- **Brand Guideline Trường Việt Anh v2.0:**
  - Màu chủ đạo: Navy `#26275D`, Vàng CTA `#F9DD0E`, Nền sáng `#F5F6FA`, Đỏ điểm nhấn `#DF2526`.
  - Font chữ: `Be Vietnam Pro`, cỡ chữ nội dung tối thiểu `16px`, độ tương phản chuẩn AAA dễ đọc cho giáo viên mọi độ tuổi.
- **Chế độ Hoạt động Kép (Dual Generation Mode):**
  - Khi cấu hình `GEMINI_API_KEY` hoặc `OPENROUTER_API_KEY`: Gọi trực tiếp LLM sinh học liệu theo thời gian thực.
  - Khi chạy nội bộ chưa cấu hình API key: Tự động kích hoạt **Smart Pedagogical Engine** dựng đầy đủ giáo án, ma trận, phiếu học tập, phân hóa 3 mức và liên kết liên môn bám sát dữ liệu thật của trường.
- **Chuẩn kết nối Major OS v2:**
  - Endpoint `GET /api/major-os/usage` hỗ trợ phân trang `trang_sau`, lọc `tu` / `den` theo ISO 8601 `+07:00`, bảo mật bằng `MAJOR_OS_API_KEY`.
