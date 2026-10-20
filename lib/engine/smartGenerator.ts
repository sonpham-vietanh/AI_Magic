import { getGradeMeta, getSubjectMeta } from '../catalog/categories';
import { RELATION_LABELS } from '../knowledge-graph';
import type {
  ClassProfile,
  GeneratedResource,
  GenerationRequest,
  KnowledgeEdge,
  KnowledgeNode,
  PedagogicalTool,
} from '../types';
import { callLiveLlm } from './llmClient';
import { buildSystemAndUserPrompt } from './promptBuilder';

export function cleanPedagogicalText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, '$1$2')
    .replace(/`+([^`\n]*)`+/g, '$1')
    .split('\n')
    .filter((line) => !/^\s*([-*_]{3,})\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^(\s*)[-*+\u2022]\s+/, '$1')
        .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?![*\w])/g, '$1$2'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const nowIsoVietnam = (): string => {
  const now = new Date();
  const tzOffsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + tzOffsetMs);
  return local.toISOString().replace('Z', '+07:00');
};

export const generatePedagogicalResource = async (params: {
  tool: PedagogicalTool;
  request: GenerationRequest;
  classProfile?: ClassProfile;
  primaryNode?: KnowledgeNode;
  linkedNodes: { node: KnowledgeNode; edge?: KnowledgeEdge }[];
  preferredModel?: string;
}): Promise<GeneratedResource> => {
  const {
    tool,
    request,
    classProfile,
    primaryNode,
    linkedNodes,
    preferredModel,
  } = params;
  const subjectMeta = getSubjectMeta(request.subject);
  const gradeMeta = getGradeMeta(request.grade);

  const topic =
    String(request.inputs.topic || '').trim() ||
    primaryNode?.title ||
    String(tool.sampleInput.topic || 'Bài học trọng tâm');
  const objectives =
    String(request.inputs.objectives || '').trim() ||
    primaryNode?.moetRequiredOutcomes.join('; ') ||
    String(
      tool.sampleInput.objectives ||
        'Đạt yêu cầu cần đạt theo Chương trình GDPT 2018.',
    );
  const durationLabel =
    request.inputs.duration === '15_phut'
      ? '15 phút'
      : request.inputs.duration === '90_phut'
        ? '90 phút (2 tiết)'
        : '45 phút (1 tiết)';

  const { systemPrompt, userPrompt } = buildSystemAndUserPrompt(params);
  const live = await callLiveLlm(systemPrompt, userPrompt, preferredModel);

  const coBanGroup = classProfile?.groups.find((g) => g.tier === 'co_ban');
  const chuanGroup = classProfile?.groups.find((g) => g.tier === 'chuan');
  const nangCaoGroup = classProfile?.groups.find((g) => g.tier === 'nang_cao');

  const differentiationSummary = {
    coBan: classProfile
      ? `${coBanGroup?.count ?? 0} học sinh: Làm bài theo mẫu hướng dẫn từng bước, ${classProfile.specialSupportStudents.length > 0 ? `giáo viên kèm sát học sinh mã ${classProfile.specialSupportStudents.map((s) => `${s.studentCode} (${s.pedagogicalAccommodation})`).join('; ')}.` : 'giáo viên kèm sát khi cần.'}`
      : 'Nhóm Cơ bản: Có gợi ý công thức và làm mẫu câu đầu tiên.',
    chuan: classProfile
      ? `${chuanGroup?.count ?? 0} học sinh: Giải quyết trọn vẹn các bài tập trọng tâm theo nhóm đôi.`
      : 'Nhóm Đạt chuẩn: Hoàn thành bài tập theo yêu cầu SGK và liên hệ thực tế.',
    nangCao: classProfile
      ? `${nangCaoGroup?.count ?? 0} học sinh: Giải thêm câu hỏi vận dụng cao và trình bày tóm tắt từ khóa Tiếng Anh (${classProfile.englishProficiencyLevel}).`
      : 'Nhóm Khá giỏi: Mở rộng bài toán thực tiễn và liên hệ môn học khác.',
  };

  const crossSubjectHighlights = linkedNodes.map(({ node, edge }) => ({
    targetSubject: node.subject,
    targetTopic: `${node.subjectName} (Khối ${node.grade}): ${node.title}`,
    integrationActivity:
      edge?.suggestedSharedActivity ||
      edge?.integrationIdea ||
      node.vietAnhPracticalHook,
  }));

  const fallbackSections = buildStructuredSections({
    tool,
    request,
    topic,
    objectives,
    durationLabel,
    subjectName: subjectMeta.name,
    gradeLabel: gradeMeta.label,
    classProfile,
    primaryNode,
    linkedNodes,
    differentiationSummary,
  });

  const structuredSections =
    live.ok && live.content
      ? parseMarkdownIntoSections(live.content, tool.name)
      : fallbackSections;

  const markdownContent = structuredSections
    .map((sec) => `${sec.heading}\n${sec.body}`)
    .join('\n\n');

  const isLive = Boolean(live.ok && live.content);
  const sourceNote = isLive
    ? ''
    : ' (Nội dung từ mẫu dự phòng, chưa có kết quả từ mô hình AI.)';
  const is5512 = /5512/.test(tool.moetStandardRef);
  const hasAllActivities = [1, 2, 3, 4].every((n) =>
    new RegExp(`Hoạt động\\s*${n}\\b`, 'i').test(markdownContent),
  );
  const hasAbcd = ['a', 'b', 'c', 'd'].every((l) =>
    new RegExp(`(^|\\n)\\s*${l}\\)`).test(markdownContent),
  );
  const structurePassed = is5512
    ? hasAllActivities && hasAbcd
    : structuredSections.length > 0;
  const hasCrossSubject = crossSubjectHighlights.length > 0;

  const moetComplianceChecklist = [
    {
      criterion: `Cấu trúc ${tool.moetStandardRef}`,
      passed: structurePassed,
      note:
        (is5512
          ? structurePassed
            ? 'Có đủ 4 hoạt động và các mục a) đến d).'
            : 'Chưa phát hiện đủ 4 hoạt động hoặc các mục a) đến d), cần giáo viên rà soát.'
          : structurePassed
            ? 'Đã có các phần nội dung theo cấu trúc công cụ.'
            : 'Chưa có nội dung.') + sourceNote,
    },
    {
      criterion: 'Hoạt động thực hành trên lớp',
      passed: Boolean(primaryNode?.vietAnhPracticalHook) || (is5512 && hasAllActivities),
      note:
        primaryNode?.vietAnhPracticalHook ??
        'Có hoạt động khởi động và bài tập gắn với thực tế.',
    },
    {
      criterion: 'Phân hóa theo nhóm học sinh',
      passed: Boolean(classProfile),
      note: classProfile
        ? `Chia bài tập cho 3 nhóm học sinh của lớp ${classProfile.className} (${classProfile.studentCount} HS).`
        : 'Chưa chọn lớp, chỉ phân hóa chung theo 3 mức Cơ bản, Đạt chuẩn và Khá giỏi.',
    },
    {
      criterion: 'Liên hệ liên môn',
      passed: hasCrossSubject,
      note: hasCrossSubject
        ? `Kết nối với môn ${linkedNodes.map((l) => l.node.subjectName).join(', ')} trong cùng tuần.`
        : 'Chưa chọn cầu nối liên môn.',
    },
  ];

  const postActionTitleSuffix: Record<
    NonNullable<GenerationRequest['postAction']>,
    string
  > = {
    rut_ngan: ' (Bản tóm tắt 1 trang)',
    tang_do_kho: ' (Kèm câu hỏi nâng cao)',
    giam_do_kho: ' (Bản hướng dẫn từng bước cho HS cơ bản)',
    tao_rubric: ' (Kèm bảng chấm điểm)',
    tao_phieu_hoc_tap: ' (Kèm phiếu học tập)',
    song_ngu_anh_viet: ' (Kèm thuật ngữ Song ngữ)',
    them_hoat_dong_vui_ve: ' (Kèm trò chơi đầu giờ)',
  };

  const suffix = request.postAction
    ? postActionTitleSuffix[request.postAction]
    : '';

  return {
    id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: nowIsoVietnam(),
    toolId: tool.id,
    toolName: tool.name,
    category: tool.category,
    teacher: {
      email:
        request.teacherEmail ||
        classProfile?.homeroomTeacher.email ||
        'son.nguyen@truongvietanh.com',
      name:
        request.teacherName ||
        classProfile?.homeroomTeacher.name ||
        'Nguyễn Sơn',
    },
    grade: request.grade,
    subject: request.subject,
    classId: classProfile?.id,
    className: classProfile?.className,
    knowledgeNodeId: primaryNode?.id,
    linkedNodeIds: linkedNodes.map((l) => l.node.id),
    title: `${tool.name}: ${topic}${classProfile ? ` (Lớp ${classProfile.className})` : ''}${suffix}`,
    markdownContent,
    structuredSections,
    differentiationSummary,
    crossSubjectHighlights,
    moetComplianceChecklist,
    generationMode: live.ok ? 'llm_live' : 'smart_template',
    modelUsed: live.modelUsed,
    estimatedMinutesSaved: tool.estimatedMinutesSaved,
  };
};

function parseMarkdownIntoSections(
  markdown: string,
  fallbackHeading: string,
): { heading: string; body: string }[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: { heading: string; body: string }[] = [];
  const defaultHeading = cleanPedagogicalText(fallbackHeading) || 'Nội dung học liệu';
  let currentHeading = defaultHeading;
  let currentLines: string[] = [];

  const flush = () => {
    const cleanedBody = cleanPedagogicalText(currentLines.join('\n'));
    if (cleanedBody.length > 0) {
      sections.push({ heading: currentHeading, body: cleanedBody });
    }
  };

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = cleanPedagogicalText(headingMatch[2]) || currentHeading;
      currentLines = [];
    } else {
      currentLines.push(rawLine);
    }
  }
  flush();

  if (sections.length === 0) {
    return [{ heading: defaultHeading, body: cleanPedagogicalText(markdown) }];
  }
  return sections;
}

function buildStructuredSections(ctx: {
  tool: PedagogicalTool;
  request: GenerationRequest;
  topic: string;
  objectives: string;
  durationLabel: string;
  subjectName: string;
  gradeLabel: string;
  classProfile?: ClassProfile;
  primaryNode?: KnowledgeNode;
  linkedNodes: { node: KnowledgeNode; edge?: KnowledgeEdge }[];
  differentiationSummary: { coBan: string; chuan: string; nangCao: string };
}): { heading: string; body: string }[] {
  const {
    request,
    topic,
    objectives,
    durationLabel,
    subjectName,
    gradeLabel,
    classProfile,
    primaryNode,
    linkedNodes,
    differentiationSummary,
  } = ctx;

  const classLabel = classProfile
    ? `Lớp ${classProfile.className} (${classProfile.studentCount} học sinh)`
    : gradeLabel;

  const interestsHook = classProfile
    ? classProfile.dominantInterests.slice(0, 2).join(', ')
    : 'tình huống đời sống hằng ngày';

  const linkedText =
    linkedNodes.length > 0
      ? linkedNodes
          .map(({ node, edge }, idx) => {
            const rel = edge ? RELATION_LABELS[edge.relation].label : 'Liên hệ';
            return `${idx + 1}. Môn ${node.subjectName} (${rel}, Bài: ${node.title}):\n   Nội dung kết nối: ${edge?.integrationIdea ?? node.vietAnhPracticalHook}\n   Hoạt động trên lớp: ${edge?.suggestedSharedActivity ?? 'Dùng chung số liệu và ngữ liệu trong tuần.'}`;
          })
          .join('\n')
      : `Liên hệ thực tế: Học sinh dùng kiến thức bài "${topic}" để giải thích hoặc tính toán các tình huống gặp tại gia đình và trường học.`;

  const baseSections: { heading: string; body: string }[] = [
    {
      heading: 'I. MỤC TIÊU BÀI HỌC',
      body: [
        `1. Kiến thức:`,
        `   Bài học: ${topic} (${subjectName}, ${gradeLabel}, thời lượng: ${durationLabel}).`,
        `   Yêu cầu cần đạt: ${cleanPedagogicalText(objectives)}`,
        primaryNode
          ? primaryNode.moetRequiredOutcomes
              .map((o) => `   ${cleanPedagogicalText(o)}`)
              .join('\n')
          : '',
        `2. Năng lực:`,
        `   Năng lực chung: ${(primaryNode?.coreCompetencies ?? ['Tự chủ và tự học', 'Giao tiếp và hợp tác', 'Giải quyết vấn đề']).join(', ')}.`,
        `   Vận dụng thực tế: ${cleanPedagogicalText(primaryNode?.vietAnhPracticalHook ?? `Đưa ví dụ gần gũi với học sinh (${interestsHook}) để dẫn vào bài.`)}`,
        `3. Phẩm chất: ${(primaryNode?.coreQualities ?? ['Chăm chỉ', 'Trung thực', 'Trách nhiệm']).join(', ')}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      heading: 'II. TIẾN TRÌNH DẠY HỌC (CÔNG VĂN 5512)',
      body: [
        `Hoạt động 1: Mở đầu và Khởi động (5 đến 7 phút)`,
        `a) Mục tiêu: Tạo hứng thú cho học sinh ${classLabel} trước khi vào bài mới.`,
        `b) Nội dung: Giáo viên nêu câu hỏi tình huống ngắn gắn với chủ đề ${interestsHook} liên quan đến bài "${topic}".`,
        `c) Sản phẩm: Câu trả lời miệng hoặc dự đoán nhanh của học sinh.`,
        `d) Tổ chức thực hiện: Học sinh trao đổi nhanh theo bàn trong 2 phút, giáo viên gọi 2 đến 3 em trả lời rồi dẫn vào bài.`,
        '',
        `Hoạt động 2: Hình thành kiến thức mới (15 phút)`,
        `a) Mục tiêu: Học sinh nắm được khái niệm và quy tắc trọng tâm của bài "${topic}".`,
        `b) Nội dung: Học sinh đọc ngữ liệu và ví dụ trong SGK, làm câu hỏi tìm hiểu bài theo nhóm đôi.`,
        `c) Sản phẩm: Nội dung ghi bảng và câu trả lời của các nhóm.`,
        `d) Tổ chức thực hiện:`,
        `   Bước 1 (Giao nhiệm vụ): Giáo viên chiếu ví dụ mẫu và nêu rõ yêu cầu.`,
        `   Bước 2 (Thực hiện): Học sinh làm việc theo cặp (giáo viên đi quan sát, hướng dẫn thêm cho học sinh mã ${classProfile?.specialSupportStudents.map((s) => s.studentCode).join(', ') || 'cần hỗ trợ'}).`,
        `   Bước 3 (Báo cáo): Đại diện 2 nhóm lên trình bày, các nhóm khác nhận xét.`,
        `   Bước 4 (Kết luận): Giáo viên chốt lại kiến thức trọng tâm để học sinh ghi vở.`,
        '',
        `Hoạt động 3: Luyện tập (13 phút)`,
        `a) Mục tiêu: Rèn kỹ năng làm bài tập theo 3 mức độ năng lực của lớp.`,
        `b) Nội dung: Hệ thống bài tập chia theo 3 mức (chi tiết tại Mục III).`,
        `c) Sản phẩm: Bài làm của học sinh trong vở hoặc phiếu học tập.`,
        `d) Tổ chức thực hiện: Học sinh làm bài cá nhân, sau đó đổi vở chấm chéo theo bàn dựa trên đáp án giáo viên chiếu.`,
        '',
        `Hoạt động 4: Vận dụng và Mở rộng (10 phút)`,
        `a) Mục tiêu: Vận dụng kiến thức vào thực tế và liên hệ môn học khác.`,
        `b) Nội dung và Sản phẩm: Học sinh trả lời câu hỏi thực tế hoặc nhiệm vụ liên môn tại Mục IV.`,
      ].join('\n'),
    },
    {
      heading: `III. BÀI TẬP PHÂN HÓA THEO LỚP (${classLabel.toUpperCase()})`,
      body: [
        `1. Mức Cơ bản (${differentiationSummary.coBan})`,
        `   Bài tập áp dụng trực tiếp công thức và quy tắc vừa học của bài "${topic}", có làm mẫu sẵn ý đầu tiên để học sinh làm theo.`,
        '',
        `2. Mức Đạt chuẩn (${differentiationSummary.chuan})`,
        `   Bài tập tổng hợp theo đúng yêu cầu cần đạt của chương trình, yêu cầu học sinh trình bày đầy đủ các bước giải.`,
        '',
        `3. Mức Khá Giỏi (${differentiationSummary.nangCao})`,
        `   Bài toán thực tế mở rộng hoặc câu hỏi giải thích vì sao, khuyến khích học sinh tìm cách giải ngắn gọn hơn.`,
      ].join('\n'),
    },
    {
      heading: 'IV. LIÊN HỆ LIÊN MÔN & CỦNG CỐ CUỐI TIẾT',
      body: [
        `1. Kết nối với các môn học khác trong tuần:`,
        linkedText,
        '',
        `2. Câu hỏi củng cố nhanh cuối bài (3 phút):`,
        `   Câu 1: Nêu lại ý chính hoặc công thức quan trọng nhất của bài "${topic}"?`,
        `   Câu 2: Chỉ ra lỗi sai dễ mắc phải khi làm dạng bài này?`,
        `   Câu 3: Nêu 1 ví dụ ứng dụng nội dung vừa học vào đời sống hằng ngày.`,
      ].join('\n'),
    },
  ];

  if (request.postAction) {
    switch (request.postAction) {
      case 'rut_ngan':
        return [
          {
            heading: 'TÓM TẮT GIÁO ÁN 1 TRANG (DÙNG NHANH TRÊN LỚP)',
            body: [
              `1. Bài dạy: ${topic} (${subjectName}, ${gradeLabel}).`,
              `2. Trọng tâm cần đạt: ${cleanPedagogicalText(objectives)}`,
              `3. Khởi động (5 phút): Câu hỏi thực tế gắn với ${interestsHook}.`,
              `4. Nội dung chính (25 phút): Nêu ví dụ thực tế, chốt kiến thức, giao bài tập 3 mức độ (Cơ bản, Chuẩn, Khá giỏi).`,
              `5. Củng cố (10 phút): Liên hệ môn ${linkedNodes.map((l) => l.node.subjectName).join(', ') || 'thực tế'} và 2 câu hỏi kiểm tra nhanh.`,
            ].join('\n'),
          },
          ...baseSections.slice(2),
        ];
      case 'tang_do_kho':
        return [
          ...baseSections,
          {
            heading: 'V. CÂU HỎI NÂNG CAO & BỒI DƯỠNG HỌC SINH KHÁ GIỎI',
            body: [
              `Câu 1 (Vận dụng thực tế): Đặt bài toán "${topic}" vào tình huống thực tế có nhiều dữ kiện, yêu cầu học sinh lựa chọn phương án hợp lý nhất và giải thích.`,
              `Câu 2 (Phát hiện lỗi sai): Đưa ra một cách làm có lỗi sai ngầm định thường gặp, yêu cầu học sinh chỉ ra chỗ sai và sửa lại.`,
              `Câu 3 (Liên môn): Kết hợp kiến thức bài "${topic}" với môn ${linkedNodes[0]?.node.subjectName || 'Khoa học tự nhiên'} để giải quyết câu hỏi tổng hợp.`,
            ].join('\n'),
          },
        ];
      case 'giam_do_kho':
        return [
          {
            heading: 'I. HƯỚNG DẪN TỪNG BƯỚC CHO HỌC SINH NHÓM CƠ BẢN',
            body: [
              `Tóm tắt ngắn gọn nội dung chính của bài "${topic}" trong 3 bước làm bài:`,
              `Bước 1: Đọc đề và gạch chân các số liệu hoặc từ khóa chính.`,
              `Bước 2: Thay vào mẫu có sẵn theo ví dụ của giáo viên trên bảng.`,
              `Bước 3: Kiểm tra lại kết quả cùng bạn bên cạnh.`,
              classProfile
                ? `Lưu ý hỗ trợ riêng tại lớp ${classProfile.className}: ${classProfile.specialSupportStudents.map((s) => `Mã HS ${s.studentCode}: ${s.pedagogicalAccommodation}`).join(' | ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          ...baseSections,
        ];
      case 'tao_rubric':
        return [
          ...baseSections,
          {
            heading: 'V. BẢNG TIÊU CHÍ CHẤM ĐIỂM (THANG ĐIỂM 10)',
            body: [
              `1. Nắm vững kiến thức trọng tâm (4,0 điểm):`,
              `   Mức Tốt (3,5 đến 4,0đ): Làm đúng toàn bộ yêu cầu, trình bày rõ ràng.`,
              `   Mức Đạt (2,0 đến 3,0đ): Đúng ý chính nhưng còn sai sót nhỏ khi trình bày.`,
              `   Cần cố gắng (Dưới 2,0đ): Chưa nắm được quy tắc cơ bản, cần giáo viên hướng dẫn lại.`,
              `2. Vận dụng thực tế (3,0 điểm):`,
              `   Mức Tốt (2,5 đến 3,0đ): Nêu được ví dụ thực tế hợp lý, tính toán chính xác.`,
              `   Mức Đạt (1,5 đến 2,0đ): Nêu được ví dụ theo SGK.`,
              `3. Thái độ làm việc nhóm và trình bày (3,0 điểm):`,
              `   Mức Tốt (2,5 đến 3,0đ): Các thành viên đều tham gia, nộp bài đúng giờ, chữ viết sạch sẽ.`,
            ].join('\n'),
          },
        ];
      case 'tao_phieu_hoc_tap':
        return [
          ...baseSections,
          {
            heading: 'V. MẪU PHIẾU HỌC TẬP (IN A4 PHÁT TRÊN LỚP)',
            body: [
              `PHIẾU HỌC TẬP MÔN ${subjectName.toUpperCase()} (${gradeLabel.toUpperCase()})`,
              `Họ và tên: .................................................. Lớp: ${classProfile?.className || '..........'}`,
              `Bài học: ${topic}`,
              '',
              `Câu 1 (Khởi động, 3 phút): Điền nội dung còn thiếu vào chỗ trống:`,
              `....................................................................................................................`,
              `Câu 2 (Thực hành trọng tâm, 10 phút): Giải bài tập sau và trình bày các bước thực hiện:`,
              `....................................................................................................................`,
              `....................................................................................................................`,
              `Câu 3 (Tự chọn theo khả năng, 7 phút): Học sinh chọn 1 trong 2 ý:`,
              `Ý A (Cơ bản): Làm bài tập tương tự ví dụ mẫu trên bảng.`,
              `Ý B (Nâng cao): Liên hệ thực tế với môn ${linkedNodes[0]?.node.subjectName || 'đời sống'} để giải thích hiện tượng.`,
            ].join('\n'),
          },
        ];
      case 'song_ngu_anh_viet':
        return [
          ...baseSections,
          {
            heading: 'V. TỪ VỰNG & MẪU CÂU TIẾNG ANH TRONG BÀI',
            body: [
              `1. Mức độ Tiếng Anh của lớp: ${classProfile?.englishProficiencyLevel || 'A2 đến B1'}.`,
              `2. Từ vựng chính liên quan đến bài "${topic}":`,
              `   Concept / Topic: Chủ đề bài học`,
              `   Data & Example: Số liệu và Ví dụ minh họa`,
              `   Conclusion: Kết luận trọng tâm`,
              `3. Câu hỏi gợi ý song ngữ trên lớp:`,
              `   Giáo viên: "Can anyone give a real-life example of this topic?"`,
              `   Học sinh: "In my opinion, we can see this in..."`,
            ].join('\n'),
          },
        ];
      case 'them_hoat_dong_vui_ve':
        return [
          ...baseSections,
          {
            heading: 'V. TRÒ CHƠI KHỞI ĐỘNG ĐẦU GIỜ (5 PHÚT)',
            body: [
              `1. Tên hoạt động: Tiếp sức nhanh bài "${topic}"`,
              `2. Cách tổ chức: Chia lớp thành 3 dãy bàn. Trong 3 phút, mỗi dãy cử đại diện lên bảng viết nhanh các ví dụ hoặc từ khóa liên quan đến chủ đề bài học.`,
              `3. Tổng kết: Giáo viên chữa nhanh trên bảng, khen thưởng đội viết đúng nhiều nhất và dẫn trực tiếp vào nội dung bài mới.`,
            ].join('\n'),
          },
        ];
    }
  }

  return baseSections;
}

export const answerPedagogicalAssistant = async (params: {
  question: string;
  currentResource?: GeneratedResource;
  classProfile?: ClassProfile;
  primaryNode?: KnowledgeNode;
}): Promise<{
  reply: string;
  suggestions: string[];
  mode: 'llm_live' | 'smart_template';
}> => {
  const { question, currentResource, classProfile, primaryNode } = params;

  const systemPrompt = [
    `Bạn là giáo viên có kinh nghiệm hỗ trợ chuyên môn tại Trường Việt Anh.`,
    `Trả lời ngắn gọn, rõ ràng, đúng chuẩn Công văn 5512 và Thông tư 22/27 của Bộ GD&ĐT.`,
    `TUYỆT ĐỐI KHÔNG dùng dấu sao (*, **), dấu gạch ngang đầu dòng (-), hay ký hiệu Markdown. Chỉ dùng đánh số 1., 2., a), b) sạch sẽ.`,
  ].join('\n');

  const contextLines = [
    classProfile
      ? `Lớp: ${classProfile.className} (${classProfile.campus}, ${classProfile.studentCount} HS).`
      : '',
    primaryNode
      ? `Bài học: ${primaryNode.title} (${primaryNode.subjectName} Khối ${primaryNode.grade})`
      : '',
    currentResource ? `Tài liệu đang xem: ${currentResource.title}` : '',
    `Câu hỏi: ${question}`,
  ]
    .filter(Boolean)
    .join('\n');

  const live = await callLiveLlm(systemPrompt, contextLines);
  if (live.ok && live.content) {
    return {
      reply: cleanPedagogicalText(live.content),
      suggestions: [
        'Gợi ý 3 câu hỏi kiểm tra nhanh cuối bài',
        'Cách hướng dẫn nhóm học sinh chậm hiểu trong lớp',
        'Gợi ý liên hệ thực tế cho bài học này',
      ],
      mode: 'llm_live',
    };
  }

  const reply = [
    `Về nội dung thầy/cô hỏi ("${question}"), gợi ý triển khai trên lớp như sau:`,
    '',
    `1. Cách tổ chức hoạt động trên lớp:`,
    classProfile
      ? `Với lớp ${classProfile.className} (${classProfile.studentCount} học sinh, khả năng tập trung khoảng ${classProfile.attentionSpanMinutes} phút), thầy/cô nên chia tiết học thành các hoạt động ngắn 10 đến 15 phút thay vì giảng liền mạch.`
      : `Chia tiết học thành các bước ngắn: Nêu tình huống mở đầu (5 phút), Học sinh làm việc theo cặp (15 phút), Chữa bài và chốt kiến thức (15 phút).`,
    primaryNode
      ? `Bám sát yêu cầu của bài "${primaryNode.title}": ${primaryNode.moetRequiredOutcomes[0] ?? ''}`
      : '',
    '',
    `2. Giao bài tập theo nhóm học sinh:`,
    classProfile
      ? `a) Nhóm Cơ bản (${classProfile.groups.find((g) => g.tier === 'co_ban')?.count ?? 0} em): Làm bài theo mẫu có sẵn trên bảng${classProfile.specialSupportStudents.length > 0 ? `, lưu ý kèm thêm cho mã HS ${classProfile.specialSupportStudents.map((s) => s.studentCode).join(', ')}` : ''}.\nb) Nhóm Đạt chuẩn (${classProfile.groups.find((g) => g.tier === 'chuan')?.count ?? 0} em): Làm bài tập trọng tâm trong SGK.\nc) Nhóm Khá giỏi (${classProfile.groups.find((g) => g.tier === 'nang_cao')?.count ?? 0} em): Thêm 1 câu hỏi vận dụng thực tế.`
      : `a) Nhóm Cơ bản: Có bài mẫu hướng dẫn bước đầu.\nb) Nhóm Đạt chuẩn: Hoàn thành bài tập trọng tâm.\nc) Nhóm Khá giỏi: Mở rộng câu hỏi thực tế.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    reply: cleanPedagogicalText(reply),
    suggestions: [
      'Gợi ý hoạt động đầu giờ 5 phút dễ tổ chức',
      'Cách chia bài tập cho học sinh hay mất tập trung',
      'Gợi ý liên hệ bài học này với môn khác',
    ],
    mode: 'smart_template',
  };
};
