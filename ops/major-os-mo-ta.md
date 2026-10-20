# Kết nối Major OS — Công cụ AI Sinh Tài nguyên Dạy học Liên môn (MagicStudio Việt Anh)

## 1. App làm gì, ai dùng

Hệ thống hỗ trợ giáo viên Trường Việt Anh (Cơ sở AHT & Cơ sở BT) khởi tạo nhanh học liệu cho tất cả các môn học (Kế hoạch bài dạy Công văn 5512, Ma trận & Đề kiểm tra Thông tư 22/27, Phiếu học tập, Rubric, Chủ đề tích hợp liên môn từ Knowledge Graph và Phân hóa bài tập theo Hồ sơ Lớp học).

- **Người dùng chính:** Giáo viên và Cán bộ quản lý chuyên môn Trường Việt Anh (`@truongvietanh.com`).
- **Đối tượng thụ hưởng được tham chiếu:** Học sinh theo lớp (chỉ gửi mã học sinh `VA-YYYY-NNNNN` khi giáo viên tạo học liệu hỗ trợ cá nhân hóa, tuân thủ tuyệt đối mục 4 của chuẩn thu thập Major OS).

## 2. Endpoint

### `GET /api/major-os/usage`

**Xác thực (fail-closed):** Header `Authorization: Bearer <MAJOR_OS_API_KEY>` (key riêng chỉ đọc báo cáo, thu hồi được trên Major OS). Nếu server chưa đặt `MAJOR_OS_API_KEY` thì endpoint trả `503`; sai/thiếu key trả `401`. Đã gỡ hoàn toàn chế độ `demo=1`; không còn dữ liệu mẫu qua query string.

**Tham số:**

| Tên | Bắt buộc | Mô tả |
|---|---|---|
| `tu` | không | ISO 8601 có múi giờ, vd `2026-10-15T00:00:00+07:00`. Bỏ trống = lấy từ đầu. |
| `den` | không | ISO 8601 có múi giờ. Bỏ trống = đến thời điểm hiện tại. |
| `trang_sau` | không | Con trỏ phân trang (`base64url`), lấy từ trường `trang_sau` của phản hồi trước. |

Phân trang dùng `tu`/`den`/`trang_sau` (không dùng `page`/`offset`). Mỗi trang trả tối đa **500 dòng**. Mỗi dòng có `id` cố định (không sinh bản trùng khi Major OS lấy lại).

**Phản hồi mẫu** (dữ liệu mẫu):

```json
{
  "du_lieu": [
    {
      "id": "evt_va_tr_0001",
      "luc": "2026-10-15T08:30:12+07:00",
      "nguoi": {
        "email": "lan.nguyen@truongvietanh.com",
        "ten": "Nguyễn Thị Lan"
      },
      "tinh_nang": "sinh_hoc_lieu",
      "so_lan": 1,
      "so_phut": 14,
      "cong_cu_id": "khbd-5512",
      "mon_hoc": "toan",
      "khoi_lop": "7",
      "lop_hoc": "7A1"
    },
    {
      "id": "evt_va_tr_0002",
      "luc": "2026-10-15T08:42:05+07:00",
      "nguoi": {
        "email": "lan.nguyen@truongvietanh.com",
        "ten": "Nguyễn Thị Lan"
      },
      "hoc_sinh": {
        "ma": "VA-2026-00417"
      },
      "tinh_nang": "phan_hoa_lop_hoc",
      "so_lan": 1,
      "so_phut": 8,
      "cong_cu_id": "phht-phan-hoa-3-muc",
      "mon_hoc": "toan",
      "khoi_lop": "7",
      "lop_hoc": "7A1"
    }
  ],
  "trang_sau": null
}
```

## 3. Ý nghĩa từng trường

- `id` — Khóa định danh cố định của sự kiện sử dụng.
- `luc` — Thời điểm phát sinh sự kiện theo múi giờ Việt Nam (`+07:00`, chuẩn ISO 8601).
- `nguoi` — Thông tin giáo viên thao tác (`email` thuộc `@truongvietanh.com` và `ten` hiển thị).
- `hoc_sinh` — Chỉ xuất hiện khi giáo viên tạo kế hoạch hỗ trợ cá nhân hóa cho học sinh cần lưu ý; chỉ chứa trường `ma` (`VA-YYYY-NNNNN`).
- `tinh_nang` — Khóa tính năng cố định (xem bảng mục 4).
- `so_lan` — Số lượt thực hiện (mặc định là `1`).
- `so_phut` — Thời lượng tương tác hoặc số phút ước tính công cụ hỗ trợ giáo viên trên phiên làm việc.
- `cong_cu_id` — Mã công cụ trong bộ 82 công cụ (vd: `khbd-5512`, `ktdg-ma-tran-22`, `thlm-knowledge-graph`).
- `mon_hoc`, `khoi_lop`, `lop_hoc` — Ngữ cảnh bộ môn và lớp học được chọn khi sinh học liệu.

## 4. Danh sách tính năng (`tinh_nang`)

| Khóa | Tên hiển thị |
|---|---|
| `sinh_hoc_lieu` | Sinh mới học liệu từ một trong 82 công cụ sư phạm |
| `tinh_chinh_hau_ky` | Tinh chỉnh hậu kỳ 1-click (Rút ngắn, Tăng/Giảm độ khó, Tạo Rubric, Tạo Phiếu học tập, Song ngữ) |
| `ket_noi_lien_mon` | Thiết kế chủ đề/hoạt động kết nối liên môn trên Knowledge Graph |
| `phan_hoa_lop_hoc` | Tạo học liệu phân hóa 3 mức độ hoặc hỗ trợ học sinh theo Hồ sơ Lớp học |
| `xuat_hoc_lieu` | Xuất học liệu ra file Word (`.doc`), Markdown (`.md`) hoặc In PDF |
| `luu_thu_vien` | Lưu và chia sẻ học liệu vào Thư viện Học liệu Dùng chung của trường |
| `hoi_tro_ly_su_pham` | Đặt câu hỏi và nhận tư vấn từ Trợ lý Sư phạm Việt Anh |

## 5. Báo cáo / Cảnh báo mong muốn trên Major OS

- **Bảng xếp hạng giáo viên & tổ bộ môn tích cực đổi mới học liệu:** Thống kê theo tuần/tháng số học liệu được tạo và chia sẻ vào thư viện trường.
- **Tỉ lệ áp dụng Dạy học Liên môn & Phân hóa Lớp học:** Đo lường tỉ lệ giáo viên sử dụng tính năng `ket_noi_lien_mon` và `phan_hoa_lop_hoc` ở từng khối lớp.
- **Danh sách công cụ được dùng nhiều nhất / ít dùng nhất** trong 82 công cụ để đội ngũ phát triển tối ưu hóa prompt.

## 6. Giới hạn & Liên hệ kỹ thuật

- Tần suất Major OS lấy dữ liệu: Mỗi 15 phút/lần (có rate limit mềm theo IP/key để chống lạm dụng; 15 phút/lần là an toàn).
- Phụ trách triển khai kỹ thuật: **Nguyễn Sơn** (`son.nguyen@truongvietanh.com`) · Định hướng sản phẩm: **Anh Nguyễn Mạnh Dương** (`duong@truongvietanh.com`) & **Anh Hùng**.

## 7. Bảo mật & vận hành

- **Endpoint nội bộ `/api/usage`:** dùng cho giao diện của app (ghi/đọc sự kiện sử dụng). Không dành cho Major OS; Major OS chỉ dùng `/api/major-os/usage`.
- **`APP_API_TOKEN` (tùy chọn):** caller bên ngoài (không cùng origin) gọi API nội bộ phải gửi `Authorization: Bearer <APP_API_TOKEN>`.
- **Same-origin guard:** request từ trình duyệt phải cùng origin. Đây chỉ là rào chắn chống gọi chéo trang, **không phải xác thực người dùng thật**; đăng nhập/phân quyền giáo viên là việc cần làm tiếp (follow-up).
- **Rate limit:** các route sinh học liệu/trợ lý/usage có giới hạn số request theo IP; vượt ngưỡng trả `429`.
- **LLM:** endpoint tunnel yêu cầu `stream: true` (không đổi thành `false`); thiếu cấu hình LLM thì engine dùng mẫu dựng sẵn.
- **Xoay khóa:** mọi khóa từng bị commit hoặc chia sẻ (Supabase secret/publishable, LLM API key, `MAJOR_OS_API_KEY`) phải được rotate và chỉ lưu trong `.env.local`/biến môi trường deploy.
- **Không import `lib/supabase.ts` từ client component** (chứa/đọc khóa server).
