// HỢP ĐỒNG DỮ LIỆU DÙNG CHUNG cho các sản phẩm của hệ thống (theo sơ đồ kiến trúc v2.1 của anh Dương).
// File này ĐÃ ĐÓNG BĂNG: không agent nào được sửa. Muốn đổi, báo người điều phối.
//
// Nguồn trong sơ đồ:
//  - "Kết quả": Kế hoạch bài dạy · Slide (PPTX) · Worksheet (DOCX/PDF) · Quiz củng cố trong tiết ·
//    Đề kiểm tra + ma trận · Infographic · Mindmap · Podcast · Audio tranh luận · Video 1–8 phút.
//  - Pha A bước 2: "Sinh 6 dạng tài nguyên / nguyên tử: Text · infographic · mindmap · video ·
//    audio tranh luận 2 chuyên gia · podcast".

/** 6 dạng tài nguyên sinh cho 1 nguyên tử tri thức (workflow thứ 6). */
export const RESOURCE_KINDS = ['text', 'infographic', 'mindmap', 'video', 'tranh_luan', 'podcast'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  text: 'Bài đọc (Text)',
  infographic: 'Infographic',
  mindmap: 'Sơ đồ tư duy (Mindmap)',
  video: 'Video 1–8 phút',
  tranh_luan: 'Audio tranh luận 2 chuyên gia',
  podcast: 'Podcast',
};

/** Hai sản phẩm có định dạng tệp riêng (không nằm trong 6 dạng tài nguyên). */
export type ArtifactKind = ResourceKind | 'slides' | 'worksheet';

export interface TextData {
  title: string;
  /** Các mục của bài đọc; thân bài là văn bản thuần (không HTML, không markdown). */
  sections: { heading: string; body: string }[];
}

export interface MindmapNode {
  id: string;
  label: string;
  children?: MindmapNode[];
}
export interface MindmapData {
  title: string;
  /** Gốc là khái niệm trung tâm; tối đa 3 tầng, mỗi nút tối đa ~8 con (do bộ kiểm tra áp dụng). */
  root: MindmapNode;
}

export interface InfographicData {
  title: string;
  subtitle?: string;
  /** 3–6 ý chính ngắn. */
  keyPoints: { label: string; text: string }[];
  /** Quy trình/các bước (tuỳ chọn). */
  steps?: { n: number; title: string; text: string }[];
  /** Con số/sự kiện nổi bật (tuỳ chọn). */
  facts?: { value: string; caption: string }[];
  /** Một câu chốt cần nhớ. */
  takeaway: string;
}

export interface ScriptLine {
  speaker: string;
  text: string;
}
export interface PodcastData {
  title: string;
  durationMin: number;
  /** 1–2 người dẫn. */
  hosts: string[];
  lines: ScriptLine[];
}
export interface DebateData {
  title: string;
  topic: string;
  /** ĐÚNG 2 chuyên gia với quan điểm khác nhau. */
  experts: { name: string; stance: string }[];
  lines: ScriptLine[];
  conclusion: string;
}

export interface VideoScene {
  n: number;
  durationSec: number;
  visual: string;
  narration: string;
  onScreenText?: string;
}
export interface VideoData {
  title: string;
  /** 1–8 phút theo sơ đồ; tổng durationSec của các cảnh phải khớp totalMin. */
  totalMin: number;
  scenes: VideoScene[];
}

export interface Slide {
  title: string;
  /** 3–5 ý ngắn. */
  bullets: string[];
  /** Ghi chú cho giáo viên khi trình bày. */
  notes?: string;
  /** Gợi ý hình minh hoạ. */
  visual?: string;
}
export interface SlidesData {
  title: string;
  /** 10–14 slide: có slide mở đầu gợi mở và slide tổng kết. */
  slides: Slide[];
}

export interface WorksheetItem {
  prompt: string;
  /** Số dòng kẻ để học sinh trả lời. */
  lines?: number;
  level?: 'nho' | 'hieu' | 'van_dung';
}
export interface WorksheetData {
  title: string;
  /** Thông tin đầu phiếu (họ tên, lớp…) do bộ dựng tài liệu tự thêm; không đưa vào đây. */
  sections: { heading: string; items: WorksheetItem[] }[];
  /** Đáp án và gợi ý chấm: dành riêng cho giáo viên, TÁCH khỏi phần học sinh. */
  answerKey: { heading: string; body: string }[];
}

export type ArtifactData = {
  text: TextData;
  infographic: InfographicData;
  mindmap: MindmapData;
  video: VideoData;
  tranh_luan: DebateData;
  podcast: PodcastData;
  slides: SlidesData;
  worksheet: WorksheetData;
};

export interface Artifact<K extends ArtifactKind = ArtifactKind> {
  kind: K;
  title: string;
  data: ArtifactData[K];
}

/** Một dấu kiểm cấu trúc xác định (không do AI tự chấm). */
export interface StructureCheck {
  id: string;
  label: string;
  ok: boolean;
  note?: string;
}

export const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  ...RESOURCE_LABELS,
  slides: 'Slide bài giảng (PPTX)',
  worksheet: 'Phiếu học tập (Worksheet)',
};
