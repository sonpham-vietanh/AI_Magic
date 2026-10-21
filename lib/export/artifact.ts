// Xuất sản phẩm ra tệp thật: PPTX, DOCX, SVG, PNG, JSON và bản in sạch (PDF qua hộp thoại in).
import type { Artifact, ArtifactKind } from '@/lib/resources/types';
import { buildArtifactDocx } from './artifactDocx';
import { buildInfographicScene, buildMindmapScene, sceneToSvg } from './diagrams';
import { downloadBlob } from './docx';
import { buildSlidesPptx } from './pptx';
import { buildWorksheetStudentHtml, buildWorksheetTeacherHtml, printHtml } from './print';

export type ExportFormat = 'docx' | 'pptx' | 'svg' | 'png' | 'pdf' | 'json';

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  docx: 'Tải Word (.docx)',
  pptx: 'Tải PowerPoint (.pptx)',
  svg: 'Tải ảnh vector (.svg)',
  png: 'Tải ảnh (.png)',
  pdf: 'In / Lưu PDF',
  json: 'Tải dữ liệu (.json)',
};

/** Các định dạng xuất phù hợp với từng loại sản phẩm; phần tử đầu tiên là định dạng chính. */
export function availableFormats(kind: ArtifactKind): ExportFormat[] {
  switch (kind) {
    case 'slides':
      return ['pptx', 'docx', 'json'];
    case 'worksheet':
      return ['docx', 'pdf', 'json'];
    case 'mindmap':
    case 'infographic':
      return ['png', 'svg', 'json'];
    default:
      return ['docx', 'json'];
  }
}

const EXT: Record<ExportFormat, string> = { docx: 'docx', pptx: 'pptx', svg: 'svg', png: 'png', pdf: 'pdf', json: 'json' };

/** Tên tệp an toàn, bỏ dấu tiếng Việt. */
export function safeFilename(name: string): string {
  const s = String(name || 'san-pham')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'san-pham';
}

/** Chuỗi SVG của sản phẩm sơ đồ; null nếu loại này không có dạng ảnh. */
export function artifactSvg(artifact: Artifact): string | null {
  if (artifact.kind === 'mindmap') return sceneToSvg(buildMindmapScene(artifact.data as Artifact<'mindmap'>['data']));
  if (artifact.kind === 'infographic') return sceneToSvg(buildInfographicScene(artifact.data as Artifact<'infographic'>['data']));
  return null;
}

/** Chuyển chuỗi SVG thành PNG nền trắng, độ phân giải đủ in (rộng tối thiểu ~2400px). */
export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(4, Math.max(2, 2400 / Math.max(1, width)));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Không dựng được ảnh từ sơ đồ.'));
      img.src = url;
    });
    const cw = Math.round(width * scale);
    const ch = Math.round(height * scale);
    // Giới hạn kích thước canvas an toàn cho trình duyệt
    const k = Math.min(1, 16000 / Math.max(cw, ch));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cw * k);
    canvas.height = Math.round(ch * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ vẽ ảnh.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được tệp ảnh.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** In bản đáp án của phiếu (dành cho giáo viên), tách hẳn khỏi phiếu học sinh. */
export function printWorksheetAnswers(artifact: Artifact): Promise<void> {
  return printHtml(buildWorksheetTeacherHtml(artifact.data as Artifact<'worksheet'>['data']));
}

export async function exportArtifact(artifact: Artifact, format: ExportFormat, filename?: string): Promise<void> {
  if (!availableFormats(artifact.kind).includes(format)) {
    throw new Error('Loại sản phẩm này chưa hỗ trợ định dạng đã chọn.');
  }
  const base = safeFilename(filename || artifact.title);
  const name = `${base}.${EXT[format]}`;

  if (format === 'json') {
    downloadBlob(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }), name);
    return;
  }
  if (format === 'pdf') {
    // Chỉ in phiếu của học sinh; đáp án in riêng bằng printWorksheetAnswers.
    await printHtml(buildWorksheetStudentHtml(artifact.data as Artifact<'worksheet'>['data']));
    return;
  }
  if (format === 'docx') {
    downloadBlob(await buildArtifactDocx(artifact), name);
    return;
  }
  if (format === 'pptx') {
    const { data } = await buildSlidesPptx(artifact.data as Artifact<'slides'>['data']);
    const copy = new Uint8Array(data);
    downloadBlob(
      new Blob([copy], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
      name,
    );
    return;
  }
  const svg = artifactSvg(artifact);
  if (!svg) throw new Error('Loại sản phẩm này không có dạng ảnh.');
  if (format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), name);
    return;
  }
  const scene = artifact.kind === 'mindmap'
    ? buildMindmapScene(artifact.data as Artifact<'mindmap'>['data'])
    : buildInfographicScene(artifact.data as Artifact<'infographic'>['data']);
  downloadBlob(await svgToPngBlob(svg, scene.width, scene.height), name);
}
