import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Card, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
  borderRadius: 7, padding: '8px 12px', color: colors.text, fontSize: 13, outline: 'none',
};

// ── Edit Domain Modal ─────────────────────────────────────────────────────────
function EditDomainModal({ domain, onDone, onClose }: { domain: any; onDone: () => void; onClose: () => void }) {
  // Domain fields use 'area' as the name-equivalent in the DB
  const [form, setForm] = useState({
    area: domain.area || domain.name || '',
    refCode: domain.ref_code || '',
    description: domain.description || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.area.trim()) { toast.warning('Domain name is required'); return; }
    setSaving(true);
    try {
      await api.updateDomain(domain.id, { area: form.area, refCode: form.refCode, description: form.description });
      toast.success('Domain updated');
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 500 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Edit Domain</div>
            <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>{domain.standard} · {domain.id}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Domain Name / Area *</div>
            <input value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Reference Code</div>
            <input value={form.refCode} onChange={e => setForm(p => ({ ...p, refCode: e.target.value }))} placeholder="e.g. RC, GOV" style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Description</div>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <Btn onClick={save} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save Domain'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Edit Control Modal ────────────────────────────────────────────────────────
function EditControlModal({ control, onDone, onClose }: { control: any; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    ref: control.ref || '',
    title: control.title || '',
    description: control.description || '',
    testingProcedure: control.testing_procedure || '',
    evidenceRequired: control.evidence_required || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.ref.trim() || !form.title.trim()) { toast.warning('Ref and Title are required'); return; }
    setSaving(true);
    try {
      await api.updateControl(control.id, {
        ref: form.ref, title: form.title, description: form.description,
        testingProcedure: form.testingProcedure || undefined,
        evidenceRequired: form.evidenceRequired || undefined,
      });
      toast.success('Control updated');
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Edit Control</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Ref *</div>
              <input value={form.ref} onChange={e => setForm(p => ({ ...p, ref: e.target.value }))} placeholder="e.g. AIF-RC-01" style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Title *</div>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Description</div>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Testing Procedure</div>
            <textarea value={form.testingProcedure} onChange={e => setForm(p => ({ ...p, testingProcedure: e.target.value }))}
              rows={2} placeholder="How this control should be tested…" style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Evidence Required</div>
            <input value={form.evidenceRequired} onChange={e => setForm(p => ({ ...p, evidenceRequired: e.target.value }))}
              placeholder="What evidence is needed to verify this control…" style={inp} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <Btn onClick={save} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save Control'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Link Control to Another Domain Modal ─────────────────────────────────────
function LinkDomainModal({ control, domains, onDone, onClose }: {
  control: any; domains: any[];
  onDone: () => void; onClose: () => void;
}) {
  const [targetDomain, setTargetDomain] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [saving, setSaving] = useState(false);

  const available = domains;

  const link = async () => {
    if (!targetDomain) { toast.warning('Select a target domain'); return; }
    setSaving(true);
    try {
      await api.linkControlToDomain(control.id, targetDomain, isMandatory);
      toast.success('Control linked to domain');
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Link to Another Domain</div>
            <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
              Control <strong>{control.ref}</strong> will be shared across multiple domains
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Target Domain *</div>
            <select value={targetDomain} onChange={e => setTargetDomain(e.target.value)} style={inp}>
              <option value="">— Select domain —</option>
              {available.map(d => (
                <option key={d.id} value={d.id}>{d.standard} · {d.area || d.id}</option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text }}>
            <input type="checkbox" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} />
            Mark as mandatory in the target domain
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <Btn onClick={link} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Linking…' : 'Link Control'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Add Control Modal ─────────────────────────────────────────────────────────
function AddControlModal({ domainId, onDone, onClose }: {
  domainId: string; onDone: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'new' | 'existing'>('existing');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({ ref: '', title: '', description: '', isMandatory: false });
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<any>(null);

  const doSearch = (q: string) => {
    setSearchQ(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      // Show all when empty
      setSearching(true);
      api.searchControls(undefined).then(setSearchResults).catch(() => setSearchResults([])).finally(() => setSearching(false));
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await api.searchControls(q)); }
      catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
  };

  // Load results on mount when "existing" tab is active
  useEffect(() => {
    if (tab === 'existing') doSearch('');
  }, [tab]);

  const addExisting = async (ctrl: any) => {
    setSaving(true);
    try {
      await api.addControlToDomain(domainId, { existingControlId: ctrl.id, isMandatory: false });
      toast.success('Control linked to domain');
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const addNew = async () => {
    if (!form.ref.trim() || !form.title.trim()) { toast.warning('Ref and Title are required'); return; }
    setSaving(true);
    try {
      await api.addControlToDomain(domainId, { ...form });
      toast.success('Control created and added');
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const tabStyle = (t: 'new' | 'existing'): React.CSSProperties => ({
    padding: '7px 18px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: tab === t ? colors.accent : 'transparent',
    color: tab === t ? '#fff' : colors.text3, border: 'none',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Add Control to Domain</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: colors.bg3, borderRadius: 8, padding: 4 }}>
          <button style={tabStyle('existing')} onClick={() => setTab('existing')}>🔍 Use Existing Control</button>
          <button style={tabStyle('new')} onClick={() => setTab('new')}>+ Create New</button>
        </div>

        {tab === 'existing' && (
          <div>
            <input value={searchQ} onChange={e => doSearch(e.target.value)}
              placeholder="Search by ref or title…" style={inp} />
            {searching && <div style={{ fontSize: 12, color: colors.text3, marginTop: 8 }}>Searching…</div>}
            <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {searchResults.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: colors.bg3, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{c.ref} — {c.title}</div>
                    <div style={{ fontSize: 11, color: colors.text3 }}>
                      {c.framework_name || c.standard}{c.domain_area ? ` · ${c.domain_area}` : ''}
                    </div>
                  </div>
                  <Btn small onClick={() => addExisting(c)} style={{ opacity: saving ? 0.6 : 1, marginLeft: 10, whiteSpace: 'nowrap' }}>
                    Link to Domain
                  </Btn>
                </div>
              ))}
              {!searching && searchResults.length === 0 && (
                <div style={{ fontSize: 12, color: colors.text3, padding: '10px 0', textAlign: 'center' }}>
                  No controls found. Switch to "Create New" to add one.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'new' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Ref *</div>
                <input value={form.ref} onChange={e => setForm(p => ({ ...p, ref: e.target.value }))} placeholder="e.g. AIF-RC-01" style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Title *</div>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Control title" style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Description</div>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text }}>
                <input type="checkbox" checked={form.isMandatory}
                  onChange={e => setForm(p => ({ ...p, isMandatory: e.target.checked }))} />
                Mark as mandatory for this domain
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
              <Btn onClick={addNew} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Create & Add'}</Btn>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Bulk Upload Modal ─────────────────────────────────────────────────────────
function BulkUploadModal({ frameworks, onDone, onClose }: { frameworks: any[]; onDone: () => void; onClose: () => void }) {
  const [selFw,       setSelFw]       = useState('');
  const [domains,     setDomains]     = useState<any[]>([]);
  const [selDomain,   setSelDomain]   = useState('');
  const [file,        setFile]        = useState<File|null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [loadingDom,  setLoadingDom]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelDomain(''); setDomains([]);
    if (!selFw) return;
    setLoadingDom(true);
    api.controlLibraryDomains(selFw).then(d => setDomains(d as any[])).catch(()=>{}).finally(() => setLoadingDom(false));
  }, [selFw]);

  const downloadTemplate = () => {
    const csv = [
      'ref,title,description,frequency,testing_procedure,evidence_required',
      'AIF-RC-01,Risk Classification Policy,"Document AI system risk classification criteria",annual,"Review policy document","Risk classification matrix"',
      'AIF-RC-02,Risk Assessment Procedure,"Conduct and document AI risk assessment",semi-annual,"Interview risk team, review assessment reports","Completed risk assessment report"',
      'AIF-RC-03,Bias Testing,"Test AI model for demographic bias",quarterly,"Run bias test suite","Bias test results"',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'controls-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file)      { toast.warning('Select a file'); return; }
    if (!selDomain) { toast.warning('Select a domain to upload into'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('domainId', selDomain);
      await api.bulkUploadControls(fd);
      toast.success(`Controls uploaded from ${file.name}`);
      onDone(); onClose();
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    setUploading(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--c-bg2)', border:`1px solid ${colors.border2}`,
        borderRadius:14, padding:28, width:'100%', maxWidth:520 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:colors.text }}>Bulk Upload Controls</div>
            <div style={{ fontSize:12, color:colors.text3, marginTop:2 }}>Upload a CSV or Excel file to add controls to a domain</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:colors.text3, fontSize:20 }}>✕</button>
        </div>

        {/* Sample template download */}
        <div style={{ padding:'12px 16px', background:`${colors.indigo}10`, borderRadius:10,
          border:`1px solid ${colors.indigo}30`, marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:colors.indigo }}>📥 Sample Template</div>
            <div style={{ fontSize:11, color:colors.text3, marginTop:2 }}>
              Columns: ref, title, description, frequency, testing_procedure, evidence_required
            </div>
          </div>
          <Btn small variant="ghost" onClick={downloadTemplate}>⬇ Download CSV</Btn>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Framework</div>
            <select value={selFw} onChange={e => setSelFw(e.target.value)} style={{ ...inp, outline:'none' }}>
              <option value="">— Select framework —</option>
              {frameworks.map((f: any) => <option key={f.code} value={f.code}>{f.name||f.code}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Target Domain</div>
            <select value={selDomain} onChange={e => setSelDomain(e.target.value)} style={{ ...inp, outline:'none' }} disabled={!selFw||loadingDom}>
              <option value="">— Select domain —</option>
              {domains.map((d: any) => <option key={d.id} value={d.id}>{d.ref_code} – {d.area}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>File (CSV or Excel)</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }}
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <Btn small variant="ghost" onClick={() => fileRef.current?.click()}>📂 Choose File</Btn>
              {file && <span style={{ fontSize:12, color:colors.text2 }}>✓ {file.name}</span>}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, marginTop:20, paddingTop:16, borderTop:`1px solid ${colors.border}` }}>
          <Btn onClick={upload} style={{ opacity:uploading?0.7:1 }}>{uploading?'Uploading…':'↑ Upload Controls'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

export default function ControlLibrary() {
  const [frameworks,  setFrameworks]  = useState<any[]>([]);
  const [selFw,       setSelFw]       = useState('');
  const [domains,     setDomains]     = useState<any[]>([]);
  const [selDomain,   setSelDomain]   = useState<any>(null);
  const [controls,    setControls]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [ctrlLoading, setCtrlLoading] = useState(false);
  const [bulkUpload,  setBulkUpload]  = useState(false);

  // Modals
  const [editDomain,  setEditDomain]  = useState<any>(null);
  const [editControl, setEditControl] = useState<any>(null);
  const [addCtrl,     setAddCtrl]     = useState(false);
  const [linkDomain,  setLinkDomain]  = useState<any>(null); // control to link

  useEffect(() => {
    api.frameworks().then(setFrameworks).catch(console.error);
  }, []);

  const loadDomains = (fw: string) => {
    if (!fw) { setDomains([]); setSelDomain(null); setControls([]); return; }
    setLoading(true);
    api.controlLibraryDomains(fw)
      .then(d => { setDomains(d as any[]); setSelDomain(null); setControls([]); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDomains(selFw); }, [selFw]);

  const loadControls = (domain: any) => {
    setSelDomain(domain);
    setCtrlLoading(true);
    api.controlLibraryControls(domain.id)
      .then(setControls)
      .catch(console.error)
      .finally(() => setCtrlLoading(false));
  };

  const reloadControls = () => { if (selDomain) loadControls(selDomain); };
  const reloadDomains  = () => loadDomains(selFw);

  const removeControl = async (domainId: string, controlId: string) => {
    if (!confirm('Remove this control from the domain? If it is only linked here, the control will be deleted.')) return;
    try {
      await api.removeControlFromDomain(domainId, controlId);
      toast.success('Control removed');
      reloadControls();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleMandatory = async (domainId: string, controlId: string, current: boolean) => {
    try {
      await api.setControlMandatory(domainId, controlId, !current);
      toast.success(`Marked as ${!current ? 'mandatory' : 'optional'}`);
      reloadControls();
    } catch (e: any) { toast.error(e.message); }
  };

  const selStyle: React.CSSProperties = {
    background: colors.bg3, border: `1px solid ${colors.border}`,
    borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13,
  };

  return (
    <PageWrap title="Control Library"
      subtitle="Centralized repository of control domains and controls — manage, link, and configure mandatory flags."
      action={<Btn onClick={() => setBulkUpload(true)}>↑ Bulk Upload Controls</Btn>}>

      {/* Framework selector */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 10 }}>Select Framework</div>
        <select value={selFw} onChange={e => setSelFw(e.target.value)} style={{ ...selStyle, width: '100%', maxWidth: 400 }}>
          <option value="">— Choose a framework —</option>
          {frameworks.map((f: any) => (
            <option key={f.code} value={f.code}>{f.name || f.code}</option>
          ))}
        </select>
      </Card>

      {selFw && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

          {/* Domain list */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Domains</div>
              <span style={{ fontSize: 11, color: colors.text3 }}>{domains.length} total</span>
            </div>
            {loading ? (
              <div style={{ padding: 20 }}><LoadingSpinner /></div>
            ) : domains.length === 0 ? (
              <div style={{ padding: 20, fontSize: 12, color: colors.text3 }}>No domains found for this framework.</div>
            ) : (
              <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                {domains.map((d: any) => (
                  <div key={d.id}
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${colors.border}40`,
                      background: selDomain?.id === d.id ? `${colors.accent}15` : 'transparent',
                      borderLeft: selDomain?.id === d.id ? `3px solid ${colors.accent}` : '3px solid transparent',
                      transition: 'all 0.15s' }}
                    onClick={() => loadControls(d)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, wordBreak: 'break-word' }}>
                          {d.area || d.id}
                        </div>
                        <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>
                          {d.ref_code && <span style={{ marginRight: 6, fontWeight: 600 }}>{d.ref_code}</span>}
                          {d.controls_count ?? 0} controls
                          {d.mandatory_controls > 0 && (
                            <span style={{ marginLeft: 6, color: colors.orange }}>· {d.mandatory_controls} mandatory</span>
                          )}
                        </div>
                      </div>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setEditDomain(d); }}
                        style={{ background: 'none', border: `1px solid ${colors.border}`, cursor: 'pointer',
                          color: colors.text3, fontSize: 11, borderRadius: 5, padding: '2px 6px',
                          marginLeft: 6, flexShrink: 0 }}>
                        ✏ Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Controls panel */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {!selDomain ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: colors.text3 }}>
                ← Select a domain to view its controls
              </div>
            ) : (
              <>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{selDomain.area || selDomain.id}</div>
                    {selDomain.description && (
                      <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>{selDomain.description}</div>
                    )}
                  </div>
                  <Btn small onClick={() => setAddCtrl(true)}>+ Add Control</Btn>
                </div>

                {ctrlLoading ? (
                  <div style={{ padding: 20 }}><LoadingSpinner /></div>
                ) : controls.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: colors.text3 }}>
                    No controls in this domain yet. Add one above.
                  </div>
                ) : (
                  <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                    {controls.map((c: any) => (
                      <div key={c.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: colors.indigo }}>{c.ref_code || c.id}</span>
                            {c.is_mandatory && (
                              <span style={{ fontSize: 10, background: '#ef444420', color: '#ef4444',
                                padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>Mandatory</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{c.title}</div>
                          {c.description && (
                            <div style={{ fontSize: 11, color: colors.text3, marginTop: 2,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
                              {c.description}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                          <button onClick={() => setEditControl(c)}
                            style={{ background: 'none', border: `1px solid ${colors.border}`, cursor: 'pointer',
                              color: colors.text3, fontSize: 11, borderRadius: 5, padding: '2px 6px' }}>✏ Edit</button>
                          <button onClick={() => setLinkDomain(c)}
                            style={{ background: 'none', border: `1px solid ${colors.border}`, cursor: 'pointer',
                              color: colors.text3, fontSize: 11, borderRadius: 5, padding: '2px 6px' }}>⤢ Link</button>
                          <button onClick={async () => {
                            if (!confirm('Remove this control?')) return;
                            await api.removeControlFromDomain(selDomain!.id, c.id).catch(() => {});
                            if (selDomain) loadControls(selDomain);
                          }} style={{ background: 'none', border: `1px solid ${colors.border}`, cursor: 'pointer',
                            color: '#ef4444', fontSize: 11, borderRadius: 5, padding: '2px 6px' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {editDomain  && <EditDomainModal  domain={editDomain}  onDone={() => { loadDomains(selFw); setEditDomain(null); }}  onClose={() => setEditDomain(null)} />}
      {addCtrl     && selDomain && <AddControlModal domainId={selDomain.id} onDone={() => loadControls(selDomain)} onClose={() => setAddCtrl(false)} />}
      {editControl && <EditControlModal control={editControl} onDone={() => { if (selDomain) loadControls(selDomain); setEditControl(null); }} onClose={() => setEditControl(null)} />}
      {bulkUpload  && <BulkUploadModal  frameworks={frameworks} onDone={() => { loadDomains(selFw); setBulkUpload(false); }} onClose={() => setBulkUpload(false)} />}
    </PageWrap>
  );
}
