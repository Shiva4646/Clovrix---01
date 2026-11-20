import { useState, useEffect, useCallback } from 'react';
import { PageWrap, Card, Badge, Btn, Bar, colors } from '../ui';
import { toast } from '../Toast';
import { can } from '@/lib/capabilities';
import {
  auditManagementApi as api, AuditSummary, AuditDetail, Priority, TestResult,
} from '@/lib/mock/frameworkManagement';

function auditStatusMeta(s: string) {
  return s === 'closed' ? 'completed' : s === 'in_review' ? 'in-review' : s === 'active' ? 'running' : 'draft';
}
function priorityColor(p: Priority) {
  return p === 'High' ? colors.red : p === 'Medium' ? colors.orange : colors.green;
}
function resultBadge(r: TestResult | null) {
  if (!r) return <span style={{ color: colors.text3 }}>—</span>;
  const st = r === 'pass' ? 'compliant' : r === 'fail' ? 'failed' : 'partial';
  return <Badge label={r} status={st} />;
}

export default function AuditManagementPage() {
  const canClose = can('audit.close');       // Compliance Admin only
  const readOnly = !canClose;                // e.g. Lead Auditor views read-only

  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAudits(await api.getAudits());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <PageWrap
      title="Audits"
      subtitle={readOnly ? 'Review audit progress and outcomes.' : 'Track each audit to completion and close it once all work is done.'}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 960 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg3)' }}>
                {['Audit', 'Framework', 'Status', 'Progress', 'Findings', 'Action'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>Loading audits…</td></tr>
              ) : audits.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>No audits yet. Create one from Framework Management.</td></tr>
              ) : (
                audits.map(a => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${colors.border}` }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: colors.text }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: colors.text3 }}>{a.id} · Lead: {a.controlLead}</div>
                    </td>
                    <td style={tdStyle}><Badge label={a.frameworkCode.replace('fw-', '').toUpperCase()} color={colors.accent} /></td>
                    <td style={tdStyle}><Badge label={a.status.replace('_', ' ')} status={auditStatusMeta(a.status)} /></td>
                    <td style={{ ...tdStyle, minWidth: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}><Bar pct={a.progressPct} /></div>
                        <span style={{ fontSize: 11, color: colors.text3, whiteSpace: 'nowrap' }}>{a.assessed}/{a.ready} assessed</span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {a.openFindings > 0
                        ? <span style={{ color: colors.red, fontWeight: 600 }}>{a.openFindings} open</span>
                        : <span style={{ color: colors.green, fontWeight: 600 }}>0 open</span>}
                    </td>
                    <td style={tdStyle}><Btn small variant="ghost" onClick={() => setOpenId(a.id)}>Open</Btn></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {openId && (
        <AuditDrawer auditId={openId} readOnly={readOnly} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </PageWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit detail drawer
// ─────────────────────────────────────────────────────────────────────────────
function AuditDrawer({ auditId, readOnly, onClose, onChanged }: {
  auditId: string; readOnly: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setDetail(await api.getAuditDetail(auditId)); }, [auditId]);
  useEffect(() => { load(); }, [load]);

  const resolveFinding = async (id: string) => {
    setBusy(true);
    try { await api.resolveFinding(id); await load(); onChanged(); toast.success(`${id} resolved.`); }
    finally { setBusy(false); }
  };

  const closeAudit = async () => {
    setBusy(true);
    try {
      const res = await api.closeAudit(auditId);
      if (res.ok) { toast.success('Audit closed.'); await load(); onChanged(); }
      else {
        const b = res.blockers;
        toast.error(`Cannot close: ${b.readyUnassessed} unassessed, ${b.pendingReview} pending review, ${b.openFindings} open findings.`);
        await load();
      }
    } finally { setBusy(false); }
  };

  const b = detail?.blockers;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={() => !busy && onClose()} />
      <div style={{
        position: 'relative', width: 'min(640px, 100%)', height: '100%', background: 'var(--c-bg2)',
        borderLeft: `1px solid ${colors.border2}`, boxShadow: '-16px 0 48px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        {!detail ? (
          <div style={{ padding: 40, color: colors.text3 }}>Loading…</div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{detail.audit.name}</div>
                <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>
                  {detail.audit.id} · {detail.audit.department || '—'} · Lead: {detail.audit.controlLead}
                </div>
                <div style={{ marginTop: 8 }}><Badge label={detail.audit.status.replace('_', ' ')} status={auditStatusMeta(detail.audit.status)} /></div>
              </div>
              <button onClick={() => !busy && onClose()} style={{ background: 'none', border: 'none', color: colors.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Closure readiness */}
              {detail.audit.status !== 'closed' && (
                <div style={{
                  border: `1px solid ${detail.canClose ? 'rgba(5,150,105,0.3)' : colors.border2}`,
                  background: detail.canClose ? 'rgba(5,150,105,0.06)' : 'var(--c-bg3)',
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 8 }}>
                    {detail.canClose ? 'Ready to close' : 'Outstanding before close'}
                  </div>
                  <div style={{ display: 'flex', gap: 18, fontSize: 12, color: colors.text2 }}>
                    <span>Unassessed (ready): <strong style={{ color: b!.readyUnassessed ? colors.orange : colors.green }}>{b!.readyUnassessed}</strong></span>
                    <span>Pending review: <strong style={{ color: b!.pendingReview ? colors.orange : colors.green }}>{b!.pendingReview}</strong></span>
                    <span>Open findings: <strong style={{ color: b!.openFindings ? colors.red : colors.green }}>{b!.openFindings}</strong></span>
                  </div>
                </div>
              )}

              {/* Findings */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Findings ({detail.findings.length})
                </div>
                {detail.findings.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: colors.text3 }}>No findings raised.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.findings.map(f => {
                      const open = ['open', 'in_progress', 'in-remediation'].includes(f.status);
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: colors.red }}>{f.id}</span>
                          <span style={{ flex: 1, fontSize: 12.5, color: colors.text2 }}>{f.title}</span>
                          <Badge label={f.severity} color={f.severity === 'High' ? colors.red : f.severity === 'Medium' ? colors.orange : colors.green} />
                          <Badge label={f.status} status={open ? 'failed' : 'approved'} />
                          {!readOnly && open && <Btn small variant="ghost" onClick={() => resolveFinding(f.id)} disabled={busy}>Resolve</Btn>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Controls ({detail.controls.length})
                </div>
                <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, background: 'var(--c-bg3)' }}>
                        {['Control', 'Priority', 'Status', 'Ready', 'Result', 'Review'].map((h, i) => <th key={i} style={{ ...thStyle, padding: '9px 10px' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.controls.map(c => (
                        <tr key={c.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td style={{ ...tdStyle, padding: '8px 10px' }}>
                            <span style={{ fontWeight: 600, color: colors.accent }}>{c.controlRef}</span>
                            <span style={{ color: colors.text2 }}> · {c.controlTitle}</span>
                          </td>
                          <td style={{ ...tdStyle, padding: '8px 10px' }}><Badge label={c.priority} color={priorityColor(c.priority)} /></td>
                          <td style={{ ...tdStyle, padding: '8px 10px' }}>{c.implementationStatus}</td>
                          <td style={{ ...tdStyle, padding: '8px 10px' }}>{c.readyForAssessment ? 'Yes' : 'No'}</td>
                          <td style={{ ...tdStyle, padding: '8px 10px' }}>{resultBadge(c.latestResult)}</td>
                          <td style={{ ...tdStyle, padding: '8px 10px', textTransform: 'capitalize' }}>{c.reviewStatus || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={onClose} disabled={busy}>Close</Btn>
              {!readOnly && detail.audit.status !== 'closed' && (
                <Btn variant="primary" onClick={closeAudit} disabled={busy || !detail.canClose}
                  title={detail.canClose ? undefined : 'Resolve outstanding items before closing'}>
                  {busy ? 'Working…' : 'Close Audit'}
                </Btn>
              )}
              {detail.audit.status === 'closed' && (
                <Badge label="Audit closed" status="approved" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left', color: colors.text3, fontSize: 11,
  fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '11px 14px', color: colors.text2, verticalAlign: 'middle', lineHeight: 1.45 };
