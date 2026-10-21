import type { Bloom, Tt22Level } from './tt22';

export interface BankItem {
  id: string;
  atomId: string;
  atomCode: string;
  bloom: Bloom;
  tt22Level: Tt22Level;
  /** Độ khó thực đo = 1 - tỉ lệ làm đúng; null khi chưa có kết quả. */
  difficultyMeasured: number | null;
  lastUsedAt: string | null;
  doKho: string;
  dok: number;
  noiDung: string;
  dapAn: string;
  loiGiai: string;
  options: string[];
}

export type ExamStatus = 'nhap' | 'cho_duyet' | 'da_duyet' | 'tu_choi';

export interface ExamItemSnapshot {
  questionId: string;
  atomId: string;
  atomCode: string;
  bloom: Bloom;
  tt22Level: Tt22Level;
  noiDung: string;
  dapAn: string;
  loiGiai: string;
  options: string[];
}

export interface MatrixCell {
  target: number;
  selected: number;
  points: number;
}

export interface ExamMatrix {
  standard: 'TT 22/2021/TT-BGDĐT';
  totalPoints: number;
  pointsPerQuestion: number;
  rows: {
    atomId: string;
    atomCode: string;
    title: string;
    cells: Record<Tt22Level, MatrixCell>;
    totalSelected: number;
    points: number;
  }[];
  totals: Record<Tt22Level, MatrixCell>;
  totalTarget: number;
  totalSelected: number;
  shortfall: string[];
}

export interface ExamApproval {
  reviewer: string;
  decision: 'duyet' | 'tu_choi';
  note: string;
  at: string;
}

export interface AccessLogEntry {
  at: string;
  actor: string;
  action: string;
}

export interface ExamRecord {
  examId: string;
  orgId: string;
  createdBy: string;
  createdAt: string;
  examDate: string | null;
  status: ExamStatus;
  language: 'vi' | 'en' | 'song_ngu';
  questionIds: string[];
  items: ExamItemSnapshot[];
  matrix: ExamMatrix;
  assignedReviewers: string[];
  approvals: ExamApproval[];
  accessLog: AccessLogEntry[];
}

export interface UsageEntry {
  questionId: string;
  usedAt: string;
  examId: string;
}

export interface OrgData {
  usage: UsageEntry[];
  results: Record<string, { n: number; correct: number }>;
  exams: ExamRecord[];
}
