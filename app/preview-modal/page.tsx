'use client';
import { useState } from 'react';
import { ALL_TOOLS } from '@/lib/catalog';
import { ToolStudioModal } from '@/components/ToolStudioModal';
import { AssistantDrawer } from '@/components/AssistantDrawer';

export default function Page() {
  const [mode, setMode] = useState<string>('tool');
  const [open, setOpen] = useState(true);
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const m = q?.get('m') || mode;
  const tool = ALL_TOOLS.find((t) => t.maturity === 'experimental' && q?.get('x')) || ALL_TOOLS[Number(q?.get('i') || 0)];
  void setMode;
  return (
    <div>
      <button onClick={() => setOpen(true)}>mở</button>
      {m === 'tool' ? (
        <ToolStudioModal tool={open ? tool : null} initialGrade="7" initialSubject={'TOAN' as never} teacherName="Cô Lan" teacherEmail="a@b.c" onClose={() => setOpen(false)} />
      ) : (
        <AssistantDrawer open={open} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
