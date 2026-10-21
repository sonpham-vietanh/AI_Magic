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
- Nếu cấu hình `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` hoặc `GEMINI_API_KEY`, hệ thống sẽ gọi LLM trực tiếp (endpoint tunnel yêu cầu `stream: true`).
- Thao tác duyệt/quản trị cần `REVIEWER_KEY` (header `x-reviewer-key`); thiếu biến này thì mọi thao tác duyệt trả 503. `ASSESSMENT_REVIEWERS` là danh sách tên người duyệt.
- Sau Cloudflare/Traefik, giới hạn tốc độ lấy IP từ `cf-connecting-ip` hoặc `x-forwarded-for` (chỉnh `TRUSTED_PROXY_HOPS` nếu số proxy khác 1).
- Node.js >= 22.
- Thiếu cấu hình Supabase thì các API lưu trữ trả lỗi rõ ràng. `MAJOR_OS_API_KEY` là bắt buộc cho `/api/major-os/usage` (thiếu => 503). `APP_API_TOKEN` là tùy chọn cho caller bên ngoài.
- Nếu để trống, hệ thống tự động sử dụng **Smart Pedagogical Generator** tích hợp sẵn để dựng học liệu mẫu chi tiết theo đúng lớp học và nút kiến thức liên môn được chọn.

### 3. Chạy môi trường phát triển (cổng 3080 theo `npm run dev`; `npm start` cũng cổng 3080, còn ảnh Docker chạy cổng 3000)
```bash
npm run dev
```
Mở trình duyệt tại: [http://localhost:3080](http://localhost:3080)

### 4. Kiểm tra TypeScript, Smoke Test & Build Production
```bash
npm run typecheck
npm test
npm run test:smoke
npm run build
```
Đặt `SMOKE_BASE_URL=http://localhost:3080` (trỏ vào bản đang chạy) để `test:smoke` kiểm thêm `/api/health` và việc gọi ẩn danh vào API bị từ chối (401).

---

## 📂 Cấu trúc Thư mục

Cấu trúc bám sơ đồ kiến trúc v2.1 của anh Nguyễn Mạnh Dương. Nguồn sự thật và bảng truy vết (sơ đồ → mã → trạng thái trung thực): [docs/KIEN_TRUC_V2_1.md](docs/KIEN_TRUC_V2_1.md).

**Các trang (menu bên trái):**
- Soạn và dùng: Trợ lý soạn bài `/`, Thư viện tiết học `/kho`, Kiểm tra & Đề thi `/kiem-tra`, Lịch sử của tôi `/lich-su`.
- Dựng kho và chất lượng: Dựng kho — Pha A (trang duyệt) `/duyet`, Chất lượng & Tín hiệu `/chat-luong`.
- Công cụ phụ (thu gọn, ngoài phạm vi sơ đồ v1): Kho 82 công cụ `/cong-cu`, Thư viện cũ `/thu-vien`, Sơ đồ liên môn `/so-do-lien-mon`, Lớp học & chương trình `/ho-so-lop-hoc`, Soạn bài bằng biểu mẫu `/soan-bai`, Kết nối dịch vụ ngoài `/ket-noi`.

**Thư mục:**
- `app/` — các trang trên và API routes (`/api/workflows/run`, `/api/kho/*`, `/api/assessment/*`, `/api/signals/*`, `/api/eval/*`, `/api/versions`, `/api/integrations/status`, `/api/major-os/usage`, …).
- `components/` — giao diện (`Shell.tsx`, `agent/`, `resources/`, `kho/`, …).
- `lib/workflows/` — 7 tham số, router xác định, 6 workflow, Reflection. `lib/resources/` — 6 dạng tài nguyên. `lib/kho/` — Kho bản chuẩn và duyệt. `lib/guardrails/` — guardrail thời sự.
- `lib/versions/` — lịch sử & phiên bản cá nhân (`.data/versions.json`). `lib/integrations/` — danh bạ dịch vụ ngoài.
- `lib/catalog/`, `lib/knowledge-graph/`, `lib/classes/`, `lib/engine/` — danh mục 82 công cụ, đồ thị tri thức GDPT 2018, hồ sơ lớp, bộ sinh học liệu.
- `supabase/migrations/` — schema PostgreSQL/Supabase. `ops/major-os-mo-ta.md` — tích hợp Major OS v2.
- `docs/` — [KIEN_TRUC_V2_1.md](docs/KIEN_TRUC_V2_1.md) (hiện hành); các file cũ (PRD, ARCHITECTURE_AND_KNOWLEDGE_GRAPH, MAGICSCHOOL_BENCHMARK, TOOL_AUDIT) chỉ còn giá trị tham khảo.

**Khác biệt hạ tầng so với sơ đồ:** sơ đồ ghi FastAPI + PostgreSQL pgvector + Docker; thực tế là Next.js + Supabase + file JSON cục bộ trong `.data/` (store, kho, đánh giá, tín hiệu, phiên bản, ghi chú lớp; không có sao lưu tự động; có `Dockerfile`). Khoá ghi file chỉ có trong một tiến trình nên phải chạy đúng 1 bản sao và tắt rolling deploy. Chưa có SSO Google Workspace. Chi tiết ở mục 4 của tài liệu kiến trúc.

**Dịch vụ ngoài:** chỉ LLM và guardrail nguồn tin chạy thật. Gamma, Canva, Gemini Notebook, TTS/STT **chưa tích hợp** (chưa có khoá/license); hệ thống tự dựng PPTX/DOCX/SVG và dùng giọng đọc của trình duyệt. Xem `/ket-noi`.

---

## 🔒 Bảo mật & vận hành

- `GET /api/major-os/usage`: fail-closed (thiếu `MAJOR_OS_API_KEY` => 503, sai key => 401), đã gỡ `demo=1`, phân trang bằng `tu` / `den` / `trang_sau`. Xem `ops/major-os-mo-ta.md`.
- API nội bộ mới `/api/usage`; caller ngoài dùng `APP_API_TOKEN`; có same-origin guard (chỉ là rào chắn, **không phải xác thực người dùng thật** — việc cần làm tiếp) và rate limit (vượt ngưỡng => 429).
- `GET /api/health` không cần xác thực, chỉ trả `ok` và thời gian (dùng cho `HEALTHCHECK`). Có header bảo mật (nosniff, frame-ancestors, Referrer/Permissions-Policy); chưa đặt CSP `script-src`.
- Body của route POST có giới hạn kích thước (`lib/server/body.ts`, vượt => 413).
- Rotate mọi khóa từng bị commit/chia sẻ; chỉ lưu khóa trong `.env.local` (đã ignore).
- Không import `lib/supabase.ts` từ client component.
- Phiên bản cá nhân (`/api/versions`) lưu trong `.data/versions.json` (ghi nguyên tử, sao lưu file hỏng). Tên người dùng chỉ là khai báo, **chưa có đăng nhập thật**; ai biết id phiên bản đều đọc được. Khi deploy cần gắn volume bền cho `.data/` (thư mục thuộc người dùng `node` trong ảnh Docker; nếu volume gắn vào bị root sở hữu thì cần `chown` cho uid 1000).
- `GET /api/integrations/status` chỉ trả đúng/sai về việc đã có biến môi trường, không bao giờ trả giá trị khoá.
- `npm run test:smoke` quét bí mật trong mã nguồn và tài liệu, fail nếu phát hiện.
