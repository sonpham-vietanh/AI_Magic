# Sổ tay vận hành — Việt Anh MagicStudio

Dành cho người quản trị hệ thống (không cần biết lập trình). Tài liệu không chứa giá trị khóa thật; mọi khóa nằm trong biến môi trường trên Coolify hoặc `.env.local`.
Trạng thái từng mục được ghi trung thực: cái gì đã kiểm chứng, cái gì chưa.

## 1. Kiến trúc tóm tắt

```
Giáo viên (trình duyệt)
   |  HTTPS
Cloudflare  ->  Traefik (Coolify)  ->  Container Next.js 16 (cổng 3000, 1 bản sao)
                                          |-- Đăng nhập Google Workspace (OAuth + PKCE), phiên ký HMAC trong cookie va_session
                                          |-- API: /api/*   (kiểm tra phiên, vai trò, giới hạn tốc độ)
                                          |-- Kho dữ liệu vận hành: .data/*.json  (volume bền, gắn vào /app/.data)
                                          |        \-- đồng bộ thêm lên Supabase (bảng va_app_store hoặc studio_kv, khi chạy production)
                                          \-- AI: Gemini / Groq / OpenRouter / OpenAI-tương-thích (xoay vòng khóa, có dự phòng)
Supabase (tùy chọn): đồ thị tri thức và học liệu gốc (atoms, edges, questions, ...) + bản sao các kho vận hành.
```

Điểm cần nhớ:

- Ứng dụng đọc/ghi kho `.data/*.json` qua `lib/server/safeJson.ts` (ghi nguyên tử, lỗi ghi được báo chứ không nuốt). Ở production, mỗi lần ghi còn đẩy lên Supabase TRƯỚC; nếu Supabase lỗi thì thao tác ghi thất bại (để không làm đĩa và đám mây lệch nhau).
- Máy dev dùng chung `.env.local` với production nên **mặc định không đụng Supabase thật** (chỉ bật khi `NODE_ENV=production` hoặc `VA_CLOUD_STORE=1`).
- Các kho: `teaching-studio-store`, `versions`, `kho-reviews`, `kho-assets`, `assessment`, `eval`, `signals`, `class-notes`, `teacher-sessions`, `user-prefs`, `user-roles`, `usage-ledger`, `audit-log`, `ops-log`. Xem tình trạng từng kho tại trang **/quan-tri/du-lieu** (chỉ quản trị viên).

## 2. Biến môi trường

Đối chiếu bằng cách tìm `process.env` trong mã (ngày 2026-10-23). Cột "Bắt buộc" là cho production có bật đăng nhập Google. Không có biến nào dưới đây được phép commit giá trị thật.

### 2.1. Đăng nhập và phân quyền

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Có (để bật đăng nhập) | Có CẢ HAI thì bật đăng nhập: mọi trang và API cần phiên. Thiếu một trong hai thì trở về chế độ cũ (tự khai tên). |
| `APP_BASE_URL` | Có ở production | Địa chỉ gốc công khai, ví dụ `https://magic.truongvietanh.com`. Dùng dựng redirect URI `<APP_BASE_URL>/api/auth/google/callback` (phải khai đúng trong Google Cloud) và đặt cookie `secure`. |
| `SESSION_SECRET` | Có ở production | Chuỗi ngẫu nhiên dài để ký phiên. Thiếu ở production thì **không ký được phiên**. Nếu bỏ trống, mã dự phòng dùng `REVIEWER_KEY` rồi `SUPABASE_SECRET_KEY` (xem mục 6: nên đặt riêng để đổi các khóa kia không làm mọi người bị đăng xuất). |
| `AUTH_ALLOWED_DOMAINS` | Không (mặc định `truongvietanh.com`) | Tên miền email được vào, phân cách bằng dấu phẩy. |
| `ADMIN_EMAILS` | Nên có | Email quản trị viên (vai trò cao nhất, vào được `/quan-tri/**`). Phân cách bằng dấu phẩy. Vai trò cũng có thể gán thêm ở trang quản trị (kho `user-roles`); vai trò hiệu lực là mức CAO NHẤT giữa biến này và kho. |
| `REVIEWER_EMAILS` | Không | Email người duyệt. |
| `REVIEWER_KEY` | Nên có | Mã dùng chung của người duyệt (header `x-reviewer-key`), cửa dự phòng khi cần. Thiếu thì thao tác duyệt bằng mã trả 503. |
| `ASSESSMENT_REVIEWERS` | Không | Danh sách tên người duyệt đề kiểm tra (khai báo). |
| `APP_API_TOKEN` | Không | Bearer token cho caller ngoài (script, Major OS) gọi API nội bộ. |
| `MAJOR_OS_API_KEY` | Chỉ khi dùng Major OS | Bắt buộc cho `GET /api/major-os/usage`; thiếu thì trả 503. |
| `TRUSTED_PROXY_HOPS` | Không (mặc định 1) | Số proxy tin cậy đứng trước app khi lấy IP cho giới hạn tốc độ (Cloudflare + Traefik: thường 1 đến 2). |

### 2.2. Dữ liệu và Supabase

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Khuyến nghị | Địa chỉ dự án Supabase. Được nhúng lúc **build** (khai báo thành Build Variable trên Coolify). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Khuyến nghị | Khóa công khai (publishable). Cũng nhúng lúc build. Chỉ dùng đọc dữ liệu gốc; không dùng để ghi kho vận hành. |
| `SUPABASE_SECRET_KEY` | Khuyến nghị | Khóa secret phía máy chủ, dùng ghi kho vận hành. **Không** bao giờ đưa lên trình duyệt. |
| `SUPABASE_APP_STORE_TABLE` | Không (mặc định `va_app_store`) | Tên bảng lưu kho vận hành. |
| `VA_CLOUD_STORE` | Không | `1` = bật đồng bộ Supabase ngoài production (chỉ dùng có chủ đích khi thử). |
| `ASSESSMENT_STORE_FILE`, `KHO_ASSETS_FILE`, `KHO_REVIEWS_FILE`, `EVAL_FILE`, `SIGNALS_FILE` | Không | Đổi đường dẫn tệp của từng kho (mặc định `.data/<tên>.json`). Tệp ở ngoài `.data/` thì **không** được đồng bộ Supabase. |
| `TEACHER_SESSION_STORE_PATH`, `USER_ROLES_STORE_PATH`, `USER_PREFS_FILE`, `USAGE_LEDGER_FILE`, `AUDIT_LOG_STORE_PATH`, `OPS_LOG_FILE` | Không | Như trên, cho các kho đăng nhập, phân quyền, tùy chọn, sổ sử dụng, nhật ký quản trị, nhật ký vận hành. |

### 2.3. AI và hạn mức

| Biến | Ý nghĩa |
|---|---|
| `GEMINI_API_KEY` / `GEMINI_API_KEYS`, `GEMINI_MODEL` | Gemini; `*_KEYS` là danh sách nhiều khóa để xoay vòng. |
| `GROQ_API_KEY` / `GROQ_API_KEYS`, `GROQ_BASE_URL`, `GROQ_MODEL` | Groq. |
| `OPENROUTER_API_KEY` / `OPENROUTER_API_KEYS`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` | OpenRouter. |
| `OPENAI_API_KEY` / `OPENAI_API_KEYS`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Điểm cuối tương thích OpenAI (kể cả tunnel; yêu cầu `stream: true`, đã xử lý trong mã). |
| `FORCE_LLM_ON_PACK` | `1` = ép gọi AI cho gói tài nguyên thay vì dựng mẫu. |
| `USAGE_DAILY_LIMIT` | Số lượt soạn AI mỗi người mỗi ngày (mặc định 40; `0` = không giới hạn). |
| `USAGE_MONTHLY_BUDGET_USD` | Ngân sách tháng ước tính (USD); chỉ **cảnh báo**, không chặn. `0` hoặc trống = không đặt. |
| `USAGE_PRICING_JSON` | Ghi đè bảng giá tham khảo, ví dụ `{"my-model":{"in":1,"out":4}}` (USD mỗi triệu token). Chi phí chỉ là ước lượng, không phải hóa đơn. |

Không có khóa AI nào thì hệ thống tự dùng bộ dựng mẫu cục bộ (nội dung đơn giản hơn, không lỗi).

### 2.4. Dịch vụ dự kiến, môi trường chạy và kiểm thử

| Biến | Ghi chú |
|---|---|
| `GAMMA_API_KEY`, `CANVA_API_KEY`, `GEMINI_NOTEBOOK_API_KEY`, `TTS_API_KEY`, `STT_API_KEY` | **Chưa tích hợp**; chỉ để trang `/ket-noi` báo "đã cấu hình". |
| `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED` | Do Dockerfile đặt (cổng 3000). |
| `SMOKE_BASE_URL` | Cho `npm run test:smoke`: trỏ vào bản đang chạy để kiểm thêm `/api/health` và truy cập ẩn danh. |
| `VITEST`, `VA_ENABLE_SUPABASE_STORE_IN_TEST`, `VA_SSO_IN_TEST` | Chỉ cho kiểm thử tự động. Không đặt trên máy chủ. |

## 3. Deploy qua Coolify

1. Đẩy mã lên nhánh `main` của kho Git. Ứng dụng Coolify dùng build pack **Dockerfile**, cổng **3000**.
2. Biến môi trường: khai báo ở tab Environment Variables. `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` đánh dấu **Build Variable** (được nhúng lúc build; đổi chúng phải build lại).
3. Volume bền: gắn một volume vào **`/app/.data`**. Thiếu volume thì mỗi lần deploy là mất toàn bộ dữ liệu cục bộ (phần đã đồng bộ Supabase thì còn). Thư mục thuộc người dùng `node` (uid 1000); nếu volume bị root sở hữu thì `chown 1000:1000` rồi deploy lại. Trang `/api/health` báo `dataDirWritable:false` khi quyền sai.
4. **Chỉ chạy đúng 1 bản sao và tắt rolling deploy** (mục 8). Trên Coolify: số replica = 1, bỏ tùy chọn "rolling update".
5. Bấm Deploy. Kiểm tra: `GET /api/health` trả `ok:true`; mở `/dang-nhap`; đăng nhập bằng email quản trị rồi mở `/quan-tri/du-lieu`.
6. Sau mỗi lần deploy lớn nên tải một bản sao lưu (mục 4) để có điểm quay lại.

Khi đổi Google Cloud: redirect URI phải khớp chính xác `<APP_BASE_URL>/api/auth/google/callback`.

## 4. Sao lưu và khôi phục

Có hai loại bản sao lưu, mục đích khác nhau:

| | Tải từ trang `/quan-tri/du-lieu` | `scripts/backup-data.mjs` |
|---|---|---|
| Ai dùng | Quản trị viên, bằng trình duyệt | Người quản trị máy chủ, bằng dòng lệnh/cron |
| Nội dung | Một tệp JSON gồm các kho + manifest (SHA-256 từng kho). **Đã loại** token phiên, mã và khóa; email giữ nguyên | Bản chép NGUYÊN các tệp `.data/*.json` ra thư mục có dấu thời gian + `MANIFEST.json`; có thể kéo thêm kho trên Supabase |
| Dùng để | Lưu trữ, đối chiếu, kiểm tra toàn vẹn (nút "Kiểm tra bản sao lưu") | Khôi phục thật |
| Khôi phục tự động | Không. Chỉ kiểm tra, không ghi vào kho | Có, bằng `scripts/restore-data.mjs` |

Mọi lần tải và kiểm tra đều ghi vào nhật ký vận hành (kho `ops-log`), hiển thị ở cuối trang.

### 4.1. Sao lưu bằng dòng lệnh

```bash
node scripts/backup-data.mjs                       # .data -> backups/va-backup-<thời điểm>/ , giữ 14 bản
node scripts/backup-data.mjs --keep 30 --out /srv/backups   # thư mục nằm ngoài volume .data
node scripts/backup-data.mjs --supabase            # kéo thêm các kho trên Supabase (cần URL và khóa secret trong môi trường)
```

- Bản sao lưu THÔ (chưa loại dữ liệu nhạy cảm): giữ ở nơi chỉ quản trị viên truy cập được, không gửi qua chat/email.
- Thư mục sao lưu nên nằm **ngoài** volume `.data` (hoặc ở volume khác) và được chép ra máy khác định kỳ. Sao lưu nằm cùng ổ với dữ liệu không bảo vệ được khi mất ổ.
- Lưu ý hiện trạng: ảnh Docker hiện chưa chép thư mục `scripts/` vào container. Cách tạm khi chưa sửa Dockerfile, chạy từ máy có mã nguồn: `docker exec -i <tên-container> node --input-type=module - --out /srv/backups < scripts/backup-data.mjs` (nạp script qua stdin). Cách gọn hơn: thêm dòng `COPY --from=build /app/scripts ./scripts` vào giai đoạn runner của Dockerfile (việc cần làm, chưa làm).
- Đặt lịch (cron Coolify hoặc cron máy chủ), ví dụ mỗi ngày 2 giờ sáng. **Chưa có lịch tự động nào được thiết lập.**

### 4.2. Khôi phục

```bash
node scripts/restore-data.mjs backups/va-backup-20261023T020000Z                 # XEM THỬ (mặc định), không ghi gì
node scripts/restore-data.mjs backups/va-backup-20261023T020000Z --only eval,signals --apply
node scripts/restore-data.mjs backups/va-backup-20261023T020000Z --apply --yes   # không hỏi (cron/CI)
```

Quy trình an toàn: (1) tắt ứng dụng hoặc ngừng ghi; (2) chạy xem thử và đọc danh sách "ghi đè / tạo mới / giống hệt"; (3) `--apply` và gõ `KHOI PHUC` khi được hỏi; (4) bật lại ứng dụng. Script kiểm tra checksum trước (lệch thì dừng, không ghi gì) và giữ tệp cũ dạng `*.pre-restore-<thời điểm>`.

Quan trọng: **khôi phục chỉ ghi vào đĩa, không ghi lên Supabase.** Ở production, lần đọc kế tiếp lấy dữ liệu từ Supabase trước; nếu Supabase đang có bản khác thì bản khôi phục trên đĩa sẽ không hiện ra. Muốn khôi phục kho nào lên Supabase phải làm thủ công (ví dụ tạm bỏ biến Supabase, hoặc sửa trực tiếp hàng tương ứng trong bảng), và việc này **chưa được thử trên dữ liệu thật**. Hãy tập khôi phục trên máy thử trước khi cần đến nó.

## 5. Kiểm tra RLS Supabase

```bash
node scripts/check-rls.mjs --env-file .env.local
```

Dùng khóa publishable thử ĐỌC (chỉ đọc, không ghi, không in khóa hay nội dung hàng) từng bảng và báo anon đọc được bảng nào. Kết quả lần chạy ngày 2026-10-23 trên dự án thật (chỉ đọc):

- `resources`, `atoms`, `edges`, `questions`, `socratic`: anon **đọc được** (đây là dữ liệu học liệu gốc dùng chung; cần xác nhận có chủ ý công khai không).
- `va_app_store`: **chưa tạo** (migration `20261022000001_va_app_store.sql` chưa được áp dụng) nên ứng dụng đang lưu kho vận hành ở phân vùng `va_app_store_v2` trong bảng dùng chung `studio_kv`.
- `studio_kv` và phân vùng `va_app_store_v2`: anon đọc ra 0 hàng. Script **không phân biệt được** "bảng trống" với "RLS đã chặn", nên chưa thể khẳng định kho vận hành đã được cô lập.

Việc nên làm: áp dụng migration `va_app_store` (bảng riêng, đã bật RLS, không có chính sách cho anon). Sau đó ứng dụng tự chuyển sang bảng riêng; phần dữ liệu cũ trong `studio_kv` cần được chuyển/dọn thủ công. Không có migration nào được viết để bật RLS lên `studio_kv`, vì bảng này dùng chung với ứng dụng khác và bật RLS có thể làm hỏng chúng; cần chủ sở hữu bảng xác nhận trước.

## 6. Đổi khóa

Nguyên tắc: đổi trên Coolify, deploy lại, kiểm tra, rồi mới thu hồi khóa cũ ở nhà cung cấp.

| Khóa | Cách đổi | Hệ quả |
|---|---|---|
| `SESSION_SECRET` | Đặt chuỗi mới, deploy | **Mọi người bị đăng xuất** và phải đăng nhập lại (phiên cũ không còn hợp lệ). Không mất dữ liệu. |
| `REVIEWER_KEY` | Đặt mã mới, thông báo người duyệt | Nếu `SESSION_SECRET` đang bỏ trống, mã này cũng là khóa ký phiên, đổi sẽ đăng xuất mọi người. Nên đặt `SESSION_SECRET` riêng. |
| `GOOGLE_CLIENT_SECRET` | Tạo secret mới trong Google Cloud, cập nhật Coolify, deploy, rồi xóa secret cũ | Người đang đăng nhập không bị ảnh hưởng. |
| `SUPABASE_SECRET_KEY` | Tạo khóa mới trong Supabase, cập nhật, deploy, rồi thu hồi khóa cũ | Nếu `SESSION_SECRET` và `REVIEWER_KEY` đều trống thì đây là khóa ký phiên. Nếu có khóa bị lộ: đổi ngay. |
| Khóa AI (`GEMINI_API_KEY`, ...) | Thêm khóa mới vào `*_API_KEYS` (xoay vòng), deploy, bỏ khóa cũ | Không gián đoạn nếu còn ít nhất một khóa tốt. |
| `APP_API_TOKEN`, `MAJOR_OS_API_KEY` | Đặt mới và báo bên gọi | Bên gọi cũ nhận 401 cho đến khi cập nhật. |

Khóa từng bị commit, chat hoặc chia sẻ phải coi là đã lộ và đổi (việc xoay khóa đã ghi nhận là còn dang dở trong ghi chú dự án; chưa xác nhận đã làm xong).

## 7. Cấp quyền

- **Quản trị viên:** thêm email vào `ADMIN_EMAILS` (Coolify) rồi deploy lại; hoặc quản trị viên hiện có vào `/quan-tri` gán vai trò "Quản trị viên" cho người khác. Quản trị viên vào được `/quan-tri/**`, tải sao lưu, xem sử dụng AI.
- **Người duyệt:** thêm vào `REVIEWER_EMAILS`, hoặc gán ở trang `/quan-tri`. Có quyền duyệt học liệu mẫu, duyệt đề, ghi số liệu đánh giá.
- **Chặn tài khoản:** ở trang `/quan-tri`. Tài khoản bị chặn thấy `/dang-nhap?error=blocked` và bị từ chối ở mọi API, có hiệu lực ngay (không đợi cookie hết hạn 14 ngày).
- Vai trò hiệu lực = mức cao nhất giữa biến môi trường và kho `user-roles`. Gỡ một email khỏi biến môi trường **không** hạ quyền nếu kho vẫn gán quyền cho email đó.
- Mọi thay đổi vai trò ghi vào nhật ký quản trị (kho `audit-log`).

## 8. Xử lý sự cố thường gặp

**Bị khóa ngoài vì đăng nhập Google (không ai vào được, kể cả quản trị).** Nguyên nhân thường gặp: sai `APP_BASE_URL`, sai redirect URI, hết hạn secret, quên đưa email mình vào `ADMIN_EMAILS`. Cách thoát: trên Coolify **gỡ biến `GOOGLE_CLIENT_ID`** (hoặc `GOOGLE_CLIENT_SECRET`), deploy lại. Hệ thống quay về chế độ tự khai tên, ai vào cũng được nên chỉ nên làm tạm và đừng để lâu. Sửa cấu hình, đặt lại biến rồi deploy lần nữa.

**AI "hết phiên" / báo hết hạn mức.** Có hai nghĩa: (a) *phiên đăng nhập hết hạn* (cookie 14 ngày hoặc đổi `SESSION_SECRET`): đăng nhập lại. (b) *hết hạn mức lượt soạn trong ngày* (mặc định 40): tự làm mới lúc 0 giờ; tăng bằng `USAGE_DAILY_LIMIT`; người dùng vẫn lấy được bản chuẩn đã duyệt trong Kho. Nếu AI trả lỗi hàng loạt: xem `/quan-tri/su-dung` (nếu có) hoặc nhật ký container; khóa AI có thể hết hạn mức của nhà cung cấp, thêm khóa vào `*_API_KEYS`. Không có khóa nào thì hệ thống dùng bộ dựng mẫu.

**Supabase lỗi hoặc không kết nối được.** Hệ thống chọn **an toàn dữ liệu hơn tiện**: khi đọc kho lỗi thì dừng chứ không dùng đĩa rồi ghi ngược đè; khi ghi lên Supabase lỗi thì thao tác ghi thất bại (người dùng thấy lỗi lưu). Các việc không cần ghi (xem, tải) vẫn chạy ở phần không dính kho. Kiểm tra: dự án Supabase có bị tạm dừng không, `SUPABASE_SECRET_KEY` còn hiệu lực không, bảng `va_app_store` có còn không. `/api/health` **không** phụ thuộc Supabase nên vẫn trả 200 (không phát hiện được lỗi này); xem trạng thái ở `/quan-tri/du-lieu`. Tạm thời có thể gỡ `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY` để chạy chỉ bằng đĩa, nhưng dữ liệu mới trên đĩa sẽ lệch với bản trên Supabase; cần đối chiếu sau.

**Kho báo "JSON hỏng" hoặc có tệp `*.corrupt-<số>`.** Hệ thống đã đổi tên tệp hỏng sang `.corrupt-<thời điểm>` và bắt đầu kho rỗng. Đừng xóa tệp đó; lấy bản sao lưu gần nhất để khôi phục (mục 4.2), hoặc nhờ người am hiểu sửa tay tệp `.corrupt-*` rồi đổi tên lại.

**Mất dữ liệu sau deploy.** Gần như chắc chắn là chưa gắn volume vào `/app/.data`. Gắn volume rồi khôi phục từ bản sao lưu.

**Hai người cùng sửa, dữ liệu "nhảy" hoặc mất bản ghi.** Kiểm tra số replica có đang >1 không (mục 9).

**Container khởi động lại liên tục.** Xem `uptimeSec` ở `/api/health`; xem nhật ký container. Thường do thiếu `SESSION_SECRET` ở production (mọi lần ký phiên đều lỗi) hoặc hết bộ nhớ.

## 9. Giới hạn đã biết

- **Một bản sao duy nhất.** Khóa ghi (mutex) nằm trong bộ nhớ MỘT tiến trình. Hai container cùng ghi một volume, hoặc rolling deploy (container mới chạy khi container cũ chưa tắt), sẽ ghi đè lẫn nhau. Đã ghi vào Dockerfile/README nhưng **không có cơ chế ép buộc**; chỉ dựa vào cấu hình Coolify.
- Giới hạn tốc độ cũng nằm trong bộ nhớ từng tiến trình, mất khi khởi động lại.
- Kho JSON chỉ hợp quy mô nhỏ (hàng chục người dùng, vài nghìn bản ghi). Mỗi lần ghi viết lại cả tệp.
- Chưa có sao lưu tự động theo lịch (mục 4.1) và chưa kiểm chứng khôi phục lên Supabase.
- Khôi phục chỉ ghi đĩa (mục 4.2). Bản tải từ trang quản trị không khôi phục được tự động.
- `/api/health` chỉ nói tiến trình còn sống, không nói Supabase hay AI có hoạt động.
- Chi phí AI là ước lượng theo bảng giá tham khảo, không thay hóa đơn nhà cung cấp.
- Chưa kiểm tra RLS của bảng dùng chung `studio_kv` đến mức khẳng định (mục 5).
