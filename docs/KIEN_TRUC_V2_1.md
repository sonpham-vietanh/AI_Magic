# Kiến trúc v2.1 — nguồn sự thật và bảng truy vết

Nguồn: sơ đồ "Hệ thống Sinh Học liệu Giảng dạy — Trường Việt Anh" (v2.1) của anh Nguyễn Mạnh Dương.
Tài liệu này thay thế các mô tả kiến trúc cũ trong `docs/` (xem ghi chú ở đầu từng file cũ). Bảng truy vết dưới đây ghi **trung thực**
điều gì đã có trong mã, điều gì mới làm một phần, điều gì chưa. Cột "Trạng thái" là nhận định khi viết tài liệu (2026-10-21), dựa trên việc đọc mã và
chạy thử một số luồng; **chưa phải kết quả nghiệm thu chính thức**.

## 1. Tóm tắt sơ đồ (ba panel)

1. **Panel 1 — Kho học liệu chuẩn và Pha B (cá nhân hoá).** Kho là tài sản lõi: 1 tiết/bài = 1 bản chuẩn đã qua người duyệt, 6 dạng tài nguyên cho mỗi nguyên tử tri thức, neo Chương trình GDPT 2018 (TT 32/2018), CV 5512 Phụ lục IV (giáo án), TT 22/2021 (đánh giá), NĐ 13/2023 (chỉ dùng mã học sinh); không dẫn xuất toàn văn SGK.
2. **Panel 2 — Pha A (dựng kho, offline, có người duyệt):** (1) phân rã Knowledge Graph; (2) sinh 6 dạng tài nguyên (Text, infographic, mindmap, video, audio tranh luận 2 chuyên gia, podcast); (3) ghép theo phân phối chương trình, phủ 4 bậc Bloom liên tiếp có Phân tích; (4) NGƯỜI DUYỆT (cổng bắt buộc, rubric 6 tiêu chí 1–5); (5) nhập kho (1 tiết = 1 bản chuẩn, gắn org_id); (6) nạp Ngân hàng câu hỏi.
3. **Panel 3 — Pha B (online):** (1) giáo viên nhập 7 tham số bằng biểu mẫu có ràng buộc; (2) lấy bản chuẩn từ Kho, chỉ nâng cấp, không sinh lại từ đầu; (3) Router xác định chọn 1 trong 6 workflow cứng, không có Planner tự do; (4) guardrail thời sự; (5) Reflection theo rubric; (6) giáo viên xem, chỉnh, duyệt, dạy; (7) ghi tín hiệu tự động (sinh lại + diff).

Kết quả đầu ra: Kế hoạch bài dạy, Slide (PPTX), Worksheet (DOCX/PDF), Quiz củng cố trong tiết, Đề kiểm tra + ma trận, Infographic, Mindmap, Podcast, Audio tranh luận, Video 1–8 phút.
Web App: biểu mẫu 7 tham số, Thư viện tiết học, Trang duyệt (Pha A), Lịch sử & phiên bản cá nhân, SSO Google Workspace.
Dịch vụ ngoài "mua, không tự xây": LLM, Gamma/Canva, Gemini Notebook API (cần license Education Premium; không dùng tích hợp phi chính thức), TTS/STT, tin tức danh sách trắng.

## 2. Bảng truy vết

Quy ước: **Đạt** = có mã chạy được cho đúng ý sơ đồ; **Một phần** = có nhưng thiếu ý quan trọng; **Chưa** = chưa làm.

| Thành phần của sơ đồ | Nơi cài đặt trong mã | Trạng thái và ghi chú trung thực |
|---|---|---|
| 7 tham số (ngày dạy, bài dạy, Bloom thấp nhất, ngôn ngữ, phong cách, sự kiện thời sự, format) | `lib/workflows/types.ts` (`WorkflowParamsSchema`, `FORMAT_DAU_RA`, `PHONG_CACH`); biểu mẫu ở trợ lý `components/agent/*` và `/soan-bai` | Đạt về ràng buộc dữ liệu (zod). Schema có thêm tham số phụ ngoài sơ đồ (`lienKetId`, `classId`, `teacher`, `dangTaiNguyen`). Chất lượng trải nghiệm biểu mẫu chưa được người dùng thật đánh giá. |
| Bloom: chọn 1 trong 3 mức, hệ thống lấy thêm 3 bậc trên nên luôn có Phân tích | `bloomThapNhat: 'nho'|'hieu'|'van_dung'`; `bloomLevels` trong `WorkflowResult` | Đạt về lựa chọn 3 mức. Việc nội dung sinh ra thật sự phủ đủ 4 bậc là do prompt và bộ kiểm tra cấu trúc (`lib/workflows/validators.ts`); chưa có số liệu đo. Xem mục 3(b). |
| Router xác định, 6 workflow cứng, không Planner | `lib/workflows/router.ts` (`routeWorkflow`), `app/api/workflows/run` | Đạt: ánh xạ format đầu ra sang workflow bằng bảng cố định. |
| Workflow 1 — kế hoạch bài dạy | `lib/workflows/*`, `khbdFix.ts` | Đạt về mã; cần LLM để sinh mới (xem mục 5). |
| Workflow 2 — slide (PPTX) | `lib/resources`, `lib/export/pptx.ts` | Một phần: PPTX tự dựng, bố cục đơn giản; không dùng Gamma. |
| Workflow 3 — worksheet (DOCX/PDF) | `lib/resources`, `lib/export/docx.ts`, `lib/export/artifact.ts` | Một phần: DOCX tự dựng; PDF qua in của trình duyệt. |
| Workflow 4 — quiz củng cố trong tiết | `app/api/assessment/quiz`, `lib/assessment` | Một phần: chưa kiểm chứng với dữ liệu thật quy mô lớn. |
| Workflow 5 — đề kiểm tra định kỳ + ma trận | `app/api/assessment/exam*`, `lib/assessment/examDoc.ts`, trang `/kiem-tra` | Một phần: có ma trận theo TT 22/2021; độ phủ dữ liệu câu hỏi phụ thuộc ngân hàng. |
| Workflow 6 — 6 dạng tài nguyên cho 1 nguyên tử | `lib/resources`, `app/api/kho/resources/generate`, `components/resources/ArtifactView.tsx` | Một phần: Text, infographic, mindmap, kịch bản podcast/tranh luận, kịch bản video đã có dạng dữ liệu và hiển thị. **Không có tệp âm thanh hay tệp video thật.** |
| Kho học liệu chuẩn (1 tiết = 1 bản chuẩn) | `lib/kho/*`, `app/api/kho/*`, trang `/kho` | Một phần: có cơ chế bản chuẩn và trạng thái duyệt; độ phủ nội dung kho còn mỏng so với toàn chương trình. |
| Pha A bước 1 — phân rã Knowledge Graph | `lib/knowledge-graph/*`; quy trình phân rã nằm ở bộ kỹ năng ngoài kho mã | Một phần: đồ thị có sẵn để tra; công cụ phân rã tự động không nằm trong ứng dụng này. |
| Pha A bước 2 — sinh 6 dạng tài nguyên | `lib/kho/generate.ts`, `app/api/kho/resources/generate` | Một phần (xem workflow 6). |
| Pha A bước 3 — ghép theo phân phối chương trình | `lib/kho`, dữ liệu chương trình trong `lib/catalog` và `/ho-so-lop-hoc` | Một phần: chưa có công cụ ghép tự động có kiểm tra phủ 4 bậc Bloom. |
| Pha A bước 4 — người duyệt, rubric 6 tiêu chí 1–5 | `lib/eval/rubric.ts` (`RUBRIC_6`), `lib/kho/reviewStore.ts`, `app/api/kho/review`, trang `/duyet` | Đạt về cổng và chấm điểm. Danh sách người duyệt cấu hình qua biến `ASSESSMENT_REVIEWERS`; **chưa có đăng nhập thật nên danh tính người duyệt chỉ là khai báo.** |
| Pha A bước 5 — nhập kho, gắn org_id | `lib/server/org.ts` (`getOrgId`), các store trong `lib/kho` | Một phần: org_id luôn là `vietanh`; chưa lấy từ SSO. |
| Pha A bước 6 — nạp Ngân hàng câu hỏi (5 nhãn) | `lib/assessment/bank.ts`, `app/api/assessment/bank` | Một phần: ngân hàng và nhập câu hỏi có; **chưa kiểm chứng đủ 5 nhãn theo đúng định nghĩa của sơ đồ** (cần anh Dương chốt danh sách nhãn). |
| Guardrail thời sự | `lib/guardrails/news.ts` | Đạt: danh sách trắng nguồn, loại chủ đề nhạy cảm, không dùng sự kiện dưới 48 giờ. Chưa có bộ thu thập tin tự động. |
| Reflection (tự soi theo rubric) | `lib/workflows/reflection.ts` | Đạt về luồng; điểm do AI chấm, không thay cho người duyệt. |
| Giáo viên xem, chỉnh, duyệt, dạy | `components/agent/*`, nút "Duyệt & dùng" | Một phần: phụ thuộc giao diện trợ lý đang được làm lại. |
| Vòng lặp tín hiệu (sinh lại + diff) | `lib/signals/*`, `app/api/signals/*`, trang `/chat-luong`; phiên bản cá nhân ở `lib/versions/*` | Một phần: có ghi tín hiệu và so sánh phiên bản theo dòng; chưa có phân tích dài hạn trên dữ liệu thật của giáo viên. |
| Eval harness | `lib/eval/*`, `app/api/eval/*` | Một phần: có chấm điểm theo rubric, ca kiểm thử, so sánh mù; **đường cơ sở thời gian soạn (baseline) chưa đo** (mục 3c). |
| org_id (đa tổ chức) | `lib/server/org.ts`; `lib/versions/store.ts` tách theo org | Một phần: mọi bản ghi mới mang org_id nhưng chỉ có một tổ chức. |
| Web App: biểu mẫu 7 tham số | `/` (trợ lý), `/soan-bai` | Đạt (hai đường vào). |
| Web App: Thư viện tiết học | `/kho` | Một phần (xem Kho). |
| Web App: Trang duyệt (Pha A) | `/duyet` | Đạt về chức năng. |
| Web App: Lịch sử & phiên bản cá nhân | `/lich-su`, `app/api/versions`, `lib/versions/*` (lưu `.data/versions.json`) | Đạt về lưu, danh sách, so sánh, mở lại trong trợ lý. Nhóm theo tên khai báo, **không phải tài khoản**. |
| Web App: SSO Google Workspace | — | **Chưa.** Hiện chỉ có rào chắn cùng nguồn (`lib/server/guard.ts`) và token tuỳ chọn; không phải xác thực người dùng. |
| Dịch vụ ngoài | `lib/integrations/catalog.ts`, `/ket-noi`, `GET /api/integrations/status` | Danh bạ trung thực. Chỉ LLM và guardrail nguồn tin chạy thật. |
| Hạ tầng | Xem mục 4 | Khác sơ đồ. |

## 3. Điểm KHÔNG NHẤT QUÁN ngay trong sơ đồ (cần anh Dương xác nhận)

(a) **Số workflow.** Panel 1 nói "6 workflow cứng" nhưng Panel 3 ghi "Workflow Router (5 nhánh cứng)". Mã hiện cài **6** workflow (kế hoạch, slide, worksheet, quiz, đề kiểm tra, 6 dạng tài nguyên). Cần xác nhận số đúng.

(b) **Bloom.** Sơ đồ ghi chương trình "phủ 4 bậc Bloom liên tiếp có Phân tích" nhưng biểu mẫu chỉ cho chọn Nhớ, Hiểu hoặc Vận dụng làm bậc thấp nhất. Mã hiểu là: chọn bậc thấp nhất rồi lấy thêm 3 bậc liền trên (Nhớ: Nhớ, Hiểu, Vận dụng, Phân tích; Hiểu: Hiểu, Vận dụng, Phân tích, Đánh giá; Vận dụng: Vận dụng, Phân tích, Đánh giá, Sáng tạo), nên luôn có Phân tích. Cần xác nhận cách hiểu này, và với "Nhớ" thì 4 bậc có thật sự là Nhớ đến Phân tích hay không.

(c) **Phạm vi v1 và ba việc phải chốt trước khi viết code.** Sơ đồ ghi phạm vi v1 là Toán 10, 1 workflow (soạn kế hoạch bài dạy), 10 giáo viên nhóm Create, tháng 9–11/2026; trong khi hệ thống đang xây rộng hơn nhiều (6 workflow, nhiều môn, kho 82 công cụ). Ba việc cần CON NGƯỜI làm, **đều CHƯA làm**:
1. Đo baseline thời gian soạn của 10 giáo viên.
2. Có văn bản nội bộ chốt: neo GDPT 2018, không dẫn xuất toàn văn SGK.
3. Xác nhận license Google Workspace for Education và có báo giá Education Premium.

Đã đưa các mục không thuộc phạm vi v1 vào nhóm menu "Công cụ phụ" (thu gọn mặc định, ghi "Ngoài phạm vi sơ đồ v1").

## 4. Hạ tầng: sơ đồ so với thực tế

| Hạng mục | Sơ đồ | Thực tế |
|---|---|---|
| Máy chủ ứng dụng | FastAPI | Next.js 16 (App Router, route handler) |
| Cơ sở dữ liệu | PostgreSQL + pgvector | Supabase (có migration `supabase/migrations`) cho phần đồ thị tri thức; **dữ liệu vận hành lưu file JSON cục bộ trong `.data/`** (store, kho, đánh giá, tín hiệu, phiên bản). Không có tìm kiếm vector. |
| Đóng gói | Docker | Có `Dockerfile`; deploy bằng Coolify. Volume cho `.data/` phải được gắn cố định, nếu không dữ liệu mất khi dựng lại. |
| Đăng nhập | SSO Google Workspace | Chưa có |

Hệ quả: file JSON chỉ phù hợp quy mô nhỏ, một tiến trình; chưa có sao lưu định kỳ và chưa có khoá chéo giữa nhiều tiến trình.

## 5. Dịch vụ ngoài và biến môi trường dự kiến

Trạng thái "đã cấu hình" chỉ suy từ việc biến có giá trị khác rỗng; API chỉ trả đúng/sai, không bao giờ trả giá trị.

| Dịch vụ | Dùng cho | Biến môi trường | Hệ thống đang làm thay |
|---|---|---|---|
| LLM (Claude/GPT/Gemini) | Mọi workflow sinh nội dung | `OPENAI_API_KEY` (và `OPENAI_BASE_URL`, `OPENAI_MODEL`), `OPENROUTER_API_KEY`, `GEMINI_API_KEY` | Bộ dựng mẫu cục bộ (smart template). Đã nối thật. |
| Gamma | Slide | `GAMMA_API_KEY` (dự kiến) | Tự dựng PPTX. **Chưa tích hợp** (chưa có khoá). |
| Canva | Infographic, ảnh | `CANVA_API_KEY` (dự kiến) | Tự dựng SVG/PNG. **Chưa tích hợp.** |
| Gemini Notebook API | Podcast, audio tranh luận | `GEMINI_NOTEBOOK_API_KEY` (dự kiến) | Chỉ kịch bản + giọng đọc của trình duyệt. Cần license Education Premium; **không dùng tích hợp phi chính thức.** **Chưa tích hợp.** |
| TTS/STT | Giọng đọc, ghi chú giọng nói | `TTS_API_KEY`, `STT_API_KEY` (dự kiến) | Giọng đọc của trình duyệt; video chỉ có kịch bản phân cảnh. **Chưa tích hợp.** |
| Nguồn tin danh sách trắng | Sự kiện thời sự | không cần khoá | Giáo viên dán đường dẫn, guardrail kiểm tra. |

## 6. Phiên bản cá nhân (hợp đồng API)

- `POST /api/versions` nhận `{runId, title, format, workflow, lessonKey, lessonTitle?, text, artifacts?, actor, basedOnVersion?}` và trả `{ok, version:{id, number, createdAt}}`. `number` tăng dần theo (người, bài, sản phẩm). Giới hạn: văn bản 100KB, artifacts 1MB, khoảng 200 phiên bản mỗi người (bản cũ nhất bị loại).
- `GET /api/versions?id=` trả một phiên bản đầy đủ (404 nếu không có); `GET /api/versions?actor=&limit=` trả danh sách tóm tắt của đúng tên đó.
- Tên (`actor`) chỉ là khai báo, ai biết id đều đọc được phiên bản đó. Đăng nhập thật là việc sau.
