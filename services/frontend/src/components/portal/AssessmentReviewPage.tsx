import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageWrap, Card, Badge, Btn, colors } from '../ui';
import { toast } from '../Toast';
import { getUser } from '@/lib/auth';
import { can } from '@/lib/capabilities';
import realapi from '@/lib/api';
import { ReviewItem, TestResult } from '@/lib/mock/frameworkManagement';

const field: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg)', border: `1px solid ${colors.border2}`,
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: colors.text, outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: colors.text3,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block',
};
const roBox: React.CSSProperties = {
  fontSize: 12.5, color: colors.text2, background: 'var(--c-bg3)',
  borderRadius: 8, padding: '9px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
};

function resultStatus(r: TestResult) {
  return r === 'pass' ? 'compliant' : r === 'fail' ? 'failed' : 'partial';
}
function reviewStatusMeta(s: string) {
  return s === 'approved' ? 'approved' : s === 'returned' ? 'failed' : 'pending';
}

export default function AssessmentReviewPage() {
  const user = getUser();
  const reviewer = user?.name || 'Reviewer';
  const canReview = can('findings.approve'); // Reviewer + Compliance Admin

  const [rows, setRows] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [active, setActive] = useState<ReviewItem | null>(null);

  const load = useCallback(async () => {
  try {
    const data = await realapi.getAssessmentReviewQueue();

    const mapped = data.map((a: any) => ({
      ...a,
      reviewStatus: a.reviewStatus ?? a.review_status,
      reviewComments: a.reviewComments ?? a.review_comments,
      reviewedAt: a.reviewedAt ?? a.reviewed_at,
      findingRef: a.findingRef ?? a.finding_id,
      controlRef: a.controlRef ?? a.control_ref,
      controlTitle: a.controlTitle ?? a.control_title,
      auditName: a.auditName ?? a.audit_name ?? a.audit_id,
      priority: a.priority ?? 'Medium',
      theme: a.theme ?? '—',
    }));

    setRows(mapped);
  } catch (error) {
    console.error('Failed to load review queue:', error);
    toast.error('Failed to load review queue.');
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(a =>
      (q === '' || a.controlRef.toLowerCase().includes(q) || a.controlTitle.toLowerCase().includes(q)) &&
      (statusFilter === 'all' || a.reviewStatus === statusFilter) &&
      (resultFilter === 'all' || a.result === resultFilter)
    );
  }, [rows, search, statusFilter, resultFilter]);

  const pending = rows.filter(a => a.reviewStatus === 'pending').length;

  return (
    <PageWrap
      title="Assessment Review"
      subtitle="Review the Assessor's results — approve to confirm, or return for re-testing."
    >
      {pending > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          background: 'rgba(0,86,179,0.08)', border: `1px solid rgba(0,86,179,0.25)`,
          borderRadius: 10, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>
            <strong>{pending}</strong> assessment{pending === 1 ? '' : 's'} awaiting your review.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input style={{ ...field, width: 280 }} placeholder="Search by Control ID or Title" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...field, width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Review States</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="returned">Returned</option>
        </select>
        <select style={{ ...field, width: 150 }} value={resultFilter} onChange={e => setResultFilter(e.target.value)}>
          <option value="all">All Results</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 960 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg3)' }}>
                {['Control ID', 'Control Title', 'Audit', 'Method', 'Result', 'Finding', 'Review', 'Action'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>Loading review queue…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>No assessments to review yet. They appear here once the Assessor records results.</td></tr>
              ) : (
                filtered.map(a => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${colors.border}` }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.accent, whiteSpace: 'nowrap' }}>{a.controlRef}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.text }}>{a.controlTitle}</td>
                    <td style={tdStyle}>{a.auditName}</td>
                    <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{a.method}</td>
                    <td style={tdStyle}><Badge label={a.result} status={resultStatus(a.result)} /></td>
                    <td style={tdStyle}>{a.findingRef ? <span style={{ color: colors.red, fontWeight: 600 }}>{a.findingRef}</span> : <span style={{ color: colors.text3 }}>—</span>}</td>
                    <td style={tdStyle}><Badge label={a.reviewStatus} status={reviewStatusMeta(a.reviewStatus)} /></td>
                    <td style={tdStyle}>
                      <Btn small variant={a.reviewStatus === 'pending' ? 'primary' : 'ghost'} onClick={() => setActive(a)}>
                        {a.reviewStatus === 'pending' ? (canReview ? 'Review' : 'View') : 'View'}
                      </Btn>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {active && (
        <ReviewDrawer item={active} reviewer={reviewer} canReview={canReview} onClose={() => setActive(null)} onReviewed={load} />
      )}
    </PageWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review drawer
// ─────────────────────────────────────────────────────────────────────────────
function ReviewDrawer({ item, reviewer, canReview, onClose, onReviewed }: {
  item: ReviewItem; reviewer: string; canReview: boolean; onClose: () => void; onReviewed: () => void;
}) {
  const [comments, setComments] = useState(item.reviewComments ?? '');
  const [saving, setSaving] = useState(false);
  const decided = item.reviewStatus !== 'pending';

  const decide = async (decision: 'approved' | 'returned') => {
    if (decision === 'returned' && !comments.trim()) {
      toast.error('Add a comment explaining what needs re-testing before returning.');
      return;
    }
    setSaving(true);
    try {
      await realapi.reviewAssessment(item.id, decision, comments);
      toast.success(decision === 'approved'
        ? `Assessment for ${item.controlRef} approved.`
        : `Assessment for ${item.controlRef} returned for re-testing.`);
      onReviewed();
      onClose();
    } catch {
      toast.error('Review action failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={() => !saving && onClose()} />
      <div style={{
        position: 'relative', width: 'min(540px, 100%)', height: '100%', background: 'var(--c-bg2)',
        borderLeft: `1px solid ${colors.border2}`, boxShadow: '-16px 0 48px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>{item.controlRef}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginTop: 2 }}>{item.controlTitle}</div>
            <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>{item.auditName} · {item.theme} · {item.priority} priority</div>
          </div>
          <button onClick={() => !saving && onClose()} style={{ background: 'none', border: 'none', color: colors.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Method</label>
              <div style={{ ...roBox, textTransform: 'capitalize' }}>{item.method}</div>
            </div>
            <div>
              <label style={label}>Result</label>
              <div><Badge label={item.result} status={resultStatus(item.result)} /></div>
            </div>
          </div>
          <div>
            <label style={label}>Assessor</label>
            <div style={roBox}>{item.assessor}</div>
          </div>
          <div>
            <label style={label}>Assessor Comments</label>
            <div style={roBox}>{item.comments || '—'}</div>
          </div>
          {item.findingRef && (
            <div style={{ fontSize: 12.5, color: colors.red, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 8, padding: '10px 12px' }}>
              A finding <strong>{item.findingRef}</strong> was raised for this failed control. Approving confirms the finding.
            </div>
          )}

          <div>
            <label style={label}>Reviewer Comments</label>
            <textarea
              style={{ ...field, minHeight: 90, resize: 'vertical', lineHeight: 1.5 }}
              value={comments}
              onChange={e => setComments(e.target.value)}
              readOnly={decided || !canReview}
              placeholder="QA notes; required when returning for re-test…"
            />
          </div>

          {decided && (
            <div style={{ fontSize: 12, color: colors.text3 }}>
              {item.reviewStatus === 'approved' ? 'Approved' : 'Returned'} by {item.reviewer || 'reviewer'}
              {item.reviewedAt ? ` on ${new Date(item.reviewedAt).toLocaleString()}` : ''}.
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Close</Btn>
          {canReview && !decided && (
            <>
              <Btn variant="ghost" onClick={() => decide('returned')} disabled={saving} style={{ color: colors.red, borderColor: 'rgba(220,38,38,0.3)' }}>Return for Re-test</Btn>
              <Btn variant="success" onClick={() => decide('approved')} disabled={saving}>{saving ? 'Saving…' : 'Approve'}</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left', color: colors.text3, fontSize: 11,
  fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '11px 14px', color: colors.text2, verticalAlign: 'middle', lineHeight: 1.45 };
