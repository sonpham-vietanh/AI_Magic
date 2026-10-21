'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { getConnectedNodes, getNodesByFilter, KNOWLEDGE_NODES, RELATION_LABELS } from '@/lib/knowledge-graph';
import type { GradeLevel, SubjectCode } from '@/lib/types';

export function WeeklyTopics() {
  const [grade, setGrade] = useState<GradeLevel | 'all'>('all');
  const [subject, setSubject] = useState<SubjectCode | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>('kg-7-toan-thong-ke-bieu-do');

  const nodes = getNodesByFilter({ grade, subject });
  const active =
    nodes.find((n) => n.id === selectedId) ||
    KNOWLEDGE_NODES.find((n) => n.id === selectedId) ||
    nodes[0];
  const connections = active ? getConnectedNodes(active.id) : [];

  return (
    <div className="sd-layout">
      <aside className="sd-side" aria-label="Chủ đề theo tuần">
        <div className="sd-filters">
          <div>
            <label className="ag-field-label" htmlFor="wk-grade">
              Khối
            </label>
            <select
              id="wk-grade"
              className="ag-field"
              value={grade}
              onChange={(e) => setGrade(e.target.value as GradeLevel | 'all')}
            >
              <option value="all">Tất cả khối</option>
              {GRADES.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ag-field-label" htmlFor="wk-subject">
              Môn
            </label>
            <select
              id="wk-subject"
              className="ag-field"
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectCode | 'all')}
            >
              <option value="all">Tất cả môn</option>
              {SUBJECTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="sd-side-count" aria-live="polite">
          {nodes.length} chủ đề
        </div>
        <div className="sd-topics">
          {nodes.length === 0 && <p className="sd-empty">Không có chủ đề phù hợp.</p>}
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="sd-atom"
              aria-current={active?.id === node.id}
              onClick={() => setSelectedId(node.id)}
            >
              <b>{node.title}</b>
              <small>
                {node.subjectName} · Khối {node.grade} · Tuần {node.weekRange[0]}–{node.weekRange[1]}
              </small>
            </button>
          ))}
        </div>
      </aside>

      {active ? (
        <section className="sd-panel" aria-label="Chi tiết chủ đề">
          <div className="sd-head">
            <div>
              <h2>{active.title}</h2>
              <div className="sd-meta">
                <span className="sd-pill">
                  {active.subjectName} · Khối {active.grade}
                </span>
                <span className="sd-pill gold">
                  Học kỳ {active.semester} · Tuần {active.weekRange[0]}–{active.weekRange[1]}
                </span>
              </div>
            </div>
            <Link href={`/?nodeId=${active.id}&tool=thlm-knowledge-graph`} className="ag-btn primary">
              Soạn kế hoạch liên môn
            </Link>
          </div>

          <ul className="sd-topic-list">
            {active.moetRequiredOutcomes.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16.5 }}>Liên kết với môn khác</h3>
          {connections.length === 0 && <p className="ag-note">Chủ đề này chưa có liên kết.</p>}
          {connections.map(({ edge, node }) => (
            <div key={edge.id} className="sd-cross">
              <strong>
                {node.subjectName} (Khối {node.grade}): {node.title}
              </strong>
              <div>
                <span className="sd-pill gold" style={{ marginTop: 6 }}>
                  {RELATION_LABELS[edge.relation].label}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <b>Điểm giao thoa:</b> {edge.integrationIdea}
              </div>
              <div style={{ marginTop: 4 }}>
                <b>Hoạt động phối hợp:</b> {edge.suggestedSharedActivity}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="sd-empty">Chọn một chủ đề để xem chi tiết.</p>
      )}
    </div>
  );
}
