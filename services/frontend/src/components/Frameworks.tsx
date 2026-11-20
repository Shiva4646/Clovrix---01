import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, colors } from './ui';

const CATEGORIES = ['security', 'ai_governance', 'privacy', 'quality', 'environmental', 'operational', 'financial', 'other'];

const PRESET_COLORS = [
  '#6366f1','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#64748b',
];

export default function Frameworks() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [selected,   setSelected]   = useState<any>(null);
  const [loading,    setLoading]     = useState(true);
  const [creating,   setCreating]    = useState(false);
  const [addDomain,  setAddDomain]   = useState(false);
  const [saving,     setSaving]      = useState(false);
  const [tab,        setTab]         = useState<'frameworks'|'add'|'crossmap'>('frameworks');
  const [crossMap,   setCrossMap]    = useState<any>(null);
  const [crossLoading, setCrossLoading] = useState(false);

  const [form, setForm] = useState({
    code: '', name: '', shortName: '', version: '2024', description: '',
    category: 'security', color: '#6366f1', icon: '◈', sortOrder: 99,
    domains: [] as { area: string; refCode: string; description: string }[],
  });

  const [domainForm, setDomainForm] = useState({ area: '', refCode: '', description: '', riskLevel: 'medium' });
  const [editSteps,   setEditSteps]   = useState(false);
  const [steps,       setSteps]       = useState<{ name: string; description: string; allowFileUpload: boolean }[]>([]);
  const [domains,     setDomains]     = useState<any[]>([]);
  const [addCtrlDomain, setAddCtrlDomain] = useState<string|null>(null); // domain id open for add-control
  const [ctrlForm,    setCtrlForm]    = useState({ ref:'', title:'', description:'', frequency:'annual' });
  const [ctrlSaving,  setCtrlSaving]  = useState(false);
  // Excel upload moved to Control Library page

  const load = () => {
    setLoading(true);
    api.frameworks().then(setFrameworks).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const loadCrossMap = async () => {
    if (crossMap) { setTab('crossmap'); return; }
    setCrossLoading(true);
    try {
      const data = await api.frameworkCrossMap();
      setCrossMap(data);
      setTab('crossmap');
    } catch (e: any) { console.error(e); }
    setCrossLoading(false);
  };

  const openFramework = async (fw: any) => {
    setSelected(fw);
    setDomains([]);
    const detail = await api.framework(fw.code);
    setSelected(detail.framework);
    setDomains(detail.domains || []);
    setSteps(
      (detail.workflow_steps || [])
        .filter((s: any) => s.step_type === 'custom')
        .map((s: any) => ({ name: s.name, description: s.description || '', allowFileUpload: s.allow_file_upload || false }))
    );
  };

  const refreshDomains = async () => {
    if (!selected) return;
    const detail = await api.framework(selected.code);
    setDomains(detail.domains || []);
  };

  const addControlToDomain = async (domainId: string) => {
    if (!ctrlForm.ref || !ctrlForm.title) return;
    setCtrlSaving(true);
    try {
      await api.createControl({ domainId, ref: ctrlForm.ref, title: ctrlForm.title, description: ctrlForm.description, frequency: ctrlForm.frequency });
      setCtrlForm({ ref:'', title:'', description:'', frequency:'annual' });
      setAddCtrlDomain(null);
      await refreshDomains();
    } catch(e) { console.error(e); }
    setCtrlSaving(false);
  };


  const create = async () => {
    if (!form.code || !form.name) return;
    setSaving(true);
    try {
      await api.createFramework({
        code: form.code.toUpperCase().replace(/\s/g, '_'),
        name: form.name,
        shortName: form.shortName || form.name,
        version: form.version,
        description: form.description,
        category: form.category,
        color: form.color,
        icon: form.icon,
        sortOrder: form.sortOrder,
        domains: form.domains.length > 0 ? form.domains.map(d => ({
          area: d.area, refCode: d.refCode, description: d.description
        })) : null,
      });
      setCreating(false);
      setTab('frameworks');
      setForm({ code:'',name:'',shortName:'',version:'2024',description:'',category:'security',color:'#6366f1',icon:'◈',sortOrder:99,domains:[] });
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const addDomainToForm = () => {
    if (!domainForm.area) return;
    setForm(p => ({ ...p, domains: [...p.domains, { area: domainForm.area, refCode: domainForm.refCode, description: domainForm.description }] }));
    setDomainForm({ area: '', refCode: '', description: '', riskLevel: 'medium' });
  };

  const addDomainToExisting = async () => {
    if (!domainForm.area || !selected) return;
    setSaving(true);
    try {
      await api.addFrameworkDomain(selected.code, domainForm);
      setAddDomain(false);
      setDomainForm({ area: '', refCode: '', description: '', riskLevel: 'medium' });
      await refreshDomains();
      load();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const saveSteps = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.updateFrameworkSteps(selected.code, steps.map(s => ({
        name: s.name, description: s.description, allowFileUpload: s.allowFileUpload
      })));
      setEditSteps(false);
    }
    catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const deactivate = async (code: string) => {
    if (!confirm(`Deactivate framework ${code}? This hides it from all views.`)) return;
    await api.deleteFramework(code);
    setSelected(null);
    load();
  };

  if (loading) return <LoadingSpinner />;

  const scoreColor = (score: number) => score >= 75 ? colors.green : score >= 50 ? colors.yellow : colors.red;

  return (
    <PageWrap title="Compliance Frameworks"
      subtitle="Add any compliance standard - ISO, SOC, GDPR, NIST, PCI-DSS, HIPAA - with zero code changes"
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small variant={tab === 'frameworks' ? 'primary' : 'ghost'} onClick={() => { setTab('frameworks'); setCreating(false); }}>
            Frameworks ({frameworks.length})
          </Btn>
          <Btn small variant={tab === 'crossmap' ? 'primary' : 'ghost'} onClick={loadCrossMap}>
            {crossLoading ? '⟳ Loading…' : '⊞ Cross-Mapping Matrix'}
          </Btn>
          <Btn onClick={() => { setTab('add'); setCreating(true); setSelected(null); }}>+ Add Framework</Btn>
        </div>
      }>

      {/* ── Add framework form ─────────────────────────────────────────────── */}
      {tab === 'add' && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Register a New Compliance Framework</div>
          <div style={{ fontSize: 13, color: colors.text3, marginBottom: 20 }}>
            Fill in the details below. Once saved, this framework will appear across Controls, Workflows, Reports and Dashboard - no deployment needed.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { k:'code',        l:'Framework Code *',         p:'ISO9001, NIST_CSF, PCI_DSS, HIPAA' },
              { k:'name',        l:'Full Name *',              p:'ISO 9001 - Quality Management System' },
              { k:'shortName',   l:'Short Name (for tabs)',    p:'ISO 9001' },
              { k:'version',     l:'Version / Year',           p:'2015' },
            ].map(f => (
              <div key={f.k}>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.l}</div>
                <input value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                  placeholder={f.p}
                  style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13 }} />
              </div>
            ))}
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} placeholder="Brief description of this compliance standard and its purpose..."
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</div>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13 }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Icon (emoji or symbol)</div>
              <input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                placeholder="◈"
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Brand Colour</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <div key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                      outline: form.color === c ? `3px solid white` : 'none', outlineOffset: 2 }} />
                ))}
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width: 32, height: 32, cursor: 'pointer', background: 'none', border: 'none' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Display Order</div>
              <input type="number" value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: +e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13 }} />
            </div>
          </div>

          {/* Domains */}
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Control Domains (optional)</div>
            <div style={{ fontSize: 12, color: colors.text3, marginBottom: 12 }}>
              Add the top-level domains/clauses for this framework. You can also add them later via the Domains tab.
            </div>

            {form.domains.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {form.domains.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', background: colors.bg3, borderRadius: 6, marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 12, color: colors.indigo, marginRight: 8 }}>{d.refCode}</span>
                      <span style={{ fontSize: 12, color: colors.text }}>{d.area}</span>
                    </div>
                    <button onClick={() => setForm(p => ({ ...p, domains: p.domains.filter((_,j) => j !== i) }))}
                      style={{ background: 'none', border: 'none', color: colors.text3, cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              {[
                { k:'refCode', l:'Ref Code', p:'4.1' },
                { k:'area',    l:'Domain Area *', p:'Context of the Organisation' },
                { k:'description', l:'Description', p:'Understanding internal/external issues...' },
              ].map(f => (
                <div key={f.k}>
                  <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>{f.l}</div>
                  <input value={(domainForm as any)[f.k]} onChange={e => setDomainForm(p => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.p}
                    style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12 }} />
                </div>
              ))}
              <Btn small onClick={addDomainToForm}>+ Add</Btn>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={create} style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : `Create ${form.code ? form.code.toUpperCase() : 'Framework'}`}
            </Btn>
            <Btn variant="ghost" onClick={() => setTab('frameworks')}>Cancel</Btn>
          </div>

          {/* Preview */}
          {form.code && form.name && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: colors.bg3, borderRadius: 8, borderLeft: `3px solid ${form.color}` }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 6 }}>PREVIEW</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${form.color}22`, border: `1.5px solid ${form.color}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: form.color }}>
                  {(form.shortName || form.name || form.code)?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{form.name}</div>
                  <div style={{ fontSize: 11, color: colors.text3 }}>{form.code.toUpperCase()} · v{form.version} · {form.domains.length} domains</div>
                </div>
                <div style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: '50%',
                  background: `conic-gradient(${form.color} 0%, #1a1d2e 0%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: form.color, fontWeight: 700 }}>0%</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Framework list + detail ────────────────────────────────────────── */}
      {tab === 'frameworks' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 16 }}>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {frameworks.map(fw => (
              <Card key={fw.id} style={{ cursor: 'pointer', borderLeft: `3px solid ${fw.color || colors.indigo}`,
                border: selected?.code === fw.code ? `1px solid ${fw.color || colors.indigo}` : undefined }}
                onClick={() => openFramework(fw)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: `${fw.color || colors.indigo}22`,
                    border: `1.5px solid ${fw.color || colors.indigo}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, color: fw.color || colors.indigo, flexShrink: 0 }}>
                    {(fw.short_name || fw.name || fw.code)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{fw.short_name}</div>
                    <div style={{ fontSize: 11, color: colors.text3, marginTop: 1 }}>{fw.code} · v{fw.version}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <Bar pct={Number(fw.avg_score) || 0} color={fw.color || colors.indigo} h={4} />
                      </div>
                      <span style={{ fontSize: 11, color: fw.color || colors.indigo, fontWeight: 600 }}>
                        {Math.round(Number(fw.avg_score) || 0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: colors.text3 }}>{fw.domain_count_live || fw.domain_count} domains</span>
                  <span style={{ fontSize: 11, color: colors.text3 }}>·</span>
                  <Badge label={fw.category?.replace(/_/g,' ')} />
                </div>
              </Card>
            ))}

            {frameworks.length === 0 && (
              <Card style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>◈</div>
                <div style={{ color: colors.text3, fontSize: 13, marginBottom: 12 }}>No frameworks yet. Add ISO 42001, SOC 2, GDPR or any other standard.</div>
                <Btn small onClick={() => setTab('add')}>+ Add First Framework</Btn>
              </Card>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header */}
              <Card style={{ borderLeft: `4px solid ${selected.color || colors.indigo}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 32 }}>{selected.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{selected.name}</div>
                      <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
                        {selected.code} · v{selected.version} · {selected.category?.replace(/_/g,' ')}
                      </div>
                    </div>
                  </div>
                  <Btn small variant="danger" onClick={() => deactivate(selected.code)}>Deactivate</Btn>
                </div>
                {selected.description && (
                  <div style={{ fontSize: 13, color: colors.text2, marginTop: 12 }}>{selected.description}</div>
                )}
              </Card>

              {/* Custom Workflow Steps */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>Custom Workflow Steps</div>
                    <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>Inserted between Control Testing (Step 2) and Gap Analysis. The 6 system steps are always preserved.</div>
                  </div>
                  <Btn small variant="ghost" onClick={() => setEditSteps(p => !p)}>
                    {editSteps ? 'Cancel' : steps.length > 0 ? `Edit (${steps.length})` : '+ Add'}
                  </Btn>
                </div>

                {editSteps ? (
                  <div style={{ marginTop: 12 }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${selected.color || colors.indigo}22`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: selected.color || colors.indigo, fontWeight: 600, flexShrink: 0 }}>
                            {i+1}
                          </div>
                          <input value={s.name} onChange={e => setSteps(p => p.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                            placeholder="Step name" style={{ flex: 1, background: 'var(--c-bg2)', border: `1px solid ${colors.border}`, borderRadius: 6, padding: '5px 8px', color: colors.text, fontSize: 12 }} />
                          <button onClick={() => setSteps(p => p.filter((_,j) => j !== i))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                        </div>
                        <input value={s.description} onChange={e => setSteps(p => p.map((x,j) => j===i ? {...x,description:e.target.value} : x))}
                          placeholder="Description (optional)" style={{ width: '100%', background: 'var(--c-bg2)', border: `1px solid ${colors.border}`, borderRadius: 6, padding: '5px 8px', color: colors.text, fontSize: 12, boxSizing:'border-box' as const }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 12, color: colors.text2 }}>
                          <input type="checkbox" checked={s.allowFileUpload}
                            onChange={e => setSteps(p => p.map((x,j) => j===i ? {...x,allowFileUpload:e.target.checked} : x))}
                            style={{ accentColor: colors.indigo }} />
                          Allow file uploads on this step
                        </label>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Btn small onClick={() => setSteps(p => [...p, { name: '', description: '', allowFileUpload: false }])}>+ Add Step</Btn>
                      <Btn small onClick={saveSteps} style={{ opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving…' : 'Save Custom Steps'}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${colors.border}`, alignItems: 'center' }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${selected.color || colors.indigo}22`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: selected.color || colors.indigo, fontWeight: 600, flexShrink: 0 }}>
                          {i+1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: colors.text }}>{s.name}</div>
                          {s.description && <div style={{ fontSize: 11, color: colors.text3 }}>{s.description}</div>}
                        </div>
                        {s.allowFileUpload && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${colors.indigo}20`, color: colors.indigo, fontWeight: 600 }}>📎 File Upload</span>
                        )}
                      </div>
                    ))}
                    {steps.length === 0 && <div style={{ color: colors.text3, fontSize: 13, marginTop: 4 }}>No custom steps. Click "+ Add" to insert steps between Control Testing and Gap Analysis.</div>}
                  </div>
                )}
              </Card>

              {/* Control Domains */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
                    Control Domains <span style={{ fontSize: 12, color: colors.text3, fontWeight: 400 }}>({domains.length})</span>
                  </div>
                  <Btn small onClick={() => setAddDomain(p => !p)}>+ Add Domain</Btn>
                </div>

                {/* Add domain form */}
                {addDomain && (
                  <div style={{ background: colors.bg3, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>REF CODE</div>
                        <input value={domainForm.refCode} onChange={e => setDomainForm(p => ({ ...p, refCode: e.target.value }))}
                          placeholder="4.1"
                          style={{ width: '100%', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>DOMAIN AREA *</div>
                        <input value={domainForm.area} onChange={e => setDomainForm(p => ({ ...p, area: e.target.value }))}
                          placeholder="Context of the Organisation"
                          style={{ width: '100%', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12 }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>DESCRIPTION</div>
                      <input value={domainForm.description} onChange={e => setDomainForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Brief description of this domain area"
                        style={{ width: '100%', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn small onClick={addDomainToExisting} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Adding…' : 'Add Domain'}</Btn>
                      <Btn small variant="ghost" onClick={() => setAddDomain(false)}>Cancel</Btn>
                    </div>
                  </div>
                )}

                {/* Domains list */}
                {domains.length === 0 && !addDomain && (
                  <div style={{ color: colors.text3, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    No domains yet — click "+ Add Domain" to create the first control group.
                  </div>
                )}
                {domains.map((d: any) => (
                  <div key={d.id} style={{ borderRadius: 8, border: `1px solid ${colors.border}`, marginBottom: 10, overflow: 'hidden' }}>
                    {/* Domain header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: colors.bg3 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: `${selected?.color || colors.indigo}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: selected?.color || colors.indigo, flexShrink: 0 }}>
                        {d.ref_code || d.id?.split('-')[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{d.area}</div>
                        {d.description && <div style={{ fontSize: 11, color: colors.text3 }}>{d.description}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: colors.text3 }}>{d.controls_count || 0} controls</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: d.score >= 70 ? `${colors.green}22` : `${colors.orange}22`,
                          color: d.score >= 70 ? colors.green : colors.orange }}>{d.score || 0}%</span>
                        <Btn small onClick={() => setAddCtrlDomain(addCtrlDomain === d.id ? null : d.id)}>+ Control</Btn>
                      </div>
                    </div>

                    {/* Add control inline form */}
                    {addCtrlDomain === d.id && (
                      <div style={{ padding: '12px 14px', background: `${colors.accent}08`, borderTop: `1px solid ${colors.border}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 100px', gap: 8, marginBottom: 8 }}>
                          {[
                            { k:'ref', l:'REF *', p:'4.1.1' },
                            { k:'title', l:'CONTROL TITLE *', p:'Define organisational context' },
                            { k:'description', l:'DESCRIPTION', p:'Optional detail' },
                          ].map(f => (
                            <div key={f.k} style={f.k === 'description' ? {} : {}}>
                              <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>{f.l}</div>
                              <input value={(ctrlForm as any)[f.k]} onChange={e => setCtrlForm(p => ({ ...p, [f.k]: e.target.value }))}
                                placeholder={f.p}
                                style={{ width: '100%', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', color: colors.text, fontSize: 12 }} />
                            </div>
                          ))}
                          <div>
                            <div style={{ fontSize: 10, color: colors.text3, marginBottom: 3 }}>FREQUENCY</div>
                            <select value={ctrlForm.frequency} onChange={e => setCtrlForm(p => ({ ...p, frequency: e.target.value }))}
                              style={{ width: '100%', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', color: colors.text, fontSize: 12 }}>
                              {['annual','quarterly','monthly','weekly','continuous'].map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Btn small onClick={() => addControlToDomain(d.id)} style={{ opacity: ctrlSaving ? 0.7 : 1 }}>
                            {ctrlSaving ? 'Saving…' : 'Add Control'}
                          </Btn>
                          <Btn small variant="ghost" onClick={() => setAddCtrlDomain(null)}>Cancel</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Card>

              {/* API quick-reference */}
              <Card style={{ display: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 10 }}>
                  API — Add this framework without UI
                </div>
                <div style={{ background: colors.bg3, borderRadius: 6, padding: 12, fontFamily: 'monospace', fontSize: 11, color: colors.text2, lineHeight: 1.7 }}>
                  <div style={{ color: colors.text3 }}># Add any framework via API:</div>
                  <div>POST /api/frameworks</div>
                  <div>X-Tenant-ID: your-tenant</div>
                  <div style={{ marginTop: 6 }}>{'{'}</div>
                  <div style={{ paddingLeft: 16 }}>"code": "ISO9001",</div>
                  <div style={{ paddingLeft: 16 }}>"name": "ISO 9001 — Quality Management",</div>
                  <div style={{ paddingLeft: 16 }}>"shortName": "ISO 9001",</div>
                  <div style={{ paddingLeft: 16 }}>"version": "2015",</div>
                  <div style={{ paddingLeft: 16 }}>"category": "quality",</div>
                  <div style={{ paddingLeft: 16 }}>"color": "#10b981",</div>
                  <div style={{ paddingLeft: 16 }}>"domains": [...]</div>
                  <div>{'}'}</div>
                </div>
                <div style={{ fontSize: 12, color: colors.text3, marginTop: 10 }}>
                  ✓ Framework appears in Controls, Workflows, Reports, Dashboard immediately — no redeploy needed.
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ═══ CROSS-MAPPING MATRIX ═══════════════════════════════════════ */}
      {tab === 'crossmap' && crossMap && (
        <div>
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Frameworks', value: (crossMap.frameworks||[]).length, color: colors.indigo },
              { label: 'Control Areas', value: crossMap.total_areas || 0, color: colors.blue },
              { label: 'Shared Areas', value: (crossMap.shared_areas||[]).length, color: colors.green },
              { label: 'Total Gaps', value: (crossMap.gap_summary||[]).reduce((s:number,f:any)=>s+f.gaps,0), color: colors.orange },
            ].map(s => (
              <Card key={s.label} style={{ padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>{s.label}</div>
              </Card>
            ))}
          </div>

          {/* Shared areas — controls that map across multiple frameworks */}
          {(crossMap.shared_areas||[]).length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Shared Control Areas</div>
              <div style={{ fontSize: 12, color: colors.text2, marginBottom: 14 }}>
                These control areas satisfy requirements across multiple frameworks simultaneously — reducing audit duplication.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(crossMap.shared_areas||[]).slice(0,10).map((area: any) => (
                  <div key={area.area} style={{
                    padding: '10px 14px', background: colors.bg3, borderRadius: 8,
                    borderLeft: `3px solid ${colors.green}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{area.area}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: colors.green, fontWeight: 600 }}>
                          {area.coverage_count} frameworks · {area.avg_score}% avg
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(area.frameworks_covered||[]).map((fw: any) => (
                        <span key={fw.code} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: `${fw.color || colors.indigo}20`, color: fw.color || colors.indigo,
                          fontWeight: 600, border: `1px solid ${fw.color || colors.indigo}40`,
                        }}>
                          {fw.name} — {fw.score}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Gap summary per framework */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Gap Analysis by Framework</div>
            <div style={{ fontSize: 12, color: colors.text2, marginBottom: 14 }}>
              Red/amber gaps show control areas required by other frameworks that this framework doesn't yet have.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
              {(crossMap.gap_summary||[]).map((fw: any) => {
                const fwMeta = (crossMap.frameworks||[]).find((f: any) => f.code === fw.framework_code);
                const color  = fwMeta?.color || colors.indigo;
                return (
                  <div key={fw.framework_code} style={{ background: colors.bg3, borderRadius: 10, padding: '12px 14px',
                    borderLeft: `3px solid ${color}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>
                      {fw.framework_name || fw.framework_code}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: fw.gaps > 0 ? colors.orange : colors.green }}>
                        {fw.gaps}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text3 }}>
                        {fw.gaps === 0 ? '✓ No gaps' : `gap${fw.gaps !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Cross-map matrix table */}
          {(crossMap.matrix||[]).length > 0 && (
            <Card>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Control-to-Framework Matrix</div>
              <div style={{ fontSize: 12, color: colors.text2, marginBottom: 14 }}>
                Each row is a control area; columns show which frameworks include it and at what compliance level.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.text3, fontWeight: 500 }}>Control Area</th>
                      {(crossMap.frameworks||[]).map((fw: any) => (
                        <th key={fw.code} style={{ textAlign: 'center', padding: '8px 10px', borderBottom: `1px solid ${colors.border}`,
                          color: fw.color || colors.indigo, fontWeight: 600, fontSize: 11 }}>
                          {fw.short_name || fw.code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(crossMap.matrix||[]).slice(0, 30).map((row: any) => (
                      <tr key={row.area} style={{ borderBottom: `1px solid ${colors.border}40` }}>
                        <td style={{ padding: '8px 12px', color: colors.text, fontSize: 12 }}>{row.area}</td>
                        {(crossMap.frameworks||[]).map((fw: any) => {
                          const cell = (row.frameworks||{})[fw.code];
                          return (
                            <td key={fw.code} style={{ textAlign: 'center', padding: '8px 10px' }}>
                              {cell ? (
                                <span title={`${cell.score}%`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                                  background: cell.score >= 70 ? colors.green : cell.score >= 40 ? colors.yellow : colors.orange }} />
                              ) : (
                                <span style={{ color: colors.border, fontSize: 14 }}>·</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </PageWrap>
  );
}
