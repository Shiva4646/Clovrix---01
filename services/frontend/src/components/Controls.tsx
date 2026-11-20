import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Badge, ScoreRing, PageWrap, LoadingSpinner, ErrorBanner, Btn, Table, colors } from './ui';
import { toast } from './Toast';

/** First-letter badge for any framework */
function FwBadge({ name, color }: { name: string; color?: string }) {
  const bg = color || '#818cf8';
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, background: `${bg}22`,
      border: `1.5px solid ${bg}55`, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800, color: bg, flexShrink: 0,
    }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
  borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13, outline: 'none',
};

export default function Controls() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [domains,    setDomains]    = useState<any[]>([]);
  const [controls,   setControls]   = useState<any[]>([]);
  const [selected,   setSelected]   = useState<any>(null);
  const [std,        setStd]        = useState<string>('');
  const [loading,    setLoading]    = useState(true);
  const [ctrlLoading,setCtrlLoading]= useState(false);
  const [error,      setError]      = useState('');
  const [creating,   setCreating]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  // ✅ CX-22 & CX-23: New state for selection and assignment
  const [selectedControls, setSelectedControls] = useState<Set<string>>(new Set());
  const [completion, setCompletion] = useState<any>(null);
  const [accessors, setAccessors] = useState<any[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAccessor, setSelectedAccessor] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [form, setForm] = useState({
    domainId: '', ref: '', title: '',
    testing_procedure: '', evidence_required: '', frequency: 'annual',
  });

  useEffect(() => {
    api.frameworks()
      .then(fws => {
        setFrameworks(fws);
        if (fws.length > 0) setStd(fws[0].code);
        else setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!std) return;
    setLoading(true);
    setSelected(null);
    setControls([]);
    setSelectedControls(new Set());
    api.domains(std)
      .then(d => setDomains(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [std]);

  const selectDomain = async (d: any) => {
    setSelected(d);
    setCreating(false);
    setSelectedControls(new Set());
    setCtrlLoading(true);
    try {
      const detail = await api.domain(d.id);
      setControls(detail.controls || []);
      // ✅ CX-22: Fetch completion summary
      const comp = await api.getControlCompletion(d.id);
      setCompletion(comp);
      // ✅ CX-23: Load accessors for assignment
      const accs = await api.getAccessors('assessor');
      setAccessors(accs);
    } catch (e: any) { toast.error(e.message); }
    setCtrlLoading(false);
  };

  const toggleStatus = async (ctrl: any) => {
    const next = ctrl.status === 'compliant' ? 'failing' : 'compliant';
    try {
      await api.updateControlStatus(ctrl.id, next);
      setControls(p => p.map(c => c.id === ctrl.id ? { ...c, status: next } : c));
      // ✅ CX-22: Update completion counter after status change
      if (selected) {
        const comp = await api.getControlCompletion(selected.id);
        setCompletion(comp);
      }
    } catch (e: any) { toast.error(e.message); }
  };

  // ✅ CX-22: Toggle control selection
  const toggleControlSelection = (controlId: string) => {
    const newSelected = new Set(selectedControls);
    if (newSelected.has(controlId)) {
      newSelected.delete(controlId);
    } else {
      newSelected.add(controlId);
    }
    setSelectedControls(newSelected);
  };

  // ✅ CX-23: Assign selected controls to assessor
  const assignToAccessor = async () => {
    if (!selectedAccessor) { toast.warning('Please select an assessor'); return; }
    if (selectedControls.size === 0) { toast.warning('Please select at least one control'); return; }
    
    setAssignLoading(true);
    try {
      await api.assignControls(Array.from(selectedControls), selectedAccessor);
      toast.success(`Assigned ${selectedControls.size} control(s)`);
      setShowAssignModal(false);
      setSelectedAccessor('');
      setSelectedControls(new Set());
      // Refresh controls
      if (selected) {
        const detail = await api.domain(selected.id);
        setControls(detail.controls || []);
      }
    } catch (e: any) { toast.error(e.message, 'Assignment failed'); }
    setAssignLoading(false);
  };

  const createControl = async () => {
    if (!form.title) { toast.warning('Title is required'); return; }
    setSaving(true);
    try {
      await api.createControl({ ...form, domainId: selected.id, ownerEmail: '' });
      toast.success(`Control created: ${form.title}`);
      setCreating(false);
      setForm({ domainId: '', ref: '', title: '', testing_procedure: '', evidence_required: '', frequency: 'annual' });
      const detail = await api.domain(selected.id);
      setControls(detail.controls || []);
      // ✅ CX-22: Update completion after creation
      const comp = await api.getControlCompletion(selected.id);
      setCompletion(comp);
    } catch (e: any) { toast.error(e.message, 'Failed to create control'); }
    setSaving(false);
  };

  if (loading && frameworks.length === 0) return <LoadingSpinner />;

  const activeFw = frameworks.find(f => f.code === std);

  return (
    <PageWrap
      title="Control Framework"
      subtitle={activeFw ? `${activeFw.name} — ${activeFw.short_name}` : 'Loading frameworks…'}
    >
      <ErrorBanner msg={error} />

      {frameworks.length === 0 && !loading && (
        <div style={{padding:'60px 20px',textAlign:'center',color:colors.text3}}>
          <div style={{fontSize:36,marginBottom:16}}>🗂️</div>
          <div style={{fontSize:16,fontWeight:600,color:colors.text,marginBottom:8}}>No Frameworks Yet</div>
          <div style={{fontSize:13,lineHeight:1.6,maxWidth:400,margin:'0 auto'}}>
            Go to <strong>Compliance Frameworks</strong> to add your first framework, then return here to manage its control domains and controls.
          </div>
        </div>
      )}

      {frameworks.length > 0 && <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${colors.border}`,
        marginBottom: 20, overflowX: 'auto',
      }}>
        {frameworks.map(fw => {
          const active = std === fw.code;
          const col = fw.color || '#818cf8';
          return (
            <button key={fw.code}
              onClick={() => setStd(fw.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: active ? `2.5px solid ${col}` : '2.5px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
                color: active ? col : colors.text3,
                fontWeight: active ? 700 : 400, fontSize: 13,
                transition: 'all 0.15s', marginBottom: -1,
              }}>
              <FwBadge name={fw.short_name || fw.name} color={col} />
              {fw.short_name || fw.code}
            </button>
          );
        })}
      </div>}

      {frameworks.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

        <div style={{
          background: 'var(--c-bg2)', borderRadius: 10,
          border: `1px solid ${colors.border}`, overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.text3, fontSize: 13 }}>Loading…</div>
          ) : domains.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.text3, fontSize: 13 }}>No domains found</div>
          ) : (
            domains.map((d, i) => {
              const isActive = selected?.id === d.id;
              const col = activeFw?.color || '#818cf8';
              return (
                <div key={d.id}
                  onClick={() => selectDomain(d)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < domains.length - 1 ? `1px solid ${colors.border}` : 'none',
                    cursor: 'pointer',
                    background: isActive ? `${col}14` : 'transparent',
                    borderLeft: isActive ? `3px solid ${col}` : '3px solid transparent',
                    transition: 'background 0.12s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ScoreRing score={d.score} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: isActive ? col : colors.text,
                        fontFamily: 'monospace',
                      }}>{d.ref_code}</div>
                      <div style={{
                        fontSize: 12, color: colors.text2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{d.area}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, alignItems: 'center' }}>
                        <Badge label={d.status} status={d.status} />
                        {d.findings_count > 0 && (
                          <span style={{ fontSize: 10, color: colors.orange }}>⚑ {d.findings_count}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: colors.text3, flexShrink: 0 }}>
                      {d.controls_count ?? 0}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selected && (
          <div>
            <div style={{
              background: 'var(--c-bg2)', borderRadius: 10, border: `1px solid ${colors.border}`,
              padding: '14px 18px', marginBottom: 14,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{selected.area}</div>
                <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
                  {selected.ref_code} · {selected.controls_count ?? controls.length} controls
                  {selected.last_tested_at ? ` · tested ${new Date(selected.last_tested_at).toLocaleDateString()}` : ''}
                </div>
                {selected.description && (
                  <div style={{ fontSize: 12, color: colors.text2, marginTop: 6 }}>{selected.description}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <ScoreRing score={selected.score} size={52} />
                <Btn small onClick={() => setCreating(p => !p)}>+ Add Control</Btn>
              </div>
            </div>

            {creating && (
              <div style={{
                background: 'var(--c-bg2)', borderRadius: 10, border: `1px solid ${colors.border}`,
                padding: '14px 18px', marginBottom: 14,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 12 }}>New Control</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'ref',                label: 'Reference',         placeholder: 'ISO42001-8.4.1' },
                    { key: 'title',              label: 'Control Title *',   placeholder: 'MFA enforced for all users' },
                    { key: 'testing_procedure',  label: 'Testing Procedure', placeholder: 'Review IdP MFA report…' },
                    { key: 'evidence_required',  label: 'Evidence Required', placeholder: 'MFA compliance report' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
                      <input
                        value={(form as any)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Frequency</div>
                    <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))} style={inputStyle}>
                      {['annual','quarterly','monthly','continuous'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Btn onClick={createControl} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Creating…' : 'Create'}</Btn>
                  <Btn variant="ghost" onClick={() => setCreating(false)}>Cancel</Btn>
                </div>
              </div>
            )}

            {ctrlLoading ? (
              <LoadingSpinner />
            ) : controls.length === 0 ? (
              <div style={{
                background: 'var(--c-bg2)', borderRadius: 10, border: `1px solid ${colors.border}`,
                padding: '40px 20px', textAlign: 'center', color: colors.text3, fontSize: 13,
              }}>
                No controls in this domain. Click + Add Control to create one.
              </div>
            ) : (
              <>
                {/* ✅ CX-22: Show completion summary and bulk actions */}
                {selectedControls.size > 0 && (
                  <div style={{
                    background: `${colors.indigo}14`, borderRadius: 10, border: `1px solid ${colors.indigo}44`,
                    padding: '12px 14px', marginBottom: 14,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 12, color: colors.text }}>
                      <strong>{selectedControls.size}</strong> control(s) selected
                      {completion && completion.completed_controls > 0 && (
                        <span style={{ color: colors.text3, marginLeft: 12 }}>
                          · <strong style={{ color: colors.green }}>{completion.completed_controls}</strong> completed
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn small variant="ghost" onClick={() => setShowAssignModal(true)}>
                        📋 Assign to Assessor
                      </Btn>
                      <Btn small variant="ghost" style={{ color: colors.text3 }} onClick={() => setSelectedControls(new Set())}>
                        Clear
                      </Btn>
                    </div>
                  </div>
                )}

                {/* ✅ CX-22: Show total and completed controls */}
                {completion && (
                  <div style={{
                    background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14,
                    display: 'flex', gap: 16, fontSize: 12,
                  }}>
                    <div>Total: <strong>{completion.total_controls}</strong></div>
                    <div style={{ color: colors.green }}>Completed: <strong>{completion.completed_controls}</strong></div>
                    <div style={{ color: colors.text3 }}>Assigned to: <strong>{completion.assigned_to_count}</strong></div>
                  </div>
                )}

                <Table
                  headers={['', 'Ref', 'Title', 'Frequency', 'Status', 'Auto', 'Owner', 'Action']}
                  rows={controls.map(c => [
                    // ✅ CX-22: Checkbox for control selection
                    <input
                      key={`checkbox-${c.id}`}
                      type="checkbox"
                      checked={selectedControls.has(c.id)}
                      onChange={() => toggleControlSelection(c.id)}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />,
                    <span key="ref" style={{ fontSize: 11, color: colors.indigo, fontFamily: 'monospace', fontWeight: 600 }}>{c.ref}</span>,
                    <div key="title">
                      <div style={{ fontSize: 13, color: colors.text }}>{c.title}</div>
                      {c.description && (
                        <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>
                          {c.description?.slice(0, 70)}{c.description?.length > 70 ? '…' : ''}
                        </div>
                      )}
                    </div>,
                    <span key="freq" style={{ fontSize: 11, color: colors.text3, textTransform: 'capitalize' }}>{c.frequency}</span>,
                    <Badge key="status" label={c.status} status={c.status} />,
                    <span key="auto" style={{ fontSize: 12, color: c.automated ? colors.green : colors.text3 }}>
                      {c.automated ? '⟳ auto' : '—'}
                    </span>,
                    <span key="owner" style={{ fontSize: 11, color: colors.text3 }}>{c.owner_email?.split('@')[0] || '—'}</span>,
                    <Btn key="action" small variant="ghost" onClick={() => toggleStatus(c)}>
                      {c.status === 'compliant' ? 'Mark Failing' : 'Mark Pass'}
                    </Btn>,
                  ])}
                />
              </>
            )}

            {/* ✅ CX-23: Assignment Modal */}
            {showAssignModal && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999,
              }}>
                <div style={{
                  background: 'var(--c-bg2)', borderRadius: 12, border: `1px solid ${colors.border}`,
                  padding: '24px', maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 16 }}>
                    Assign Controls to Assessor
                  </div>
                  <div style={{ fontSize: 12, color: colors.text3, marginBottom: 16 }}>
                    Assign {selectedControls.size} selected control(s) to an assessor for evaluation.
                  </div>
                  
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: colors.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Select Assessor
                    </div>
                    <select
                      value={selectedAccessor}
                      onChange={e => setSelectedAccessor(e.target.value)}
                      style={{
                        ...inputStyle,
                        padding: '10px 12px',
                      }}
                    >
                      <option value="">Choose an assessor…</option>
                      {accessors.map(a => (
                        <option key={a.id} value={a.email}>
                          {a.full_name} ({a.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn
                      onClick={assignToAccessor}
                      style={{ opacity: assignLoading ? 0.7 : 1 }}
                    >
                      {assignLoading ? 'Assigning…' : 'Assign'}
                    </Btn>
                    <Btn variant="ghost" onClick={() => {
                      setShowAssignModal(false);
                      setSelectedAccessor('');
                    }}>
                      Cancel
                    </Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>}
    </PageWrap>
  );
}
