import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageWrap, Card, Badge, Btn, colors } from '../ui';
import { toast } from '../Toast';
import { getUser } from '@/lib/auth';
import {
  controlLeadApi as api,
  AuditControl, ControlVersion, ImplStatus, Priority, DEMO_CONTROL_LEAD,
} from '@/lib/mock/frameworkManagement';

const STATUSES: ImplStatus[] = ['Not Started', 'In Progress', 'Completed'];

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: colors.text3,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block',
};
const field: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg)', border: `1px solid ${colors.border2}`,
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: colors.text, outline: 'none',
};
const roField: React.CSSProperties = { ...field, background: 'var(--c-bg3)', color: colors.text2, cursor: 'not-allowed' };

function statusMeta(s: ImplStatus): string {
  return s === 'Completed' ? 'completed' : s === 'In Progress' ? 'in_progress' : 'pending';
}
function priorityColor(p: Priority) {
  return p === 'High' ? colors.red : p === 'Medium' ? colors.orange : colors.green;
}
function relTime(iso?: string): string {
  if (!iso) return 'not yet saved';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
function truncate(s: string | undefined, n: number): string {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

export default function AssignedControlsPage() {
  const user = getUser();
  // The Control Lead only ever sees controls assigned to them.
  const leadEmail = user?.email || DEMO_CONTROL_LEAD;

  const [rows, setRows] = useState<AuditControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [themeFilter, setThemeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [editing, setEditing] = useState<AuditControl | null>(null);
  const [lastSaved, setLastSaved] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const data = await api.getAssignedControls(leadEmail);
      const normalized = (data ?? []).map(c => ({
        ...c,
        assignedControlLead: c.assignedControlLead || c.assigned_to || c.assignee || leadEmail,
      }));
      setRows(normalized);
      setListError(normalized.length === 0 ? 'No controls are assigned to this user yet.' : null);
      const newest = normalized
        .map(c => c.lastSavedAt)
        .filter(Boolean)
        .sort()
        .pop();
      setLastSaved(newest);
    } catch {
      setRows([]);
      setListError('Unable to load assigned controls for this user.');
    } finally {
      setLoading(false);
    }
  }, [leadEmail]);

  useEffect(() => { load(); }, [load]);

  const themes = useMemo(() => Array.from(new Set(rows.map(r => r.theme))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(c =>
      (q === '' ||
        c.controlRef.toLowerCase().includes(q) ||
        c.controlTitle.toLowerCase().includes(q) ||
        (c.policyName ?? '').toLowerCase().includes(q)) &&
      (statusFilter === 'all' || c.implementationStatus === statusFilter) &&
      (themeFilter === 'all' || c.theme === themeFilter) &&
      (priorityFilter === 'all' || c.priority === priorityFilter)
    );
  }, [rows, search, statusFilter, themeFilter, priorityFilter]);

  const awaitingReview = rows.filter(c => !c.readyForAssessment).length;

  const onSaved = (updated: AuditControl) => {
    setRows(rs => rs.map(r => (r.id === updated.id ? updated : r)));
    setEditing(updated);
    setLastSaved(updated.lastSavedAt);
  };

  return (
    <PageWrap
      title="Assigned Controls"
      subtitle="Review, enrich, and prepare assigned controls before assessment."
      action={
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Saved</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{relTime(lastSaved)}</div>
        </div>
      }
    >
      {/* Notification banner */}
      {awaitingReview > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          background: 'rgba(0,86,179,0.08)', border: `1px solid rgba(0,86,179,0.25)`,
          borderRadius: 10, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 16 }}>🔔</span>
          <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>
            You have <strong>{awaitingReview}</strong> assigned control{awaitingReview === 1 ? '' : 's'} awaiting review.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          style={{ ...field, width: 280 }}
          placeholder="Search by Control ID, Title or Policy Name"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...field, width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...field, width: 160 }} value={themeFilter} onChange={e => setThemeFilter(e.target.value)}>
          <option value="all">All Themes</option>
          {themes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={{ ...field, width: 150 }} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1180 }}>
            <thead>
              <tr style={{ background: 'var(--c-bg3)' }}>
                {['Control ID', 'Control Title', 'Assigned To', 'Requirement Summary', 'Policy Name', 'Policy Description', 'Evidence Required', 'Implementation Notes', 'Status', 'Actions'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>Loading assigned controls…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>{listError || 'No controls match your filters.'}</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${colors.border}` }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.accent, whiteSpace: 'nowrap' }}>{c.controlRef}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: colors.text }}>{c.controlTitle}</td>
                    <td style={tdStyle}>{c.assignedControlLead || leadEmail || '—'}</td>
                    <td style={tdStyle}>{truncate(c.requirementSummary, 70)}</td>
                    <td style={tdStyle}>{c.policyName || '—'}</td>
                    <td style={tdStyle}>{truncate(c.policyDescription, 60)}</td>
                    <td style={tdStyle}>{truncate(c.evidenceRequired, 50)}</td>
                    <td style={tdStyle}>{truncate(c.implementationNotes, 50)}</td>
                    <td style={tdStyle}>
                      <Badge label={c.implementationStatus} status={statusMeta(c.implementationStatus)} />
                      {c.readyForAssessment && <div style={{ marginTop: 4 }}><Badge label="Ready" status="approved" /></div>}
                    </td>
                    <td style={tdStyle}>
                      <Btn small onClick={() => setEditing(c)}>Edit</Btn>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <EditDrawer
          control={editing}
          leadEmail={leadEmail}
          modifiedBy={user?.name || 'Control Lead'}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </PageWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit drawer (right side panel) + version history
// ─────────────────────────────────────────────────────────────────────────────
interface DrawerProps {
  control: AuditControl;
  leadEmail: string;
  modifiedBy: string;
  onClose: () => void;
  onSaved: (c: AuditControl) => void;
}

function EditDrawer({ control, leadEmail, modifiedBy, onClose, onSaved }: DrawerProps) {
  const initial = useMemo(() => ({
    requirementSummary: control.requirementSummary,
    policyName: control.policyName ?? '',
    policyDescription: control.policyDescription ?? '',
    evidenceRequired: control.evidenceRequired ?? '',
    implementationNotes: control.implementationNotes ?? '',
    status: control.implementationStatus as ImplStatus,
  }), [control]);

  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [history, setHistory] = useState<ControlVersion[]>([]);
  const [viewVersion, setViewVersion] = useState<ControlVersion | null>(null);
  const [ready, setReady] = useState(!!control.readyForAssessment);
  const [savedAt, setSavedAt] = useState<string | undefined>(control.lastSavedAt);

  useEffect(() => { setF(initial); setReady(!!control.readyForAssessment); setSavedAt(control.lastSavedAt); }, [initial, control]);

  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const loadHistory = useCallback(() => { api.getVersionHistory(control.id).then(setHistory); }, [control.id]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  const save = async () => {
    setSaving(true);
    try {
      let latest: AuditControl | null = null;
      if (f.requirementSummary !== initial.requirementSummary)
        latest = await api.updateSummary(control.id, leadEmail, f.requirementSummary, modifiedBy) ?? latest;
      if (f.policyName !== initial.policyName || f.policyDescription !== initial.policyDescription)
        latest = await api.updatePolicy(control.id, leadEmail, f.policyName, f.policyDescription, modifiedBy) ?? latest;
      if (f.evidenceRequired !== initial.evidenceRequired)
        latest = await api.updateEvidence(control.id, leadEmail, f.evidenceRequired, modifiedBy) ?? latest;
      if (f.implementationNotes !== initial.implementationNotes)
        latest = await api.updateNotes(control.id, leadEmail, f.implementationNotes, modifiedBy) ?? latest;
      if (f.status !== initial.status)
        latest = await api.updateStatus(control.id, leadEmail, f.status, modifiedBy) ?? latest;

      if (latest) { setSavedAt(latest.lastSavedAt); onSaved(latest); toast.success('Changes saved.'); }
      else toast.info('No changes to save.');
    } catch {
      toast.error('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setF(initial); toast.info('Changes reset.'); };

  const markReady = async () => {
    setSaving(true);
    try {
      const updated = await api.markReadyForAssessment(control.id, leadEmail, modifiedBy);
      if (updated) {
        setReady(true);
        setF(s => ({ ...s, status: updated.implementationStatus }));
        setSavedAt(updated.lastSavedAt);
        onSaved(updated);
        toast.success(`${control.controlRef} marked ready for assessment.`);
      }
    } catch {
      toast.error('Action failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} onClick={() => !saving && onClose()} />
      <div style={{
        position: 'relative', width: 'min(560px, 100%)', height: '100%', background: 'var(--c-bg2)',
        borderLeft: `1px solid ${colors.border2}`, boxShadow: '-16px 0 48px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease',
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent }}>{control.controlRef}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginTop: 2 }}>{control.controlTitle}</div>
            <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>
              Last saved {relTime(savedAt)} · v{control.version} {ready && '· Ready for assessment'}
            </div>
          </div>
          <button onClick={() => !saving && onClose()} style={{ background: 'none', border: 'none', color: colors.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', borderBottom: `1px solid ${colors.border}` }}>
          {(['edit', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px',
              fontSize: 13, fontWeight: 600, color: tab === t ? colors.accent : colors.text3,
              borderBottom: `2px solid ${tab === t ? colors.accent : 'transparent'}`, marginBottom: -1,
            }}>
              {t === 'edit' ? 'Edit Control' : 'Version History'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'edit' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={label}>Control ID</label>
                  <input style={roField} value={control.controlRef} readOnly />
                </div>
                <div>
                  <label style={label}>Control Title</label>
                  <input style={roField} value={control.controlTitle} readOnly />
                </div>
              </div>

              <div>
                <label style={label}>Requirement Summary</label>
                <textarea style={{ ...field, minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} value={f.requirementSummary} onChange={e => set('requirementSummary', e.target.value)} />
              </div>
              <div>
                <label style={label}>Policy Name</label>
                <input style={field} value={f.policyName} onChange={e => set('policyName', e.target.value)} placeholder="e.g. AI Governance Policy" />
              </div>
              <div>
                <label style={label}>Policy Description</label>
                <textarea style={{ ...field, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} value={f.policyDescription} onChange={e => set('policyDescription', e.target.value)} placeholder="Describe the policy that satisfies this control…" />
              </div>
              <div>
                <label style={label}>Evidence Required</label>
                <textarea style={{ ...field, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} value={f.evidenceRequired} onChange={e => set('evidenceRequired', e.target.value)} placeholder="List the evidence needed to demonstrate compliance…" />
              </div>
              <div>
                <label style={label}>Implementation Notes</label>
                <textarea style={{ ...field, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} value={f.implementationNotes} onChange={e => set('implementationNotes', e.target.value)} placeholder="Internal notes on implementation progress…" />
              </div>
              <div style={{ maxWidth: 220 }}>
                <label style={label}>Status</label>
                <select style={field} value={f.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <VersionHistoryView history={history} viewVersion={viewVersion} setViewVersion={setViewVersion} />
          )}
        </div>

        {/* Footer actions */}
        {tab === 'edit' && (
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Btn onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
            <Btn variant="ghost" onClick={reset} disabled={saving || !dirty}>Reset</Btn>
            <Btn variant="success" onClick={markReady} disabled={saving || ready} style={{ marginLeft: 'auto' }}>
              {ready ? 'Ready ✓' : 'Mark Ready for Assessment'}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionHistoryView({ history, viewVersion, setViewVersion }: {
  history: ControlVersion[];
  viewVersion: ControlVersion | null;
  setViewVersion: (v: ControlVersion | null) => void;
}) {
  if (history.length === 0) return <div style={{ color: colors.text3, fontSize: 13, textAlign: 'center', padding: 30 }}>No version history yet.</div>;
  return (
    <div>
      <p style={{ fontSize: 12, color: colors.text3, marginBottom: 12 }}>Every modification creates a new version. Select a row to view the change.</p>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--c-bg3)' }}>
              {['Version', 'Field', 'Modified By', 'Modified Date'].map((h, i) => <th key={i} style={{ ...thStyle, padding: '9px 12px' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map(v => (
              <tr key={v.version} onClick={() => setViewVersion(viewVersion?.version === v.version ? null : v)}
                style={{ borderTop: `1px solid ${colors.border}`, cursor: 'pointer', background: viewVersion?.version === v.version ? 'rgba(0,86,179,0.06)' : 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: 600, color: colors.accent }}>v{v.version}</td>
                <td style={tdStyle}>{v.field}</td>
                <td style={tdStyle}>{v.modifiedBy}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{new Date(v.modifiedDate).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewVersion && (
        <div style={{ marginTop: 16, border: `1px solid ${colors.border2}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 10 }}>
            Version {viewVersion.version} — {viewVersion.field}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label}>Previous Value</div>
              <div style={{ fontSize: 12.5, color: colors.text2, background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{viewVersion.previousValue}</div>
            </div>
            <div>
              <div style={label}>Updated Value</div>
              <div style={{ fontSize: 12.5, color: colors.text, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{viewVersion.updatedValue}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 14px', textAlign: 'left', color: colors.text3, fontSize: 11,
  fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '11px 14px', color: colors.text2, verticalAlign: 'top', lineHeight: 1.45 };
