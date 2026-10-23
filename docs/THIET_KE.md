# Hệ thiết kế Việt Anh MagicStudio

Nguồn: bộ nhận diện chính thức (Chủ tịch xác nhận 27/06/2026). Biến màu nằm trong `app/globals.css`, thành phần dùng chung trong `app/ui.css` và `app/ui-shell.css`.

## Bảng màu

| Vai trò | Biến | Giá trị | Ghi chú |
|---|---|---|---|
| Chủ đạo | `--navy`, `--accent` | #26275D | Nút phụ, tiêu đề, thanh bên (gradient #1B1C4C đến #26275D) |
| Navy đậm (tông phụ) | `--navy-deep` | #14153A | Chỉ dùng cho hover nút tối, bóng |
| CTA / điểm nhấn | `--cta` | #F9DD0E | Chỉ nút CTA, chấm nhấn. Không tô mảng lớn |
| Chữ trên CTA | `--on-accent` | #26275D | Không dùng chữ trắng trên vàng |
| Nền trang | `--surface-page`, `--cream` | #F0F4F8 | |
| Thẻ, menu, hộp thoại | `--surface-raised`, `--surface` | #FFFFFF | |
| Chữ chính | `--on-surface`, `--ink` | #1A1A2E | |
| Chữ phụ | `--on-surface-muted`, `--muted` | #54556E | |
| Chữ trên nền tối | `--on-dark`, `--on-dark-muted`, `--on-dark-accent` | trắng 90%, trắng 72%, #FDE68A | |
| Viền trang trí | `--border`, `--line` | #E2E8F0 | |
| Viền nhẹ đậm hơn | `--line-strong` | #CBD5E1 | Chỉ trang trí, không dùng làm viền điều khiển |
| Viền điều khiển (ô nhập, nút, chip) | `--border-control` | #7A8BA3 | 3,47:1 trên trắng |
| Tiêu điểm bàn phím | `--focus`, `--ag-focus` | #26275D + vòng vàng | |
| Thành công | `--success` / `--success-bg` | #1E7F4F / #EBF7F0 | |
| Cảnh báo | `--warn` / `--warn-bg` | #B45309 / #FEF3C7 | |
| Lỗi | `--danger` / `--danger-bg` | #C42B21 / #FDECEC | Không dùng #E03C31 làm chữ |
| Thông tin | `--info` / `--info-bg` | #1D4E89 / #E8F1FB | |

Font: Be Vietnam Pro, chỉ sans-serif.

## Tương phản đã đo (WCAG)

| Cặp màu | Tỉ lệ |
|---|---|
| Navy #26275D trên trắng | 13,72 |
| Navy #26275D trên vàng #F9DD0E | 10,05 |
| #FDE68A trên Navy | 11,02 |
| Chữ phụ #54556E trên #F0F4F8 | 6,55 |
| Chữ chính #1A1A2E trên #F0F4F8 | 15,43 |
| Thông tin #1D4E89 trên #E8F1FB | 7,35 |
| Thành công #1E7F4F trên #EBF7F0 | 4,54 |
| Cảnh báo #B45309 trên #FEF3C7 | 4,51 |
| Lỗi #C42B21 trên #FDECEC | 4,95 |
| Viền điều khiển #7A8BA3 trên trắng | 3,47 |

Đo lại: `node scripts/qa/ratio.mjs "#26275D" "#FFFFFF"`.

## Quy tắc bắt buộc

1. Mỗi bề mặt (thẻ, menu, popover, hộp thoại, toast, bảng, ô nhập, huy hiệu, tab, nút) đặt `color` và `background` tường minh ở MỌI trạng thái: mặc định, hover, focus, active, đã chọn, bị khoá. Không dựa vào màu kế thừa từ phần tử cha có nền khác.
2. Chữ thường tối thiểu 4,5:1; chữ lớn, biểu tượng và viền điều khiển tối thiểu 3:1.
3. Không phân biệt trạng thái chỉ bằng màu: thêm chữ, biểu tượng hoặc viền.
4. Tên lớp có tiền tố của trang/thành phần (`rail-hist-`, `ui-`, `ag-`, `cc-`...). Không viết luật độc lập cho `.on .ok .bad .warn .active .good .info`; chỉ dùng dạng kép có phạm vi, ví dụ `.ag-status.ok`.
5. Một tên lớp chỉ được định nghĩa ở một tệp. Kiểm: `node scripts/qa/css-collisions.mjs`.
6. Nút CTA: nền vàng, chữ navy. Nút phụ: nền trắng, chữ navy, viền `--border-control`. Vùng chạm tối thiểu 44px.
7. Logo: dùng nguyên `public/logo-crest.webp` và `public/logo-vietanh.webp`, không đổi màu, không đổ bóng, không viền, không méo tỉ lệ.
8. Quét tương phản ở từng trạng thái (menu mở, hover, focus, có dữ liệu, lỗi, rỗng) bằng `scripts/qa/contrast.mjs`.

## Thành phần dùng chung

- Thanh bên: `.ag-rail`, `.ag-nav-item` (và `.active`), `.ag-label`, `.ag-new`, lịch sử `.rail-hist*` (riêng cho thanh bên; khối "Gần đây của tôi" ở trang chủ dùng `.ag-recent*` trong `ui-agent.css`).
- Menu tài khoản: `.ui-acct`, `.ui-quota`, `.ui-menu*` (`components/ui/AccountMenu.tsx`).
- Nút: `.ag-btn` (`.primary`, `.dark`, `.ghost`, `.small`, `.danger`), `.ag-iconbtn`.
- Huy hiệu và nhắn: `.ag-status`, `.ag-chip`, `.ag-alert`, `.ag-note`, `.ag-empty-note`, `.ag-field`.
- `components/ui`: Tabs (`.ui-tab*`), EmptyState (`.ui-empty*`), Skeleton (`.ui-skel`), Toast (`.ui-toast*`), ConfirmDialog (`.ui-dialog*`), trang trạng thái toàn màn hình `.ui-status*` (404, lỗi).
