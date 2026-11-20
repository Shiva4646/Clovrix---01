import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';
import { getUser, hasAnyRole } from '@/lib/auth';
import { UserSearchPicker } from './UserSearchPicker';

// ── Mini Add-Finding Modal (used inside workflow steps) ───────────────────────
function StepFindingModal({ workflowId, stepId, standard, controls, onCreated, onClose }: {
  workflowId: string; stepId: string; standard: string; controls: any[];
  onCreated: () => void; onClose: () => void;
}) {
  const [form,      setForm]      = useState({ title:'', description:'', severity:'high', businessImpact:'', controlId:'', controlRef:'', mitigationPlan:'' });
  const [assignees, setAssignees] = useState<any[]>([]);
  const [saving,    setSaving]    = useState(false);
  const user = getUser();
  const canCreateFinding = hasAnyRole(user?.roles, ['compliance_admin','control_lead','assessor','reviewer_qa','risk_owner','auditor','super_admin']);
  const inp: React.CSSProperties = { width:'100%', background:'var(--c-bg3)', border:`1px solid ${colors.border}`, borderRadius:7, padding:'8px 12px', color:colors.text, fontSize:13, outline:'none' };

  const save = async () => {
    if (!form.title.trim()) { toast.warning('Title is required'); return; }
    if (!canCreateFinding) { toast.warning('You need assessor-level access to create findings'); return; }
    setSaving(true);
    try {
      const res: any = await api.createFinding({
        title: form.title, description: form.description, severity: form.severity,
        businessImpact: form.businessImpact || undefined,
        assignedTo: assignees[0]?.email || undefined, standard, workflowId, stepId,
        controlId: form.controlId || undefined, controlRef: form.controlRef || undefined,
        mitigationPlan: form.mitigationPlan || undefined, status: 'open', source: 'manual',
      });
      if (res?.id) {
        for (const u of assignees) await api.addFindingAssignee(res.id, u.id).catch(()=>{});
      }
      toast.success('Finding logged');
      onCreated();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--c-bg2)', border:`1px solid ${colors.border2}`, borderRadius:14,
        padding:28, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:colors.text }}>Log Finding</div>
            <div style={{ fontSize:12, color:colors.text3, marginTop:2 }}>Linked to current workflow step — must be resolved before completing this step.</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:colors.text3, fontSize:20 }}>X</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Title *</div>
            <input value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Missing risk assessment documentation" style={inp} />
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Severity</div>
            <select value={form.severity} onChange={e => setForm(p=>({...p,severity:e.target.value}))} style={inp}>
              {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ fontSize:11, color:colors.text3, marginTop:4 }}>Critical/high means material risk to operations, compliance, or reputation.</div>
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Control</div>
            <select value={form.controlId} onChange={e => {
              const c = controls.find(x=>x.id===e.target.value);
              setForm(p=>({...p,controlId:e.target.value,controlRef:c?.ref||p.controlRef}));
            }} style={inp}>
              <option value="">-- Select control --</option>
              {controls.map((c:any) => <option key={c.id} value={c.id}>{c.ref} - {c.title?.slice(0,40)}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <UserSearchPicker
              selected={assignees}
              onChange={setAssignees}
              label="Assignees (optional)"
            />
            <div style={{ fontSize:11, color:colors.text3, marginTop:4 }}>If left blank, the current user becomes the finding owner.</div>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Description</div>
            <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))}
              rows={3} style={{ ...inp, resize:'vertical' }} placeholder="Describe the gap or non-conformity..." />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Business impact (optional)</div>
            <textarea value={form.businessImpact} onChange={e => setForm(p=>({...p,businessImpact:e.target.value}))}
              rows={2} style={{ ...inp, resize:'vertical' }} placeholder="Explain operational, financial, legal, or reputational impact..." />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:4 }}>Mitigation Plan (optional)</div>
            <textarea value={form.mitigationPlan} onChange={e => setForm(p=>({...p,mitigationPlan:e.target.value}))}
              rows={2} style={{ ...inp, resize:'vertical' }} placeholder="Initial mitigation steps or planned remediation..." />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:16, paddingTop:14, borderTop:`1px solid ${colors.border}` }}>
          <Btn onClick={save} style={{ opacity:saving?0.7:1 }}>{saving?'Saving...':'Create Finding'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEP_META: Record<string, { icon: string; color: string; desc: string; subStages?: string[] }> = {
  evidence:  { icon: '📂', color: colors.blue,    desc: 'Upload files, screenshots, and supporting documentation for each control.', subStages: ['Upload Evidence Files','Link to Controls','Verify Completeness'] },
  control:   { icon: '✅', color: colors.green,   desc: 'Validate each control is implemented, tested, and meets requirements.',     subStages: ['Review Controls','Validation Testing','Testing Sign-off'] },
  gap:       { icon: '🔍', color: colors.indigo,  desc: 'Identify missing controls and gaps against mandatory framework requirements.', subStages: [] },
  report:    { icon: '📄', color: colors.accent2, desc: 'Compile audit findings, evidence, and control results into a formal report.', subStages: ['Draft Report','Review Report','Finalise'] },
  sign:      { icon: '✍️', color: colors.orange,  desc: 'Reviewer sign-off confirming the audit findings are accurate and complete.', subStages: ['Reviewer Sign-off','Assessor Approval','Final Confirmation'] },
  archive:   { icon: '🗄️', color: colors.text3,   desc: 'Seal the audit record and archive all evidence for future reference.',      subStages: ['Archive Evidence','Seal Record','Notify Stakeholders'] },
};

function getStepMeta(name: string, stepType?: string) {
  if (stepType === 'custom') return { icon: '🔧', color: colors.accent2, desc: name, subStages: [], isCustom: true };
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(STEP_META)) {
    if (n.includes(k)) return { ...v, isCustom: false };
  }
  return { icon: '◈', color: colors.accent, desc: name, subStages: [], isCustom: false };
}

function fmtDate(d: any) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sevColor(sev: string) {
  if (sev === 'high' || sev === 'critical') return colors.red || '#ef4444';
  if (sev === 'medium') return colors.orange || '#f59e0b';
  return colors.text3;
}

function statusColor(s: string) {
  if (s === 'completed') return colors.green;
  if (s === 'running')   return colors.blue;
  if (s === 'pending')   return colors.text3;
  if (s === 'failed')    return colors.red;
  return colors.text3;
}

function statusBadge(s: string) {
  const col = statusColor(s);
  return <span style={{ fontSize:11, padding:'2px 10px', borderRadius:99, background:`${col}20`, color:col, fontWeight:600, textTransform:'capitalize' }}>{s}</span>;
}

// ── Sub-stage checklist component ─────────────────────────────────────────────
function SubStageChecklist({ stepId, stages, checked, onChange }: {
  stepId: string; stages: string[];
  checked: Record<string, boolean>;
  onChange: (stage: string, val: boolean) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      {stages.map(stage => (
        <label key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
          borderBottom: `1px solid ${colors.border}`, cursor: 'pointer' }}>
          <div onClick={() => onChange(stage, !checked[stage])}
            style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked[stage] ? colors.green : colors.border}`,
              background: checked[stage] ? colors.green : 'transparent', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {checked[stage] && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: checked[stage] ? colors.text : colors.text2 }}>{stage}</span>
        </label>
      ))}
    </div>
  );
}

// ── Evidence upload row ───────────────────────────────────────────────────────
function EvidenceUploadRow({ workflowId, stepId, controls, onUploaded }: {
  workflowId: string; stepId?: string; controls: any[]; onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [queued,    setQueued]    = useState(0);
  const [ctrlId,    setCtrlId]    = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    setQueued(files.length);
    let success = 0;
    for (const file of Array.from(files)) {
      try {
        await api.uploadEvidence(file, ctrlId || undefined, workflowId, stepId);
        success++;
      } catch (e: any) { toast.error(`${file.name}: ${e.message}`); }
    }
    if (success > 0) { toast.success(`${success} file${success > 1 ? 's' : ''} uploaded`); onUploaded(); }
    setUploading(false); setQueued(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={ctrlId} onChange={e => setCtrlId(e.target.value)}
          style={{ flex: 1, background: 'var(--c-bg2)', border: `1px solid ${colors.border}`,
            borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12 }}>
          <option value="">-- Link to control (optional) --</option>
          {controls.map((c: any) => (
            <option key={c.id} value={c.id}>{c.ref} — {c.title?.slice(0,50)}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" multiple style={{ display:'none' }}
          onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); }} />
        <Btn small onClick={() => fileRef.current?.click()} style={{ opacity: uploading ? 0.6 : 1, whiteSpace:'nowrap' }}>
          {uploading ? `Uploading ${queued}...` : 'Upload Files'}
        </Btn>
      </div>
      <div style={{ fontSize:11, color:colors.text3, marginTop:8 }}>Multiple files supported. PDF, XLSX, DOCX, PNG, JPG, ZIP</div>
    </div>
  );
}

// ── Step Files Modal ──────────────────────────────────────────────────────────
function StepFilesModal({ stepId, stepName, onClose }: { stepId: string; stepName: string; onClose: () => void }) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stepEvidence(stepId)
      .then((data: any) => setFiles(Array.isArray(data) ? data : data?.items || []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [stepId]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--c-bg2)', border:`1px solid ${colors.border2}`, borderRadius:14,
        padding:28, width:'100%', maxWidth:680, maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:colors.text }}>📎 Uploaded Files</div>
            <div style={{ fontSize:12, color:colors.text3, marginTop:2 }}>{stepName}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:colors.text3, fontSize:20 }}>×</button>
        </div>
        {loading ? (
          <div style={{ textAlign:'center', padding:30, color:colors.text3 }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ textAlign:'center', padding:30, color:colors.text3, fontSize:13 }}>No files uploaded to this step yet.</div>
        ) : (
          <div style={{ overflowY:'auto', flex:1 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>{['File Name','Size','Uploaded By','Date'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', borderBottom:`1px solid ${colors.border}`,
                    color:colors.text3, fontWeight:500, fontSize:12 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {files.map((f: any) => (
                  <tr key={f.id} style={{ borderBottom:`1px solid ${colors.border}40` }}>
                    <td style={{ padding:'8px 10px', color:colors.accent }}>{f.original_name || f.filename}</td>
                    <td style={{ padding:'8px 10px', color:colors.text3 }}>{f.file_size ? `${Math.round(f.file_size/1024)} KB` : '—'}</td>
                    <td style={{ padding:'8px 10px', color:colors.text3 }}>{f.collected_by || '—'}</td>
                    <td style={{ padding:'8px 10px', color:colors.text3 }}>{f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${colors.border}` }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Workflows() {
  const [workflows,  setWorkflows]  = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [detail,     setDetail]     = useState<any>(null);
  const [fullPage,   setFullPage]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Per-step state
  const [stepNotes,      setStepNotes]      = useState<Record<string,string>>({});
  const [subChecked,     setSubChecked]     = useState<Record<string,Record<string,boolean>>>({});
  const [expandedStep,   setExpandedStep]   = useState<string|null>(null);
  const [gapResult,      setGapResult]      = useState<any>(null);
  const [gapRunning,     setGapRunning]     = useState(false);
  const [evidenceList,   setEvidenceList]   = useState<any[]>([]);
  const [showEvidence,   setShowEvidence]   = useState(false);
  const [addFindingStep, setAddFindingStep] = useState<any>(null);
  const [viewFilesStep,  setViewFilesStep]  = useState<any>(null);
  const [stepFindings,   setStepFindings]   = useState<Record<string,any[]>>({});

  // New workflow form
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [form, setForm] = useState({ name:'', standard:'', type:'full-audit', description:'', agentName:'AuditAgent-Alpha' });

  const load = () => {
    setLoading(true);
    api.workflows().then(setWorkflows).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.frameworks().then(setFrameworks).catch(()=>{});
    const openId = localStorage.getItem('clovrix_open_workflow');
    if (openId) {
      localStorage.removeItem('clovrix_open_workflow');
      setTimeout(() => openDetail(openId), 600);
    }
  }, []);

  const openDetail = async (idOrWf: any) => {
    const id = typeof idOrWf === 'string' ? idOrWf : idOrWf.id;
    const [d, evList] = await Promise.all([
      api.workflow(id),
      api.workflowEvidence(id).catch(() => [] as any[]),
    ]);
    setDetail(d);
    setEvidenceList(evList.length ? evList : (d.evidence || []));
    const init: Record<string, Record<string,boolean>> = {};
    (d.steps || []).forEach((s: any) => {
      const meta = getStepMeta(s.name);
      const saved = s.output ? (() => { try { return JSON.parse(s.output); } catch { return {}; } })() : {};
      init[s.id] = {};
      (meta.subStages || []).forEach((st: string) => { init[s.id][st] = saved[st] ?? false; });
    });
    setSubChecked(init);
    setExpandedStep(null);
    setGapResult(null);
    setFullPage(true);
    if (d.steps?.length) loadStepFindings(d.steps, d.workflow?.id || id);
  };

  const loadStepFindings = async (steps: any[], workflowId: string) => {
    const map: Record<string,any[]> = {};
    for (const step of steps) {
      try {
        const r = await api.findings({ workflowId, stepId: step.id });
        map[step.id] = r.items || [];
      } catch { map[step.id] = []; }
    }
    setStepFindings(map);
  };

  const refreshDetail = async () => {
    if (!detail?.workflow?.id) return;
    const [d, evList] = await Promise.all([
      api.workflow(detail.workflow.id),
      api.workflowEvidence(detail.workflow.id).catch(() => [] as any[]),
    ]);
    setDetail(d);
    setEvidenceList(evList.length ? evList : (d.evidence || []));
    
    // ✅ CX-11 FIX: Parse and restore sub-stage checkboxes from API response
    const init: Record<string, Record<string,boolean>> = {};
    (d.steps || []).forEach((s: any) => {
      const meta = getStepMeta(s.name);
      // Parse sub-stages from the 'notes' field (where they're saved)
      const saved = s.notes ? (() => { try { return JSON.parse(s.notes); } catch { return {}; } })() : {};
      init[s.id] = {};
      (meta.subStages || []).forEach((st: string) => { init[s.id][st] = saved[st] ?? false; });
    });
    setSubChecked(init);
    
    if (d.steps?.length) loadStepFindings(d.steps, detail.workflow.id);
  };

  const createWf = async () => {
    if (!form.name || !form.standard) return toast.error('Name and framework are required');
    setSaving(true);
    try {
      const wf = await api.createWorkflow({ ...form, agentName: form.agentName || 'AuditAgent-Alpha' });
      toast.success('Workflow created');
      setCreating(false);
      setForm({ name:'', standard:'', type:'full-audit', description:'', agentName:'AuditAgent-Alpha' });
      load();
      if (wf?.id) openDetail(wf.id);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };


  const startWorkflow = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.startWorkflow(detail.workflow.id);
      await refreshDetail();
      toast.success('Audit pipeline started — work through each step manually');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const updateStepStatus = async (stepId: string, status: string, notes?: string, _stepOrder?: number) => {
    if (!detail) return;
    // Advisory warning for open findings — does not block completion
    if (status === 'completed') {
      try {
        const check = await api.checkStepFindings(detail.workflow.id, stepId);
        const n = Number(check?.open_findings ?? 0);
        if (n > 0) {
          toast.warning(`Note: ${n} open finding${n !== 1 ? 's' : ''} on this step. Resolve them when ready.`);
        }
      } catch { /* ignore — do not block */ }
    }
    setSaving(true);
    try {
      await api.updateStep(detail.workflow.id, stepId, { status, notes });
      await refreshDetail();
      toast.success(status === 'completed' ? 'Step marked complete' : `Step set to ${status}`);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const saveSubStages = async (stepId: string, checked: Record<string,boolean>) => {
    await api.updateStep(detail.workflow.id, stepId, { notes: JSON.stringify(checked) });
  };

  const toggleSubStage = (stepId: string, stage: string, val: boolean) => {
    setSubChecked(prev => {
      const next = { ...prev, [stepId]: { ...(prev[stepId]||{}), [stage]: val } };
      saveSubStages(stepId, next[stepId]);
      return next;
    });
  };

  const runGapAnalysis = async () => {
    if (!detail) return;
    setGapRunning(true);
    try {
      const r = await api.workflowGapAnalysis(detail.workflow.id, {});
      setGapResult(r);
      toast.success('Gap analysis complete');
    } catch (e: any) { toast.error(e.message); }
    setGapRunning(false);
  };

  const addGapFinding = async (gap: any) => {
    try {
      await api.createFinding({
        title: `Gap: ${gap.control_ref || gap.title} — ${gap.gap || 'Missing control'}`,
        description: gap.recommendation || gap.description || '',
        severity: gap.severity || 'medium',
        standard: detail.workflow.standard,
        workflowId: detail.workflow.id,
        domainId: gap.domain_id,
        controlId: gap.control_id,
        source: 'gap-analysis',
        aiGenerated: true,
      });
      toast.success('Finding added');
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Render list ─────────────────────────────────────────────────────────────
  if (loading) return <PageWrap title="Audit Tracking"><LoadingSpinner /></PageWrap>;

  if (fullPage && detail) return renderFullPage();

  return (
    <PageWrap title="Audit Tracking"
      subtitle="AI-driven 6-step audit pipeline — create, run, and sign off compliance audits."
      action={<Btn onClick={() => setCreating(p => !p)}>+ New Audit Workflow</Btn>}>

      {creating && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 14 }}>New Audit Workflow</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[{ k:'name', l:'Workflow Name *', p:'ISO 42001 Q2 Audit' },
              { k:'agentName', l:'Agent Name', p:'AuditAgent-Alpha' }].map(f => (
              <div key={f.k}>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>{f.l}</div>
                <input value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                  placeholder={f.p}
                  style={{ width:'100%', background:colors.bg3, border:`1px solid ${colors.border}`, borderRadius:6, padding:'8px 12px', color:colors.text, fontSize:13 }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>FRAMEWORK *</div>
              <select value={form.standard} onChange={e => setForm(p => ({ ...p, standard: e.target.value }))}
                style={{ width:'100%', background:colors.bg3, border:`1px solid ${colors.border}`, borderRadius:6, padding:'8px 12px', color:colors.text, fontSize:13 }}>
                <option value="">Select framework...</option>
                {frameworks.map((f: any) => <option key={f.code} value={f.code}>{f.name || f.code}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>TYPE</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ width:'100%', background:colors.bg3, border:`1px solid ${colors.border}`, borderRadius:6, padding:'8px 12px', color:colors.text, fontSize:13 }}>
                {['full-audit','control-testing','gap-assessment','review-only'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>DESCRIPTION</div>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Optional description..."
              style={{ width:'100%', background:colors.bg3, border:`1px solid ${colors.border}`, borderRadius:6, padding:'8px 12px', color:colors.text, fontSize:13, resize:'vertical' }} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <Btn onClick={createWf} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Creating...' : 'Create Workflow'}</Btn>
            <Btn variant="ghost" onClick={() => setCreating(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {workflows.length === 0 && !creating && (
        <Card style={{ textAlign:'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8 }}>No audit workflows yet</div>
          <div style={{ fontSize: 13, color: colors.text3, marginBottom: 20 }}>Create your first audit to start the 6-step compliance pipeline.</div>
          <Btn onClick={() => setCreating(true)}>+ New Audit Workflow</Btn>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {workflows.map((wf: any) => {
          const col = wf.status === 'completed' ? colors.green : wf.status === 'running' ? colors.blue : wf.status === 'cancelled' ? colors.red : colors.text3;
          return (
            <Card key={wf.id} style={{ cursor:'pointer' }} onClick={() => openDetail(wf)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:colors.text }}>{wf.name}</div>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:`${col}20`, color:col, fontWeight:600, textTransform:'capitalize' }}>{wf.status}</span>
                    <Badge label={wf.standard} />
                    {wf.type && <Badge label={wf.type} />}
                  </div>
                  <div style={{ fontSize:12, color:colors.text3 }}>{wf.agent_name} · Created {fmtDate(wf.created_at)}</div>
                  {wf.progress > 0 && (
                    <div style={{ marginTop:8 }}>
                      <Bar pct={wf.progress} color={col} />
                      <div style={{ fontSize:11, color:colors.text3, marginTop:3 }}>{wf.progress}% complete</div>
                    </div>
                  )}
                </div>
                <span onClick={(e:any) => { e.stopPropagation(); openDetail(wf); }}
                  style={{ fontSize:11, padding:'4px 10px', borderRadius:6, background:'var(--c-bg3)', color:'var(--c-accent)', cursor:'pointer', fontWeight:600 }}>
                  Full View
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </PageWrap>
  );

  // ── Full-page detail view ──────────────────────────────────────────────────
  function renderFullPage() {
    const wf       = detail.workflow;
    const rawSteps = detail.steps || [];
    const ctrls    = detail.controls || [];
    const findings = detail.findings || [];
    const col      = wf.status === 'completed' ? colors.green : wf.status === 'running' ? colors.blue : colors.text3;

    // Sort steps: system steps by step_order; custom steps slot between control_testing and gap_analysis
    const systemSteps = rawSteps.filter((s: any) => s.step_type !== 'custom');
    const customSteps = rawSteps.filter((s: any) => s.step_type === 'custom');
    const controlTestIdx = systemSteps.findIndex((s: any) =>
      s.step_type === 'control_testing' || s.name.toLowerCase().includes('control test'));
    const insertAfter = controlTestIdx >= 0 ? controlTestIdx : Math.max(0, systemSteps.length - 4);
    const steps: any[] = [
      ...systemSteps.slice(0, insertAfter + 1),
      ...customSteps,
      ...systemSteps.slice(insertAfter + 1),
    ];

    return (
      <PageWrap
        title={wf.name}
        subtitle={`${wf.standard} · ${wf.type} · ${wf.agent_name}`}
        action={
          <div style={{ display:'flex', gap:8 }}>
            {evidenceList.length > 0 && (
              <Btn small variant="ghost" onClick={() => setShowEvidence(true)}
                style={{ color:colors.indigo, borderColor:colors.indigo }}>
                View Evidence ({evidenceList.length})
              </Btn>
            )}
            <Btn small variant="ghost" onClick={() => { setFullPage(false); load(); }}>Back to List</Btn>
          </div>
        }>

        {/* Overview */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
          {[
            { l:'Status',   v: wf.status,         c: col },
            { l:'Progress', v: `${wf.progress}%`, c: colors.blue },
            { l:'Findings', v: findings.length,   c: colors.orange },
            { l:'Evidence', v: evidenceList.length, c: colors.indigo },
            { l:'Controls', v: ctrls.length,      c: colors.green },
          ].map(s => (
            <Card key={s.l} style={{ textAlign:'center', padding:'14px 10px' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:colors.text3, marginTop:4 }}>{s.l}</div>
            </Card>
          ))}
        </div>

        {/* Start button */}
        {wf.status === 'pending' && (
          <Card style={{ marginBottom:20, background:`${colors.blue}10`, border:`1px solid ${colors.blue}40` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:colors.text }}>Ready to begin?</div>
                <div style={{ fontSize:12, color:colors.text3, marginTop:4 }}>Starting the workflow unlocks each step for manual completion.</div>
              </div>
              <Btn onClick={startWorkflow} style={{ opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Starting...' : 'Start Audit Pipeline'}
              </Btn>
            </div>
          </Card>
        )}

        {/* Progress bar */}
        {wf.progress > 0 && (
          <Card style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <div style={{ fontSize:13, fontWeight:600, color:colors.text }}>Overall Progress</div>
              <div style={{ fontSize:13, fontWeight:700, color:col }}>{wf.progress}%</div>
            </div>
            <Bar pct={wf.progress} color={col} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
              {steps.map((s: any) => {
                const m = getStepMeta(s.name, s.step_type);
                const sc = statusColor(s.status);
                return (
                  <div key={s.id} style={{ textAlign:'center', flex:1 }}>
                    <div style={{ fontSize:16, marginBottom:2 }}>{m.icon}</div>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:sc, margin:'0 auto 3px' }} />
                    <div style={{ fontSize:9, color:sc, textTransform:'capitalize' }}>{s.status}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Steps */}
        {steps.map((step: any, idx: number) => {
          const meta      = getStepMeta(step.name, step.step_type);
          const sColor    = statusColor(step.status);
          const isOpen    = expandedStep === step.id;
          const subStages = meta.subStages || [];
          const checked   = subChecked[step.id] || {};
          const doneCount = subStages.filter(s => checked[s]).length;
          const allSubDone = subStages.length === 0 || doneCount === subStages.length;
          const isGapStep  = step.name.toLowerCase().includes('gap');
          const isEvidStep = step.name.toLowerCase().includes('evidence');
          const isLocked   = wf.status === 'pending' || (idx > 0 && steps[idx-1]?.status !== 'completed');

          return (
            <Card key={step.id} style={{ marginBottom:12, opacity: isLocked ? 0.5 : 1,
              border: `1px solid ${isOpen ? sColor : colors.border}` }}>

              {/* Step header */}
              <div style={{ display:'flex', gap:14, alignItems:'center', cursor: isLocked ? 'default' : 'pointer' }}
                onClick={() => !isLocked && setExpandedStep(isOpen ? null : step.id)}>
                <div style={{ width:40, height:40, borderRadius:10, background:`${meta.color}20`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:600, color:colors.text }}>Step {idx+1}: {step.name}</span>
                    {statusBadge(step.status)}
                    {meta.isCustom && (
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:`${colors.accent2}25`,
                        color:colors.accent2, fontWeight:700, letterSpacing:0.5 }}>CUSTOM</span>
                    )}
                    {subStages.length > 0 && (
                      <span style={{ fontSize:11, color:colors.text3 }}>{doneCount}/{subStages.length} sub-stages</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:colors.text3 }}>{meta.desc}</div>
                  {step.started_at && <div style={{ fontSize:11, color:colors.text3, marginTop:2 }}>Started: {fmtDate(step.started_at)}</div>}
                  {step.completed_at && <div style={{ fontSize:11, color:colors.green }}>Completed: {fmtDate(step.completed_at)}</div>}
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, alignItems:'center' }}>
                  {/* View Files button — always visible when step has upload enabled */}
                  {(step.allow_file_upload || step.step_type === 'evidence_collection') && (
                    <span onClick={e => e.stopPropagation()}>
                      <Btn small variant="ghost"
                        onClick={() => setViewFilesStep(step)}
                        style={{ color:colors.indigo, borderColor:colors.indigo }}>
                        📎 View Files
                      </Btn>
                    </span>
                  )}
                  {!isLocked && step.status !== 'pending' && (
                    <span onClick={e => e.stopPropagation()}>
                      <Btn small variant="ghost"
                        onClick={() => setAddFindingStep(step)}
                        style={{ color:colors.orange, borderColor:colors.orange }}>
                        Add Finding
                      </Btn>
                    </span>
                  )}
                  {!isLocked && step.status === 'pending' && (
                    <Btn small onClick={() => updateStepStatus(step.id,'running',undefined,idx+1)}>Start</Btn>
                  )}
                  {!isLocked && step.status === 'running' && allSubDone && (
                    <Btn small onClick={() => updateStepStatus(step.id,'completed', stepNotes[step.id], idx+1)}>
                      {saving ? '...' : 'Mark Complete'}
                    </Btn>
                  )}
                  {step.status === 'completed' && <span style={{ fontSize:18 }}>✅</span>}
                  <span style={{ color:colors.text3, fontSize:16 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Step body */}
              {isOpen && !isLocked && (
                <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${colors.border}` }}>

                  {(isEvidStep || step.allow_file_upload) && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:colors.text, marginBottom:8 }}>
                        {isEvidStep ? 'Upload Evidence' : '📎 Upload Files'}
                      </div>
                      <EvidenceUploadRow workflowId={wf.id} stepId={step.id} controls={ctrls} onUploaded={refreshDetail} />
                      {isEvidStep && evidenceList.length > 0 && (
                        <div style={{ marginTop:12 }}>
                          <div style={{ fontSize:12, color:colors.text3, marginBottom:6 }}>{evidenceList.length} files uploaded</div>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                            <thead>
                              <tr>{['File','Control','Uploaded By','Date'].map(h =>
                                <th key={h} style={{ textAlign:'left', padding:'6px 8px', borderBottom:`1px solid ${colors.border}`, color:colors.text3, fontWeight:500 }}>{h}</th>
                              )}</tr>
                            </thead>
                            <tbody>
                              {evidenceList.map((e: any) => (
                                <tr key={e.id} style={{ borderBottom:`1px solid ${colors.border}40` }}>
                                  <td style={{ padding:'6px 8px', color:colors.accent }}>{e.original_name || e.filename}</td>
                                  <td style={{ padding:'6px 8px', color:colors.text3 }}>{e.control_ref || e.control_title || '—'}</td>
                                  <td style={{ padding:'6px 8px', color:colors.text3 }}>{e.collected_by || '—'}</td>
                                  <td style={{ padding:'6px 8px', color:colors.text3 }}>{fmtDate(e.created_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {subStages.length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:colors.text, marginBottom:4 }}>
                        Sub-stages <span style={{ fontSize:12, color:colors.text3, fontWeight:400 }}>— check off each as you complete it</span>
                      </div>
                      <SubStageChecklist stepId={step.id} stages={subStages} checked={checked}
                        onChange={(stage, val) => toggleSubStage(step.id, stage, val)} />
                    </div>
                  )}

                  {isGapStep && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:colors.text }}>AI Gap Analysis</div>
                        <Btn small onClick={runGapAnalysis} disabled={gapRunning}>
                          {gapRunning ? 'Running...' : 'Run AI Analysis'}
                        </Btn>
                      </div>
                      {gapResult && (
                        <div style={{ marginTop:10 }}>
                          {(gapResult.gaps || []).length === 0 ? (
                            <div style={{ fontSize:12, color:colors.green, padding:'10px 14px',
                              background:`${colors.green}15`, borderRadius:8 }}>
                              No significant gaps detected
                            </div>
                          ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              {(gapResult.gaps || []).map((gap: any, gi: number) => (
                                <div key={gi} style={{ background:colors.bg3, borderRadius:8, padding:'10px 14px',
                                  borderLeft:`3px solid ${sevColor(gap.severity || 'medium')}` }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:colors.text }}>{gap.title || gap.control_ref}</div>
                                    <Btn small onClick={() => addGapFinding(gap)}>+ Finding</Btn>
                                  </div>
                                  <div style={{ fontSize:12, color:colors.text2 }}>{gap.gap || gap.recommendation}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {/* View Files Modal */}
        {viewFilesStep && (
          <StepFilesModal
            stepId={viewFilesStep.id}
            stepName={viewFilesStep.name}
            onClose={() => setViewFilesStep(null)}
          />
        )}

        {/* Add Finding Modal */}
        {addFindingStep && (
          <StepFindingModal
            workflowId={wf.id}
                stepId={addFindingStep.id}
            standard={wf.standard}
            controls={ctrls}
            onCreated={refreshDetail}
            onClose={() => setAddFindingStep(null)}
          />
        )}
      </PageWrap>
    );
  }
}
