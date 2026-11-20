import { useState, useMemo, useEffect } from 'react';
import { PageWrap, Card, Badge, Btn, Modal, colors } from '../ui';
import { toast } from '../Toast';
import { setActiveRole } from '@/lib/auth';
import {
  frameworkManagementApi as fmApi,
  DEPARTMENTS, BUSINESS_UNITS, CONTROL_LEADS,
  Framework, FrameworkControl, Priority,
} from '@/lib/mock/frameworkManagement';

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const PAGE_SIZE = 8;

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: colors.text3,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block',
};
const field: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg)', border: `1px solid ${colors.border2}`,
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: colors.text, outline: 'none',
};

function priorityColor(p: Priority) {
  return p === 'High' ? colors.red : p === 'Medium' ? colors.orange : colors.green;
}

interface Props { setPage?: (p: string) => void; }

export default function FrameworkManagementPage({ setPage }: Props) {
  // ── Step 1 form state ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '', description: '', department: '', businessUnit: '',
    startDate: '', endDate: '', frameworkId: '', controlLead: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ── Live framework list (loaded from the DB) ───────────────────────────────
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  useEffect(() => {
    fmApi.getFrameworks()
      .then(setFrameworks)
      .catch(() => toast.error('Failed to load frameworks from the server.'));
  }, []);

  // ── Step 2 controls state ──────────────────────────────────────────────────
  const [loadedFramework, setLoadedFramework] = useState<Framework | null>(null);
  const [controls, setControls] = useState<FrameworkControl[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // filters / search / sort / pagination
  const [searchId, setSearchId] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [themeFilter, setThemeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [prioritySort, setPrioritySort] = useState<'none' | 'asc' | 'desc'>('none');
  const [page, setPageNum] = useState(1);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const themes = useMemo(
    () => Array.from(new Set(controls.map(c => c.theme))).sort(),
    [controls]
  );

  // ── Load framework controls ────────────────────────────────────────────────
  const loadFramework = async () => {
    if (!form.frameworkId) { toast.error('Select a framework first.'); return; }
    setLoading(true);
    const fw = frameworks.find(f => f.code === form.frameworkId) ?? null;
    try {
      const data = await fmApi.getFrameworkControls(form.frameworkId);
      setLoadedFramework(fw);
      setControls(data);
      setSelected(new Set());
      setSearchId(''); setSearchTitle(''); setThemeFilter('all'); setPriorityFilter('all');
      setPrioritySort('none'); setPageNum(1);
      toast.success(`Loaded ${data.length} controls for ${fw?.code}.`);
    } catch {
      toast.error('Failed to load framework controls.');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived filtered / sorted rows ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = controls.filter(c =>
      (searchId === '' || c.controlId.toLowerCase().includes(searchId.toLowerCase())) &&
      (searchTitle === '' || c.controlTitle.toLowerCase().includes(searchTitle.toLowerCase())) &&
      (themeFilter === 'all' || c.theme === themeFilter) &&
      (priorityFilter === 'all' || c.priority === priorityFilter)
    );
    if (prioritySort !== 'none') {
      rows = [...rows].sort((a, b) => {
        const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        return prioritySort === 'asc' ? d : -d;
      });
    }
    return rows;
  }, [controls, searchId, searchTitle, themeFilter, priorityFilter, prioritySort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // page-level select-all applies to currently visible rows
  const allVisibleSelected = pageRows.length > 0 && pageRows.every(c => selected.has(c.id));

  const toggle = (id: string) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAllVisible = () => setSelected(s => {
    const next = new Set(s);
    if (allVisibleSelected) pageRows.forEach(c => next.delete(c.id));
    else pageRows.forEach(c => next.add(c.id));
    return next;
  });

  const cyclePrioritySort = () =>
    setPrioritySort(p => (p === 'none' ? 'asc' : p === 'asc' ? 'desc' : 'none'));

  // ── Actions ────────────────────────────────────────────────────────────────
  const canSave = form.name.trim() !== '' && form.frameworkId !== '';

  const saveDraft = async () => {
    if (!canSave) { toast.error('Enter an audit name and select a framework.'); return; }
    await fmApi.createAudit({
      name: form.name, description: form.description, department: form.department,
      businessUnit: form.businessUnit, startDate: form.startDate, endDate: form.endDate,
      frameworkId: form.frameworkId, controlLead: form.controlLead, status: 'draft',
    });
    toast.success('Draft audit saved.');
  };

  const requestAssign = () => {
    if (!canSave) { toast.error('Enter an audit name and select a framework.'); return; }
    if (selected.size === 0) { toast.error('Select at least one control to assign.'); return; }
    if (!form.controlLead) { toast.error('Assign a Control Lead before continuing.'); return; }
    setConfirmOpen(true);
  };

  const confirmAssign = async () => {
    setAssigning(true);
    try {
      const audit = await fmApi.createAudit({
        name: form.name, description: form.description, department: form.department,
        businessUnit: form.businessUnit, startDate: form.startDate, endDate: form.endDate,
        frameworkId: form.frameworkId, controlLead: form.controlLead, status: 'draft',
      });
      const copies = await fmApi.assignControls(
        audit.id, form.frameworkId, Array.from(selected), form.controlLead
      );
      setConfirmOpen(false);
      toast.success(`Audit ${audit.id} initialized with ${copies.length} controls. Handing off to Control Lead…`);
      // Navigate to the Control Lead's Assigned Controls workspace
      setActiveRole('Control Lead');
      setTimeout(() => {
        if (setPage) setPage('assigned-controls');
        else window.dispatchEvent(new CustomEvent('clovrix:navigate', { detail: 'assigned-controls' }));
      }, 400);
    } catch {
      toast.error('Assignment failed. Please try again.');
    } finally {
      setAssigning(false);
    }
  };

  const cancel = () => {
    setForm({ name: '', description: '', department: '', businessUnit: '', startDate: '', endDate: '', frameworkId: '', controlLead: '' });
    setLoadedFramework(null); setControls([]); setSelected(new Set());
    toast.info('Cleared.');
  };

  const leadName = CONTROL_LEADS.find(l => l.email.toLowerCase() === form.controlLead.toLowerCase())?.name;
  const leadDisplay = form.controlLead
    ? (leadName || form.controlLead.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || form.controlLead)
    : '—';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageWrap
      title="Framework Management"
      subtitle="Create a new audit by selecting a compliance framework and assigning its controls to a Control Lead."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>
        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* STEP 1 — Create Audit */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, background: 'var(--c-bg3)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: '0.06em' }}>STEP 1</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginLeft: 10 }}>Create Audit</span>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Audit Name</label>
                  <input style={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. ISO 42001 Initial Certification FY26" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Audit Description</label>
                  <textarea style={{ ...field, minHeight: 76, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Scope, objectives and context for this audit…" />
                </div>
                <div>
                  <label style={label}>Department</label>
                  <select style={field} value={form.department} onChange={e => set('department', e.target.value)}>
                    <option value="">Select department…</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Business Unit</label>
                  <select style={field} value={form.businessUnit} onChange={e => set('businessUnit', e.target.value)}>
                    <option value="">Select business unit…</option>
                    {BUSINESS_UNITS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Audit Start Date</label>
                  <input type="date" style={field} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                </div>
                <div>
                  <label style={label}>Audit End Date</label>
                  <input type="date" style={field} value={form.endDate} onChange={e => set('endDate', e.target.value)} />
                </div>
                <div>
                  <label style={label}>Framework</label>
                  <select style={field} value={form.frameworkId} onChange={e => set('frameworkId', e.target.value)}>
                    <option value="">{frameworks.length ? 'Select framework…' : 'Loading frameworks…'}</option>
                    {frameworks.map(f => <option key={f.code} value={f.code}>{f.code} — {f.name.split('—')[1]?.trim() || f.name} ({f.controlCount})</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Control Lead</label>
                  <select style={field} value={form.controlLead} onChange={e => set('controlLead', e.target.value)}>
                    <option value="">Assign a Control Lead…</option>
                    {CONTROL_LEADS.map(l => <option key={l.id} value={l.email}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 18 }}>
                <Btn onClick={loadFramework} disabled={loading || !form.frameworkId}>
                  {loading ? 'Loading…' : 'Load Framework'}
                </Btn>
              </div>
            </div>
          </Card>

          {/* STEP 2 — Framework Controls */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.border}`, background: 'var(--c-bg3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: '0.06em' }}>STEP 2</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginLeft: 10 }}>Framework Controls</span>
              </div>
              {loadedFramework && (
                <span style={{ fontSize: 12, color: colors.text3 }}>
                  {loadedFramework.code} · {filtered.length} of {controls.length} shown · {selected.size} selected
                </span>
              )}
            </div>

            {!loadedFramework ? (
              <div style={{ padding: '56px 20px', textAlign: 'center', color: colors.text3, fontSize: 13 }}>
                Select a framework in Step 1 and click <strong>Load Framework</strong> to view its controls.
              </div>
            ) : (
              <div style={{ padding: 20 }}>
                {/* toolbar */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                  <input style={{ ...field, width: 160 }} placeholder="Search Control ID" value={searchId} onChange={e => { setSearchId(e.target.value); setPageNum(1); }} />
                  <input style={{ ...field, width: 200 }} placeholder="Search Title" value={searchTitle} onChange={e => { setSearchTitle(e.target.value); setPageNum(1); }} />
                  <select style={{ ...field, width: 160 }} value={themeFilter} onChange={e => { setThemeFilter(e.target.value); setPageNum(1); }}>
                    <option value="all">All Themes</option>
                    {themes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select style={{ ...field, width: 150 }} value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPageNum(1); }}>
                    <option value="all">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {/* table */}
                <div style={{ maxHeight: 460, overflow: 'auto', border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 920 }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--c-bg3)' }}>
                        <th style={thStyle(46)}>
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible" style={{ cursor: 'pointer' }} />
                        </th>
                        <th style={thStyle(90)}>Control ID</th>
                        <th style={thStyle(170)}>Control Objective</th>
                        <th style={thStyle(180)}>Control Title</th>
                        <th style={thStyle()}>Requirement Summary</th>
                        <th style={{ ...thStyle(96), cursor: 'pointer', userSelect: 'none' }} onClick={cyclePrioritySort} title="Sort by priority">
                          Priority {prioritySort === 'asc' ? '▲' : prioritySort === 'desc' ? '▼' : '⇅'}
                        </th>
                        <th style={thStyle(150)}>Theme</th>
                        <th style={thStyle(140)}>Implementation Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(c => {
                        const isSel = selected.has(c.id);
                        return (
                          <tr key={c.id}
                            style={{ borderBottom: `1px solid ${colors.border}`, background: isSel ? 'rgba(0,86,179,0.06)' : 'transparent', cursor: 'pointer' }}
                            onClick={() => toggle(c.id)}
                            onMouseOver={e => { if (!isSel) e.currentTarget.style.background = 'var(--c-bg3)'; }}
                            onMouseOut={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <td style={tdStyle} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={isSel} onChange={() => toggle(c.id)} style={{ cursor: 'pointer' }} />
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: colors.accent, whiteSpace: 'nowrap' }}>{c.controlId}</td>
                            <td style={tdStyle}>{c.controlObjective}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: colors.text }}>{c.controlTitle}</td>
                            <td style={{ ...tdStyle, color: colors.text2, minWidth: 260 }}>{c.requirementSummary}</td>
                            <td style={tdStyle}><Badge label={c.priority} color={priorityColor(c.priority)} /></td>
                            <td style={tdStyle}>{c.theme}</td>
                            <td style={tdStyle}><Badge label="Not Started" status="in_progress" /></td>
                          </tr>
                        );
                      })}
                      {pageRows.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>No controls match your filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* pagination */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                  <span style={{ fontSize: 12, color: colors.text3 }}>
                    Page {safePage} of {totalPages} · {filtered.length} controls
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="ghost" small onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={safePage <= 1}>Previous</Btn>
                    <Btn variant="ghost" small onClick={() => setPageNum(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Next</Btn>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── RIGHT SUMMARY PANEL ─────────────────────────────────────────── */}
        <Card style={{ padding: 0, position: 'sticky', top: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.border}`, background: 'var(--c-bg3)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Audit Summary</span>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SummaryRow label="Selected Framework" value={loadedFramework?.code || '—'} />
            <SummaryRow label="Total Controls" value={loadedFramework ? String(controls.length) : '—'} />
            <SummaryRow label="Selected Controls" value={String(selected.size)} accent />
            <SummaryRow label="Remaining Controls" value={loadedFramework ? String(controls.length - selected.size) : '—'} />
            <SummaryRow label="Audit Name" value={form.name || '—'} />
            <SummaryRow label="Control Lead" value={leadDisplay} />
          </div>
          <div style={{ padding: 18, borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Btn onClick={requestAssign} style={{ width: '100%' }}>Assign Selected Controls</Btn>
            <Btn variant="ghost" onClick={saveDraft} style={{ width: '100%' }}>Save Draft</Btn>
            <Btn variant="ghost" onClick={cancel} style={{ width: '100%', color: colors.red, borderColor: 'rgba(220,38,38,0.3)' }}>Cancel</Btn>
          </div>
        </Card>
      </div>

      {/* ── CONFIRMATION DIALOG ───────────────────────────────────────────── */}
      <Modal open={confirmOpen} onClose={() => !assigning && setConfirmOpen(false)} title="Confirm Assignment" width={440}>
        <p style={{ fontSize: 14, color: colors.text2, lineHeight: 1.6, marginBottom: 8 }}>
          Do you want to initialize this audit using the selected controls?
        </p>
        <div style={{ fontSize: 12, color: colors.text3, background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          <strong style={{ color: colors.text }}>{selected.size}</strong> control{selected.size === 1 ? '' : 's'} from{' '}
          <strong style={{ color: colors.text }}>{loadedFramework?.code}</strong> will be copied into the audit and assigned to{' '}
          <strong style={{ color: colors.text }}>{leadDisplay}</strong>. The original framework controls are not modified.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={() => setConfirmOpen(false)} disabled={assigning}>Cancel</Btn>
          <Btn onClick={confirmAssign} disabled={assigning}>{assigning ? 'Initializing…' : 'Confirm Assignment'}</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────
function thStyle(width?: number): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: 'left', color: colors.text3, fontSize: 11,
    fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
    whiteSpace: 'nowrap', borderBottom: `1px solid ${colors.border}`,
    ...(width ? { width } : {}),
  };
}
const tdStyle: React.CSSProperties = { padding: '11px 12px', color: colors.text2, verticalAlign: 'top', lineHeight: 1.45 };

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 12, color: colors.text3 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent ? colors.accent : colors.text, textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
