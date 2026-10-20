# TÀI LIỆU BÀN GIAO NGỮ CẢNH & KIẾN TRÚC DỰ ÁN (AI CONTEXT HANDOVER)
**Tên dự án:** Hệ sinh thái Công cụ Sư phạm & Chế biến Học liệu Trường Việt Anh (`cong-cu-day-hoc`)
**Đường dẫn mã nguồn:** `E:\Workspace\VietAnh_Major_education\cong-cu-day-hoc`
**Cổng chạy Local:** `http://localhost:3080` (Next.js 16 + TypeScript)

---

## 1. BỐI CẢNH RA ĐỜI & ĐỀ BÀI GỐC TỪ BAN LÃNH ĐẠO (ANH HÙNG & ANH SƠN)

### 1.1. Yêu cầu gốc của dự án
Nhà trường đã có:
1. Thiết kế sản phẩm ban đầu.
2. Hệ thống sinh dữ liệu theo **Knowledge Graph** cho AI Personal Tutor tại **`https://factory.vietanh.org/`** (tên nội bộ: **"Rễ — Nền tảng học liệu Trường Việt Anh"**).

Nhà trường nghiên cứu mô hình của **MagicSchool AI (~80 công cụ hỗ trợ giáo viên)** nhưng quyết định tự xây dựng hệ thống riêng vì **4 lý do cốt lõi**:
1. **Ngôn ngữ:** MagicSchool bằng tiếng Anh, giáo viên Việt Nam cần giao diện và thuật ngữ sư phạm tiếng Việt chuẩn xác.
2. **Tiêu chuẩn Học liệu:** MagicSchool không chuẩn hóa theo quy định bắt buộc của Bộ GD&ĐT Việt Nam (**Chương trình GDPT 2018, Công văn 5512, Thông tư 22, Thông tư 27, Định dạng đề thi THPT mới 2025**) và đặc thù học sinh **Trường Việt Anh**.
3. **Liên kết Liên môn (Integrated Learning):** Tài nguyên của MagicSchool sinh ra rời rạc từng môn, trong khi hệ thống của Việt Anh có **Đồ thị Tri thức (Knowledge Graph)** cho phép kết nối các môn học với nhau tạo bối cảnh dạy học tích hợp liên môn / STEAM.
4. **Chủ quyền Dữ liệu (Data Ownership):** Toàn bộ dữ liệu học thuật, ngân hàng câu hỏi, kịch bản Socratic và lịch sử biên soạn của giáo viên được giữ lại trên **Supabase riêng của nhà trường**.

---

## 2. ĐỊNH VỊ KIẾN TRÚC QUAN TRỌNG NHẤT: `factory.vietanh.org` VS. `cong-cu-day-hoc`

> **LƯU Ý SỐNG CÒN CHO AI TIẾP THEO:** Tuyệt đối không biến `cong-cu-day-hoc` thành một công cụ gọi ChatGPT viết lại giáo án từ con số 0 chỉ dựa vào tên bài học. Phải hiểu rõ sự phân vai giữa 2 hệ thống dùng chung 1 Database Supabase:

| Tiêu chí | Hệ thống 1: `https://factory.vietanh.org/` ("Rễ") | Hệ thống 2: `cong-cu-day-hoc` (Dự án này) |
| :--- | :--- | :--- |
| **Vai trò** | **Nhà máy sản xuất Nguyên liệu gốc (Data Factory)** | **Trạm Lắp ráp, Chế biến & Đứng lớp của Giáo viên (Teacher Studio)** |
| **Đơn vị xử lý** | Xử lý theo từng **Nguyên tử kiến thức đơn lẻ (1 Atom)** | Tổ hợp **1 hoặc nhiều Atoms**, kết hợp **Hồ sơ Lớp học (Class DNA)** và **Liên kết Liên môn (`edges`)** |
| **Công việc thực hiện** | Sinh và kiểm duyệt cuốn chiếu từ từ từng gói kiến thức chuẩn (`packages` L1/L2/L3), 8 định dạng học liệu gốc (`resources`/`assets`), ngân hàng câu hỏi (`questions`), bậc thang Socratic (`socratic`/`ladders`), mô phỏng HTML5 (`tainguyen`). | **Nạp 100% nguyên liệu đã sinh từ `factory.vietanh.org`**, hiển thị cho giáo viên dùng ngay (0 giây chờ), và cung cấp công cụ để **chế biến thành sản phẩm đi dạy thực tế** mà Factory chưa làm. |

---

## 3. KIỂM KÊ CẤU TRÚC DATABASE SUPABASE DÙNG CHUNG (`jhqdzrejpcvasbsnamer.supabase.co`)

Dự án kết nối trực tiếp qua REST API tới Supabase (`lib/supabase.ts`):
- **URL:** `https://jhqdzrejpcvasbsnamer.supabase.co`
- **Publishable Key:** `<SUPABASE_PUBLISHABLE_KEY — xem .env.local>`
- **Secret Key (Server-side):** `<SUPABASE_SECRET_KEY — xem .env.local>`

### 6 Tầng dữ liệu thật đang có trong Supabase:
1. **`public.tree_scaffold` (3.153 dòng) & `public.atoms` (12.908 dòng):**
   - Mỗi Atom có: `id` (VD: `KC-6147340`), `code` (VD: `TO07-C04-D03`), `title`, `subject`, `grade`, `chapter`, `lesson`, `bloom`, `dok`, `nang_luc`, `yeu_cau` (Yêu cầu cần đạt GDPT 2018), `quan_niem_sai` (Lỗi học sinh hay mắc).
2. **`public.edges` (8.968 dòng) & `studio_kv` (`collection=edges`):**
   - Lưu liên kết giữa các Atoms: `from_id`, `to_id`, `relation` (`prerequisite`, `related`...), `cross_subject` (liên môn), `quan_niem_sai`, `remediation_hint`.
3. **`public.questions` (12.986 dòng):**
   - Lưu câu hỏi gắn với `atom_id`: `noi_dung`, `do_kho`, `dok`, `dap_an`, `loi_giai`, và mảng `nhieu` (`[{ noiDung, lyDo }]` — các phương án bẫy và giải thích tại sao học sinh chọn nhầm).
4. **`public.socratic` (7.612 dòng) & `studio_kv` (`collection=ladders`, 5.035 dòng):**
   - Lưu kịch bản hỏi đáp Socratic 4 bậc khi học sinh trả lời sai: `wrong_answer`, `misconception`, `bac_1` (Khơi gợi) -> `bac_2` (Định hướng) -> `bac_3` (Phản biện) -> `bac_4` (Chốt kiến thức).
5. **`studio_kv` (`collection=packages` — Đang cập nhật cuốn chiếu, hiện có 29 gói cho 22 bài mẫu):**
   - Mã gói có dạng `{atom.code}-L{1|2|3}` (VD: `TO07-C04-D03-L1`, `TO10-C03-B04-L2`) hoặc `{atom.id}-L{1|2|3}` (VD: `KC-3549094-L1`).
   - Trường `j.atomId` trỏ về `atoms.id` (VD: `KC-6147340`).
   - Trường `j.fields` chứa **7 trường chuẩn của Knowledge Contract**:
     1. `objective` (Mục tiêu)
     2. `explanation` (Giải thích cốt lõi)
     3. `example` (Ví dụ chuẩn)
     4. `counterExample` (Phản ví dụ)
     5. `commonMistake` (Lỗi thường gặp)
     6. `strategy` (Chiến lược dạy Socratic)
     7. `questions` (Câu hỏi gốc theo mức L1/L2/L3)
6. **`public.resources` & `studio_kv` (`collection=assets`, 68 mục) & `studio_kv` (`collection=tainguyen`, 666 mục):**
   - `resources` / `assets`: Chứa 8 định dạng học liệu đã sinh sẵn theo từng `packageId`:
     - `text` (Bài đọc lý thuyết, có `sections`)
     - `worksheet` (Phiếu học tập, có `sections`)
     - `slide` (Bài trình chiếu, có `slides: [{ title, bullets, notes }]`)
     - `quiz` (Trắc nghiệm, có `questions: [{ q, options, answer, explanation, dok }]`)
     - `mindmap` (Sơ đồ tư duy, có `markdown`)
     - `flashcard` (Thẻ ghi nhớ, có `cards: [{ front, back }]`)
     - `podcast` (Kịch bản đối thoại Cô Mai & bé Bin, có `script: [{ speaker, text }]`)
     - `video` (Storyboard 7 cảnh Thầy Dương, Tim, An, Leo, có `scenes: [{ beat, setting, visual, mucTieu, dialogue }]`)
   - `tainguyen`: 666 học liệu tương tác HTML5 (`j.atomId`, `j.format`, `j.content` là full HTML/JS/CSS chạy trong `iframe srcDoc`).

---

## 4. TỪ DỮ LIỆU FACTORY -> QUA CÔNG CỤ CỦA `cong-cu-day-hoc` TẠO RA NHỮNG GÌ?

Hệ thống `cong-cu-day-hoc` giải quyết khoảng trống giữa **Dữ liệu thô theo từng Atom của Factory** và **Nhu cầu đứng lớp thực tế của Giáo viên**:

1. **Hiển thị & Tải ngay Học liệu gốc của Factory (0 giây chờ):**
   - Tự động phát hiện và ưu tiên đưa các bài học đã có `packages` và `assets` từ `factory.vietanh.org` lên đầu danh sách chọn bài.
   - Cho phép giáo viên xem trực tiếp 7 trường của Gói `L1/L2/L3` và bấm mở xem / xuất file Word (`.doc`) ngay lập tức cho 8 định dạng (`Slide`, `Worksheet`, `Text`, `Quiz`, `Mindmap`, `Flashcard`, `Podcast`, `Video Storyboard`).
2. **Công cụ Tổ hợp 01 — Đóng gói Gói Factory thành Giáo án Công văn 5512 & Hồ sơ Tiết dạy Phân hóa (4 trong 1):**
   - Lấy 7 trường của `packages` + `questions` + `socratic` + **Hồ sơ Lớp học (`CLASS_PROFILES` - VD: Lớp 7A1 có nhóm Cơ bản, Đạt chuẩn, Nâng cao và mã học sinh cần hỗ trợ đặc biệt)** để biên soạn đồng bộ 4 phần trong 1 lần bấm:
     1. Kế hoạch bài dạy chuẩn Công văn 5512 (4 hoạt động, mỗi hoạt động đủ a. Mục tiêu, b. Nội dung, c. Sản phẩm, d. Tổ chức thực hiện).
     2. Phiếu học tập in A4 phát cho học sinh (chia 3 mức độ năng lực).
     3. Đề kiểm tra nhanh 5 phút cuối giờ (Exit Ticket).
     4. Cẩm nang Socratic 4 bậc & Cầu nối liên môn.
   - Xuất ra 1 file Word `.doc` duy nhất có ngắt trang (`page-break-before: always`) để in phát ngay.
3. **Công cụ Tổ hợp 02 — Máy Trộn Đề Kiểm Tra Nhiều Bài / Chương & Ma Trận Thông Tư 22:**
   - Vì `factory.vietanh.org` chỉ sinh từng Atom lẻ, công cụ này cho phép giáo viên **tích chọn nhiều bài học cùng lúc (VD: 3–6 bài trong 1 chương)**.
   - Tự động rút câu hỏi thật từ `questions` (hoặc từ gói `quiz` của `factoryAssets`) và mục tiêu `L1/L2/L3` của tất cả các bài đã chọn để lập: **Ma trận & Bảng đặc tả Thông tư 22 + Đề kiểm tra tổng hợp + Đáp án phân tích bẫy + Kịch bản Socratic chữa bài**.
4. **Công cụ Tổ hợp 03 — Trạm Thiết kế Chủ đề Dạy học Liên môn (Integrated Learning / STEAM 5E):**
   - Đọc bảng `edges` để ghép Atom môn chính với các Atoms môn liên quan (Toán ↔ Vật lí / Địa lí / Sinh học / Công nghệ) thành dự án STEAM 5E hoàn chỉnh.
5. **Công cụ Tổ hợp 04 — Bảng Tương tác Lớp học (Live Classroom TV Mode):**
   - Chế độ trình chiếu toàn màn hình trên TV lớp học: Chiếu từng câu hỏi trắc nghiệm, bấm lật đáp án & giải thích phương án bẫy, bấm mở từng bậc gợi ý Socratic `1 -> 2 -> 3 -> 4`, và chạy trực tiếp mô phỏng HTML5 (`tainguyen`).
6. **Kho 82 Công cụ Chuyên môn & Chủ nhiệm (Tab 2):**
   - Bao gồm đầy đủ 82 công cụ chia theo 7 nhóm (Kế hoạch bài dạy, Phiếu học tập, Kiểm tra đánh giá, Chuyển đổi học liệu, Nhận xét học bạ TT22/TT27, Công tác chủ nhiệm, Hành chính nhà trường).

---

## 5. CẤU HÌNH AI LLM TUNNEL & QUY TẮC LÀM SẠCH VĂN BẢN (BẮT BUỘC TUÂN THỦ)

### 5.1. Kết nối Live AI API (`lib/engine/llmClient.ts` & `.env.local`)
- **Endpoint:** `<OPENAI_BASE_URL — xem .env.local>`
- **API Key:** `<OPENAI_API_KEY — xem .env.local>`
- **Models hỗ trợ:**
  - Mặc định (nhanh, ổn định): `cc/claude-haiku-4-5-20251001`
  - Chuyên sâu: `cc/claude-sonnet-5-5`, `cc/claude-opus-5-5`
- **Lưu ý kỹ thuật quan trọng:** Endpoint tunnel này trả về định dạng **SSE stream (`data: {...}`)** và bắt buộc gửi kèm `"stream": true` trong body request. Hàm `parseOpenAiCompatibleResponse` trong `lib/engine/llmClient.ts` đã xử lý ghép các chunk `delta.content` hoàn chỉnh. Không được sửa thành `stream: false`.

### 5.2. Quy tắc Vàng về Trình bày Văn bản (Clean Pedagogical Text)
Người dùng **rất ghét các ký tự rác Markdown và LaTeX thô** trên giao diện cũng như trong văn bản sinh ra:
1. **TUYỆT ĐỐI KHÔNG** để xuất hiện các dấu `*`, `**`, `-`, `+`, `•`, `###`, `---`, `` ` `` trong nội dung hiển thị cho giáo viên.
2. **TUYỆT ĐỐI KHÔNG** để xuất hiện ký hiệu LaTeX thô như `\(\in,\notin\)` hay `\mathbb{Q}` — phải đi qua hàm `cleanFactoryText()` (trong `lib/supabase.ts`) và `cleanPedagogicalText()` (trong `lib/engine/smartGenerator.ts`) để chuyển thành ký hiệu toán học chuẩn (`∈, ∉, ℚ, ℝ, ≤, ≥, ≠, √...`) và đánh mục hành chính Việt Nam (`I., II., 1., 2., a), b), Bước 1:, Bước 2:`).

---

## 6. SƠ ĐỒ CÁC FILE QUAN TRỌNG TRONG REPO (`cong-cu-day-hoc`)

- [`lib/supabase.ts`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/lib/supabase.ts): Tầng kết nối Supabase. Chứa `querySupabaseAtoms` (tự động ưu tiên các bài đã có `packages`/`assets` từ Factory lên đầu), `fetchSupabaseAtomDetail` (nạp đồng thời `atom`, `packages` L1-L3, `factoryAssets` 8 định dạng, `questions`, `socratic`, `edges`, `tainguyen`), và `cleanFactoryText`.
- [`components/DashboardClient.tsx`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/components/DashboardClient.tsx): Giao diện chính theo mô hình **Bàn Làm Việc 2 Cột (Studio)**:
  - **Tab 1 (`studio`):** Cột Trái hiển thị Nguyên liệu gốc từ `factory.vietanh.org` (chia 3 tab con gọn gàng: *Gói Kiến thức L1-L3*, *Học liệu gốc*, *Câu hỏi & Liên môn*); Cột Phải hiển thị 4 Công cụ Tổ hợp & Chế biến cho Giáo viên.
  - **Tab 2 (`catalog`):** Kho 82 Công cụ Chuyên môn & Chủ nhiệm.
  - Kèm 4 Modal: Modal Xem & Xuất Word Học liệu gốc Factory, Modal Đóng gói Giáo án 5512 (4 trong 1), Modal Máy Trộn Đề Kiểm Tra Nhiều Bài (Thông tư 22), và Modal Bảng Tương tác Lớp học (TV Mode).
- [`app/api/generate-pack/route.ts`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/app/api/generate-pack/route.ts): API xử lý 2 chế độ tổ hợp lớn:
  - `mode = 'lesson_pack'`: Chuyển hóa Gói `packages` (7 trường) + `factoryAssets` + `CLASS_PROFILES` thành Trọn bộ Hồ sơ Tiết dạy 4-trong-1.
  - `mode = 'multi_exam'`: Nhận mảng `atomIds: string[]`, rút câu hỏi thật và mục tiêu L1-L3 của nhiều bài học để xuất Ma trận Thông tư 22 + Đề kiểm tra tổng hợp + Đáp án + Kịch bản chữa bài Socratic.
- [`app/api/generate/route.ts`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/app/api/generate/route.ts) & [`lib/engine/smartGenerator.ts`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/lib/engine/smartGenerator.ts): API và Engine xử lý cho toàn bộ 82 công cụ chuyên sâu, đã được nối trực tiếp với dữ liệu `packages` của Factory.
- [`lib/engine/llmClient.ts`](file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/lib/engine/llmClient.ts): Bộ gọi API Claude qua tunnel (cấu hình qua OPENAI_BASE_URL) với bộ đọc SSE stream.
