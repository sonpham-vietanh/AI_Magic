import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassById } from '@/lib/classes';
import { callLiveLlm, withLlmDeltaSink } from '@/lib/engine/llmClient';
import { cleanPedagogicalText as basePedagogicalClean } from '@/lib/text/clean';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { cleanFactoryText, fetchSupabaseAtomDetail } from '@/lib/supabase';

function cleanPedagogicalText(raw: string): string {
  return basePedagogicalClean(cleanFactoryText(raw || ''));
}

const ATOM_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

const packBodySchema = z.object({
  mode: z.enum(['lesson_pack', 'multi_exam']).optional(),
  atomId: z.string().regex(ATOM_ID_RE).optional(),
  atomIds: z.array(z.string().regex(ATOM_ID_RE)).max(6).optional(),
  subject: z.string().max(100).optional(),
  grade: z
    .enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    .optional(),
  classId: z.string().max(100).optional(),
  teacherName: z.string().max(100).optional(),
  stream: z.boolean().optional(),
});

export type PackStreamEvent =
  | {
      type: 'stage';
      id: LessonPackSection['id'];
      status: 'start' | 'done';
    }
  | { type: 'delta'; text: string }
  | { type: 'done'; pack: CompleteLessonPack }
  | { type: 'error'; error: string };

type Emit = (event: PackStreamEvent) => void;

export interface LessonPackSection {
  id: 'giao_an' | 'phieu_hoc_tap' | 'kiem_tra_nhanh' | 'cam_nang_socratic';
  tabTitle: string;
  docHeading: string;
  content: string;
}

export interface CompleteLessonPack {
  atomCode: string;
  atomTitle: string;
  subject: string;
  grade: string;
  className: string;
  teacherName: string;
  modelUsed: string;
  estimatedMinutesSaved: number;
  sections: LessonPackSection[];
}

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'generate-pack', 10, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' },
      { status: 400 },
    );
  }
  const parsed = packBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Tham số không hợp lệ.' },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (body.mode === 'multi_exam' && !(body.atomIds && body.atomIds.length > 0)) {
    return NextResponse.json(
      { ok: false, error: 'Thiếu danh sách bài học (atomIds).' },
      { status: 400 },
    );
  }
  if (body.mode !== 'multi_exam' && !body.atomId) {
    return NextResponse.json(
      { ok: false, error: 'Thiếu mã bài học (atomId).' },
      { status: 400 },
    );
  }

  const wantsStream =
    body.stream === true ||
    (request.headers.get('accept') || '').includes('text/event-stream');

  const run = async (emit: Emit): Promise<CompleteLessonPack> => {
    const classProfile = getClassById(body.classId);
    const teacherName = body.teacherName || 'Giáo viên Việt Anh';

    // CHẾ ĐỘ 2: MÁY TRỘN ĐỀ KIỂM TRA & MA TRẬN THÔNG TƯ 22 GỘP NHIỀU BÀI HỌC (VIỆC FACTORY CHƯA LÀM)
    if (
      body.mode === 'multi_exam' &&
      Array.isArray(body.atomIds) &&
      body.atomIds.length > 0
    ) {
      const targetIds = body.atomIds.slice(0, 6);
      const details = await Promise.all(
        targetIds.map((id) => fetchSupabaseAtomDetail(id)),
      );
      const validDetails = details.filter((d) => d.atom !== null);
      const firstAtom = validDetails[0]?.atom;
      const subjectName = firstAtom?.subject || body.subject || 'Toán';
      const gradeStr = String(firstAtom?.grade || body.grade || '7');
      const className = classProfile
        ? `${classProfile.className} (${classProfile.campus}, ${classProfile.studentCount} HS)`
        : `Khối ${gradeStr}`;

      const combinedCode = validDetails.map((d) => d.atom!.code).join(' + ');
      const combinedTitle = validDetails
        .map((d) => `[${d.atom!.code}] ${d.atom!.title}`)
        .join('; ');

      const allQuestions = validDetails.flatMap((d) =>
        (d.questions || []).map((q) => ({
          ...q,
          atomCode: d.atom!.code,
          atomTitle: d.atom!.title,
        })),
      );
      const allSocratic = validDetails.flatMap((d) => d.socratic || []);

      const maTranLines: string[] = [
        `I. MA TRẬN & BẢNG ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KỲ (CHUẨN THÔNG TƯ 22/2021/TT-BGDĐT)`,
        `Môn học: ${subjectName} | Khối: ${gradeStr} | Lớp áp dụng: ${className}`,
        `Số đơn vị kiến thức (Atoms) được tổ hợp từ Factory: ${validDetails.length} bài học`,
        `Tổng số câu hỏi rút từ Ngân hàng Supabase: ${allQuestions.length} câu hỏi gốc`,
        '',
        `II. ĐẶC TẢ CHI TIẾT TỪNG ĐƠN VỊ KIẾN THỨC TRONG ĐỀ:`,
      ];

      validDetails.forEach((d, idx) => {
        const a = d.atom!;
        const pkgL1 = d.packages.find((p) => p.level === 1);
        const pkgL2 = d.packages.find((p) => p.level === 2);
        const pkgL3 = d.packages.find((p) => p.level === 3);
        maTranLines.push(
          `\n${idx + 1}. Đơn vị kiến thức ${idx + 1}: [${a.code}] ${a.title} (${a.chapter} - ${a.lesson})`,
          `   a) Mức Nhận biết (L1): ${pkgL1?.fields.objective || a.yeu_cau || `Nhận biết khái niệm và quy tắc cơ bản của ${a.title}`}`,
          `   b) Mức Thông hiểu (L2): ${pkgL2?.fields.objective || `Hiểu và giải thích được bản chất, lấy được ví dụ và phản ví dụ về ${a.title}`}`,
          `   c) Mức Vận dụng (L3): ${pkgL3?.fields.objective || `Vận dụng giải bài toán thực tế liên quan đến ${a.title}`}`,
          `   d) Lỗi sai trọng tâm cần kiểm tra: ${pkgL1?.fields.commonMistake || a.quan_niem_sai || 'Kiểm tra điều kiện áp dụng công thức.'}`,
          `   e) Số câu hỏi trích xuất từ kho Supabase của bài này: ${d.questions.length} câu`,
        );
      });

      const deThiLines: string[] = [
        `ĐỀ KIỂM TRA TỔNG HỢP (${validDetails.length} BÀI HỌC)`,
        `Môn: ${subjectName} — Khối ${gradeStr} — Thời gian làm bài: 45 phút`,
        `Họ và tên học sinh: .................................................... Lớp: ${className}`,
        `Các bài học trong phạm vi đề: ${combinedTitle}`,
        '',
        `PHẦN I. CÂU HỎI ĐÁNH GIÁ TRÍCH XUẤT TỪ NGÂN HÀNG SUPABASE & GÓI FACTORY:`,
      ];

      if (allQuestions.length > 0) {
        allQuestions.slice(0, 12).forEach((q, idx) => {
          deThiLines.push(
            `\nCâu ${idx + 1} (Thuộc bài [${q.atomCode}] — Mức độ: ${q.do_kho}, DOK ${q.dok}):`,
            `${cleanPedagogicalText(q.noi_dung)}`,
            `Bài làm / Trả lời của học sinh: ......................................................................................`,
          );
        });
      } else {
        validDetails.forEach((d, idx) => {
          const pkg = d.packages[0];
          deThiLines.push(
            `\nPhần câu hỏi bài [${d.atom!.code}] ${d.atom!.title}:`,
            pkg?.fields.questions ||
              `Câu ${idx + 1}: Trình bày khái niệm và lấy ví dụ áp dụng cho bài ${d.atom!.title}.`,
          );
        });
      }

      const dapAnLines: string[] = [
        `HƯỚNG DẪN CHẤM CHI TIẾT & PHÂN TÍCH PHƯƠNG ÁN NHIỄU (DÀNH CHO GIÁO VIÊN)`,
        `Phạm vi đề: ${combinedCode}`,
        '',
      ];

      if (allQuestions.length > 0) {
        allQuestions.slice(0, 12).forEach((q, idx) => {
          dapAnLines.push(
            `Câu ${idx + 1} ([${q.atomCode}] - Mức ${q.do_kho}):`,
            `   a) Đáp án đúng: ${cleanPedagogicalText(q.dap_an)}`,
            `   b) Lời giải chi tiết: ${cleanPedagogicalText(q.loi_giai)}`,
          );
          if (Array.isArray(q.nhieu) && q.nhieu.length > 0) {
            dapAnLines.push(
              `   c) Các bẫy học sinh hay nhầm: ${q.nhieu
                .map((n) => `"${n.noiDung}" (Lý do sai: ${n.lyDo})`)
                .join('; ')}`,
            );
          }
          dapAnLines.push('');
        });
      }

      const chuaBaiLines: string[] = [
        `CẨM NANG CHỮA BÀI SAU KIỂM TRA (SOCRATIC 4 BẬC CHO CÁC BÀI ĐÃ CHỌN)`,
        '',
      ];
      allSocratic.slice(0, 5).forEach((s, idx) => {
        chuaBaiLines.push(
          `Tình huống chữa bài ${idx + 1}: Khi học sinh làm sai "${cleanPedagogicalText(s.wrong_answer)}"`,
          `   Nguyên nhân nhầm lẫn: ${cleanPedagogicalText(s.misconception)}`,
          `   Bước 1 (Hỏi khơi gợi): ${cleanPedagogicalText(s.bac_1)}`,
          `   Bước 2 (Hỏi định hướng): ${cleanPedagogicalText(s.bac_2)}`,
          `   Bước 3 (Hỏi phản biện): ${cleanPedagogicalText(s.bac_3)}`,
          `   Bước 4 (Chốt kiến thức): ${cleanPedagogicalText(s.bac_4)}`,
          '',
        );
      });

      const examPack: CompleteLessonPack = {
        atomCode: combinedCode,
        atomTitle: `Đề Kiểm tra Tổ hợp (${validDetails.length} bài học)`,
        subject: subjectName,
        grade: gradeStr,
        className,
        teacherName,
        modelUsed: `Factory Mixer (${allQuestions.length} câu hỏi Supabase)`,
        estimatedMinutesSaved: 120,
        sections: [
          {
            id: 'giao_an',
            tabTitle: '1. Ma trận & Đặc tả Thông tư 22',
            docHeading:
              'PHẦN I. MA TRẬN & BẢNG ĐẶC TẢ ĐỀ KIỂM TRA TỔ HỢP (THÔNG TƯ 22)',
            content: maTranLines.join('\n'),
          },
          {
            id: 'phieu_hoc_tap',
            tabTitle: `2. Đề Kiểm tra In A4 (${Math.min(allQuestions.length, 12) || validDetails.length} câu)`,
            docHeading: 'PHẦN II. ĐỀ KIỂM TRA CHÍNH THỨC (IN PHÁT CHO HỌC SINH)',
            content: deThiLines.join('\n'),
          },
          {
            id: 'kiem_tra_nhanh',
            tabTitle: '3. Đáp án & Phân tích Bẫy',
            docHeading:
              'PHẦN III. ĐÁP ÁN CHẤM CHI TIẾT & PHÂN TÍCH LỖI SAI HỌC SINH',
            content: dapAnLines.join('\n'),
          },
          {
            id: 'cam_nang_socratic',
            tabTitle: '4. Kịch bản Chữa bài Socratic',
            docHeading:
              'PHẦN IV. KỊCH BẢN DẪN DẮT SOCRATIC 4 BẬC DÙNG KHI TRẢ BÀI KIỂM TRA',
            content: chuaBaiLines.join('\n'),
          },
        ],
      };

      return examPack;
    }

    const atomId = body.atomId as string;

    const detail = await fetchSupabaseAtomDetail(atomId);
    const atom = detail.atom;
    const packages = detail.packages || [];
    const factoryAssets = detail.factoryAssets || [];
    const questions = detail.questions || [];
    const socratic = detail.socratic || [];
    const edges = detail.edges || [];

    const subjectName = atom?.subject || body.subject || 'Toán';
    const gradeStr = String(atom?.grade || body.grade || '7');
    const atomCode = atom?.code || atomId;
    const atomTitle = atom?.title || 'Bài học trọng tâm';
    const className = classProfile
      ? `${classProfile.className} (${classProfile.campus}, ${classProfile.studentCount} HS)`
      : `Khối ${gradeStr}`;

    const coBanCount = classProfile?.groups[0]?.count ?? 6;
    const chuanCount = classProfile?.groups[1]?.count ?? 16;
    const nangCaoCount = classProfile?.groups[2]?.count ?? 8;
    const supportCodes =
      classProfile?.specialSupportStudents
        .map((s) => `${s.studentCode} (${s.pedagogicalAccommodation})`)
        .join('; ') || 'Học sinh cần kèm sát bước đầu';

    // Chuẩn bị ngữ cảnh từ Gói Học Liệu Gốc của Factory (studio_kv.packages + resources/assets)
    const factoryPackagesContext =
      packages.length > 0
        ? packages
            .map((pkg) => {
              const f = pkg.fields;
              return [
                `GÓI KIẾN THỨC GỐC TỪ FACTORY [${pkg.id}] (Mức ${pkg.level} - ${pkg.bloom}, Trạng thái: ${pkg.status}):`,
                f.objective ? `1. Mục tiêu gốc: ${f.objective}` : '',
                f.explanation ? `2. Giải thích cốt lõi: ${f.explanation}` : '',
                f.example ? `3. Ví dụ mẫu: ${f.example}` : '',
                f.counterExample ? `4. Phản ví dụ: ${f.counterExample}` : '',
                f.commonMistake
                  ? `5. Lỗi sai thường gặp: ${f.commonMistake}`
                  : '',
                f.strategy
                  ? `6. Chiến lược dạy Socratic: ${f.strategy}`
                  : '',
                f.questions ? `7. Câu hỏi gốc trong gói: ${f.questions}` : '',
              ]
                .filter(Boolean)
                .join('\n');
            })
            .join('\n\n')
        : '';

    const factoryWorksheetAsset = factoryAssets.find(
      (a) => a.format === 'worksheet',
    );
    const factoryTextAsset = factoryAssets.find((a) => a.format === 'text');
    const factorySlideAsset = factoryAssets.find((a) => a.format === 'slide');

    // Prompt AI chuyển hóa trực tiếp Gói Học Liệu Gốc của Factory thành Giáo án 5512 + Phiếu học tập phân hóa theo Lớp
    const systemPrompt = [
      'Bạn là Chuyên gia Sư phạm Trưởng của Trường Việt Anh.',
      'Nhiệm vụ: Nạp trực tiếp GÓI KIẾN THỨC GỐC TỪ FACTORY (Mục tiêu, Giải thích, Ví dụ, Phản ví dụ, Lỗi sai, Chiến lược Socratic) và chuyển thể đồng bộ thành 2 tài liệu lên lớp cho Lớp học cụ thể: PHẦN 1 là Kế hoạch bài dạy chuẩn Công văn 5512 (4 hoạt động) và PHẦN 2 là Phiếu học tập in A4 phát trên lớp (chia 3 mức độ năng lực).',
      'QUY TẮC TRÌNH BÀY BẮT BUỘC: TUYỆT ĐỐI KHÔNG dùng dấu sao (*, **), KHÔNG dùng dấu gạch ngang đầu dòng (-), KHÔNG dùng dấu # hay ---. Chỉ dùng hệ thống đánh mục chuẩn hành chính (I., II., 1., 2., a), b), Bước 1:, Bước 2:).',
      'Ngăn cách giữa Phần 1 và Phần 2 bằng đúng chuỗi: ===PHIEU_HOC_TAP===',
    ].join('\n');

    const crossLinksText =
      edges.length > 0
        ? edges
            .slice(0, 3)
            .map(
              (e, i) =>
                `${i + 1}. [${e.linkedAtom?.code || e.to_id}] (${e.linkedAtom?.subject || 'Liên môn'}): ${e.linkedAtom?.title || e.remediation_hint || ''}`,
            )
            .join('\n')
        : 'Liên hệ thực tiễn đời sống học sinh tại TP.HCM.';

    const sampleQuestionsText =
      questions.length > 0
        ? questions
            .slice(0, 3)
            .map(
              (q, i) =>
                `Câu ${i + 1} (${q.do_kho}): ${q.noi_dung} (Đáp án: ${q.dap_an})`,
            )
            .join('\n')
        : '';

    const userPrompt = [
      `MÔN HỌC: ${subjectName} | KHỐI: ${gradeStr} | LỚP: ${className}`,
      `BÀI DẠY: [${atomCode}] ${atomTitle} (${atom?.chapter || ''} - ${atom?.lesson || ''})`,
      `YÊU CẦU CẦN ĐẠT: ${atom?.yeu_cau || packages[0]?.fields.objective || atomTitle}`,
      `LỖI SAI HỌC SINH HAY MẮC CẦN LƯU Ý: ${atom?.quan_niem_sai || packages[0]?.fields.commonMistake || 'Cần nắm chắc định nghĩa và điều kiện áp dụng.'}`,
      `PHÂN HÓA LỚP HỌC: Nhóm Cơ bản (${coBanCount} HS, lưu ý mã ${supportCodes}); Nhóm Đạt chuẩn (${chuanCount} HS); Nhóm Nâng cao (${nangCaoCount} HS).`,
      factoryPackagesContext
        ? `\nNGUYÊN LIỆU GỐC ĐÃ SINH SẴN TỪ FACTORY.VIETANH.ORG (BẮT BUỘC KẾ THỪA 100% NỘI DUNG NÀY):\n${factoryPackagesContext}\n`
        : '',
      factoryWorksheetAsset
        ? `PHIẾU HỌC TẬP GỐC TỪ FACTORY (${factoryWorksheetAsset.id}):\n${factoryWorksheetAsset.sections.map((s) => `${s.heading}: ${s.body}`).join('\n')}`
        : '',
      factoryTextAsset
        ? `BÀI ĐỌC LÝ THUYẾT GỐC TỪ FACTORY (${factoryTextAsset.id}):\n${factoryTextAsset.sections.map((s) => `${s.heading}: ${s.body}`).join('\n')}`
        : '',
      factorySlideAsset
        ? `DÀN Ý SLIDE GỐC TỪ FACTORY (${factorySlideAsset.id}):\n${factorySlideAsset.sections.map((s) => `${s.heading}: ${s.body}`).join('\n')}`
        : '',
      `KẾT NỐI KIẾN THỨC & LIÊN MÔN TỪ KNOWLEDGE GRAPH:\n${crossLinksText}`,
      sampleQuestionsText
        ? `CÂU HỎI THẬT TRONG NGÂN HÀNG ĐỂ LỒNG GHÉP:\n${sampleQuestionsText}`
        : '',
      '',
      'Hãy kế thừa toàn bộ Giải thích, Ví dụ, Phản ví dụ, Chiến lược dạy của Factory để biên soạn ngắn gọn, súc tích, dùng được ngay trên lớp theo cấu trúc:',
      'PHẦN 1: KẾ HOẠCH BÀI DẠY CÔNG VĂN 5512 (I. Mục tiêu; II. Chuẩn bị & Học liệu Factory đi kèm; III. Tiến trình 4 Hoạt động lên lớp có đủ a) Mục tiêu, b) Nội dung lấy từ Giải thích/Ví dụ/Phản ví dụ của Factory, c) Sản phẩm, d) Tổ chức thực hiện phân hóa cho lớp)',
      '===PHIEU_HOC_TAP===',
      'PHẦN 2: PHIẾU HỌC TẬP IN A4 PHÁT CHO HỌC SINH (Có chỗ ghi Họ tên, Lớp; Nhiệm vụ 1: Khởi động cá nhân; Nhiệm vụ 2: Thảo luận cặp đôi phân tích Ví dụ & Phản ví dụ; Nhiệm vụ 3: Bài tập tự chọn 3 mức Cơ bản L1, Đạt chuẩn L2, Nâng cao L3 kèm hướng dẫn chấm nhanh cho GV).',
    ]
      .filter(Boolean)
      .join('\n');

    // Hai phần tất định đã có đủ dữ liệu ngay sau khi tải từ Supabase.
    emit({ type: 'stage', id: 'kiem_tra_nhanh', status: 'start' });
    emit({ type: 'stage', id: 'kiem_tra_nhanh', status: 'done' });
    emit({ type: 'stage', id: 'cam_nang_socratic', status: 'start' });
    emit({ type: 'stage', id: 'cam_nang_socratic', status: 'done' });
    emit({ type: 'stage', id: 'giao_an', status: 'start' });
    emit({ type: 'stage', id: 'phieu_hoc_tap', status: 'start' });

    const live = await withLlmDeltaSink(
      (text) => emit({ type: 'delta', text }),
      () => callLiveLlm(systemPrompt, userPrompt, undefined),
    );
    emit({ type: 'stage', id: 'giao_an', status: 'done' });
    emit({ type: 'stage', id: 'phieu_hoc_tap', status: 'done' });

    let giaoAnContent = '';
    let phieuHocTapContent = '';

    if (live.ok && live.content) {
      const parts = live.content.split('===PHIEU_HOC_TAP===');
      giaoAnContent = cleanPedagogicalText(parts[0] || live.content);
      phieuHocTapContent = cleanPedagogicalText(
        parts[1] || buildFallbackWorksheet(atomCode, atomTitle, subjectName, className, questions),
      );
    } else {
      giaoAnContent = buildFallbackLessonPlan(
        atomCode,
        atomTitle,
        subjectName,
        gradeStr,
        className,
        atom?.yeu_cau || atomTitle,
        atom?.quan_niem_sai || '',
        supportCodes,
      );
      phieuHocTapContent = buildFallbackWorksheet(
        atomCode,
        atomTitle,
        subjectName,
        className,
        questions,
      );
    }

    // Phần 3: Đề kiểm tra nhanh 5 phút cuối tiết (Exit Ticket từ Ngân hàng câu hỏi thật Supabase)
    const kiemTraContent =
      questions.length > 0
        ? [
            `BỘ CÂU HỎI KIỂM TRA NHANH CUỐI TIẾT (EXIT TICKET 5 PHÚT)`,
            `Bài học: [${atomCode}] ${atomTitle} (${subjectName} Khối ${gradeStr})`,
            `Mục đích: Kiểm tra nhanh mức độ hiểu bài của học sinh Lớp ${className} ngay trước khi kết thúc tiết học.`,
            '',
            ...questions.slice(0, 5).map((q, idx) => {
              const lines = [
                `Câu ${idx + 1} (Mức độ: ${q.do_kho}, Tư duy DOK ${q.dok}):`,
                `${cleanPedagogicalText(q.noi_dung)}`,
                `a) Đáp án đúng: ${cleanPedagogicalText(q.dap_an)}`,
                `b) Hướng dẫn giải chi tiết: ${cleanPedagogicalText(q.loi_giai)}`,
              ];
              if (Array.isArray(q.nhieu) && q.nhieu.length > 0) {
                lines.push(
                  `c) Các bẫy học sinh hay chọn nhầm: ${q.nhieu
                    .map((n) => `"${n.noiDung}" (Lý do nhầm: ${n.lyDo})`)
                    .join('; ')}`,
                );
              }
              return lines.join('\n');
            }),
          ].join('\n\n')
        : [
            `BỘ CÂU HỎI KIỂM TRA NHANH CUỐI TIẾT (EXIT TICKET 5 PHÚT)`,
            `Bài học: [${atomCode}] ${atomTitle}`,
            `Câu 1 (Nhận biết): Nêu khái niệm hoặc quy tắc trọng tâm nhất vừa học trong bài "${atomTitle}".`,
            `Câu 2 (Thông hiểu): Chỉ ra lỗi sai phổ biến cần tránh khi áp dụng kiến thức bài này (${atom?.quan_niem_sai || 'điều kiện áp dụng'}).`,
            `Câu 3 (Vận dụng): Lấy 1 ví dụ thực tế trong đời sống ứng dụng kiến thức bài học hôm nay.`,
          ].join('\n\n');

    // Phần 4: Cẩm nang Đứng lớp Socratic 4 Bậc & Cầu nối Liên môn (từ Supabase)
    const camNangLines: string[] = [
      `1. CẢNH BÁO LỖI SAI TRỌNG TÂM GIÁO VIÊN CẦN NHẤN MẠNH TRÊN BẢNG:`,
      `   ${cleanPedagogicalText(atom?.quan_niem_sai || 'Nhắc học sinh kiểm tra kỹ điều kiện của đề bài trước khi áp dụng công thức.')}`,
      '',
      `2. KỊCH BẢN HỎI ĐÁP SOCRATIC 4 BẬC (DÙNG KHI HỌC SINH TRẢ LỜI SAI TRÊN LỚP):`,
    ];

    if (socratic.length > 0) {
      socratic.slice(0, 3).forEach((s, idx) => {
        camNangLines.push(
          `\nTình huống ${idx + 1}: Khi học sinh trả lời sai "${cleanPedagogicalText(s.wrong_answer)}"`,
          `   Nguyên nhân gốc rễ học sinh nhầm: ${cleanPedagogicalText(s.misconception)}`,
          `   Bước 1 (Hỏi khơi gợi): ${cleanPedagogicalText(s.bac_1)}`,
          `   Bước 2 (Hỏi định hướng): ${cleanPedagogicalText(s.bac_2)}`,
          `   Bước 3 (Hỏi phản biện): ${cleanPedagogicalText(s.bac_3)}`,
          `   Bước 4 (Chốt kiến thức đúng): ${cleanPedagogicalText(s.bac_4)}`,
        );
      });
    } else {
      camNangLines.push(
        `   Bước 1 (Khơi gợi): Yêu cầu học sinh nhắc lại dữ kiện đề bài đã cho.`,
        `   Bước 2 (Định hướng): Đối chiếu dữ kiện với định nghĩa hoặc quy tắc vừa học ở Hoạt động 2.`,
        `   Bước 3 (Phản biện): Thử thay kết quả của học sinh vào đề bài xem có thỏa mãn không.`,
        `   Bước 4 (Chốt kiến thức): Để học sinh tự sửa lại bước biến đổi bị nhầm.`,
      );
    }

    camNangLines.push(
      '',
      `3. CẦU NỐI TÍCH HỢP LIÊN MÔN & KIẾN THỨC LIÊN QUAN (KNOWLEDGE GRAPH):`,
      crossLinksText,
    );

    const pack: CompleteLessonPack = {
      atomCode,
      atomTitle,
      subject: subjectName,
      grade: gradeStr,
      className,
      teacherName,
      modelUsed: live.modelUsed,
      estimatedMinutesSaved: 95,
      sections: [
        {
          id: 'giao_an',
          tabTitle: '1. Giáo án Công văn 5512',
          docHeading: 'PHẦN I. KẾ HOẠCH BÀI DẠY CHUẨN CÔNG VĂN 5512 (DÀNH CHO GIÁO VIÊN)',
          content: giaoAnContent,
        },
        {
          id: 'phieu_hoc_tap',
          tabTitle: '2. Phiếu Học tập In A4 (3 Mức)',
          docHeading: 'PHẦN II. PHIẾU HỌC TẬP TRÊN LỚP (IN PHÁT CHO HỌC SINH)',
          content: phieuHocTapContent,
        },
        {
          id: 'kiem_tra_nhanh',
          tabTitle: `3. Câu hỏi Kiểm tra (${questions.length || 3} câu)`,
          docHeading: 'PHẦN III. ĐỀ KIỂM TRA NHANH 5 PHÚT CUỐI GIỜ & PHÂN TÍCH LỖI SAI',
          content: kiemTraContent,
        },
        {
          id: 'cam_nang_socratic',
          tabTitle: `4. Kịch bản Socratic & Liên môn`,
          docHeading: 'PHẦN IV. CẨM NANG ĐỨNG LỚP: KỊCH BẢN SOCRATIC 4 BẬC & LIÊN MÔN',
          content: camNangLines.join('\n'),
        },
      ],
    };

    return pack;
  };

  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const emit: Emit = (event) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}

`),
            );
          } catch {
            closed = true;
          }
        };
        try {
          const pack = await run(emit);
          emit({ type: 'done', pack });
        } catch (err) {
          console.error('[generate-pack] stream failed:', err);
          emit({
            type: 'error',
            error: 'Lỗi khi tạo trọn bộ hồ sơ tiết dạy. Vui lòng thử lại.',
          });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // đã đóng
            }
          }
        }
      },
      cancel() {
        // client hủy: emit() sẽ tự bỏ qua
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  try {
    const pack = await run(() => {});
    return NextResponse.json({ ok: true, pack });
  } catch (err) {
    console.error('[generate-pack] failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Lỗi khi tạo trọn bộ hồ sơ tiết dạy. Vui lòng thử lại.' },
      { status: 500 },
    );
  }
}

function buildFallbackLessonPlan(
  code: string,
  title: string,
  subject: string,
  grade: string,
  className: string,
  yeuCau: string,
  quanNiemSai: string,
  supportCodes: string,
): string {
  return [
    `I. MỤC TIÊU BÀI HỌC`,
    `1. Kiến thức: Học sinh nắm vững bài [${code}] ${title} (${subject} Khối ${grade}).`,
    `2. Yêu cầu cần đạt: ${cleanPedagogicalText(yeuCau)}`,
    `3. Lưu ý khắc phục lỗi sai học sinh: ${cleanPedagogicalText(quanNiemSai || 'Phân biệt kỹ khái niệm và điều kiện áp dụng.')}`,
    '',
    `II. TIẾN TRÌNH 4 HOẠT ĐỘNG LÊN LỚP (LỚP ${className})`,
    `1. Hoạt động 1: Mở đầu và Khởi động (5 phút)`,
    `   a) Mục tiêu: Kích hoạt kiến thức nền và tạo hứng thú đầu giờ.`,
    `   b) Nội dung: Học sinh giải quyết nhanh Nhiệm vụ 1 trong Phiếu học tập.`,
    `   c) Sản phẩm: Câu trả lời dự đoán của học sinh.`,
    `   d) Tổ chức thực hiện: Làm cá nhân 2 phút, gọi 2 học sinh chia sẻ nhanh.`,
    '',
    `2. Hoạt động 2: Hình thành kiến thức mới (15 phút)`,
    `   a) Mục tiêu: Nắm vững bản chất kiến thức bài ${title}.`,
    `   b) Nội dung: Thảo luận cặp đôi hoàn thành Nhiệm vụ 2 trong Phiếu học tập.`,
    `   c) Sản phẩm: Kết luận kiến thức trọng tâm ghi vở.`,
    `   d) Tổ chức thực hiện: Giáo viên kèm sát học sinh mã ${supportCodes}, sau đó chốt kiến thức trên bảng và cảnh báo lỗi sai thường gặp.`,
    '',
    `3. Hoạt động 3: Luyện tập phân hóa 3 mức (15 phút)`,
    `   a) Mục tiêu: Rèn kỹ năng giải bài tập theo đúng năng lực từng nhóm học sinh.`,
    `   b) Nội dung: Học sinh hoàn thành Nhiệm vụ 3 (Cơ bản, Đạt chuẩn, Nâng cao) trên Phiếu học tập.`,
    '',
    `4. Hoạt động 4: Vận dụng và Kiểm tra nhanh Exit Ticket (10 phút)`,
    `   a) Mục tiêu: Đánh giá ngay mức độ hiểu bài của cả lớp trước khi hết giờ.`,
    `   b) Tổ chức thực hiện: Học sinh làm nhanh bộ câu hỏi kiểm tra ở Phần III.`,
  ].join('\n');
}

function buildFallbackWorksheet(
  code: string,
  title: string,
  subject: string,
  className: string,
  questions: { noi_dung: string; do_kho: string }[],
): string {
  return [
    `PHIẾU HỌC TẬP MÔN ${subject.toUpperCase()}`,
    `Bài học: [${code}] ${title}`,
    `Họ và tên học sinh: .................................................... Lớp: ${className}`,
    '',
    `NHIỆM VỤ 1: KHỞI ĐỘNG ĐẦU GIỜ (5 PHÚT)`,
    questions[0]
      ? `Câu hỏi mở đầu: ${cleanPedagogicalText(questions[0].noi_dung)}`
      : `Câu hỏi mở đầu: Nêu ví dụ thực tế liên quan đến chủ đề "${title}".`,
    `Trả lời của em: ..........................................................................................................`,
    '',
    `NHIỆM VỤ 2: KHÁM PHÁ KIẾN THỨC MỚI (THẢO LUẬN CẶP ĐÔI - 10 PHÚT)`,
    `Điền quy tắc hoặc kết luận trọng tâm của bài học và chỉ ra 1 lỗi sai cần tránh:`,
    `.................................................................................................................................`,
    '',
    `NHIỆM VỤ 3: BÀI TẬP PHÂN HÓA THEO NĂNG LỰC (15 PHÚT)`,
    `1. Dành cho Nhóm Cơ bản: ${questions[0] ? cleanPedagogicalText(questions[0].noi_dung) : `Áp dụng trực tiếp quy tắc bài ${title} vào ví dụ mẫu.`}`,
    `2. Dành cho Nhóm Đạt chuẩn: ${questions[1] ? cleanPedagogicalText(questions[1].noi_dung) : `Giải bài tập trọng tâm và trình bày rõ từng bước.`}`,
    `3. Dành cho Nhóm Nâng cao: ${questions[2] ? cleanPedagogicalText(questions[2].noi_dung) : `Vận dụng giải bài toán thực tế mở rộng và giải thích tại sao.`}`,
  ].join('\n');
}
