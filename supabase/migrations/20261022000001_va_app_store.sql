-- Migration: Bảng lưu trữ trạng thái ứng dụng độc lập (KHÔNG chạm vào bảng dữ liệu gốc atoms/edges/questions/socratic/resources)
-- Dùng cho: Duyệt Kho (kho-reviews, kho-assets), Đề kiểm tra TT22 (assessment), Lịch sử phiên bản (versions),
-- Ghi chú lớp học (class-notes), Tín hiệu chất lượng (signals, eval) và Phiên đăng nhập giáo viên (teacher-sessions).

create table if not exists public.va_app_store (
  store_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_va_app_store_updated_at on public.va_app_store (updated_at desc);

-- Bật RLS: chặn truy cập anon trực tiếp từ trình duyệt, chỉ cho phép Backend có service_role / secret key thao tác.
alter table public.va_app_store enable row level security;

comment on table public.va_app_store is 'Bảng lưu trữ JSONB độc lập cho các phân hệ vận hành của Công cụ Dạy học Việt Anh (không ảnh hưởng dữ liệu gốc).';
