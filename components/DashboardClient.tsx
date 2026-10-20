'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  CompleteLessonPack,
  LessonPackSection,
} from '@/app/api/generate-pack/route';
import {
  ALL_TOOLS,
  getCategoryMeta,
  getToolById,
  searchTools,
  TOOL_CATEGORIES,
} from '@/lib/catalog';
import { CLASS_PROFILES, getClassById } from '@/lib/classes';
import type {
  SupabaseAtom,
  SupabaseEdge,
  SupabaseFactoryAsset,
  SupabaseFactoryPackage,
  SupabaseQuestion,
  SupabaseSocratic,
  SupabaseStatsOverview,
  SupabaseTainguyenFull,
  SupabaseTainguyenMeta,
} from '@/lib/supabase';
import type {
  GradeLevel,
  KnowledgeNode,
  PedagogicalTool,
  SubjectCode,
  ToolCategoryCode,
} from '@/lib/types';
import {
  buildFactoryAssetDocx,
  buildLessonPackDocx,
  downloadBlob,
} from '@/lib/export/docx';
import { MathText } from './MathText';
import { AssistantDrawer } from './AssistantDrawer';
import { Shell } from './Shell';
import { ToolStudioModal } from './ToolStudioModal';

// Bản sao cục bộ để không kéo lib/supabase.ts (xử lý khoá bí mật) vào bundle client.
function mapSupabaseSubjectToCode(subjectName?: string): SubjectCode {
  if (!subjectName) return 'toan';
  const s = subjectName.toLowerCase();
  if (s.includes('toán')) return 'toan';
  if (s.includes('ngữ văn') || s.includes('tiếng việt')) return 'ngu_van';
  if (s.includes('tiếng anh') || s.includes('oxford')) return 'tieng_anh';
  if (s.includes('khoa học tự nhiên')) return 'khtn';
  if (s.includes('vật lí') || s.includes('vật lý')) return 'vat_ly';
  if (s.includes('hoá học') || s.includes('hóa học')) return 'hoa_hoc';
  if (s.includes('sinh học')) return 'sinh_hoc';
  if (s.includes('lịch sử và địa')) return 'lich_su_dia_ly';
  if (s.includes('địa lí') || s.includes('địa lý')) return 'dia_ly';
  if (s.includes('công dân') || s.includes('kinh tế')) return 'gdcd_gdktpl';
  if (s.includes('tin học')) return 'tin_hoc';
  if (s.includes('công nghệ')) return 'cong_nghe';
  return 'toan';
}

async function readApiJson<T>(res: Response): Promise<T> {
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await res.json()) as T & { error?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    if (res.status === 429) {
      throw new Error('Hệ thống đang quá tải, vui lòng thử lại sau ít phút.');
    }
    if (res.status === 401) {
      throw new Error('Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.');
    }
    throw new Error(
      body?.error || `Máy chủ trả về lỗi (${res.status}). Vui lòng thử lại sau.`,
    );
  }
  return body;
}

const SUPABASE_SUBJECTS = [
  'Toán',
  'Ngữ văn',
  'Tiếng Anh',
  'Khoa học tự nhiên',
  'Lịch sử và Địa lí',
  'Giáo dục công dân',
  'Tin học',
  'Công nghệ',
  'Vật lí',
  'Hoá học',
  'Sinh học',
  'Địa lí',
  'Giáo dục kinh tế và pháp luật',
  'Oxford English',
];

const QUICK_TEACHER_COMBOS: {
  toolId: string;
  step: string;
  title: string;
  desc: string;
}[] = [
  {
    toolId: 'khbd-5512',
    step: '01',
    title: 'Giáo án chuẩn Công văn 5512',
    desc: 'Đủ 4 hoạt động lên lớp và phân hóa 3 nhóm học sinh.',
  },
  {
    toolId: 'pht-worksheet-5512',
    step: '02',
    title: 'Phiếu Học tập In A4',
    desc: 'Bài tập cá nhân và thảo luận nhóm phát ngay tại lớp.',
  },
  {
    toolId: 'ktdg-15-phut',
    step: '03',
    title: 'Đề Kiểm tra 15 phút (A/B)',
    desc: '2 mã đề tương đương kèm đáp án chấm nhanh.',
  },
  {
    toolId: 'ktdg-ma-tran-22',
    step: '04',
    title: 'Ma trận & Đặc tả Thông tư 22',
    desc: 'Chuẩn 4 mức độ nhận thức và định dạng đề mới.',
  },
];

export function DashboardClient({
  initialToolId,
  initialNodeId,
  initialClassId,
}: {
  initialToolId?: string;
  initialNodeId?: string;
  initialClassId?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<
    ToolCategoryCode | 'all'
  >('all');
  const [featuredOnly, setFeaturedOnly] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTool, setActiveTool] = useState<PedagogicalTool | null>(null);
  const [assistantOpen, setAssistantOpen] = useState<boolean>(false);
  const [workspaceView, setWorkspaceView] = useState<'studio' | 'catalog'>(
    'studio',
  );
  const [leftDataTab, setLeftDataTab] = useState<
    'package' | 'assets' | 'questions'
  >('package');

  // Ngữ cảnh bài dạy thực tế
  const [sbSubject, setSbSubject] = useState<string>('Toán');
  const [grade, setGrade] = useState<GradeLevel>('7');
  const [onlyFactoryReady, setOnlyFactoryReady] = useState<boolean>(false);
  const [atomId, setAtomId] = useState<string>(initialNodeId || 'KC-5735310');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    (initialClassId && getClassById(initialClassId)?.id) ||
      CLASS_PROFILES[0]?.id ||
      '',
  );
  const [selectedTeacherName, setSelectedTeacherName] =
    useState<string>('Anh Hùng');

  const [sbOverview, setSbOverview] = useState<SupabaseStatsOverview | null>(
    null,
  );
  const [sbAtoms, setSbAtoms] = useState<SupabaseAtom[]>([]);
  const [atomPackages, setAtomPackages] = useState<SupabaseFactoryPackage[]>(
    [],
  );
  const [activePkgLevel, setActivePkgLevel] = useState<number>(1);
  const [atomFactoryAssets, setAtomFactoryAssets] = useState<
    SupabaseFactoryAsset[]
  >([]);
  const [activeFactoryAsset, setActiveFactoryAsset] =
    useState<SupabaseFactoryAsset | null>(null);
  const [atomEdges, setAtomEdges] = useState<SupabaseEdge[]>([]);
  const [atomQuestions, setAtomQuestions] = useState<SupabaseQuestion[]>([]);
  const [atomSocratic, setAtomSocratic] = useState<SupabaseSocratic[]>([]);
  const [atomTainguyen, setAtomTainguyen] = useState<SupabaseTainguyenMeta[]>(
    [],
  );

  // Máy trộn Đề kiểm tra nhiều bài (Multi-Atom Exam Mixer)
  const [examMixerOpen, setExamMixerOpen] = useState<boolean>(false);
  const [selectedExamAtomIds, setSelectedExamAtomIds] = useState<string[]>([]);

  // Chế độ Bảng Tương Tác Lớp Học (Live Classroom Mode - Tính năng vượt trội ChatGPT)
  const [liveBoardOpen, setLiveBoardOpen] = useState<boolean>(false);
  const [liveTab, setLiveTab] = useState<'quiz' | 'socratic' | 'simulation'>(
    'quiz',
  );
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(0);
  const [revealedAnswer, setRevealedAnswer] = useState<boolean>(false);
  const [socraticStep, setSocraticStep] = useState<number>(1);
  const [activeSimHtml, setActiveSimHtml] =
    useState<SupabaseTainguyenFull | null>(null);
  const [fallbackSims, setFallbackSims] = useState<SupabaseTainguyenMeta[]>([]);

  // Tính năng Đinh: 1-Chạm Soạn Trọn Bộ Hồ Sơ Tiết Dạy (4-trong-1)
  const [packModalOpen, setPackModalOpen] = useState<boolean>(false);
  const [packLoading, setPackLoading] = useState<boolean>(false);
  const [lessonPack, setLessonPack] = useState<CompleteLessonPack | null>(null);
  const [activePackTab, setActivePackTab] =
    useState<LessonPackSection['id']>('giao_an');
  const [packNotice, setPackNotice] = useState<string>('');
  const [dataError, setDataError] = useState<string>('');

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const [ov, tn] = await Promise.all([
          fetch('/api/supabase/knowledge?mode=overview', {
            signal: ctrl.signal,
          }).then((r) =>
            readApiJson<{ ok?: boolean; overview?: SupabaseStatsOverview }>(r),
          ),
          fetch('/api/supabase/knowledge?mode=tainguyen&limit=6', {
            signal: ctrl.signal,
          }).then((r) =>
            readApiJson<{ ok?: boolean; items?: SupabaseTainguyenMeta[] }>(r),
          ),
        ]);
        if (ov.ok && ov.overview) {
          setSbOverview(ov.overview);
          if (ov.overview.users[0]?.name) {
            setSelectedTeacherName(ov.overview.users[0].name);
          }
        }
        if (tn.ok && tn.items) setFallbackSims(tn.items);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setDataError(
          err instanceof Error
            ? err.message
            : 'Không tải được dữ liệu tổng quan.',
        );
      }
    };
    void load();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({
      limit: '100',
    });
    if (!onlyFactoryReady) {
      params.set('subject', sbSubject);
      params.set('grade', grade);
    } else {
      params.set('onlyFactoryReady', 'true');
    }
    fetch(`/api/supabase/knowledge?${params.toString()}`, {
      signal: ctrl.signal,
    })
      .then((r) => readApiJson<{ ok?: boolean; atoms?: SupabaseAtom[] }>(r))
      .then((data) => {
        const list = data.atoms || [];
        setDataError('');
        setSbAtoms(list);
        setAtomId((cur) =>
          list.length > 0 && !list.some((a) => a.id === cur) ? list[0].id : cur,
        );
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setSbAtoms([]);
        setDataError(
          err instanceof Error
            ? err.message
            : 'Không tải được danh sách bài học.',
        );
      });
    return () => ctrl.abort();
  }, [sbSubject, grade, onlyFactoryReady]);

  useEffect(() => {
    if (!atomId) return;
    const ctrl = new AbortController();
    setActiveQuestionIdx(0);
    setRevealedAnswer(false);
    setSocraticStep(1);
    fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(atomId)}`, {
      signal: ctrl.signal,
    })
      .then((r) =>
        readApiJson<{
          ok?: boolean;
          packages?: SupabaseFactoryPackage[];
          factoryAssets?: SupabaseFactoryAsset[];
          edges?: SupabaseEdge[];
          questions?: SupabaseQuestion[];
          socratic?: SupabaseSocratic[];
          tainguyen?: SupabaseTainguyenMeta[];
        }>(r),
      )
      .then((data) => {
        if (data.ok) {
          const pkgs = data.packages || [];
          setAtomPackages(pkgs);
          setActivePkgLevel(pkgs[0]?.level || 1);
          setAtomFactoryAssets(data.factoryAssets || []);
          setAtomEdges(data.edges || []);
          setAtomQuestions(data.questions || []);
          setAtomSocratic(data.socratic || []);
          setAtomTainguyen(data.tainguyen || []);
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setAtomPackages([]);
        setAtomFactoryAssets([]);
        setAtomEdges([]);
        setAtomQuestions([]);
        setAtomSocratic([]);
        setAtomTainguyen([]);
        setDataError(
          err instanceof Error ? err.message : 'Không tải được chi tiết bài học.',
        );
      });
    return () => ctrl.abort();
  }, [atomId]);

  useEffect(() => {
    if (initialNodeId) {
      setAtomId(initialNodeId);
    }
    if (initialToolId) {
      const foundTool = ALL_TOOLS.find(
        (t) => t.id === initialToolId || t.slug === initialToolId,
      );
      if (foundTool) {
        setActiveTool(foundTool);
      }
    }
  }, [initialToolId, initialNodeId]);

  const selectedSbAtom = sbAtoms.find((a) => a.id === atomId);
  const subjectCode = mapSupabaseSubjectToCode(sbSubject);
  const activeClassProfile = getClassById(selectedClassId);

  const activeNode: KnowledgeNode | undefined = selectedSbAtom
    ? {
        id: selectedSbAtom.id,
        grade: String(selectedSbAtom.grade) as GradeLevel,
        subject: subjectCode,
        subjectName: selectedSbAtom.subject,
        semester: 1,
        weekRange: [1, 2],
        title: `[${selectedSbAtom.code}] ${selectedSbAtom.title}`,
        moetRequiredOutcomes: selectedSbAtom.yeu_cau
          ? [selectedSbAtom.yeu_cau]
          : [selectedSbAtom.title],
        coreCompetencies: selectedSbAtom.nang_luc
          ? [selectedSbAtom.nang_luc]
          : ['Năng lực tự chủ và tự học'],
        coreQualities: ['Chăm chỉ', 'Trách nhiệm'],
        vietAnhPracticalHook:
          selectedSbAtom.quan_niem_sai ||
          `${selectedSbAtom.chapter} · ${selectedSbAtom.lesson}`,
        keywords: [selectedSbAtom.code, selectedSbAtom.chapter],
      }
    : undefined;

  const filteredTools = searchTools({
    query: searchQuery,
    category: selectedCategory,
    subject: 'all',
    grade: 'all',
    featuredOnly: !searchQuery && selectedCategory === 'all' && featuredOnly,
  });

  const handleLoadSimulation = (id: string) => {
    fetch(
      `/api/supabase/knowledge?mode=tainguyen&tainguyenId=${encodeURIComponent(id)}`,
    )
      .then((r) =>
        readApiJson<{ ok?: boolean; item?: SupabaseTainguyenFull | null }>(r),
      )
      .then((data) => {
        if (data.ok && data.item) {
          setActiveSimHtml(data.item);
        } else {
          setDataError('Không tìm thấy mô phỏng này.');
        }
      })
      .catch((err: unknown) => {
        setDataError(
          err instanceof Error ? err.message : 'Không tải được mô phỏng.',
        );
      });
  };

  const simsToDisplay =
    atomTainguyen.length > 0 ? atomTainguyen : fallbackSims.slice(0, 4);
  const currentQuestion = atomQuestions[activeQuestionIdx];

  const handleGenerateCompletePack = async () => {
    setPackModalOpen(true);
    setPackLoading(true);
    setPackNotice('');
    try {
      const res = await fetch('/api/generate-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'lesson_pack',
          atomId,
          subject: sbSubject,
          grade,
          classId: selectedClassId,
          teacherName: selectedTeacherName,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        pack?: CompleteLessonPack;
        warning?: string;
      }>(res);
      if (data.ok && data.pack) {
        setLessonPack(data.pack);
        setActivePackTab('giao_an');
        if (data.warning) setPackNotice(data.warning);
      } else {
        setPackNotice('Không thể tạo bộ hồ sơ. Vui lòng thử lại.');
      }
    } catch (err) {
      setPackNotice(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.',
      );
    } finally {
      setPackLoading(false);
    }
  };

  const handleGenerateMultiExamPack = async () => {
    const idsToMix =
      selectedExamAtomIds.length > 0 ? selectedExamAtomIds : [atomId];
    setExamMixerOpen(false);
    setPackModalOpen(true);
    setPackLoading(true);
    setPackNotice('');
    try {
      const res = await fetch('/api/generate-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'multi_exam',
          atomIds: idsToMix,
          subject: sbSubject,
          grade,
          classId: selectedClassId,
          teacherName: selectedTeacherName,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        pack?: CompleteLessonPack;
        warning?: string;
      }>(res);
      if (data.ok && data.pack) {
        setLessonPack(data.pack);
        setActivePackTab('giao_an');
        if (data.warning) setPackNotice(data.warning);
      } else {
        setPackNotice('Không thể tạo bộ hồ sơ. Vui lòng thử lại.');
      }
    } catch (err) {
      setPackNotice(
        err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.',
      );
    } finally {
      setPackLoading(false);
    }
  };

  const handleDownloadFactoryAssetWord = async (asset: SupabaseFactoryAsset) => {
    try {
      const blob = await buildFactoryAssetDocx(asset);
      downloadBlob(blob, `Factory-${asset.format}-${asset.packageId}.docx`);
    } catch (err) {
      console.error('[docx] export failed', err);
      window.alert('Không thể tạo file Word (.docx). Vui lòng thử lại hoặc dùng nút In.');
    }
  };

  const activePkg =
    atomPackages.find((p) => p.level === activePkgLevel) || atomPackages[0];

  const handleDownloadPackWord = async () => {
    if (!lessonPack) return;
    try {
      const blob = await buildLessonPackDocx(lessonPack);
      downloadBlob(blob, `Tron-bo-tiet-day-${lessonPack.atomCode}.docx`);
      setPackNotice(
        'Đã tải file Word (.docx) gồm đủ 4 phần (đã ngắt trang sẵn để in phát cho học sinh)!',
      );
    } catch (err) {
      console.error('[docx] export failed', err);
      setPackNotice('Không thể tạo file Word (.docx). Vui lòng thử lại hoặc dùng nút In.');
    }
  };

  return (
    <Shell
      title="Trạm Ứng dụng & Chế biến Học liệu từ Factory Việt Anh"
      subtitle="Nạp trực tiếp Gói kiến thức chuẩn (L1-L3) & 8 Học liệu gốc từ factory.vietanh.org, kết hợp Công cụ Tổ hợp Giáo án 5512, Trộn Đề Thông tư 22 & Dạy học Liên môn."
      onOpenAssistant={() => setAssistantOpen(true)}
      rightActions={
        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => void handleGenerateCompletePack()}
          >
            Đóng Gói Giáo Án 5512 Từ Factory (4 trong 1)
          </button>
          <button
            type="button"
            className="btn btn-navy"
            onClick={() => {
              setSelectedExamAtomIds(
                sbAtoms.slice(0, 3).map((a) => a.id),
              );
              setExamMixerOpen(true);
            }}
          >
            Máy Trộn Đề Nhiều Bài (Thông tư 22)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setLiveBoardOpen(true);
              if (!activeSimHtml && simsToDisplay[0]) {
                handleLoadSimulation(simsToDisplay[0].id);
              }
            }}
          >
            Bảng Tương tác Lớp học
          </button>
        </div>
      }
    >
      <div className="stack" style={{ gap: '20px' }}>
        {/* ==================== KHỐI 1: NẠP BÀI HỌC TỪ SUPABASE & FACTORY.VIETANH.ORG ==================== */}
        <section
          className="va-card-accent"
          style={{ padding: '20px 24px' }}
          aria-label="Thiết lập tiết dạy và nạp dữ liệu từ Factory"
        >
          <div
            className="row-between"
            style={{
              marginBottom: '14px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div className="row-wrap" style={{ gap: '8px' }}>
              <span className="va-badge va-badge-green">
                Đồng bộ trực tiếp với factory.vietanh.org
              </span>
              <span style={{ fontSize: '13.5px', color: 'var(--muted)' }}>
                Đã có <b>{sbOverview?.packagesCount || 29} gói kiến thức L1-L3</b>,{' '}
                <b>{sbOverview?.resourcesCount || 68} học liệu gốc 8 định dạng</b>,{' '}
                <b>{(sbOverview?.questionsCount || 12986).toLocaleString('vi-VN')} câu hỏi</b> &{' '}
                <b>{sbOverview?.tainguyenCount || 666} mô phỏng HTML5</b> (đang cập nhật liên tục)
              </span>
            </div>

            <div className="row-wrap">
              <button
                type="button"
                className={`va-tab ${onlyFactoryReady ? 'active' : ''}`}
                onClick={() => setOnlyFactoryReady(true)}
              >
                Chỉ hiện bài đã có Gói gốc Factory (22 bài)
              </button>
              <button
                type="button"
                className={`va-tab ${!onlyFactoryReady ? 'active' : ''}`}
                onClick={() => setOnlyFactoryReady(false)}
              >
                Theo Môn / Khối ({(sbOverview?.atomsCount || 12908).toLocaleString('vi-VN')} bài)
              </button>
            </div>
          </div>

          {dataError && (
            <div
              role="alert"
              className="va-badge"
              style={{ whiteSpace: 'normal', color: '#b42318' }}
            >
              {dataError}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              alignItems: 'end',
            }}
          >
            {!onlyFactoryReady && (
              <>
                <div className="field">
                  <label htmlFor="ctx-subject">Môn học</label>
                  <select
                    id="ctx-subject"
                    value={sbSubject}
                    onChange={(e) => setSbSubject(e.target.value)}
                  >
                    {SUPABASE_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="ctx-grade">Khối lớp</label>
                  <select
                    id="ctx-grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value as GradeLevel)}
                  >
                    {['6', '7', '8', '9', '10', '11', '12'].map((g) => (
                      <option key={g} value={g}>
                        Khối {g}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div
              className="field"
              style={{ gridColumn: onlyFactoryReady ? 'span 3' : 'span 2' }}
            >
              <label htmlFor="ctx-node">
                Chọn đơn vị kiến thức (Ưu tiên hiển thị bài đã sinh Gói Factory lên đầu)
              </label>
              <select
                id="ctx-node"
                value={atomId}
                onChange={(e) => setAtomId(e.target.value)}
              >
                {sbAtoms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.hasFactoryPackage
                      ? `[ĐÃ CÓ GÓI FACTORY${a.factoryAssetCount ? ` + ${a.factoryAssetCount} HỌC LIỆU` : ''}] `
                      : ''}
                    [{a.code}] {a.title} ({a.subject} K{a.grade})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="ctx-class">Lớp áp dụng (Việt Anh)</label>
              <select
                id="ctx-class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {CLASS_PROFILES.map((c) => (
                  <option key={c.id} value={c.id}>
                    Lớp {c.className} ({c.studentCount} HS)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ==================== THANH CHUYỂN CHẾ ĐỘ LÀM VIỆC (GIỮ GIAO DIỆN GỌN GÀNG, KHÔNG RỐI MẮT) ==================== */}
        <div
          className="row-between"
          style={{
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '10px 16px',
          }}
        >
          <div className="row-wrap" style={{ gap: '8px' }}>
            <button
              type="button"
              className={`va-tab ${workspaceView === 'studio' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('studio')}
              style={{ fontSize: '14.5px', padding: '9px 16px' }}
            >
              <span>1. Bàn Làm Việc Bài Dạy (Nguyên liệu Factory → Chế biến)</span>
            </button>
            <button
              type="button"
              className={`va-tab ${workspaceView === 'catalog' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('catalog')}
              style={{ fontSize: '14.5px', padding: '9px 16px' }}
            >
              <span>2. Kho 82 Công Cụ Chuyên Môn & Chủ Nhiệm</span>
              <span className="va-tab-count">82</span>
            </button>
          </div>

          <div style={{ fontSize: '13.5px', color: 'var(--muted)' }}>
            Đang áp dụng cho: <b>Lớp {activeClassProfile?.className}</b> (
            {activeClassProfile?.campus})
          </div>
        </div>

        {/* ==================== CHẾ ĐỘ 1: BÀN LÀM VIỆC 2 CỘT (TRÁI: NGUYÊN LIỆU FACTORY · PHẢI: CHẾ BIẾN) ==================== */}
        {workspaceView === 'studio' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '18px',
              alignItems: 'start',
            }}
          >
            {/* ---------- CỘT TRÁI: NGUYÊN LIỆU GỐC ĐÃ NẠP TỪ FACTORY.VIETANH.ORG ---------- */}
            <section
              className="card stack"
              style={{ gap: '14px', padding: '20px 22px' }}
              aria-label="Nguyên liệu gốc từ Factory"
            >
              <div>
                <div className="row-between" style={{ marginBottom: '6px' }}>
                  <span className="va-badge va-badge-navy">
                    NGUYÊN LIỆU GỐC TỪ FACTORY.VIETANH.ORG
                  </span>
                  {atomPackages.length > 0 ? (
                    <span className="va-badge va-badge-green">
                      Đã có {atomPackages.length} Gói L1-L3 & {atomFactoryAssets.length} Học liệu
                    </span>
                  ) : (
                    <span className="va-badge va-badge-gold">
                      Đang cập nhật Gói L1-L3
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--navy)' }}>
                  {selectedSbAtom
                    ? `[${selectedSbAtom.code}] ${selectedSbAtom.title}`
                    : 'Đang tải bài học...'}
                </h2>
                {selectedSbAtom && (
                  <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                    {selectedSbAtom.subject} Khối {selectedSbAtom.grade} · {selectedSbAtom.chapter} ·{' '}
                    {selectedSbAtom.lesson}
                  </p>
                )}
              </div>

              {/* 3 TAB CON BÊN TRONG CỘT TRÁI ĐỂ KHÔNG BỊ TRẢI DÀI GÂY RỐI */}
              <div
                className="row-wrap"
                style={{
                  borderBottom: '1px solid var(--line)',
                  paddingBottom: '10px',
                  gap: '6px',
                }}
              >
                <button
                  type="button"
                  className={`va-tab ${leftDataTab === 'package' ? 'active' : ''}`}
                  onClick={() => setLeftDataTab('package')}
                >
                  <span>Gói Kiến thức ({atomPackages.length || 1})</span>
                </button>
                <button
                  type="button"
                  className={`va-tab ${leftDataTab === 'assets' ? 'active' : ''}`}
                  onClick={() => setLeftDataTab('assets')}
                >
                  <span>Học liệu gốc ({atomFactoryAssets.length})</span>
                </button>
                <button
                  type="button"
                  className={`va-tab ${leftDataTab === 'questions' ? 'active' : ''}`}
                  onClick={() => setLeftDataTab('questions')}
                >
                  <span>
                    Câu hỏi ({atomQuestions.length}) & Liên môn ({atomEdges.length})
                  </span>
                </button>
              </div>

              {/* NỘI DUNG TAB CON 1: GÓI KIẾN THỨC CHUẨN (L1 / L2 / L3) */}
              {leftDataTab === 'package' && (
                <div className="stack" style={{ gap: '12px' }}>
                  {atomPackages.length > 1 && (
                    <div className="row-wrap" style={{ gap: '6px' }}>
                      {atomPackages.map((pkg) => (
                        <button
                          key={pkg.id}
                          type="button"
                          className={`va-tab ${activePkg?.id === pkg.id ? 'active' : ''}`}
                          onClick={() => setActivePkgLevel(pkg.level)}
                          style={{ fontSize: '12.5px', padding: '5px 10px' }}
                        >
                          Mức L{pkg.level} ({pkg.bloom})
                        </button>
                      ))}
                    </div>
                  )}

                  {activePkg ? (
                    <div className="stack" style={{ gap: '10px' }}>
                      <div
                        style={{
                          background: 'var(--cream)',
                          border: '1px solid var(--line)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: 'var(--navy)',
                            textTransform: 'uppercase',
                            marginBottom: '4px',
                          }}
                        >
                          1. Mục tiêu & Giải thích cốt lõi ({activePkg.id})
                        </div>
                        <div style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                          <b>Mục tiêu:</b>{' '}
                          {activePkg.fields.objective ||
                            selectedSbAtom?.yeu_cau ||
                            selectedSbAtom?.title}
                        </div>
                        {activePkg.fields.explanation && (
                          <div
                            style={{
                              fontSize: '13.5px',
                              color: 'var(--muted)',
                              marginTop: '6px',
                              lineHeight: 1.55,
                            }}
                          >
                            <b>Giải thích:</b> {activePkg.fields.explanation}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--line)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: 'var(--navy)',
                            textTransform: 'uppercase',
                            marginBottom: '4px',
                          }}
                        >
                          2. Ví dụ chuẩn & Phản ví dụ
                        </div>
                        <div style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                          <b>Ví dụ:</b>{' '}
                          {activePkg.fields.example ||
                            'Áp dụng trực tiếp quy tắc bài học.'}
                        </div>
                        {activePkg.fields.counterExample && (
                          <div
                            style={{
                              fontSize: '13.5px',
                              color: 'var(--muted)',
                              marginTop: '6px',
                              lineHeight: 1.55,
                            }}
                          >
                            <b>Phản ví dụ:</b> {activePkg.fields.counterExample}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          background: '#fffdf5',
                          border: '1px solid var(--gold)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: 'var(--gold-text)',
                            textTransform: 'uppercase',
                            marginBottom: '4px',
                          }}
                        >
                          3. Lỗi học sinh hay mắc & Chiến lược Socratic
                        </div>
                        <div style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                          <b>Lỗi sai:</b>{' '}
                          {activePkg.fields.commonMistake ||
                            selectedSbAtom?.quan_niem_sai ||
                            'Kiểm tra kỹ điều kiện áp dụng.'}
                        </div>
                        {activePkg.fields.strategy && (
                          <div
                            style={{
                              fontSize: '13.5px',
                              color: 'var(--navy)',
                              marginTop: '6px',
                              lineHeight: 1.55,
                            }}
                          >
                            <b>Chiến lược dạy:</b> {activePkg.fields.strategy}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    selectedSbAtom && (
                      <div className="stack" style={{ gap: '10px' }}>
                        <div
                          style={{
                            background: 'var(--cream)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '12px 14px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 800,
                              color: 'var(--navy)',
                              textTransform: 'uppercase',
                              marginBottom: '4px',
                            }}
                          >
                            Yêu cầu cần đạt ({selectedSbAtom.code})
                          </div>
                          <div style={{ fontSize: '13.5px' }}>
                            {selectedSbAtom.yeu_cau || selectedSbAtom.title}
                          </div>
                        </div>
                        <div
                          style={{
                            background: '#fffdf5',
                            border: '1px solid var(--gold)',
                            borderRadius: '8px',
                            padding: '12px 14px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 800,
                              color: 'var(--gold-text)',
                              textTransform: 'uppercase',
                              marginBottom: '4px',
                            }}
                          >
                            Lỗi sai học sinh hay mắc
                          </div>
                          <div style={{ fontSize: '13.5px' }}>
                            {selectedSbAtom.quan_niem_sai ||
                              'Lưu ý học sinh nắm vững định nghĩa và điều kiện áp dụng.'}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* NỘI DUNG TAB CON 2: 8 ĐỊNH DẠNG HỌC LIỆU ĐÃ SINH SẴN TRÊN FACTORY */}
              {leftDataTab === 'assets' && (
                <div className="stack" style={{ gap: '10px' }}>
                  {atomFactoryAssets.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {atomFactoryAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setActiveFactoryAsset(asset)}
                          style={{
                            textAlign: 'left',
                            background: '#ffffff',
                            border: '1px solid var(--line)',
                            borderLeft: '4px solid var(--green)',
                            borderRadius: '8px',
                            padding: '12px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '6px',
                          }}
                        >
                          <div>
                            <div className="row-between">
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  color: 'var(--green)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {asset.format.toUpperCase()}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {asset.id}
                              </span>
                            </div>
                            <div
                              style={{
                                fontWeight: 800,
                                fontSize: '14px',
                                color: 'var(--navy)',
                                marginTop: '4px',
                              }}
                            >
                              {asset.formatLabel}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--navy)',
                            }}
                          >
                            Xem & tải Word ({asset.sections.length} mục) →
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '20px',
                        borderRadius: '8px',
                        background: 'var(--cream)',
                        border: '1px dashed var(--line)',
                        fontSize: '13.5px',
                        color: 'var(--muted)',
                      }}
                    >
                      Bài học này đang chờ <b>factory.vietanh.org</b> cập nhật gói 8 định dạng. Bạn có thể bấm nút <b>Đóng gói Giáo án 5512 & Phiếu A4</b> ở cột bên phải để chế biến ngay bằng AI.
                    </div>
                  )}
                </div>
              )}

              {/* NỘI DUNG TAB CON 3: CÂU HỎI GỐC & LIÊN KẾT LIÊN MÔN */}
              {leftDataTab === 'questions' && (
                <div className="stack" style={{ gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                  {atomQuestions.slice(0, 4).map((q, idx) => (
                    <div
                      key={q.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'var(--cream)',
                        border: '1px solid var(--line)',
                        fontSize: '13.5px',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '3px' }}>
                        Câu {idx + 1} ({q.do_kho} · DOK {q.dok}):
                      </div>
                      <div><MathText text={q.noi_dung} /></div>
                      <div style={{ fontSize: '12.5px', color: 'var(--green)', marginTop: '4px', fontWeight: 700 }}>
                        Đáp án: <MathText text={q.dap_an} />
                      </div>
                    </div>
                  ))}

                  {atomEdges.length > 0 && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '1px solid var(--line)',
                        fontSize: '13.5px',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '6px' }}>
                        Liên kết Kiến thức & Liên môn (Bảng edges):
                      </div>
                      {atomEdges.slice(0, 4).map((e) => (
                        <div key={e.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
                          • <b>[{e.linkedAtom?.code || e.to_id}]</b> ({e.linkedAtom?.subject || 'Liên môn'}):{' '}
                          {e.linkedAtom?.title || e.remediation_hint}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ---------- CỘT PHẢI: XƯỞNG CHẾ BIẾN & ĐỨNG LỚP CHO GIÁO VIÊN ---------- */}
            <section
              className="card stack"
              style={{ gap: '14px', padding: '20px 22px' }}
              aria-label="Xưởng chế biến cho giáo viên"
            >
              <div>
                <span className="va-badge va-badge-gold">
                  XƯỞNG CHẾ BIẾN & TỔ HỢP CHO GIÁO VIÊN
                </span>
                <h2 style={{ fontSize: '18px', fontWeight: 800, marginTop: '6px' }}>
                  Chế biến Nguyên liệu bên trái thành Hồ sơ Đi dạy
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                  Chọn 1 trong 4 công cụ tổ hợp dưới đây để đóng gói bài dạy, trộn đề kiểm tra nhiều bài hoặc chiếu lên TV lớp học.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                }}
              >
                {/* CÔNG CỤ 1 */}
                <button
                  type="button"
                  onClick={() => void handleGenerateCompletePack()}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderTop: '4px solid var(--cta)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--gold-text)' }}>
                      01 · HỒ SƠ TIẾT DẠY (4 TRONG 1)
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--navy)', marginTop: '3px' }}>
                      Đóng gói Giáo án 5512 & Phiếu A4 Phân hóa
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Chuyển 7 trường Gói Factory thành Giáo án 4 hoạt động + Phiếu bài tập 3 mức cho Lớp {activeClassProfile?.className}.
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                    Chế biến ngay →
                  </div>
                </button>

                {/* CÔNG CỤ 2 */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExamAtomIds(sbAtoms.slice(0, 3).map((a) => a.id));
                    setExamMixerOpen(true);
                  }}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderTop: '4px solid var(--navy)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--gold-text)' }}>
                      02 · GỘP NHIỀU BÀI TRONG CHƯƠNG
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--navy)', marginTop: '3px' }}>
                      Máy Trộn Đề Kiểm Tra & Ma Trận Thông Tư 22
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Tích chọn nhiều bài học cùng lúc để rút câu hỏi thật từ Supabase thành Đề thi + Bảng đặc tả.
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                    Mở Máy Trộn Đề →
                  </div>
                </button>

                {/* CÔNG CỤ 3 */}
                <button
                  type="button"
                  onClick={() => {
                    const steamTool =
                      getToolById('khbd-steam-5e') || getToolById('khbd-5512');
                    if (steamTool) setActiveTool(steamTool);
                  }}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderTop: '4px solid var(--green)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--green)' }}>
                      03 · INTEGRATED LEARNING ({atomEdges.length} CẠNH)
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--navy)', marginTop: '3px' }}>
                      Ghép Bài Dạy Tích Hợp Liên Môn (STEAM 5E)
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Kết nối bài học này với các môn liên quan trên Knowledge Graph thành dự án thực tế.
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                    Soạn Bài Liên Môn →
                  </div>
                </button>

                {/* CÔNG CỤ 4 */}
                <button
                  type="button"
                  onClick={() => {
                    setLiveBoardOpen(true);
                    if (!activeSimHtml && simsToDisplay[0]) {
                      handleLoadSimulation(simsToDisplay[0].id);
                    }
                  }}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderTop: '4px solid var(--navy)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--gold-text)' }}>
                      04 · DẠY TRỰC TIẾP TRÊN LỚP
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--navy)', marginTop: '3px' }}>
                      Bảng Tương tác TV (Quiz, Socratic & HTML5)
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.45 }}>
                      Chiếu {atomQuestions.length} câu hỏi, mở từng bậc gợi ý Socratic 1→4 và chạy mô phỏng HTML5.
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                    Chiếu Lên Bảng →
                  </div>
                </button>
              </div>

              {/* LỐI TẮT GỌN NHẸ TỚI CÁC CÔNG CỤ LẺ & CHỦ NHIỆM */}
              <div
                style={{
                  paddingTop: '12px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div className="row-wrap" style={{ gap: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)' }}>
                    Soạn lẻ nhanh:
                  </span>
                  {QUICK_TEACHER_COMBOS.map((item) => (
                    <button
                      key={item.toolId}
                      type="button"
                      className="va-tab"
                      style={{ fontSize: '12.5px', padding: '5px 10px' }}
                      onClick={() => {
                        const found = getToolById(item.toolId);
                        if (found) setActiveTool(found);
                      }}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="va-tab active"
                  style={{ fontSize: '12.5px', padding: '6px 12px' }}
                  onClick={() => setWorkspaceView('catalog')}
                >
                  Mở Kho 82 Công cụ & Chủ nhiệm →
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ==================== CHẾ ĐỘ 2: KHO 82 CÔNG CỤ SƯ PHẠM CHUYÊN SÂU (GIỮ NGUYÊN 100% TÍNH NĂNG) ==================== */}
        {workspaceView === 'catalog' && (
          <section className="card stack" style={{ gap: '16px', padding: '20px 22px' }}>
            <div className="row-between">
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
                  Kho Công cụ Chuyên môn ({filteredTools.length} công cụ)
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '2px' }}>
                  Toàn bộ 82 công cụ hỗ trợ giảng dạy, kiểm tra đánh giá, nhận xét học bạ và công tác chủ nhiệm.
                </p>
              </div>

              <div className="row-wrap">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm công cụ: giáo án, ma trận, nhận xét..."
                  style={{
                    width: '260px',
                    height: '38px',
                    fontSize: '14px',
                  }}
                />
                <button
                  type="button"
                  className={`va-tab ${featuredOnly ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory('all');
                    setFeaturedOnly(true);
                  }}
                >
                  16 Trọng tâm
                </button>
                <button
                  type="button"
                  className={`va-tab ${!featuredOnly ? 'active' : ''}`}
                  onClick={() => setFeaturedOnly(false)}
                >
                  Tất cả 82 công cụ
                </button>
              </div>
            </div>

            <div
              className="va-tabs-bar"
              role="tablist"
              aria-label="Nhóm công cụ sư phạm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                className={`va-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                <span>Tất cả nhóm</span>
              </button>
              {TOOL_CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.code;
                return (
                  <button
                    key={cat.code}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`va-tab ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setFeaturedOnly(false);
                      setSelectedCategory(cat.code);
                    }}
                  >
                    <span>{cat.shortName}</span>
                    <span className="va-tab-count">{cat.toolCount}</span>
                  </button>
                );
              })}
            </div>

            <div className="va-tools-grid">
              {filteredTools.map((tool) => {
                const catMeta = getCategoryMeta(tool.category);
                return (
                  <article
                    key={tool.id}
                    className="va-tool-card"
                    onClick={() => setActiveTool(tool)}
                    style={{ padding: '18px 20px', minHeight: 'auto' }}
                  >
                    <div className="stack" style={{ gap: '8px' }}>
                      <div className="row-between">
                        <span className="va-badge va-badge-gold">
                          {catMeta.shortName}
                        </span>
                        <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 600 }}>
                          {tool.moetStandardRef.split('&')[0]}
                        </span>
                      </div>

                      <h3 className="va-tool-card-title" style={{ fontSize: '16px' }}>
                        {tool.name}
                      </h3>

                      <p
                        className="va-tool-card-desc"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {tool.shortDescription}
                      </p>
                    </div>

                    <div
                      className="row-between"
                      style={{
                        paddingTop: '10px',
                        marginTop: '10px',
                        borderTop: '1px solid var(--line)',
                        fontSize: '13.5px',
                      }}
                    >
                      <span style={{ color: 'var(--muted)' }}>
                        Tiết kiệm ~{tool.estimatedMinutesSaved} phút
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--navy)' }}>
                        Mở công cụ →
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ==================== MODAL BẢNG TƯƠNG TÁC LỚP HỌC (LIVE CLASSROOM BOARD) ==================== */}
      {liveBoardOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setLiveBoardOpen(false)}
        >
          <div
            className="studio-modal"
            style={{ maxWidth: '1180px', height: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="studio-header">
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--cta)',
                    textTransform: 'uppercase',
                  }}
                >
                  CHẾ ĐỘ TRÌNH CHIẾU TRÊN BẢNG TƯƠNG TÁC LỚP HỌC · LỚP{' '}
                  {activeClassProfile?.className}
                </div>
                <h2
                  style={{
                    color: '#ffffff',
                    fontSize: '21px',
                    fontWeight: 800,
                    marginTop: '2px',
                  }}
                >
                  {selectedSbAtom
                    ? `[${selectedSbAtom.code}] ${selectedSbAtom.title}`
                    : 'Bài học tương tác'}
                </h2>
              </div>

              <div className="row-wrap">
                <button
                  type="button"
                  className={`btn ${liveTab === 'quiz' ? 'btn-cta' : ''}`}
                  onClick={() => setLiveTab('quiz')}
                >
                  1. Thử thách Câu hỏi ({atomQuestions.length})
                </button>
                <button
                  type="button"
                  className={`btn ${liveTab === 'socratic' ? 'btn-cta' : ''}`}
                  onClick={() => setLiveTab('socratic')}
                >
                  2. Gợi mở Socratic 4 Bậc ({atomSocratic.length})
                </button>
                <button
                  type="button"
                  className={`btn ${liveTab === 'simulation' ? 'btn-cta' : ''}`}
                  onClick={() => setLiveTab('simulation')}
                >
                  3. Mô phỏng Tương tác HTML5
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    color: '#ffffff',
                  }}
                  onClick={() => setLiveBoardOpen(false)}
                >
                  Đóng [ESC]
                </button>
              </div>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '28px 36px',
                background: 'var(--cream)',
              }}
            >
              {liveTab === 'quiz' && (
                <div
                  className="card stack"
                  style={{
                    maxWidth: '900px',
                    margin: '0 auto',
                    padding: '32px',
                    gap: '20px',
                  }}
                >
                  {currentQuestion ? (
                    <>
                      <div className="row-between">
                        <span className="va-badge va-badge-navy" style={{ fontSize: '14px', padding: '6px 12px' }}>
                          Câu hỏi {activeQuestionIdx + 1} / {atomQuestions.length}
                        </span>
                        <span className="va-badge va-badge-gold" style={{ fontSize: '14px', padding: '6px 12px' }}>
                          Mức độ: {currentQuestion.do_kho} · Tư duy DOK {currentQuestion.dok}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '22px',
                          fontWeight: 800,
                          color: 'var(--navy)',
                          lineHeight: 1.5,
                          padding: '16px 20px',
                          background: 'var(--cream)',
                          borderRadius: '8px',
                          borderLeft: '5px solid var(--navy)',
                        }}
                      >
                        <MathText text={currentQuestion.noi_dung} />
                      </div>

                      {Array.isArray(currentQuestion.nhieu) &&
                        currentQuestion.nhieu.length > 0 && (
                          <div className="stack" style={{ gap: '10px' }}>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--muted)' }}>
                              Các phương án học sinh dễ nhầm lẫn trên lớp:
                            </div>
                            <div className="grid-2" style={{ gap: '12px' }}>
                              {currentQuestion.nhieu.map((n, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: '14px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--line)',
                                    background: '#ffffff',
                                    fontSize: '16px',
                                  }}
                                >
                                  <b>Phương án bẫy {i + 1}:</b> <MathText text={n.noiDung} />
                                  {revealedAnswer && (
                                    <div
                                      style={{
                                        marginTop: '6px',
                                        fontSize: '14px',
                                        color: 'var(--gold-text)',
                                      }}
                                    >
                                      Lý do sai: <MathText text={n.lyDo} />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {revealedAnswer && (
                        <div
                          style={{
                            padding: '20px 24px',
                            borderRadius: '8px',
                            background: '#eefbf3',
                            border: '2px solid var(--green)',
                            fontSize: '18px',
                            lineHeight: 1.6,
                          }}
                        >
                          <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '6px' }}>
                            Đáp án đúng: <MathText text={currentQuestion.dap_an} />
                          </div>
                          <div style={{ fontSize: '16px' }}>
                            <b>Hướng dẫn giải:</b> <MathText text={currentQuestion.loi_giai} />
                          </div>
                        </div>
                      )}

                      <div className="row-between" style={{ paddingTop: '12px' }}>
                        <div className="row-wrap">
                          <button
                            type="button"
                            className="btn"
                            disabled={activeQuestionIdx === 0}
                            onClick={() => {
                              setActiveQuestionIdx((i) => Math.max(0, i - 1));
                              setRevealedAnswer(false);
                            }}
                          >
                            ← Câu trước
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={
                              activeQuestionIdx >= atomQuestions.length - 1
                            }
                            onClick={() => {
                              setActiveQuestionIdx((i) =>
                                Math.min(atomQuestions.length - 1, i + 1),
                              );
                              setRevealedAnswer(false);
                            }}
                          >
                            Câu tiếp theo →
                          </button>
                        </div>

                        <button
                          type="button"
                          className="btn btn-cta"
                          style={{ minHeight: '44px', paddingInline: '24px', fontSize: '16px' }}
                          onClick={() => setRevealedAnswer((prev) => !prev)}
                        >
                          {revealedAnswer
                            ? 'Ẩn đáp án'
                            : 'Mở Đáp án & Phân tích lỗi sai'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      Chưa có câu hỏi cho bài học này.
                    </div>
                  )}
                </div>
              )}

              {liveTab === 'socratic' && (
                <div
                  className="card stack"
                  style={{
                    maxWidth: '900px',
                    margin: '0 auto',
                    padding: '32px',
                    gap: '20px',
                  }}
                >
                  {atomSocratic[0] ? (
                    <>
                      <div>
                        <span className="va-badge va-badge-gold" style={{ fontSize: '14px' }}>
                          Kịch bản dẫn dắt khi học sinh trả lời sai trên lớp
                        </span>
                        <h3 style={{ fontSize: '21px', fontWeight: 800, marginTop: '8px' }}>
                          Khi học sinh trả lời sai: &ldquo;{atomSocratic[0].wrong_answer}&rdquo;
                        </h3>
                        <p style={{ fontSize: '15.5px', color: 'var(--muted)', marginTop: '4px' }}>
                          Nguyên nhân gốc rễ: {atomSocratic[0].misconception}
                        </p>
                      </div>

                      <div className="stack" style={{ gap: '12px' }}>
                        {[
                          { step: 1, title: 'Bậc 1 · Câu hỏi Khơi gợi', text: atomSocratic[0].bac_1 },
                          { step: 2, title: 'Bậc 2 · Câu hỏi Định hướng', text: atomSocratic[0].bac_2 },
                          { step: 3, title: 'Bậc 3 · Câu hỏi Phản biện', text: atomSocratic[0].bac_3 },
                          { step: 4, title: 'Bậc 4 · Chốt Kiến thức Đúng', text: atomSocratic[0].bac_4 },
                        ].map((item) => {
                          const visible = item.step <= socraticStep;
                          return (
                            <div
                              key={item.step}
                              style={{
                                padding: '16px 20px',
                                borderRadius: '8px',
                                border: visible
                                  ? '2px solid var(--navy)'
                                  : '1px dashed var(--line)',
                                background: visible ? '#ffffff' : 'var(--cream)',
                                opacity: visible ? 1 : 0.5,
                              }}
                            >
                              <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '15px' }}>
                                {item.title}
                              </div>
                              <div style={{ fontSize: '18px', marginTop: '6px', fontWeight: 600 }}>
                                {visible
                                  ? item.text
                                  : 'Bấm nút "Mở gợi ý tiếp theo" bên dưới để hiển thị cho học sinh...'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="row-between">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setSocraticStep(1)}
                        >
                          Đặt lại từ Bậc 1
                        </button>
                        <button
                          type="button"
                          className="btn btn-cta"
                          disabled={socraticStep >= 4}
                          onClick={() =>
                            setSocraticStep((s) => Math.min(4, s + 1))
                          }
                        >
                          Mở gợi ý Socratic bậc tiếp theo ({socraticStep}/4) →
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      Chưa có kịch bản Socratic cho bài học này.
                    </div>
                  )}
                </div>
              )}

              {liveTab === 'simulation' && (
                <div className="stack" style={{ gap: '14px', height: '100%' }}>
                  <div className="row-between">
                    <div className="row-wrap">
                      <span style={{ fontWeight: 800, fontSize: '15px' }}>
                        Chọn mô phỏng tương tác HTML5:
                      </span>
                      {simsToDisplay.map((sim) => (
                        <button
                          key={sim.id}
                          type="button"
                          className={`va-tab ${activeSimHtml?.id === sim.id ? 'active' : ''}`}
                          onClick={() => handleLoadSimulation(sim.id)}
                        >
                          {sim.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeSimHtml ? (
                    <iframe
                      title={activeSimHtml.name}
                      srcDoc={activeSimHtml.content}
                      style={{
                        width: '100%',
                        height: '62vh',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        background: '#ffffff',
                      }}
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                      Đang tải mô phỏng tương tác HTML5...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 1-CHẠM SOẠN TRỌN BỘ TIẾT DẠY (4 TRONG 1) ==================== */}
      {packModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setPackModalOpen(false)}
        >
          <div
            className="studio-modal"
            style={{ maxWidth: '1120px', height: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="studio-header">
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--cta)',
                    textTransform: 'uppercase',
                  }}
                >
                  TRỌN BỘ HỒ SƠ TIẾT DẠY ĐỒNG BỘ (4 TRONG 1) · TIẾT KIỆM ~95 PHÚT CHUẨN BỊ
                </div>
                <h2
                  style={{
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginTop: '2px',
                  }}
                >
                  {selectedSbAtom
                    ? `[${selectedSbAtom.code}] ${selectedSbAtom.title} — Lớp ${activeClassProfile?.className}`
                    : 'Trọn bộ hồ sơ bài dạy'}
                </h2>
              </div>

              <div className="row-wrap">
                {lessonPack && (
                  <>
                    <button
                      type="button"
                      className="btn btn-cta"
                      onClick={handleDownloadPackWord}
                    >
                      Tải Trọn Bộ 4 Hồ sơ (.docx có ngắt trang)
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => window.print()}
                    >
                      In / Xuất PDF A4
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    color: '#ffffff',
                  }}
                  onClick={() => setPackModalOpen(false)}
                >
                  Đóng [ESC]
                </button>
              </div>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 32px',
                background: 'var(--cream)',
              }}
            >
              {packLoading ? (
                <div
                  className="doc-paper"
                  style={{
                    padding: '44px',
                    textAlign: 'center',
                    display: 'grid',
                    gap: '14px',
                  }}
                >
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)' }}>
                    Hệ thống đang đồng bộ Trọn Bộ 4 Hồ Sơ cho tiết dạy...
                  </h3>
                  <div style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.8 }}>
                    1. Đang soạn Kế hoạch bài dạy chuẩn Công văn 5512 (4 hoạt động)
                    <br />
                    2. Đang thiết kế Phiếu học tập in A4 chia 3 mức cho Lớp {activeClassProfile?.className}
                    <br />
                    3. Đang trích xuất {atomQuestions.length} câu hỏi kiểm tra cuối tiết từ ngân hàng Supabase
                    <br />
                    4. Đang đóng gói {atomSocratic.length} kịch bản hỏi đáp Socratic 4 bậc & cầu nối liên môn
                  </div>
                </div>
              ) : lessonPack ? (
                <div className="stack" style={{ maxWidth: '880px', margin: '0 auto', gap: '16px' }}>
                  <div
                    className="row-between no-print"
                    style={{
                      background: '#ffffff',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div className="row-wrap">
                      {lessonPack.sections.map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          className={`va-tab ${activePackTab === sec.id ? 'active' : ''}`}
                          onClick={() => setActivePackTab(sec.id)}
                        >
                          {sec.tabTitle}
                        </button>
                      ))}
                    </div>
                    {packNotice && (
                      <span className="va-badge va-badge-green">{packNotice}</span>
                    )}
                  </div>

                  {lessonPack.sections
                    .filter((s) => s.id === activePackTab)
                    .map((sec) => (
                      <div key={sec.id} className="doc-paper">
                        <div className="doc-header">
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '15px' }}>
                              TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH
                            </div>
                            <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '3px' }}>
                              Môn: <b>{lessonPack.subject}</b> · Lớp: <b>{lessonPack.className}</b> · Giáo viên: <b>{lessonPack.teacherName}</b>
                            </div>
                          </div>
                          <span className="va-badge va-badge-navy">
                            {lessonPack.modelUsed}
                          </span>
                        </div>

                        <h2 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '14px', color: 'var(--navy)' }}>
                          {sec.docHeading}
                        </h2>

                        <div className="whitespace-pre" style={{ fontSize: '15.5px', lineHeight: 1.7 }}>
                          <MathText text={sec.content} />
                        </div>
                      </div>
                    ))}
                </div>
              ) : packNotice ? (
                <div
                  role="alert"
                  style={{ textAlign: 'center', padding: '24px', color: '#b42318' }}
                >
                  {packNotice}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL XEM & TẢI HỌC LIỆU GỐC TỪ FACTORY.VIETANH.ORG ==================== */}
      {activeFactoryAsset && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveFactoryAsset(null)}
        >
          <div
            className="studio-modal"
            style={{ maxWidth: '960px', height: '84vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="studio-header">
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--cta)',
                    textTransform: 'uppercase',
                  }}
                >
                  HỌC LIỆU GỐC ĐÃ SINH SẴN TRÊN FACTORY.VIETANH.ORG · MÃ{' '}
                  {activeFactoryAsset.id} ({activeFactoryAsset.packageId})
                </div>
                <h2
                  style={{
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginTop: '2px',
                  }}
                >
                  {activeFactoryAsset.formatLabel} —{' '}
                  {selectedSbAtom
                    ? `[${selectedSbAtom.code}] ${selectedSbAtom.title}`
                    : activeFactoryAsset.packageId}
                </h2>
              </div>

              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-cta"
                  onClick={() =>
                    handleDownloadFactoryAssetWord(activeFactoryAsset)
                  }
                >
                  Tải về Word (.docx)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                >
                  In A4 / PDF
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    color: '#ffffff',
                  }}
                  onClick={() => setActiveFactoryAsset(null)}
                >
                  Đóng [ESC]
                </button>
              </div>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 32px',
                background: 'var(--cream)',
              }}
            >
              <div
                className="doc-paper"
                style={{ maxWidth: '840px', margin: '0 auto' }}
              >
                <div className="doc-header">
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        color: 'var(--navy)',
                        fontSize: '15px',
                      }}
                    >
                      TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH · KHO HỌC LIỆU GỐC FACTORY
                    </div>
                    <div
                      style={{
                        fontSize: '13.5px',
                        color: 'var(--muted)',
                        marginTop: '3px',
                      }}
                    >
                      Định dạng: <b>{activeFactoryAsset.formatLabel}</b> · Mã gói:{' '}
                      <b>{activeFactoryAsset.packageId}</b> · Tác giả:{' '}
                      <b>{activeFactoryAsset.createdBy}</b>
                    </div>
                  </div>
                  <span className="va-badge va-badge-green">
                    Dùng ngay 0 giây
                  </span>
                </div>

                <div className="stack" style={{ gap: '18px' }}>
                  {activeFactoryAsset.sections.map((sec, idx) => (
                    <section key={idx} className="doc-section">
                      <h3>{sec.heading}</h3>
                      <div
                        className="whitespace-pre"
                        style={{ fontSize: '15.5px', lineHeight: 1.7 }}
                      >
                        <MathText text={sec.body} />
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL MÁY TRỘN ĐỀ KIỂM TRA NHIỀU BÀI (THÔNG TƯ 22) ==================== */}
      {examMixerOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setExamMixerOpen(false)}
        >
          <div
            className="studio-modal"
            style={{ maxWidth: '860px', height: '78vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="studio-header">
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--cta)',
                    textTransform: 'uppercase',
                  }}
                >
                  CÔNG CỤ TỔ HỢP TỪ SUPABASE · VIỆC FACTORY CHƯA LÀM SẴN
                </div>
                <h2
                  style={{
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginTop: '2px',
                  }}
                >
                  Máy Trộn Đề Kiểm Tra Nhiều Bài & Ma Trận Đặc Tả Thông Tư 22
                </h2>
              </div>
              <button
                type="button"
                className="btn"
                style={{
                  background: 'rgba(255,255,255,0.14)',
                  color: '#ffffff',
                }}
                onClick={() => setExamMixerOpen(false)}
              >
                Đóng
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 30px',
                background: 'var(--cream)',
              }}
            >
              <div className="card stack" style={{ padding: '20px 24px', gap: '14px' }}>
                <div className="row-between">
                  <div>
                    <h3 style={{ fontSize: '16.5px', fontWeight: 800 }}>
                      Tích chọn các bài học cần gộp vào Đề kiểm tra ({selectedExamAtomIds.length} bài đã chọn)
                    </h3>
                    <p style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '2px' }}>
                      Hệ thống sẽ tự động rút câu hỏi thật từ bảng <b>questions</b> và mục tiêu L1-L3 từ bảng <b>packages</b> của tất cả các bài được chọn để lập Ma trận Thông tư 22 + Đề kiểm tra + Đáp án chấm.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-cta"
                    disabled={selectedExamAtomIds.length === 0}
                    onClick={() => void handleGenerateMultiExamPack()}
                  >
                    Trộn Đề & Xuất Ma Trận ({selectedExamAtomIds.length} bài) →
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '8px',
                    maxHeight: '46vh',
                    overflowY: 'auto',
                    paddingRight: '4px',
                  }}
                >
                  {sbAtoms.slice(0, 25).map((a) => {
                    const checked = selectedExamAtomIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: checked
                            ? '2px solid var(--navy)'
                            : '1px solid var(--line)',
                          background: checked ? '#ffffff' : 'var(--cream)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExamAtomIds((prev) => [...prev, a.id]);
                              } else {
                                setSelectedExamAtomIds((prev) =>
                                  prev.filter((id) => id !== a.id),
                                );
                              }
                            }}
                            style={{ width: '18px', height: '18px' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--navy)' }}>
                              [{a.code}] {a.title}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                              {a.subject} Khối {a.grade} · {a.chapter}
                            </div>
                          </div>
                        </div>
                        {a.hasFactoryPackage && (
                          <span className="va-badge va-badge-green">
                            Có Gói Factory
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToolStudioModal
        tool={activeTool}
        initialGrade={grade}
        initialSubject={subjectCode}
        initialClassProfile={activeClassProfile}
        initialNode={activeNode}
        teacherName={selectedTeacherName}
        teacherEmail="giaovien@truongvietanh.com"
        onClose={() => setActiveTool(null)}
      />

      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        primaryNode={activeNode}
      />
    </Shell>
  );
}
