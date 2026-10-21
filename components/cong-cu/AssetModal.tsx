'use client';

import { Icon } from '@/components/ui/icons';
import { MathText } from '@/components/MathText';
import type { SupabaseFactoryAsset } from '@/lib/supabase';
import { Modal } from './Modal';

export function AssetModal({
  asset,
  lessonTitle,
  onDownload,
  onClose,
}: {
  asset: SupabaseFactoryAsset;
  lessonTitle: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      size="lg"
      eyebrow={lessonTitle ? `Học liệu gốc · ${lessonTitle}` : 'Học liệu gốc'}
      title={asset.formatLabel}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="ag-btn primary small" onClick={onDownload}>
            <Icon name="download" size={18} />
            Tải Word
          </button>
          <button type="button" className="ag-btn small" onClick={() => window.print()}>
            <Icon name="print" size={18} />
            <span className="cc-hide-narrow">In / PDF</span>
            <span className="cc-show-narrow">In</span>
          </button>
        </>
      }
    >
      <article className="cc-doc">
        <div className="cc-doc-meta">
          <strong>Trường Việt Anh</strong>
          <span>
            {asset.formatLabel} · Tác giả {asset.createdBy}
          </span>
        </div>
        {asset.sections.map((sec, idx) => (
          <section key={idx} className="cc-doc-sec">
            <h3>{sec.heading}</h3>
            <div className="cc-doc-text">
              <MathText text={sec.body} />
            </div>
          </section>
        ))}
      </article>
    </Modal>
  );
}
