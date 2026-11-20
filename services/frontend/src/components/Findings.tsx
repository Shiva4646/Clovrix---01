import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { Card, PageWrap, LoadingSpinner, Btn, Grid, Stat, colors, sevColor } from './ui';
import { toast } from './Toast';
import { getUser, hasAnyRole } from '@/lib/auth';
import { UserSearchPicker } from './UserSearchPicker';

const SEVERITIES = ['critical','high','medium','low'];
const STATUSES   = ['open','in-remediation','resolved','accepted','exception-requested','exception-approved','exception-rejected'];

function statusColor(s: string) {
  switch(s) {
    case 'open':                 return '#ef4444';
    case 'in-remediation':       return '#f59e0b';
    case 'resolved':             return '#10b981';
    case 'accepted':             return '#6366f1';
    case 'exception-requested':  return '#8b5cf6';
    case 'exception-approved':   return '#10b981';
    case 'exception-rejected':   return '#ef4444';
    default:                     return '#64748b';
  }
}

function StatusBadge({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99,
      background: c + '20', color: c, fontWeight: 700, textTransform: 'uppercase' as const,
      whiteSpace: 'nowrap' }}>
      {status?.replace(/-/g, ' ')}
    </span>
  );
}


const inp: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
  borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, outline: 'none'
};

// ── Add Finding Modal ─────────────────────────────────────────────────────────
function AddFindingModal({ workflowId, stepId, standard, controls, onCreated, onClose }: {
  workflowId?: string; stepId?: string; standard?: string;
  controls?: any[]; onCreated: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    title:'', description:'', severity:'high', businessImpact:'',
    controlRef:'', controlId:'', domainId:'', mitigationPlan:'', standard: standard||'',
  });
  const [assignees,  setAssignees]  = useState<any[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [domains,    setDomains]    = useState<any[]>([]);
  const [ctrlList,   setCtrlList]   = useState<any[]>(controls || []);

  useEffect(() => { if (!standard) api.frameworks().then(setFrameworks).catch(()=>{}); }, [standard]);
  useEffect(() => {
    if (!form.standard) return;
    api.domains(form.standard).then(setDomains).catch(()=>{});
  }, [form.standard]);
  useEffect(() => {
    if (!form.domainId) return;
    api.controls(form.domainId, 1).then((r:any) => setCtrlList(r.items||[])).catch(()=>{});
  }, [form.domainId]);

  const save = async () => {
    if (!form.title.trim()) { toast.warning('Title is required'); return; }
    setSaving(true);
    try {
      const res: any = await api.createFinding({
        title: form.title, description: form.description, severity: form.severity,
        businessImpact: form.businessImpact || undefined,
        assignedTo: assignees[0]?.email || undefined, standard: form.standard || standard,
        controlRef: form.controlRef || undefined, controlId: form.controlId || undefined,
        domainId: form.domainId || undefined, workflowId, stepId,
        mitigationPlan: form.mitigationPlan || undefined, status: 'open', source: 'manual',
      });
      if (res?.id) {
        for (const u of assignees) await api.addFindingAssignee(res.id, u.id).catch(()=>{});
      }
      toast.success('Finding created');
      onCreated(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--c-bg2)', borderRadius:14, padding:28,
        width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, color:colors.text }}>Log Audit Finding</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:colors.text3, fontSize:20 }}>X</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>TITLE *</div>
            <input value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))}
              placeholder="e.g. Missing conformity assessment documentation" style={inp} />
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>SEVERITY</div>
            <select value={form.severity} onChange={e => setForm(p=>({...p,severity:e.target.value}))} style={inp}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            <div style={{ fontSize:11, color:colors.text3, marginTop:4 }}>
              Critical = regulatory, data-loss, or major outage risk. High = significant control failure or business disruption.
            </div>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <UserSearchPicker selected={assignees} onChange={setAssignees}
              label="Assignees (optional — can assign multiple)" />
            <div style={{ fontSize:11, color:colors.text3, marginTop:4 }}>If you leave this blank, the current user becomes the owner of the finding.</div>
          </div>
          {!standard && (
            <div>
              <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>FRAMEWORK</div>
              <select value={form.standard} onChange={e => setForm(p=>({...p,standard:e.target.value}))} style={inp}>
                <option value="">— Select —</option>
                {frameworks.map((f:any) => <option key={f.code} value={f.code}>{f.name||f.code}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>DOMAIN</div>
            <select value={form.domainId} onChange={e => setForm(p=>({...p,domainId:e.target.value}))}
              style={inp} disabled={!form.standard && !standard}>
              <option value="">— Select domain —</option>
              {domains.map((d:any) => <option key={d.id} value={d.id}>{d.ref_code} - {d.area}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>CONTROL</div>
            <select value={form.controlId} onChange={e => {
              const c = ctrlList.find(x=>x.id===e.target.value);
              setForm(p=>({...p,controlId:e.target.value,controlRef:c?.ref||p.controlRef}));
            }} style={inp} disabled={ctrlList.length===0}>
              <option value="">— Select control —</option>
              {ctrlList.map((c:any) => <option key={c.id} value={c.id}>{c.ref} - {c.title?.slice(0,40)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>CONTROL REF (manual)</div>
            <input value={form.controlRef} onChange={e => setForm(p=>({...p,controlRef:e.target.value}))}
              placeholder="e.g. AIF-RC-01" style={inp} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>DESCRIPTION</div>
            <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))}
              rows={3} style={{ ...inp, resize:'vertical' }}
              placeholder="Detail the gap, missing control, or non-conformity observed..." />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>BUSINESS IMPACT (optional)</div>
            <textarea value={form.businessImpact} onChange={e => setForm(p=>({...p,businessImpact:e.target.value}))}
              rows={2} style={{ ...inp, resize:'vertical' }}
              placeholder="Explain the operational, financial, legal, or reputational impact..." />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>MITIGATION PLAN (optional)</div>
            <textarea value={form.mitigationPlan} onChange={e => setForm(p=>({...p,mitigationPlan:e.target.value}))}
              rows={2} style={{ ...inp, resize:'vertical' }}
              placeholder="Initial mitigation steps or planned remediation..." />
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:20, paddingTop:16 }}>
          <Btn onClick={save} style={{ opacity:saving?0.7:1 }}>{saving?'Creating...':'Create Finding'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Finding Detail Panel ──────────────────────────────────────────────────────
function FindingDetail({ finding, onClose, onRefresh, onDataChange }: {
  finding: any; onClose: () => void; onRefresh: () => void; onDataChange?: () => void;
}) {
  const [files,       setFiles]       = useState<any[]>([]);
  const [assignees,   setAssignees]   = useState<any[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [tab,         setTab]         = useState<'detail'|'files'|'exception'>('detail');
  const [excReason,   setExcReason]   = useState('');
  const [excPlan,     setExcPlan]     = useState('');
  const [excApprover, setExcApprover] = useState<any[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const user    = getUser();
  const canDecide = hasAnyRole(user?.roles, ['compliance_admin','reviewer_qa','risk_owner','auditor','super_admin']);
  const isControlLead = hasAnyRole(user?.roles, ['control_lead']);

  const loadFiles     = useCallback(() => { api.findingFiles(finding.id).then(setFiles).catch(()=>{}); }, [finding.id]);
  const loadAssignees = useCallback(() => { api.findingAssignees(finding.id).then((r:any) => setAssignees(r||[])).catch(()=>{}); }, [finding.id]);
  useEffect(() => { loadFiles(); loadAssignees(); }, [loadFiles, loadAssignees]);

  const uploadFile = async (file: File, purpose = 'evidence') => {
    setUploading(true);
    try { await api.uploadFindingFile(finding.id, file, purpose); toast.success('File uploaded: '+file.name); loadFiles(); }
    catch (e: any) { toast.error(e.message); }
    setUploading(false);
  };

  const handleAssigneesChange = async (newList: any[]) => {
    const added   = newList.filter(u => !assignees.find(a => a.id === u.id));
    const removed = assignees.filter(a => !newList.find(u => u.id === a.id));
    try {
      for (const u of added)   await api.addFindingAssignee(finding.id, u.id);
      for (const u of removed) await api.removeFindingAssignee(finding.id, u.id);
      setAssignees(newList);
      toast.success('Assignees updated');
      if (onDataChange) onDataChange(); else onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const requestException = async () => {
    if (!excReason.trim()) { toast.warning('Exception reason is required'); return; }
    if (excApprover.length === 0) { toast.warning('Select an exception approver (reviewer/auditor/admin)'); return; }
    setSubmitting(true);
    try {
      await api.requestException(finding.id, {
        reason: excReason, mitigationPlan: excPlan || undefined,
        approverId: excApprover[0]?.id, approverEmail: excApprover[0]?.email,
      });
      toast.success('Exception requested'); onRefresh(); onClose();
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  const decide = async (decision: 'approve'|'reject') => {
    if (!reviewComment.trim()) { toast.warning('Reviewer comments are required.'); return; }
    setSubmitting(true);
    try { 
      await api.decideException(finding.id, decision, reviewComment); 
      toast.success('Exception '+decision+'d'); 
      onRefresh(); 
      onClose(); 
    }
    catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  const updateStatus = async (status: string) => {
    try { await api.updateFinding(finding.id, { status }); toast.success('Status updated'); onRefresh(); onClose(); }
    catch (e: any) { toast.error(e.message); }
  };

  const sc = sevColor(finding.severity);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--c-bg2)', borderRadius:14, width:'100%', maxWidth:720,
        maxHeight:'92vh', display:'flex', flexDirection:'column' }}>

        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--c-border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, padding:'2px 10px', borderRadius:99,
                  background:sc+'20', color:sc, fontWeight:700, textTransform:'uppercase' }}>{finding.severity}</span>
                <StatusBadge status={finding.status} />
                {finding.ai_generated && <span style={{ fontSize:10, color:colors.indigo }}>AI-generated</span>}
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:colors.text, lineHeight:1.3 }}>{finding.title}</div>
              <div style={{ fontSize:12, color:colors.text3, marginTop:4 }}>
                {finding.standard && <span style={{ marginRight:8 }}>{finding.standard}</span>}
                {finding.control_ref_resolved && <span style={{ marginRight:8 }}>{finding.control_ref_resolved}</span>}
                {finding.domain_name && <span>{finding.domain_name}</span>}
              </div>
              {finding.business_impact && (
                <div style={{ fontSize:12, color:colors.text2, marginTop:8, padding:'8px 10px', background:'var(--c-bg3)', borderRadius:8 }}>
                  <strong>Business impact:</strong> {finding.business_impact}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:colors.text3, fontSize:20 }}>X</button>
          </div>
          <div style={{ display:'flex', gap:4, marginTop:14 }}>
            {(['detail','files','exception'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background: tab===t ? colors.accent : 'transparent', color: tab===t ? '#fff' : colors.text3,
              }}>
                {t==='detail'?'Details':t==='files'?'Files ('+files.length+')':'Exception'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {tab === 'detail' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {finding.description && (
                <div>
                  <div style={{ fontSize:11, color:colors.text3, marginBottom:6 }}>DESCRIPTION</div>
                  <div style={{ fontSize:13, color:colors.text2, lineHeight:1.7, background:colors.bg3, borderRadius:8, padding:12 }}>{finding.description}</div>
                </div>
              )}
              <div>
                <UserSearchPicker selected={assignees} onChange={handleAssigneesChange}
                  label="Assignees (search to add - click x to remove)" />
              </div>
              {finding.mitigation_plan && (
                <div>
                  <div style={{ fontSize:11, color:colors.text3, marginBottom:6 }}>MITIGATION PLAN</div>
                  <div style={{ fontSize:13, color:colors.text2, lineHeight:1.7, background:colors.bg3, borderRadius:8, padding:12 }}>{finding.mitigation_plan}</div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { l:'Created', v: finding.created_at ? new Date(finding.created_at).toLocaleDateString('en-GB') : '-' },
                  { l:'Created By', v: finding.created_by || '-' },
                  { l:'Due Date', v: finding.due_date ? new Date(finding.due_date).toLocaleDateString('en-GB') : 'Not set' },
                  { l:'Source', v: finding.source || '-' },
                  { l:'Files', v: files.length },
                  { l:'Control Ref', v: finding.control_ref_resolved || finding.control_ref || '-' },
                ].map(m => (
                  <div key={m.l} style={{ background:colors.bg3, borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>{m.l}</div>
                    <div style={{ fontSize:13, color:colors.text, fontWeight:500 }}>{m.v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:11, color:colors.text3, marginBottom:8 }}>ACTIONS</div>
                {!isControlLead && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {finding.status==='open' && <Btn small onClick={() => updateStatus('in-remediation')}>Start Remediation</Btn>}
                    {finding.status==='in-remediation' && <Btn small onClick={() => updateStatus('resolved')}>Mark Resolved</Btn>}
                    {finding.status==='resolved' && <Btn small variant="ghost" onClick={() => updateStatus('accepted')}>Accept and Close</Btn>}
                    {(finding.status==='open'||finding.status==='in-remediation') && (
                      <Btn small variant="ghost" onClick={() => setTab('exception')}>Request Exception</Btn>
                    )}
                    {finding.status==='exception-requested' && canDecide && (
                      <>
                        <Btn small onClick={() => decide('approve')} style={{ background:colors.green }}>Approve Exception</Btn>
                        <Btn small onClick={() => decide('reject')} style={{ background:colors.red }}>Reject</Btn>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'files' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ fontSize:13, color:colors.text3 }}>Upload evidence, remediation proof, or exception justification documents.</div>
                <input ref={fileRef} type="file" multiple style={{ display:'none' }}
                  onChange={e => { Array.from(e.target.files||[]).forEach(f => uploadFile(f)); }} />
                <Btn small onClick={() => fileRef.current?.click()} style={{ opacity:uploading?0.6:1 }}>
                  {uploading ? 'Uploading...' : 'Upload Files'}
                </Btn>
              </div>
              {files.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', color:colors.text3 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📎</div>
                  <div style={{ fontSize:14, fontWeight:600, color:colors.text, marginBottom:4 }}>No files attached</div>
                  <Btn style={{ marginTop:12 }} onClick={() => fileRef.current?.click()}>Upload First File</Btn>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {files.map((f:any) => (
                    <div key={f.id} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 14px',
                      background:colors.bg3, borderRadius:8 }}>
                      <span style={{ fontSize:20 }}>📄</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:colors.accent }}>{f.original_name||f.filename}</div>
                        <div style={{ fontSize:11, color:colors.text3, marginTop:2 }}>
                          {f.purpose} · {f.uploaded_by} · {f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB') : ''}
                          {f.file_size ? ' · '+(f.file_size/1024).toFixed(1)+' KB' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'exception' && (
            <div>
              {finding.status==='exception-requested' ? (
                <div style={{ padding:20, background:colors.indigo+'10', borderRadius:10 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:colors.indigo, marginBottom:8 }}>Exception Pending Review</div>
                  <div style={{ fontSize:13, color:colors.text2, marginBottom:4 }}>Reason: {finding.exception_reason||'-'}</div>
                  <div style={{ fontSize:13, color:colors.text2 }}>Requested by: {finding.exception_requested_by||'-'}</div>
                  {canDecide && (
                    <>
                      <div style={{ marginTop:16, marginBottom:16 }}>
                        <div style={{ fontSize:11, color:colors.text3, marginBottom:6 }}>REVIEW COMMENTS *</div>
                        <textarea
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          rows={4}
                          style={{ ...inp, resize:'vertical' }}
                          placeholder="Enter your review comments before approving or rejecting..."
                        />
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:14 }}>
                        <Btn onClick={() => decide('approve')} style={{ background:colors.green, opacity:submitting?0.6:1 }}>Approve</Btn>
                        <Btn onClick={() => decide('reject')} style={{ background:colors.red, opacity:submitting?0.6:1 }}>Reject</Btn>
                      </div>
                    </>
                  )}
                </div>
              ) : finding.exception_status==='approved' ? (
                <div style={{ padding:20, background:colors.green+'10', borderRadius:10 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:colors.green, marginBottom:8 }}>Exception Approved</div>
                  <div style={{ fontSize:13, color:colors.text2 }}>Reason: {finding.exception_reason}</div>
                </div>
              ) : finding.exception_status==='rejected' ? (
                <div style={{ padding:20, background:colors.red+'10', borderRadius:10 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:colors.red, marginBottom:8 }}>Exception Rejected</div>
                </div>
              ) : (finding.status==='open'||finding.status==='in-remediation') ? (
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:colors.text, marginBottom:4 }}>Request Exception</div>
                  <div style={{ fontSize:13, color:colors.text3, marginBottom:16 }}>
                    Use when a control cannot be implemented. An exception must be approved by a Compliance Admin, Control Lead, Assessor, Reviewer / QA, Risk Owner, or Auditor.
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>EXCEPTION REASON *</div>
                    <textarea value={excReason} onChange={e => setExcReason(e.target.value)} rows={4}
                      style={{ ...inp, resize:'vertical' }} placeholder="Explain why an exception is warranted..." />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:colors.text3, marginBottom:5 }}>COMPENSATING CONTROLS / MITIGATION</div>
                    <textarea value={excPlan} onChange={e => setExcPlan(e.target.value)} rows={3}
                      style={{ ...inp, resize:'vertical' }} placeholder="Describe compensating controls or mitigations..." />
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <UserSearchPicker selected={excApprover} onChange={setExcApprover} singleSelect
                      roleFilter={['reviewer_qa','assessor','auditor','compliance_admin','control_lead','risk_owner','super_admin']}
                      label="Exception Approver * (Compliance Admin / Control Lead / Assessor / Reviewer / QA / Risk Owner / Auditor)" />
                  </div>
                  <Btn onClick={requestException} style={{ opacity:submitting?0.7:1 }}>
                    {submitting ? 'Submitting...' : 'Submit Exception Request'}
                  </Btn>
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:'30px 20px', color:colors.text3 }}>
                  Exceptions can only be requested for open or in-remediation findings.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Findings Page ────────────────────────────────────────────────────────
export default function Findings() {
  const [items,      setItems]      = useState<any[]>([]);
  const [allStats,   setAllStats]   = useState<any>({ critical:0, high:0, open:0, ai:0, exception:0 });
  const [loading,    setLoading]    = useState(true);
  const user = getUser();
  const canCreateFinding = hasAnyRole(user?.roles, ['compliance_admin','assessor','reviewer_qa','risk_owner','auditor','super_admin']);
  const [creating,   setCreating]   = useState(false);
  const [selected,   setSelected]   = useState<any>(null);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [std,        setStd]        = useState('');
  const [sev,        setSev]        = useState('');
  const [statusF,    setStatusF]    = useState('');
  const [domainId,   setDomainId]   = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [domains,    setDomains]    = useState<any[]>([]);

  const selStyle: React.CSSProperties = { ...inp, height:36, padding:'4px 10px', width:'auto', minWidth:140 };

  useEffect(() => {
    api.findings({}).then((r:any) => {
      const all = r.items || [];
      setAllStats({
        critical: all.filter((i:any) => i.severity==='critical').length,
        high:     all.filter((i:any) => i.severity==='high').length,
        open:     all.filter((i:any) => i.status==='open').length,
        ai:       all.filter((i:any) => i.ai_generated).length,
        exception:all.filter((i:any) => i.status==='exception-requested').length,
      });
    }).catch(()=>{});
    api.frameworks().then(setFrameworks).catch(()=>{});
  }, []);

  useEffect(() => {
    setDomainId(''); setDomains([]);
    if (!std) return;
    api.domains(std).then(setDomains).catch(()=>{});
  }, [std]);

  const load = useCallback(() => {
    setLoading(true);
    api.findings({ standard:std||undefined, severity:sev||undefined, status:statusF||undefined,
                   domainId:domainId||undefined, assignedTo:assignedTo||undefined })
      .then((r:any) => setItems(r.items||[]))
      .catch((e:any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [std, sev, statusF, domainId, assignedTo]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => { setStd(''); setSev(''); setStatusF(''); setDomainId(''); setAssignedTo(''); };
  const hasFilter = !!(std || sev || statusF || domainId || assignedTo);

  if (loading && items.length === 0) return <LoadingSpinner />;

  return (
    <PageWrap title="Audit Findings"
      subtitle="All findings from audit workflows, gap analysis, and manual review. Assign, remediate, or request exceptions."
      action={<Btn onClick={() => setCreating(true)} disabled={!canCreateFinding}>{canCreateFinding ? '+ Add Finding' : 'Create disabled'}</Btn>}>

      <Grid cols={5}>
        {[
          { label:'Critical',           value:allStats.critical,  color:colors.red },
          { label:'High',               value:allStats.high,      color:colors.orange },
          { label:'Open',               value:allStats.open,      color:colors.yellow },
          { label:'AI-Generated',       value:allStats.ai,        color:colors.indigo },
          { label:'Exceptions Pending', value:allStats.exception, color:colors.accent },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      <Card style={{ marginTop:16, marginBottom:4, padding:'12px 16px' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>FRAMEWORK</div>
            <select value={std} onChange={e => setStd(e.target.value)} style={selStyle}>
              <option value="">All Frameworks</option>
              {frameworks.map((f:any) => <option key={f.code} value={f.code}>{f.code}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>DOMAIN</div>
            <select value={domainId} onChange={e => setDomainId(e.target.value)}
              style={{ ...selStyle, opacity:!std?0.4:1 }} disabled={!std}>
              <option value="">All Domains</option>
              {domains.map((d:any) => <option key={d.id} value={d.id}>{d.ref_code} - {d.area}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>SEVERITY</div>
            <select value={sev} onChange={e => setSev(e.target.value)} style={selStyle}>
              <option value="">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>STATUS</div>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selStyle}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/-/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, color:colors.text3, marginBottom:3 }}>ASSIGNED TO</div>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              placeholder="email or name..." style={{ ...selStyle, minWidth:160 }} />
          </div>
          {hasFilter && <Btn small variant="ghost" onClick={clearFilters}>Clear</Btn>}
          {loading && <div style={{ fontSize:12, color:colors.text3 }}>Loading...</div>}
        </div>
      </Card>

      <Card>
        {items.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:colors.text3 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>🔍</div>
            <div style={{ fontSize:14, fontWeight:600, color:colors.text, marginBottom:4 }}>
              {hasFilter ? 'No findings match your filters' : 'No findings yet'}
            </div>
            <div style={{ fontSize:13 }}>
              {hasFilter ? 'Try adjusting the filters above.' : 'Findings are created during audit workflows or added manually.'}
            </div>
            {!hasFilter && <Btn style={{ marginTop:12 }} onClick={() => setCreating(true)} disabled={!canCreateFinding}>{canCreateFinding ? '+ Add First Finding' : 'You need assessor-level access to create findings'}</Btn>}
          </div>
        ) : (
          <>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Severity','Title','Framework','Domain / Control','Assigned To','Status','Files',''].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 12px', borderBottom:'1px solid var(--c-border)',
                      color:colors.text3, fontWeight:600, fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((f:any) => {
                  const sc2 = sevColor(f.severity);
                  return (
                    <tr key={f.id} style={{ borderBottom:'1px solid var(--c-border)', cursor:'pointer' }}
                      onClick={() => setSelected(f)}
                      onMouseEnter={e => (e.currentTarget.style.background = colors.bg3)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:sc2, flexShrink:0 }} />
                          <span style={{ color:sc2, fontWeight:700, textTransform:'capitalize' }}>{f.severity}</span>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', maxWidth:280 }}>
                        <div style={{ fontWeight:600, color:colors.text, marginBottom:2 }}>{f.title}</div>
                        {f.ai_generated && <span style={{ fontSize:10, color:colors.indigo }}>AI</span>}
                        {f.description && (
                          <div style={{ fontSize:11, color:colors.text3 }}>{f.description?.slice(0,70)}{f.description?.length>70?'...':''}</div>
                        )}
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                          background:colors.accent+'18', color:colors.accent, fontWeight:600 }}>
                          {f.standard || '-'}
                        </span>
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ fontWeight:500, color:colors.text }}>{f.domain_name||'-'}</div>
                        {f.control_ref_resolved && (
                          <div style={{ fontSize:10, color:colors.accent, marginTop:1 }}>{f.control_ref_resolved}</div>
                        )}
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        {f.assignees_names ? (
                          <div>
                            {f.assignees_names.split(', ').map((name: string, i: number) => (
                              <div key={i} style={{ fontSize:12, color:colors.text,
                                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160 }}>
                                {name.replace(/ <.*>/, '')}
                              </div>
                            ))}
                          </div>
                        ) : f.assigned_to ? (
                          <div style={{ fontSize:12, color:colors.text }}>{f.assigned_to}</div>
                        ) : (
                          <span style={{ fontWeight:600, color:colors.red }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding:'10px 12px' }}><StatusBadge status={f.status} /></td>
                      <td style={{ padding:'10px 12px', color:colors.text3 }}>
                        {f.file_count > 0 && <span style={{ fontSize:11 }}>📎 {f.file_count}</span>}
                      </td>
                      <td style={{ padding:'10px 12px' }}>
                        <span onClick={e => e.stopPropagation()}>
                          <Btn small variant="ghost" onClick={() => setSelected(f)}>View</Btn>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize:12, color:colors.text3, padding:'10px 14px', borderTop:'1px solid var(--c-border)' }}>
              Showing {items.length} finding{items.length!==1?'s':''}{hasFilter?' (filtered)':''}
            </div>
          </>
        )}
      </Card>

      {creating && (
        <AddFindingModal
          onCreated={() => { load(); setAllStats((p:any) => ({...p, open: p.open+1})); }}
          onClose={() => setCreating(false)}
        />
      )}

      {selected && (
        <FindingDetail
          finding={selected}
          onClose={() => setSelected(null)}
          onDataChange={() => load()}
          onRefresh={() => { load(); setSelected(null); }}
        />
      )}
    </PageWrap>
  );
}
