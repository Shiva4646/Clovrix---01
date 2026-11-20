import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, ScoreRing, colors } from './ui';

// ══════════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRES
// ══════════════════════════════════════════════════════════════════════════════
export default function Questionnaires() {
  const [items, setItems]   = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState<string|null>(null);

  useEffect(() => {
    setLoading(true);
    api.questionnaires().then(setItems).catch(console.error).finally(() => setLoading(false));
  }, []);

  const open = async (q: any) => {
    const d = await api.questionnaire(q.id);
    setDetail(d);
  };

  const aiFill = async (id: string) => {
    setFilling(id);
    try {
      const r = await api.aiFill(id);
      alert(`AI filled ${r.filled} answers with ${r.avg_confidence}% average confidence`);
      if (detail?.questionnaire?.id === id) open({ id });
      const fresh = await api.questionnaires();
      setItems(fresh);
    } catch (e: any) { alert(e.message); }
    setFilling(null);
  };

  const approve = async (answerId: string) => {
    await api.approveAnswer(answerId);
    if (detail) open(detail.questionnaire);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Questionnaires" subtitle="AI-powered auto-fill for security and compliance questionnaires">
      <div style={{ display: 'grid', gridTemplateColumns: detail ? '340px 1fr' : '1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(q => (
            <Card key={q.id} style={{ cursor: 'pointer', border: detail?.questionnaire?.id === q.id ? `1px solid ${colors.indigo}` : undefined }}
              onClick={() => open(q)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{q.title}</div>
                <Badge label={q.status} status={q.status} />
              </div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 8 }}>
                From: {q.requester_org || q.requester || 'Unknown'} · Due: {q.due_date ? new Date(q.due_date).toLocaleDateString() : '—'}
              </div>
              <div style={{ marginBottom: 6 }}>
                <Bar pct={q.total_questions > 0 ? (q.answered_count / q.total_questions) * 100 : 0} color={colors.indigo} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.text3 }}>
                <span>{q.answered_count}/{q.total_questions} answered</span>
                <span style={{ color: q.ai_confidence >= 80 ? colors.green : colors.yellow }}>
                  {q.ai_confidence}% AI confidence
                </span>
              </div>
              <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                <Btn small onClick={() => aiFill(q.id)} style={{ opacity: filling === q.id ? 0.6 : 1 }}>
                  {filling === q.id ? '✦ AI filling…' : '✦ AI Auto-Fill'}
                </Btn>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <Card style={{ textAlign: 'center', padding: 32, color: colors.text3 }}>
              No questionnaires. Import one to get started.
            </Card>
          )}
        </div>

        {detail && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{detail.questionnaire?.title}</div>
                <div style={{ fontSize: 12, color: colors.text3 }}>
                  {detail.questionnaire?.total_questions} questions · {detail.questionnaire?.ai_confidence}% AI confidence
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', color: colors.text3, fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {detail.answers?.map((a: any, i: number) => (
                <div key={a.id} style={{ padding: '14px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 8 }}>
                    Q{i + 1}: {a.question}
                  </div>
                  {a.ai_answer && (
                    <div style={{ background: 'rgba(99,102,241,.08)', border: `1px solid rgba(99,102,241,.2)`, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: colors.indigo, marginBottom: 4 }}>✦ AI ANSWER · {a.confidence}% confidence</div>
                      <div style={{ fontSize: 13, color: colors.text2 }}>{a.ai_answer}</div>
                    </div>
                  )}
                  {a.final_answer && (
                    <div style={{ background: 'rgba(16,185,129,.08)', border: `1px solid rgba(16,185,129,.2)`, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: colors.green, marginBottom: 4 }}>✓ APPROVED ANSWER</div>
                      <div style={{ fontSize: 13, color: colors.text2 }}>{a.final_answer}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge label={a.status} status={a.status === 'approved' ? 'compliant' : 'partial'} />
                    {a.status === 'ai_draft' && (
                      <Btn small onClick={() => approve(a.id)}>Approve Answer</Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PageWrap>
  );
}
