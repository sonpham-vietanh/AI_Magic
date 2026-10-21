'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  CompleteLessonPack,
  LessonPackSection,
  PackStreamEvent,
} from '@/app/api/generate-pack/route';
import '@/app/ui-cc.css';
import { ALL_TOOLS, getToolById } from '@/lib/catalog';
import { CLASS_PROFILES, getClassById } from '@/lib/classes';
import type {
  SupabaseAtom,
  SupabaseEdge,
  SupabaseFactoryAsset,
  SupabaseFactoryPackage,
  SupabaseQuestion,
  SupabaseSocratic,
  SupabaseTainguyenMeta,
} from '@/lib/supabase';
import type { GradeLevel, KnowledgeNode, PedagogicalTool } from '@/lib/types';
import { buildFactoryAssetDocx, buildLessonPackDocx, downloadBlob } from '@/lib/export/docx';
import { Icon } from '@/components/ui/icons';
import { AssistantDrawer } from './AssistantDrawer';
import { Shell } from './Shell';
import { ToolStudioModal } from './ToolStudioModal';
import { AssetModal } from './cong-cu/AssetModal';
import { ClassroomTools } from './cong-cu/ClassroomTools';
import { ExamMixer } from './cong-cu/ExamMixer';
import { LessonWorkbench } from './cong-cu/LessonWorkbench';
import { LiveBoard } from './cong-cu/LiveBoard';
import { initialPackSteps, PackModal } from './cong-cu/PackModal';
import {
  GRADES,
  mapSupabaseSubjectToCode,
  readApiJson,
  readClassByGrade,
  rememberClassForGrade,
  SUPABASE_SUBJECTS,
} from './cong-cu/shared';
import { ToolCatalog } from './cong-cu/ToolCatalog';

type MainTab = 'bench' | 'catalog' | 'class';

export function DashboardClient({
  initialToolId,
  initialNodeId,
  initialClassId,
}: {
  initialToolId?: string;
  initialNodeId?: string;
  initialClassId?: string;
}) {
  const [mainTab, setMainTab] = useState<MainTab>(
    initialToolId && !initialNodeId ? 'catalog' : 'bench',
  );
  const [activeTool, setActiveTool] = useState<PedagogicalTool | null>(null);
  const [assistantOpen, setAssistantOpen] = useState<boolean>(false);

  // Ngữ cảnh bài dạy thực tế
  const [sbSubject, setSbSubject] = useState<string>('Toán');
  const [grade, setGrade] = useState<GradeLevel>('7');
  const [onlyFactoryReady, setOnlyFactoryReady] = useState<boolean>(false);
  const [lessonQuery, setLessonQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [atomId, setAtomId] = useState<string>(initialNodeId || 'KC-5735310');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    (initialClassId && getClassById(initialClassId)?.id) || CLASS_PROFILES[0]?.id || '',
  );
  const [selectedTeacherName, setSelectedTeacherName] = useState<string>('Anh Hùng');

  const [sbAtoms, setSbAtoms] = useState<SupabaseAtom[]>([]);
  const [atomsLoading, setAtomsLoading] = useState<boolean>(true);
  const atomCache = useRef<Map<string, SupabaseAtom>>(new Map());
  const [atomPackages, setAtomPackages] = useState<SupabaseFactoryPackage[]>([]);
  const [atomFactoryAssets, setAtomFactoryAssets] = useState<SupabaseFactoryAsset[]>([]);
  const [activeFactoryAsset, setActiveFactoryAsset] = useState<SupabaseFactoryAsset | null>(null);
  const [atomEdges, setAtomEdges] = useState<SupabaseEdge[]>([]);
  const [atomQuestions, setAtomQuestions] = useState<SupabaseQuestion[]>([]);
  const [atomSocratic, setAtomSocratic] = useState<SupabaseSocratic[]>([]);
  const [atomTainguyen, setAtomTainguyen] = useState<SupabaseTainguyenMeta[]>([]);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [fallbackSims, setFallbackSims] = useState<SupabaseTainguyenMeta[]>([]);

  // Máy trộn đề nhiều bài và bảng tương tác lớp học
  const [examMixerOpen, setExamMixerOpen] = useState<boolean>(false);
  const [selectedExamAtomIds, setSelectedExamAtomIds] = useState<string[]>([]);
  const [liveBoardOpen, setLiveBoardOpen] = useState<boolean>(false);

  // Chế biến trọn bộ hồ sơ tiết dạy (4 trong 1)
  const [packModalOpen, setPackModalOpen] = useState<boolean>(false);
  const [packMode, setPackMode] = useState<'lesson' | 'exam'>('lesson');
  const [packLoading, setPackLoading] = useState<boolean>(false);
  const [lessonPack, setLessonPack] = useState<CompleteLessonPack | null>(null);
  const [activePackTab, setActivePackTab] = useState<LessonPackSection['id']>('giao_an');
  const [packNotice, setPackNotice] = useState<string>('');
  const [packSteps, setPackSteps] = useState(initialPackSteps);
  const [packElapsed, setPackElapsed] = useState<number>(0);
  const [packPreview, setPackPreview] = useState<string>('');
  const packAbortRef = useRef<AbortController | null>(null);
  const skipClassAutoRef = useRef<boolean>(Boolean(initialClassId && getClassById(initialClassId)));
  const [dataError, setDataError] = useState<string>('');

  // Mô phỏng gợi ý dự phòng khi bài chưa có mô phỏng riêng.
  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const [ov, tn] = await Promise.all([
          fetch('/api/supabase/knowledge?mode=overview', { signal: ctrl.signal }).then((r) =>
            readApiJson<{
              ok?: boolean;
              overview?: { users: { name?: string }[] };
            }>(r),
          ),
          fetch('/api/supabase/knowledge?mode=tainguyen&limit=6', { signal: ctrl.signal }).then((r) =>
            readApiJson<{ ok?: boolean; items?: SupabaseTainguyenMeta[] }>(r),
          ),
        ]);
        if (ov.ok && ov.overview?.users?.[0]?.name) {
          setSelectedTeacherName(ov.overview.users[0].name as string);
        }
        if (tn.ok && tn.items) setFallbackSims(tn.items);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setDataError(err instanceof Error ? err.message : 'Không tải được dữ liệu tổng quan.');
      }
    };
    void load();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(lessonQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [lessonQuery]);

  // Danh sách bài theo môn, khối, ô tìm kiếm.
  useEffect(() => {
    const ctrl = new AbortController();
    setAtomsLoading(true);
    const params = new URLSearchParams({
      limit: '100',
      subject: sbSubject,
      grade,
    });
    if (onlyFactoryReady) params.set('onlyFactoryReady', 'true');
    if (debouncedQuery) params.set('q', debouncedQuery);
    fetch(`/api/supabase/knowledge?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => readApiJson<{ ok?: boolean; atoms?: SupabaseAtom[] }>(r))
      .then((data) => {
        const list = data.atoms || [];
        list.forEach((a) => atomCache.current.set(a.id, a));
        setDataError('');
        setSbAtoms(list);
        if (!debouncedQuery) {
          setAtomId((cur) =>
            list.length > 0 && !list.some((a) => a.id === cur) ? list[0].id : cur,
          );
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setSbAtoms([]);
        setDataError(err instanceof Error ? err.message : 'Không tải được danh sách bài học.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setAtomsLoading(false);
      });
    return () => ctrl.abort();
  }, [sbSubject, grade, onlyFactoryReady, debouncedQuery]);

  // Chi tiết của bài đang chọn.
  useEffect(() => {
    if (!atomId) return;
    const ctrl = new AbortController();
    setDetailLoading(true);
    fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(atomId)}`, { signal: ctrl.signal })
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
          setAtomPackages(data.packages || []);
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
        setDataError(err instanceof Error ? err.message : 'Không tải được chi tiết bài học.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setDetailLoading(false);
      });
    return () => ctrl.abort();
  }, [atomId]);

  useEffect(() => {
    if (initialNodeId) setAtomId(initialNodeId);
    if (initialToolId) {
      const foundTool = ALL_TOOLS.find((t) => t.id === initialToolId || t.slug === initialToolId);
      if (foundTool) setActiveTool(foundTool);
    }
  }, [initialToolId, initialNodeId]);

  const selectedSbAtom = sbAtoms.find((a) => a.id === atomId) ?? atomCache.current.get(atomId);
  const subjectCode = mapSupabaseSubjectToCode(sbSubject);
  const activeClassProfile = getClassById(selectedClassId);
  const atomGrade = selectedSbAtom ? String(selectedSbAtom.grade) : grade;
  const classGradeMismatch = !!activeClassProfile && activeClassProfile.grade !== atomGrade;
  const lessonTitle = selectedSbAtom ? selectedSbAtom.title : '';

  // Lớp áp dụng đi theo khối của bài/bộ lọc; nhớ lựa chọn thủ công theo từng khối.
  useEffect(() => {
    if (skipClassAutoRef.current) {
      skipClassAutoRef.current = false;
      return;
    }
    setSelectedClassId((cur) => {
      const curProfile = getClassById(cur);
      if (curProfile && curProfile.grade === atomGrade) return cur;
      const remembered = getClassById(readClassByGrade()[atomGrade]);
      if (remembered && remembered.grade === atomGrade) return remembered.id;
      const first = CLASS_PROFILES.find((c) => c.grade === atomGrade);
      return first ? first.id : cur;
    });
  }, [atomGrade]);

  // Đồng hồ đếm giây khi đang soạn.
  useEffect(() => {
    if (!packLoading) return;
    const t0 = Date.now();
    setPackElapsed(0);
    const timer = window.setInterval(
      () => setPackElapsed(Math.floor((Date.now() - t0) / 1000)),
      500,
    );
    return () => window.clearInterval(timer);
  }, [packLoading]);

  const cancelPackGeneration = () => {
    packAbortRef.current?.abort();
    packAbortRef.current = null;
  };

  const activeNode: KnowledgeNode | undefined = selectedSbAtom
    ? {
        id: selectedSbAtom.id,
        grade: String(selectedSbAtom.grade) as GradeLevel,
        subject: subjectCode,
        subjectName: selectedSbAtom.subject,
        semester: 1,
        weekRange: [1, 2],
        title: `[${selectedSbAtom.code}] ${selectedSbAtom.title}`,
        moetRequiredOutcomes: selectedSbAtom.yeu_cau ? [selectedSbAtom.yeu_cau] : [selectedSbAtom.title],
        coreCompetencies: selectedSbAtom.nang_luc
          ? [selectedSbAtom.nang_luc]
          : ['Năng lực tự chủ và tự học'],
        coreQualities: ['Chăm chỉ', 'Trách nhiệm'],
        vietAnhPracticalHook:
          selectedSbAtom.quan_niem_sai || `${selectedSbAtom.chapter} · ${selectedSbAtom.lesson}`,
        keywords: [selectedSbAtom.code, selectedSbAtom.chapter],
      }
    : undefined;

  const simsToDisplay = atomTainguyen.length > 0 ? atomTainguyen : fallbackSims.slice(0, 4);

  const handleGenerateCompletePack = async () => {
    packAbortRef.current?.abort();
    const ctrl = new AbortController();
    packAbortRef.current = ctrl;
    setPackMode('lesson');
    setPackModalOpen(true);
    setPackLoading(true);
    setPackNotice('');
    setPackPreview('');
    setPackSteps(initialPackSteps());
    setLessonPack(null);
    try {
      const res = await fetch('/api/generate-pack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          mode: 'lesson_pack',
          atomId,
          subject: sbSubject,
          grade,
          classId: selectedClassId,
          teacherName: selectedTeacherName,
          stream: true,
        }),
      });
      const isStream = (res.headers.get('content-type') || '').includes('text/event-stream');
      if (!isStream || !res.body) {
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
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      const handleEvent = (ev: PackStreamEvent) => {
        if (ev.type === 'stage') {
          setPackSteps((cur) => ({
            ...cur,
            [ev.id]: ev.status === 'start' ? 'running' : 'done',
          }));
        } else if (ev.type === 'delta') {
          setPackPreview((cur) => (cur + ev.text).slice(-6000));
        } else if (ev.type === 'done') {
          finished = true;
          setLessonPack(ev.pack);
          setActivePackTab('giao_an');
        } else if (ev.type === 'error') {
          finished = true;
          setPackNotice(ev.error || 'Không thể tạo bộ hồ sơ. Vui lòng thử lại.');
        }
      };
      const handleChunk = (block: string) => {
        for (const line of block.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          try {
            handleEvent(JSON.parse(line.slice(5).trim()) as PackStreamEvent);
          } catch {
            // bỏ qua dòng lỗi
          }
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        blocks.forEach(handleChunk);
      }
      if (buffer.trim()) handleChunk(buffer);
      if (!finished) {
        setPackNotice('Kết nối bị gián đoạn trước khi hoàn tất. Vui lòng thử lại.');
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        setPackNotice('Đã hủy tạo hồ sơ.');
      } else {
        setPackNotice(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.');
      }
    } finally {
      if (packAbortRef.current === ctrl) packAbortRef.current = null;
      setPackLoading(false);
    }
  };

  const handleGenerateMultiExamPack = async () => {
    const idsToMix = selectedExamAtomIds.length > 0 ? selectedExamAtomIds : [atomId];
    packAbortRef.current?.abort();
    const ctrl = new AbortController();
    packAbortRef.current = ctrl;
    setExamMixerOpen(false);
    setPackMode('exam');
    setPackModalOpen(true);
    setPackLoading(true);
    setPackNotice('');
    setLessonPack(null);
    try {
      const res = await fetch('/api/generate-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
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
      if (ctrl.signal.aborted) {
        setPackNotice('Đã hủy tạo hồ sơ.');
      } else {
        setPackNotice(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.');
      }
    } finally {
      if (packAbortRef.current === ctrl) packAbortRef.current = null;
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

  const handleDownloadPackWord = async () => {
    if (!lessonPack) return;
    try {
      const blob = await buildLessonPackDocx(lessonPack);
      downloadBlob(blob, `Tron-bo-tiet-day-${lessonPack.atomCode}.docx`);
      setPackNotice('Đã tải file Word (.docx), đã ngắt trang sẵn để in phát cho học sinh.');
    } catch (err) {
      console.error('[docx] export failed', err);
      setPackNotice('Không thể tạo file Word (.docx). Vui lòng thử lại hoặc dùng nút In.');
    }
  };

  const openToolById = (id: string) => {
    const found = getToolById(id);
    if (found) setActiveTool(found);
    else if (id === 'khbd-steam-5e') {
      const fallback = getToolById('khbd-5512');
      if (fallback) setActiveTool(fallback);
    }
  };

  const openMixer = () => {
    setSelectedExamAtomIds(atomId ? [atomId] : []);
    setExamMixerOpen(true);
  };

  const classOptions = GRADES.map((g) => ({
    grade: g,
    classes: CLASS_PROFILES.filter((c) => c.grade === g),
  })).filter((g) => g.classes.length > 0);
  const otherClasses = CLASS_PROFILES.filter((c) => !GRADES.includes(c.grade));

  const tabs: { id: MainTab; label: string }[] = [
    { id: 'bench', label: 'Chế biến từ Kho' },
    { id: 'catalog', label: `Kho ${ALL_TOOLS.length} công cụ` },
    { id: 'class', label: 'Công cụ lớp học' },
  ];

  return (
    <Shell
      title="Kho công cụ"
      subtitle="Chế biến bài dạy, trộn đề và mở công cụ sư phạm theo từng việc."
      onOpenAssistant={() => setAssistantOpen(true)}
    >
      <div className="cc-page">
        {/* Bộ lọc dùng chung */}
        <section className="cc-context" aria-label="Môn, khối và lớp áp dụng">
          <div className="cc-ctx-field">
            <label className="ag-field-label" htmlFor="cc-subject">
              Môn
            </label>
            <select
              id="cc-subject"
              className="ag-field"
              value={sbSubject}
              onChange={(e) => {
                setSbSubject(e.target.value);
                setLessonQuery('');
              }}
            >
              {SUPABASE_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="cc-ctx-field">
            <label className="ag-field-label" htmlFor="cc-grade">
              Khối
            </label>
            <select
              id="cc-grade"
              className="ag-field"
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value as GradeLevel);
                setLessonQuery('');
              }}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Khối {g}
                </option>
              ))}
            </select>
          </div>
          <div className="cc-ctx-field">
            <label className="ag-field-label" htmlFor="cc-class">
              Lớp áp dụng
            </label>
            <select
              id="cc-class"
              className="ag-field"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                const picked = getClassById(e.target.value);
                if (picked) rememberClassForGrade(picked.grade, picked.id);
              }}
            >
              {classOptions.map((g) => (
                <optgroup key={g.grade} label={`Khối ${g.grade}`}>
                  {g.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.className} · {c.studentCount} HS
                    </option>
                  ))}
                </optgroup>
              ))}
              {otherClasses.length > 0 && (
                <optgroup label="Khối khác">
                  {otherClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.className} · {c.studentCount} HS
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </section>

        {classGradeMismatch && (
          <div className="ag-alert warn" role="status">
            <Icon name="alert" size={18} />
            <span>Lớp đang chọn khác khối với bài học (bài thuộc khối {atomGrade}).</span>
          </div>
        )}
        {dataError && (
          <div className="ag-alert bad" role="alert">
            <Icon name="alert" size={18} />
            <span>{dataError}</span>
          </div>
        )}

        <div className="ag-tabs cc-main-tabs" role="tablist" aria-label="Khu vực làm việc">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`cc-tab-${t.id}`}
              aria-selected={mainTab === t.id}
              aria-controls="cc-main-panel"
              className="ag-tab"
              onClick={() => setMainTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id="cc-main-panel" role="tabpanel" aria-labelledby={`cc-tab-${mainTab}`}>
          {mainTab === 'bench' && (
            <LessonWorkbench
              atoms={sbAtoms}
              atomsLoading={atomsLoading}
              atomId={atomId}
              selectedAtom={selectedSbAtom}
              onPick={setAtomId}
              query={lessonQuery}
              onQuery={setLessonQuery}
              onlyReady={onlyFactoryReady}
              onOnlyReady={setOnlyFactoryReady}
              detail={{
                packages: atomPackages,
                assets: atomFactoryAssets,
                questions: atomQuestions,
                edges: atomEdges,
                loading: detailLoading,
              }}
              className={activeClassProfile?.className ?? ''}
              onProcess={() => void handleGenerateCompletePack()}
              onOpenAsset={setActiveFactoryAsset}
              onOpenToolById={openToolById}
            />
          )}

          {mainTab === 'catalog' && <ToolCatalog onOpen={setActiveTool} />}

          {mainTab === 'class' && (
            <ClassroomTools
              lessonTitle={lessonTitle}
              className={activeClassProfile?.className ?? ''}
              questionsCount={atomQuestions.length}
              socraticCount={atomSocratic.length}
              onMixer={openMixer}
              onBoard={() => setLiveBoardOpen(true)}
              onPickLesson={() => setMainTab('bench')}
            />
          )}
        </div>
      </div>

      {liveBoardOpen && (
        <LiveBoard
          lessonTitle={lessonTitle}
          className={activeClassProfile?.className ?? ''}
          questions={atomQuestions}
          socratic={atomSocratic}
          sims={simsToDisplay}
          onClose={() => setLiveBoardOpen(false)}
        />
      )}

      {packModalOpen && (
        <PackModal
          mode={packMode}
          loading={packLoading}
          elapsed={packElapsed}
          steps={packSteps}
          preview={packPreview}
          pack={lessonPack}
          tab={activePackTab}
          onTab={setActivePackTab}
          notice={packNotice}
          lessonTitle={lessonTitle}
          className={activeClassProfile?.className ?? ''}
          questionsCount={atomQuestions.length}
          socraticCount={atomSocratic.length}
          onDownload={() => void handleDownloadPackWord()}
          onCancel={cancelPackGeneration}
          onClose={() => setPackModalOpen(false)}
        />
      )}

      {activeFactoryAsset && (
        <AssetModal
          asset={activeFactoryAsset}
          lessonTitle={lessonTitle}
          onDownload={() => void handleDownloadFactoryAssetWord(activeFactoryAsset)}
          onClose={() => setActiveFactoryAsset(null)}
        />
      )}

      {examMixerOpen && (
        <ExamMixer
          atoms={sbAtoms}
          selected={selectedExamAtomIds}
          onSelected={setSelectedExamAtomIds}
          onRun={() => void handleGenerateMultiExamPack()}
          onClose={() => setExamMixerOpen(false)}
        />
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
