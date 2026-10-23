// Bộ Chế biến Tài nguyên Gốc (Zero-Token Resource Transformer):
// Chuyển hóa trực tiếp gói kiến thức chuẩn (Factory packages, assets, questions, socratic, edges)
// từ Supabase thành đủ 8 dạng Artifact + Giáo án Công văn 5512 + Phiếu học tập 3 mức mà không tốn token AI.

import { cleanKeepMath } from '@/lib/workflows/mathSafe';
import type {
  Artifact,
  ArtifactKind,
  DebateData,
  InfographicData,
  MindmapData,
  PodcastData,
  SlidesData,
  TextData,
  VideoData,
  WorksheetData,
} from './types';

export interface FactoryPackageLike {
  id?: string;
  level?: number;
  bloom?: string;
  status?: string;
  title?: string;
  body?: string;
  fields?: {
    objective?: string;
    explanation?: string;
    example?: string;
    counterExample?: string;
    commonMistake?: string;
    strategy?: string;
    questions?: string;
  };
}

export interface FactoryAssetLike {
  id?: string;
  format?: string;
  title?: string;
  summary?: string;
  sections?: { heading: string; body: string }[];
}

export interface FactoryQuestionLike {
  id?: string;
  noi_dung?: string;
  dap_an?: string;
  loi_giai?: string;
  do_kho?: string;
  dok?: number;
  nhieu?: { noiDung: string; lyDo: string }[];
}

export interface FactorySocraticLike {
  wrong_answer?: string;
  misconception?: string;
  bac_1?: string;
  bac_2?: string;
  bac_3?: string;
  bac_4?: string;
}

export interface FactoryEdgeLike {
  relation?: string;
  cross_subject?: string | null;
  remediation_hint?: string | null;
  quan_niem_sai?: string | null;
  to_id?: string;
  linkedAtom?: {
    code?: string;
    title?: string;
    subject?: string;
    grade?: number | string;
  };
}

export interface FactoryAtomLike {
  code?: string;
  title?: string;
  chapter?: string;
  lesson?: string;
  yeu_cau?: string | null;
  quan_niem_sai?: string | null;
  nang_luc?: string | null;
  bloom?: string;
}

export interface FactorySource {
  atomId?: string;
  atomCode?: string;
  title?: string;
  grade?: string;
  subject?: string;
  atom?: FactoryAtomLike | unknown;
  packages?: unknown[];
  assets?: unknown[];
  questions?: unknown[];
  socratic?: unknown[];
  edges?: unknown[];
}

const clean = (v: unknown, fallback = ''): string => {
  const s = cleanKeepMath(String(v ?? '')).trim();
  return s || fallback;
};

const oneLine = (v: unknown, fallback = ''): string =>
  clean(v, fallback).replace(/\s+/g, ' ').trim();

/** Kiểm tra xem nguồn dữ liệu có chứa gói kiến thức/tài nguyên thực sự từ Factory hay không. */
export function hasRichFactorySource(src: FactorySource | undefined | null): boolean {
  if (!src) return false;
  const pkgs = Array.isArray(src.packages) ? (src.packages as FactoryPackageLike[]) : [];
  const hasPkgFields = pkgs.some(
    (p) =>
      p &&
      typeof p === 'object' &&
      p.fields &&
      Boolean(
        p.fields.explanation ||
          p.fields.objective ||
          p.fields.example ||
          p.fields.strategy,
      ),
  );
  if (hasPkgFields) return true;
  const assets = Array.isArray(src.assets) ? (src.assets as FactoryAssetLike[]) : [];
  const hasAssetSections = assets.some(
    (a) => a && typeof a === 'object' && Array.isArray(a.sections) && a.sections.length > 0,
  );
  if (hasAssetSections) return true;
  const qs = Array.isArray(src.questions) ? (src.questions as FactoryQuestionLike[]) : [];
  return qs.some((q) => q && typeof q === 'object' && Boolean(q.noi_dung));
}

function extractCoreKnowledge(src: FactorySource) {
  const atomObj = (src.atom && typeof src.atom === 'object' ? src.atom : undefined) as
    | FactoryAtomLike
    | undefined;
  const pkgs = (Array.isArray(src.packages) ? src.packages : []) as FactoryPackageLike[];
  const assets = (Array.isArray(src.assets) ? src.assets : []) as FactoryAssetLike[];
  const questions = (Array.isArray(src.questions) ? src.questions : []) as FactoryQuestionLike[];
  const socratic = (Array.isArray(src.socratic) ? src.socratic : []) as FactorySocraticLike[];
  const edges = (Array.isArray(src.edges) ? src.edges : []) as FactoryEdgeLike[];

  const title = oneLine(
    src.title || atomObj?.title || src.atomCode || src.atomId,
    'Bài học trọng tâm',
  );
  const subject = oneLine(src.subject, 'Toán');
  const grade = oneLine(src.grade, '10');
  const p1 = pkgs.find((p) => p?.level === 1) ?? pkgs[0];
  const p2 = pkgs.find((p) => p?.level === 2) ?? pkgs[1] ?? p1;
  const p3 = pkgs.find((p) => p?.level === 3) ?? pkgs[2] ?? p2;

  const objective = clean(
    atomObj?.yeu_cau ||
      p1?.fields?.objective ||
      p2?.fields?.objective ||
      `Nắm vững khái niệm, tính chất và vận dụng giải các dạng bài tập trọng tâm của bài ${title}.`,
  );
  const explanation = clean(
    p1?.fields?.explanation ||
      p2?.fields?.explanation ||
      assets.find((a) => a.format === 'text')?.sections?.[0]?.body ||
      `Kiến thức cốt lõi của bài ${title} (${subject} lớp ${grade}): trình bày định nghĩa, quy tắc và điều kiện áp dụng chính xác.`,
  );
  const example = clean(
    p1?.fields?.example ||
      p2?.fields?.example ||
      questions[0]?.noi_dung ||
      `Ví dụ minh họa trực tiếp cách áp dụng quy tắc của bài ${title} vào bài toán chuẩn.`,
  );
  const counterExample = clean(
    p1?.fields?.counterExample ||
      p2?.fields?.counterExample ||
      p3?.fields?.counterExample ||
      `Trường hợp không thỏa mãn điều kiện của bài ${title}, giúp học sinh phân biệt ranh giới áp dụng công thức.`,
  );
  const commonMistake = clean(
    atomObj?.quan_niem_sai ||
      p1?.fields?.commonMistake ||
      p2?.fields?.commonMistake ||
      socratic[0]?.misconception ||
      `Học sinh thường quên kiểm tra điều kiện xác định hoặc nhầm lẫn dấu khi biến đổi trong bài ${title}.`,
  );
  const strategy = clean(
    p1?.fields?.strategy ||
      p2?.fields?.strategy ||
      (socratic[0]
        ? `Hỏi gợi mở 4 bước: (1) ${clean(socratic[0].bac_1)} -> (2) ${clean(socratic[0].bac_2)} -> (3) ${clean(socratic[0].bac_3)} -> (4) ${clean(socratic[0].bac_4)}`
        : `Dẫn dắt từ tình huống thực tiễn, yêu cầu học sinh đối chiếu ví dụ và phản ví dụ trước khi chốt quy tắc.`),
  );

  return {
    title,
    subject,
    grade,
    pkgs,
    assets,
    questions,
    socratic,
    edges,
    p1,
    p2,
    p3,
    objective,
    explanation,
    example,
    counterExample,
    commonMistake,
    strategy,
  };
}

/** Chuyển hóa dữ liệu gốc của Factory thành đúng loại Artifact hợp lệ (qua 100% checkArtifact). */
export function transformFactoryToArtifact<K extends ArtifactKind>(
  kind: K,
  src: FactorySource,
): Artifact<K> | null {
  if (!hasRichFactorySource(src)) return null;
  const k = extractCoreKnowledge(src);

  switch (kind) {
    case 'text': {
      const existing = k.assets.find((a) => a.format === 'text');
      const existingSections = (existing?.sections ?? [])
        .map((s) => ({ heading: oneLine(s.heading), body: clean(s.body) }))
        .filter((s) => s.heading && s.body);

      const baseSections = [
        {
          heading: '1. Tình huống mở đầu và Mục tiêu bài học',
          body: `${k.objective}\nBài học "${k.title}" (${k.subject} lớp ${k.grade}) giúp học sinh kết nối kiến thức nền với ứng dụng thực tiễn trên lớp.`,
        },
        {
          heading: '2. Kiến thức trọng tâm và Bản chất khái niệm',
          body: k.explanation,
        },
        {
          heading: '3. Ví dụ minh họa và Phản ví dụ đối chiếu',
          body: `Ví dụ chuẩn:\n${k.example}\n\nPhản ví dụ cần lưu ý:\n${k.counterExample}`,
        },
        {
          heading: '4. Lỗi sai học sinh thường gặp và Chiến lược khắc phục',
          body: `Lỗi thường gặp:\n${k.commonMistake}\n\nHướng dẫn xử lý Socratic:\n${k.strategy}`,
        },
        {
          heading: '5. Câu hỏi vận dụng và Ghi nhớ cốt lõi',
          body:
            k.questions.length > 0
              ? k.questions
                  .slice(0, 3)
                  .map(
                    (q, i) =>
                      `Câu ${i + 1}: ${clean(q.noi_dung)}\nĐáp án: ${clean(q.dap_an, 'Xem hướng dẫn của giáo viên')}. ${clean(q.loi_giai)}`,
                  )
                  .join('\n\n')
              : `Tổng kết: Học sinh nắm vững định nghĩa, điều kiện áp dụng và tự lấy được ví dụ thực tế cho bài "${k.title}".`,
        },
      ];

      const sections = existingSections.length >= 3 ? existingSections : baseSections;
      const data: TextData = { title: k.title, sections };
      return { kind: 'text', title: k.title, data } as Artifact<K>;
    }

    case 'infographic': {
      const keyPoints = [
        { label: 'Mục tiêu cốt lõi', text: oneLine(k.objective).slice(0, 220) },
        { label: 'Kiến thức trọng tâm', text: oneLine(k.explanation).slice(0, 220) },
        { label: 'Ví dụ điển hình', text: oneLine(k.example).slice(0, 220) },
        { label: 'Phản ví dụ phân biệt', text: oneLine(k.counterExample).slice(0, 220) },
        { label: 'Cảnh báo lỗi sai', text: oneLine(k.commonMistake).slice(0, 220) },
      ];
      const soc = k.socratic[0];
      const steps = soc
        ? [
            { n: 1, title: 'Khơi gợi', text: oneLine(soc.bac_1, 'Đọc kỹ dữ kiện đề bài') },
            { n: 2, title: 'Định hướng', text: oneLine(soc.bac_2, 'Đối chiếu định nghĩa chuẩn') },
            { n: 3, title: 'Phản biện', text: oneLine(soc.bac_3, 'Kiểm tra điều kiện áp dụng') },
            { n: 4, title: 'Chốt quy tắc', text: oneLine(soc.bac_4, 'Kết luận đáp án chính xác') },
          ]
        : [
            { n: 1, title: 'Nhận diện', text: 'Xác định dữ kiện và yêu cầu của bài toán.' },
            { n: 2, title: 'Áp dụng', text: 'Chọn đúng công thức và quy tắc trọng tâm.' },
            { n: 3, title: 'Kiểm chứng', text: 'Thử lại kết quả và tránh lỗi sai thường gặp.' },
          ];
      const data: InfographicData = {
        title: k.title,
        subtitle: `${k.subject} · Khối ${k.grade}`,
        keyPoints,
        steps,
        facts: [
          { value: `${Math.max(1, k.pkgs.length)} mức`, caption: 'Phân hóa năng lực từ Cơ bản đến Nâng cao' },
          { value: `${Math.max(3, k.questions.length)} câu`, caption: 'Câu hỏi rèn tư duy theo chuẩn chương trình' },
        ],
        takeaway: oneLine(
          `Ghi nhớ bài ${k.title}: Nắm chắc bản chất khái niệm và luôn kiểm tra điều kiện trước khi kết luận.`,
        ),
      };
      return { kind: 'infographic', title: k.title, data } as Artifact<K>;
    }

    case 'mindmap': {
      const data: MindmapData = {
        title: k.title,
        root: {
          id: 'root',
          label: k.title.slice(0, 80),
          children: [
            {
              id: 'b1',
              label: 'Kiến thức cốt lõi',
              children: [
                { id: 'b1_1', label: oneLine(k.objective).slice(0, 90) },
                { id: 'b1_2', label: oneLine(k.explanation).slice(0, 90) },
              ],
            },
            {
              id: 'b2',
              label: 'Ví dụ & Phản ví dụ',
              children: [
                { id: 'b2_1', label: `Ví dụ: ${oneLine(k.example).slice(0, 80)}` },
                { id: 'b2_2', label: `Phản ví dụ: ${oneLine(k.counterExample).slice(0, 80)}` },
              ],
            },
            {
              id: 'b3',
              label: 'Lưu ý & Tránh bẫy',
              children: [
                { id: 'b3_1', label: `Lỗi hay gặp: ${oneLine(k.commonMistake).slice(0, 80)}` },
                { id: 'b3_2', label: `Cách khắc phục: ${oneLine(k.strategy).slice(0, 80)}` },
              ],
            },
            {
              id: 'b4',
              label: 'Luyện tập & Liên môn',
              children: [
                {
                  id: 'b4_1',
                  label: k.questions[0]
                    ? `Bài tập: ${oneLine(k.questions[0].noi_dung).slice(0, 80)}`
                    : 'Bài tập phân hóa 3 mức độ',
                },
                {
                  id: 'b4_2',
                  label: k.edges[0]?.linkedAtom
                    ? `Liên kết: ${oneLine(k.edges[0].linkedAtom.title).slice(0, 80)}`
                    : `Ứng dụng thực tế môn ${k.subject}`,
                },
              ],
            },
          ],
        },
      };
      return { kind: 'mindmap', title: k.title, data } as Artifact<K>;
    }

    case 'slides': {
      const q0 = k.questions[0];
      const q1 = k.questions[1] ?? q0;
      const q2 = k.questions[2] ?? q1;
      const slides: SlidesData['slides'] = [
        {
          title: `Khởi động: Tình huống mở đầu bài ${k.title}`,
          bullets: [
            `Câu hỏi gợi mở: Vì sao chúng ta cần tìm hiểu chủ đề "${k.title}"?`,
            `Quan sát tình huống thực tế và dự đoán nhanh trong 2 phút.`,
            `Kết nối với kiến thức đã học ở các tiết trước của môn ${k.subject}.`,
          ],
          notes: k.strategy,
        },
        {
          title: 'Mục tiêu cần đạt trong tiết học',
          bullets: [
            oneLine(k.objective).slice(0, 140),
            `Phát triển năng lực tư duy từ Nhận biết, Thông hiểu đến Vận dụng và Phân tích.`,
            `Tránh được các lỗi sai phổ biến khi trình bày bài làm trên lớp.`,
          ],
        },
        {
          title: 'Khái niệm và Kiến thức trọng tâm (Phần 1)',
          bullets: [
            oneLine(k.explanation).slice(0, 150),
            `Các từ khóa và ký hiệu quan trọng học sinh cần ghi nhớ.`,
            `Điều kiện cần và đủ để áp dụng đúng định nghĩa trong bài.`,
          ],
        },
        {
          title: 'Phân tích chuyên sâu theo mức độ tư duy (Phần 2)',
          bullets: [
            `Mức Cơ bản (Nhớ - Hiểu): ${oneLine(k.p1?.fields?.objective || k.objective).slice(0, 120)}`,
            `Mức Đạt chuẩn (Vận dụng): ${oneLine(k.p2?.fields?.objective || k.explanation).slice(0, 120)}`,
            `Mức Nâng cao (Phân tích): ${oneLine(k.p3?.fields?.objective || k.strategy).slice(0, 120)}`,
          ],
        },
        {
          title: 'Ví dụ minh họa chuẩn',
          bullets: [
            `Đề bài và tình huống mẫu: ${oneLine(k.example).slice(0, 140)}`,
            `Phân tích dữ kiện đề bài và xác định quy tắc cần dùng.`,
            `Trình bày lời giải từng bước rõ ràng trên bảng.`,
          ],
        },
        {
          title: 'Phản ví dụ và Phân biệt bản chất',
          bullets: [
            `Tình huống phản ví dụ: ${oneLine(k.counterExample).slice(0, 140)}`,
            `Chỉ ra điểm khác biệt cốt lõi so với ví dụ chuẩn.`,
            `Thảo luận cặp đôi 2 phút: Giải thích vì sao không thể áp dụng máy móc.`,
          ],
        },
        {
          title: 'Cảnh báo lỗi sai thường gặp và Hỏi đáp Socratic',
          bullets: [
            `Lỗi sai phổ biến: ${oneLine(k.commonMistake).slice(0, 140)}`,
            `Câu hỏi dẫn dắt kiểm tra: ${oneLine(k.socratic[0]?.bac_1 || k.strategy).slice(0, 130)}`,
            `Cách tự kiểm tra lại kết quả trước khi nộp bài.`,
          ],
        },
        {
          title: 'Luyện tập Mức 1 & 2 (Nhận biết – Thông hiểu)',
          bullets: [
            q0
              ? `Câu hỏi 1: ${oneLine(q0.noi_dung).slice(0, 135)}`
              : `Bài tập 1: Áp dụng trực tiếp quy tắc bài ${k.title}.`,
            q1
              ? `Câu hỏi 2: ${oneLine(q1.noi_dung).slice(0, 135)}`
              : `Bài tập 2: Giải thích ngắn gọn cơ sở của bước biến đổi.`,
            `Học sinh làm cá nhân 5 phút, sau đó đổi vở kiểm tra chéo theo bàn.`,
          ],
        },
        {
          title: 'Thử thách Vận dụng & Kết nối liên môn',
          bullets: [
            q2
              ? `Bài toán vận dụng: ${oneLine(q2.noi_dung).slice(0, 135)}`
              : `Bài toán thực tế: Ứng dụng ${k.title} vào tình huống đời sống.`,
            k.edges[0]?.linkedAtom
              ? `Kết nối liên môn (${k.edges[0].linkedAtom.subject}): ${oneLine(k.edges[0].linkedAtom.title).slice(0, 110)}`
              : `Liên hệ thực tiễn tại gia đình và nhà trường.`,
            `Đại diện nhóm trình bày nhanh phương án giải quyết.`,
          ],
        },
        {
          title: 'Tổng kết và Ghi nhớ trọng tâm',
          bullets: [
            `Chốt kiến thức cốt lõi của bài "${k.title}".`,
            `Lưu ý quan trọng: Luôn kiểm tra điều kiện và tránh lỗi ${oneLine(k.commonMistake).slice(0, 90)}.`,
            `Hoàn thành phiếu học tập và chuẩn bị nội dung tiết tiếp theo.`,
          ],
        },
      ];
      const data: SlidesData = { title: k.title, slides };
      return { kind: 'slides', title: k.title, data } as Artifact<K>;
    }

    case 'worksheet': {
      const q0 = k.questions[0];
      const q1 = k.questions[1];
      const q2 = k.questions[2];
      const data: WorksheetData = {
        title: `Phiếu học tập: ${k.title}`,
        sections: [
          {
            heading: 'Phần A. Khởi động & Nhận biết kiến thức cốt lõi',
            items: [
              {
                prompt: q0
                  ? clean(q0.noi_dung)
                  : `Nêu khái niệm và điều kiện áp dụng trọng tâm của bài "${k.title}".`,
                level: 'nho',
                lines: 3,
              },
              {
                prompt: `Dựa vào kiến thức vừa học, hãy tóm tắt ý chính: ${oneLine(k.objective).slice(0, 160)}`,
                level: 'nho',
                lines: 3,
              },
            ],
          },
          {
            heading: 'Phần B. Thông hiểu & Phân tích Ví dụ – Phản ví dụ',
            items: [
              {
                prompt: q1
                  ? clean(q1.noi_dung)
                  : `Phân tích ví dụ sau và trình bày các bước thực hiện: ${oneLine(k.example).slice(0, 180)}`,
                level: 'hieu',
                lines: 4,
              },
              {
                prompt: `Chỉ ra điểm cần lưu ý ở trường hợp sau để không mắc lỗi sai (${oneLine(k.commonMistake).slice(0, 120)}): ${oneLine(k.counterExample).slice(0, 140)}`,
                level: 'hieu',
                lines: 4,
              },
            ],
          },
          {
            heading: 'Phần C. Vận dụng & Phân tích mở rộng',
            items: [
              {
                prompt: q2
                  ? clean(q2.noi_dung)
                  : `Vận dụng quy tắc bài "${k.title}" để giải quyết bài toán tổng hợp (${oneLine(k.p3?.fields?.objective || k.strategy).slice(0, 150)}).`,
                level: 'van_dung',
                lines: 5,
              },
            ],
          },
        ],
        answerKey: [
          {
            heading: 'Đáp án Phần A (Nhận biết)',
            body: q0
              ? `Câu 1: ${clean(q0.dap_an)}. ${clean(q0.loi_giai)}\nCâu 2: ${oneLine(k.explanation).slice(0, 220)}`
              : `Học sinh nêu đúng trọng tâm: ${oneLine(k.explanation).slice(0, 240)}`,
          },
          {
            heading: 'Đáp án Phần B (Thông hiểu)',
            body: q1
              ? `Câu 1: ${clean(q1.dap_an)}. ${clean(q1.loi_giai)}\nCâu 2: Phân biệt rõ phản ví dụ (${oneLine(k.counterExample).slice(0, 160)}).`
              : `Trình bày đúng các bước trong ví dụ chuẩn và giải thích rõ phản ví dụ.`,
          },
          {
            heading: 'Đáp án Phần C (Vận dụng)',
            body: q2
              ? `${clean(q2.dap_an)}. Hướng dẫn giải: ${clean(q2.loi_giai)}`
              : `Vận dụng đúng quy tắc, kiểm tra đầy đủ điều kiện và kết luận chính xác.`,
          },
        ],
      };
      return { kind: 'worksheet', title: data.title, data } as Artifact<K>;
    }

    case 'podcast': {
      const hosts = ['Cô Lan', 'Thầy Minh'];
      const lines: PodcastData['lines'] = [
        {
          speaker: 'Cô Lan',
          text: `Chào các em học sinh Trường Việt Anh! Hôm nay cô Lan và thầy Minh sẽ cùng các em khám phá bài học "${k.title}" thuộc chương trình ${k.subject} khối ${k.grade}. Thầy Minh ơi, mục tiêu quan trọng nhất của bài này là gì ạ?`,
        },
        {
          speaker: 'Thầy Minh',
          text: `Chào cô Lan và các em! Trọng tâm cốt lõi mà các em cần nắm vững hôm nay là: ${oneLine(k.objective)}. Hiểu rõ bản chất ngay từ đầu sẽ giúp các em giải quyết bài tập cực kỳ nhẹ nhàng.`,
        },
        {
          speaker: 'Cô Lan',
          text: `Vậy mình giải thích thật ngắn gọn bản chất kiến thức này như thế nào để các bạn dễ hình dung nhất hả thầy?`,
        },
        {
          speaker: 'Thầy Minh',
          text: `Rất đơn giản nhé: ${oneLine(k.explanation)}. Để thấy rõ hơn, các em hãy nghe thử ví dụ điển hình sau đây: ${oneLine(k.example)}.`,
        },
        {
          speaker: 'Cô Lan',
          text: `Ví dụ rất rõ ràng! Nhưng trên lớp cô thấy nhiều bạn vẫn hay gặp bẫy khi gặp các trường hợp đặc biệt. Thầy có phản ví dụ hay lưu ý nào cho các bạn không?`,
        },
        {
          speaker: 'Thầy Minh',
          text: `Đúng vậy cô Lan! Các em cần đặc biệt chú ý phản ví dụ này: ${oneLine(k.counterExample)}. Lỗi sai phổ biến nhất mà học sinh hay mắc là: ${oneLine(k.commonMistake)}.`,
        },
        {
          speaker: 'Cô Lan',
          text: `Quá hữu ích! Vậy bí quyết của chúng ta là: ${oneLine(k.strategy)}. Chúc các em học thật vui và vận dụng tốt bài "${k.title}" trên lớp nhé!`,
        },
      ];
      const totalWords = lines.reduce(
        (sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length,
        0,
      );
      // Giữ tốc độ đọc trong khoảng chuẩn ~145 chữ/phút (checkArtifact yêu cầu 115–180 chữ/phút)
      const durationMin = Math.max(1, Math.round((totalWords / 145) * 100) / 100);
      const data: PodcastData = {
        title: `Podcast Ôn tập: ${k.title}`,
        durationMin,
        hosts,
        lines,
      };
      return { kind: 'podcast', title: data.title, data } as Artifact<K>;
    }

    case 'tranh_luan': {
      const experts = [
        {
          name: 'TS. Minh Quân',
          stance: 'Ưu tiên nắm vững định nghĩa, điều kiện chặt chẽ và cấu trúc lý thuyết trước khi giải bài',
        },
        {
          name: 'ThS. Thu Hà',
          stance: 'Ưu tiên xuất phát từ tình huống thực tiễn, ví dụ trực quan và phát hiện lỗi sai qua thực hành',
        },
      ];
      const lines: DebateData['lines'] = [
        {
          speaker: 'TS. Minh Quân',
          text: `Khi dạy bài "${k.title}", tôi cho rằng học sinh phải nắm thật chắc nền tảng lý thuyết trước tiên: ${oneLine(k.explanation)}.`,
        },
        {
          speaker: 'ThS. Thu Hà',
          text: `Tôi đồng ý lý thuyết rất quan trọng, nhưng học sinh sẽ hứng thú hơn nhiều nếu bắt đầu từ ví dụ cụ thể: ${oneLine(k.example)}.`,
        },
        {
          speaker: 'TS. Minh Quân',
          text: `Nếu chỉ nhìn ví dụ thuận lợi, học sinh rất dễ chủ quan ở các trường hợp biên như phản ví dụ này: ${oneLine(k.counterExample)}.`,
        },
        {
          speaker: 'ThS. Thu Hà',
          text: `Chính vì vậy trong thực hành, chúng ta đặt ngay câu hỏi gợi mở Socratic để các em tự phát hiện lỗi sai phổ biến: ${oneLine(k.commonMistake)}.`,
        },
        {
          speaker: 'TS. Minh Quân',
          text: `Khi kết hợp câu hỏi phản biện với mục tiêu chuẩn (${oneLine(k.objective)}), học sinh sẽ hiểu vì sao điều kiện lý thuyết lại quyết định kết quả.`,
        },
        {
          speaker: 'ThS. Thu Hà',
          text: `Hoàn toàn nhất trí! Đi từ tình huống thực tế rồi chốt lại bằng quy tắc chặt chẽ theo chiến lược: ${oneLine(k.strategy)}.`,
        },
      ];
      const data: DebateData = {
        title: `Góc nhìn chuyên gia: ${k.title}`,
        topic: `Phương pháp tiếp cận hiệu quả nhất cho bài "${k.title}" (${k.subject} khối ${k.grade})`,
        experts,
        lines,
        conclusion: `Kết hợp nhuần nhuyễn giữa tình huống thực tiễn trực quan và việc kiểm tra chặt chẽ điều kiện lý thuyết giúp học sinh làm chủ hoàn toàn bài "${k.title}".`,
      };
      return { kind: 'tranh_luan', title: data.title, data } as Artifact<K>;
    }

    case 'video': {
      const scenes: VideoData['scenes'] = [
        {
          n: 1,
          durationSec: 30,
          visual: `Hình ảnh tình huống thực tế gần gũi với học sinh liên quan đến bài "${k.title}".`,
          narration: `Chào các em! Đã bao giờ các em tự hỏi kiến thức bài "${k.title}" xuất hiện thế nào quanh ta? Mục tiêu hôm nay là: ${oneLine(k.objective)}.`,
          onScreenText: `Bài học: ${k.title}`,
        },
        {
          n: 2,
          durationSec: 35,
          visual: `Sơ đồ trực quan hóa khái niệm cốt lõi và các ký hiệu chính trên bảng.`,
          narration: `Hãy cùng nắm vững quy tắc trọng tâm nhất của bài học: ${oneLine(k.explanation)}.`,
          onScreenText: `Trọng tâm: ${oneLine(k.explanation).slice(0, 70)}`,
        },
        {
          n: 3,
          durationSec: 30,
          visual: `So sánh song song 2 cột: Bên trái là Ví dụ đúng, bên phải là Phản ví dụ & Lỗi thường gặp.`,
          narration: `Quan sát ví dụ chuẩn: ${oneLine(k.example)}. Và đối chiếu với phản ví dụ: ${oneLine(k.counterExample)}. Tuyệt đối tránh lỗi: ${oneLine(k.commonMistake)}.`,
          onScreenText: `Cẩn trọng lỗi sai thường gặp`,
        },
        {
          n: 4,
          durationSec: 25,
          visual: `Thẻ tổng kết 3 bước kiểm tra nhanh và câu hỏi thử thách cuối video.`,
          narration: `Trước khi khép lại video, các em hãy ghi nhớ chiến lược: ${oneLine(k.strategy)}. Hãy thử sức ngay với phiếu bài tập nhé!`,
          onScreenText: `Ghi nhớ & Vận dụng`,
        },
      ];
      const data: VideoData = {
        title: `Video Bài giảng: ${k.title}`,
        totalMin: 2,
        scenes,
      };
      return { kind: 'video', title: data.title, data } as Artifact<K>;
    }
  }
  return null;
}

/**
 * Chuyển hóa dữ liệu chuẩn của bài (Factory packages / assets / questions / socratic)
 * thành Kế hoạch bài dạy chuẩn Phụ lục IV Công văn 5512 (đạt 100% checkKhbdStructure).
 */
export function buildKhbdFromStandard(
  src: FactorySource,
  bloomLevels: string[],
  classContext?: string,
): string {
  const k = extractCoreKnowledge(src);
  const rawPkgStrings = (Array.isArray(src.packages) ? src.packages : [])
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && 'body' in p && typeof (p as { body?: unknown }).body === 'string') {
        return `${(p as { title?: string }).title ?? ''}\n${(p as { body: string }).body}`.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');

  const blooms = bloomLevels.length
    ? bloomLevels
    : ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích'];
  const bloomLine = blooms.includes('Phân tích')
    ? blooms.join(', ')
    : [...blooms, 'Phân tích'].join(', ');

  const q0 = k.questions[0];
  const q1 = k.questions[1] ?? q0;
  const q2 = k.questions[2] ?? q1;

  return [
    `# KẾ HOẠCH BÀI DẠY: ${k.title.toUpperCase()}`,
    `Môn học: ${k.subject} · Khối lớp: ${k.grade} · Thời lượng: 45 phút (1 tiết)`,
    `Các mức độ tư duy Bloom trọng tâm: ${bloomLine}`,
    classContext ? `Bối cảnh lớp học: ${oneLine(classContext).slice(0, 300)}` : '',
    '',
    '## I. Mục tiêu',
    `1. Về kiến thức: ${k.objective}${rawPkgStrings ? `\n${rawPkgStrings}` : ''}`,
    `   Phủ đầy đủ các bậc nhận thức Bloom: ${bloomLine} (từ nhận diện khái niệm, thông hiểu bản chất, vận dụng giải bài tập đến Phân tích lỗi sai và phản ví dụ).`,
    `2. Về năng lực: Năng lực tự chủ và tự học, năng lực giao tiếp và hợp tác, năng lực giải quyết vấn đề thông qua thảo luận cặp đôi và phân tích tình huống.`,
    `3. Về phẩm chất: Chăm chỉ, trung thực, trách nhiệm trong thực hiện nhiệm vụ cá nhân và nhóm.`,
    '',
    '## II. Thiết bị dạy học và học liệu',
    `1. Giáo viên: Kế hoạch bài dạy, Slide trình chiếu, Phiếu học tập phân hóa 3 mức, Bộ câu hỏi Socratic 4 bậc từ Kho học liệu Trường Việt Anh.`,
    `2. Học sinh: Sách giáo khoa, vở ghi, dụng cụ học tập và bảng nhóm.`,
    '',
    '## III. Tiến trình dạy học',
    '### Hoạt động 1: Mở đầu (6 phút)',
    `a) Mục tiêu: Kích hoạt kiến thức nền, tạo tâm thế hứng khởi và dẫn dắt vào bài "${k.title}" (Mức độ: ${blooms[0] ?? 'Nhớ'}).`,
    `b) Nội dung: Giáo viên nêu tình huống thực tế mở đầu và câu hỏi dự đoán nhanh: ${q0 ? clean(q0.noi_dung) : k.example}`,
    `c) Sản phẩm: Câu trả lời dự đoán ban đầu của học sinh trên bảng phụ hoặc trả lời miệng.`,
    `d) Tổ chức thực hiện: Giáo viên giao nhiệm vụ cá nhân 2 phút; học sinh suy nghĩ và chia sẻ; giáo viên nhận xét, đặt vấn đề vào bài mới.`,
    '',
    '### Hoạt động 2: Hình thành kiến thức mới (16 phút)',
    `a) Mục tiêu: Học sinh khám phá bản chất kiến thức, phân biệt được ví dụ chuẩn và phản ví dụ (Mức độ: Hiểu, Phân tích).`,
    `b) Nội dung:\n   Kiến thức cốt lõi: ${k.explanation}\n   Ví dụ minh họa: ${k.example}\n   Phản ví dụ đối chiếu: ${k.counterExample}`,
    `c) Sản phẩm: Ghi chép kiến thức trọng tâm vào vở và bảng phân tích sự khác nhau giữa ví dụ với phản ví dụ (lưu ý tránh lỗi: ${k.commonMistake}).`,
    `d) Tổ chức thực hiện: Học sinh thảo luận cặp đôi 5 phút; đại diện nhóm trình bày; giáo viên dẫn dắt bằng chiến lược Socratic (${k.strategy}) và chốt kiến thức chuẩn.`,
    '',
    '### Hoạt động 3: Luyện tập (13 phút)',
    `a) Mục tiêu: Rèn luyện kỹ năng giải bài tập phân hóa theo 3 mức độ năng lực của lớp (Mức độ: Vận dụng, Phân tích).`,
    `b) Nội dung:\n   Mức Cơ bản: ${q0 ? clean(q0.noi_dung) : `Áp dụng trực tiếp quy tắc bài ${k.title}.`}\n   Mức Đạt chuẩn: ${q1 ? clean(q1.noi_dung) : `Giải bài tập trọng tâm và giải thích từng bước.`}\n   Mức Nâng cao (Phân tích): ${q2 ? clean(q2.noi_dung) : `Phân tích lỗi sai thường gặp (${k.commonMistake}) và đề xuất cách giải tối ưu.`}`,
    `c) Sản phẩm: Lời giải chi tiết của học sinh trên Phiếu học tập A4 và kết quả chấm chéo theo bàn.`,
    `d) Tổ chức thực hiện: Học sinh làm việc cá nhân trên phiếu học tập 8 phút; đổi bài kiểm tra chéo theo đáp án chuẩn; giáo viên gỡ rối cho nhóm cơ bản.`,
    '',
    '### Hoạt động 4: Vận dụng (10 phút)',
    `a) Mục tiêu: Vận dụng kiến thức vào thực tiễn đời sống và kết nối liên môn, đánh giá nhanh cuối tiết (Mức độ: ${bloomLine}).`,
    `b) Nội dung: ${k.edges[0]?.linkedAtom ? `Bài toán kết nối liên môn (${k.edges[0].linkedAtom.subject} - ${k.edges[0].linkedAtom.title}) và câu hỏi Exit Ticket 5 phút.` : `Liên hệ ứng dụng bài "${k.title}" trong thực tế đời sống và hoàn thành Exit Ticket 5 phút.`}`,
    `c) Sản phẩm: Bài trả lời Exit Ticket và ý tưởng ứng dụng thực tế của học sinh.`,
    `d) Tổ chức thực hiện: Học sinh hoàn thành nhanh câu hỏi kiểm tra cuối giờ trong 5 phút; giáo viên tổng kết tiết học và giao nhiệm vụ về nhà.`,
  ]
    .filter(Boolean)
    .join('\n');
}
