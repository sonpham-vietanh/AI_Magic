# Trường Việt Anh · MagicStudio Sư phạm (`cong-cu-day-hoc`)

Hệ thống **Công cụ AI Sinh Tài nguyên Dạy học Liên môn & Phân hóa Lớp học** dành riêng cho giáo viên Trường Việt Anh (Cơ sở AHT & Cơ sở BT).

Dự án được xây dựng theo định hướng của anh **Nguyễn Mạnh Dương** và kế thừa cấu trúc **Knowledge Graph** từ *AI Personal Tutor* của anh **Hùng**, mô phỏng toàn diện trải nghiệm của **MagicSchool AI (~82 công cụ)** nhưng tùy biến sâu cho **Chương trình GDPT 2018 (Bộ GD&ĐT)** và triết lý **"Vui vẻ và Thực dụng"**.

---

## 🌟 4 Điểm Khác Biệt Cốt Lõi so với MagicSchool AI

1. **100% Tiếng Việt & Chuẩn Bộ GD&ĐT (GDPT 2018):**
   - Tự động tuân thủ cấu trúc **Kế hoạch bài dạy Công văn 5512** (4 hoạt động: *Mở đầu, Hình thành kiến thức, Luyện tập, Vận dụng*), **Ma trận & Đặc tả đề kiểm tra Thông tư 22/2021 & Thông tư 27/2020**, kèm bảng kiểm tuân thủ tự động.
2. **Cá nhân hóa theo Hồ sơ Lớp học (Class DNA):**
   - Chọn lớp (*1A1, 4A2, 6A1, 7A1, 7B2, 8A1, 9A1, 10A1, 11A1, 12A1...*) để AI tự động phân hóa học liệu thành 3 mức độ (*Cơ bản / Chuẩn / Nâng cao*) và gợi ý hỗ trợ cá nhân hóa theo mã học sinh bảo mật `VA-2026-NNNNN`.
3. **Liên kết Liên môn bằng Knowledge Graph:**
   - Gắn trực tiếp từng bài học với mạng lưới các môn học liên quan trong cùng tuần học, ứng dụng thực tế và dự án STEAM/PBL.
4. **Tự chủ Dữ liệu Nội bộ & Kết nối Major OS v2:**
   - Hỗ trợ lưu trữ Supabase/PostgreSQL nội bộ và cung cấp sẵn endpoint báo cáo chuẩn Major OS v2 tại `GET /api/major-os/usage`.

---

## 🚀 Hướng dẫn Chạy Nhanh (Quick Start)

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình biến môi trường (Tùy chọn)
Sao chép `.env.example` thành `.env.local`:
```bash
cp .env.example .env.local
```
- Nếu cấu hình `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL` hoặc `GEMINI_API_KEY`, hệ thống sẽ gọi LLM trực tiếp (endpoint tunnel yêu cầu `stream: true`).
- Thiếu cấu hình Supabase thì các API lưu trữ trả lỗi rõ ràng. `MAJOR_OS_API_KEY` là bắt buộc cho `/api/major-os/usage` (thiếu => 503). `APP_API_TOKEN` là tùy chọn cho caller bên ngoài.
- Nếu để trống, hệ thống tự động sử dụng **Smart Pedagogical Generator** tích hợp sẵn để dựng học liệu mẫu chi tiết theo đúng lớp học và nút kiến thức liên môn được chọn.

### 3. Chạy môi trường phát triển (Port 3080)
```bash
npm run dev
```
Mở trình duyệt tại: [http://localhost:3080](http://localhost:3080)

### 4. Kiểm tra TypeScript, Smoke Test & Build Production
```bash
npm run typecheck
npm run test:smoke
npm run build
```

---

## 📂 Cấu trúc Thư mục

- `app/` — Các trang giao diện (Kho 82 công cụ `/`, Sơ đồ liên môn `/so-do-lien-mon`, Hồ sơ lớp học `/ho-so-lop-hoc`, Thư viện `/thu-vien`) và các API routes (`/api/generate`, `/api/assistant`, `/api/resources`, `/api/major-os/usage`).
- `components/` — Giao diện Brand Việt Anh v2.0 (`Shell.tsx`, `DashboardClient.tsx`, `ToolStudioModal.tsx`, `AssistantDrawer.tsx`).
- `lib/catalog/` — Danh mục **82 công cụ sư phạm** chia theo 8 nhóm chuyên môn.
- `lib/knowledge-graph/` — Đồ thị tri thức GDPT 2018 (`nodes.ts`, `edges.ts`) kết nối các môn học.
- `lib/classes/` — Hồ sơ đặc điểm học sinh 12 lớp mẫu thuộc Cơ sở AHT & BT (`profiles.ts`).
- `lib/engine/` — Bộ tạo Prompt sư phạm, kết nối LLM và bộ sinh học liệu thông minh.
- `supabase/migrations/` — Schema cơ sở dữ liệu PostgreSQL/Supabase.
- `ops/major-os-mo-ta.md` — Tài liệu mô tả tích hợp chuẩn Major OS v2.
- `docs/` — Bộ tài liệu [PRD.md](docs/PRD.md), [MAGICSCHOOL_BENCHMARK.md](docs/MAGICSCHOOL_BENCHMARK.md), [ARCHITECTURE_AND_KNOWLEDGE_GRAPH.md](docs/ARCHITECTURE_AND_KNOWLEDGE_GRAPH.md).


---

## 🔒 Bảo mật & vận hành

- `GET /api/major-os/usage`: fail-closed (thiếu `MAJOR_OS_API_KEY` => 503, sai key => 401), đã gỡ `demo=1`, phân trang bằng `tu` / `den` / `trang_sau`. Xem `ops/major-os-mo-ta.md`.
- API nội bộ mới `/api/usage`; caller ngoài dùng `APP_API_TOKEN`; có same-origin guard (chỉ là rào chắn, **không phải xác thực người dùng thật** — việc cần làm tiếp) và rate limit (vượt ngưỡng => 429).
- Rotate mọi khóa từng bị commit/chia sẻ; chỉ lưu khóa trong `.env.local` (đã ignore).
- Không import `lib/supabase.ts` từ client component.
- `npm run test:smoke` quét bí mật trong mã nguồn và tài liệu, fail nếu phát hiện.
