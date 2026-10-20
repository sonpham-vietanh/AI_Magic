-- Migration: Khởi tạo cơ sở dữ liệu Công cụ AI Sinh Tài nguyên Dạy học Liên môn Trường Việt Anh
-- Hỗ trợ Supabase Self-host / PostgreSQL nội bộ của Trường Việt Anh

create schema if not exists teaching_studio;

-- 1. Hồ sơ Lớp học & Đặc điểm Học sinh (Class DNA)
create table if not exists teaching_studio.class_profiles (
  id text primary key,
  class_name text not null,
  grade text not null,
  school_level text not null,
  campus text not null,
  homeroom_teacher_name text not null,
  homeroom_teacher_email text not null,
  student_count integer not null default 28,
  english_proficiency_level text not null,
  class_dynamic_summary text not null,
  dominant_interests jsonb not null default '[]'::jsonb,
  attention_span_minutes integer not null default 25,
  groups jsonb not null default '[]'::jsonb,
  -- Chỉ lưu mã học sinh VA-YYYY-NNNNN theo chuẩn bảo mật Major OS
  special_support_students jsonb not null default '[]'::jsonb,
  active_weekly_themes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Nút Kiến thức Chương trình GDPT 2018 (Knowledge Graph Nodes)
create table if not exists teaching_studio.knowledge_nodes (
  id text primary key,
  grade text not null,
  subject text not null,
  subject_name text not null,
  semester integer not null default 1,
  week_start integer not null,
  week_end integer not null,
  title text not null,
  moet_required_outcomes jsonb not null default '[]'::jsonb,
  core_competencies jsonb not null default '[]'::jsonb,
  core_qualities jsonb not null default '[]'::jsonb,
  viet_anh_practical_hook text not null,
  keywords jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 3. Cạnh Liên kết Liên môn (Knowledge Graph Edges)
create table if not exists teaching_studio.knowledge_edges (
  id text primary key,
  source_node_id text not null references teaching_studio.knowledge_nodes(id) on delete cascade,
  target_node_id text not null references teaching_studio.knowledge_nodes(id) on delete cascade,
  relation text not null,
  integration_idea text not null,
  suggested_shared_activity text not null,
  created_at timestamptz not null default now()
);

-- 4. Kho Học liệu Đã Sinh & Dùng Chung
create table if not exists teaching_studio.generated_resources (
  id text primary key,
  created_at timestamptz not null default now(),
  tool_id text not null,
  tool_name text not null,
  category text not null,
  teacher_email text not null,
  teacher_name text not null,
  grade text not null,
  subject text not null,
  class_id text,
  class_name text,
  knowledge_node_id text,
  linked_node_ids jsonb not null default '[]'::jsonb,
  title text not null,
  markdown_content text not null,
  structured_sections jsonb not null default '[]'::jsonb,
  differentiation_summary jsonb,
  cross_subject_highlights jsonb not null default '[]'::jsonb,
  moet_compliance_checklist jsonb not null default '[]'::jsonb,
  generation_mode text not null default 'smart_template',
  model_used text not null,
  estimated_minutes_saved integer not null default 45
);

-- 5. Nhật ký Sử dụng phục vụ Kết nối Major OS v2 (/api/major-os/usage)
create table if not exists teaching_studio.usage_events (
  id text primary key,
  luc timestamptz not null default now(),
  teacher_email text,
  teacher_name text,
  student_code text, -- Mã học sinh VA-YYYY-NNNNN khi phân hóa cá nhân
  tinh_nang text not null,
  so_lan integer not null default 1,
  so_phut integer,
  cong_cu_id text,
  mon_hoc text,
  khoi_lop text,
  lop_hoc text
);

create index if not exists idx_va_tr_usage_events_luc on teaching_studio.usage_events (luc asc);
create index if not exists idx_va_tr_resources_subject_grade on teaching_studio.generated_resources (subject, grade);

-- Bật RLS (Default-deny cho client trực tiếp; chỉ Backend có service_role được phép đọc/ghi)
alter table teaching_studio.class_profiles enable row level security;
alter table teaching_studio.knowledge_nodes enable row level security;
alter table teaching_studio.knowledge_edges enable row level security;
alter table teaching_studio.generated_resources enable row level security;
alter table teaching_studio.usage_events enable row level security;
