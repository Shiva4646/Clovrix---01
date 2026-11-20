import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, Table, colors } from './ui';

export default function Policies() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [detail, setDetail]     = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing]   = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  
  const defaultForm = { title: '', category: 'security', version: '1.0', ownerEmail: '', description: '', minimumApprovals: 1, tags: '', expiryDate: '', content: '' };
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [approvalModal, setApprovalModal] = useState<{ id: string, decision: 'approve'|'reject', comments: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.policies(undefined, showArchived).then(setPolicies).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [showArchived]);

  const openDetail = async (p: any) => {
    const d = await api.policy(p.id);
    setDetail(d);
  };

  const save = async () => {
    const payload = { 
      ...form, 
      tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      expiryDate: form.expiryDate || null,
    };
    
    let resId = editing ? editing.id : null;
    
    if (editing) {
      await api.updatePolicy(editing.id, payload);
    } else {
      const res = await api.createPolicy(payload);
      resId = res.id;
    }

    if (file && resId) {
      await api.uploadPolicyFile(resId, file);
    }

    setCreating(false);
    setEditing(null);
    setFile(null);
    load();
    if (editing && detail?.policy?.id === editing.id) openDetail({ id: editing.id });
  };

  const startEdit = (p: any) => {
    setEditing(p);
    setForm({
      title: p.title,
      category: p.category,
      version: p.version,
      ownerEmail: p.owner_email || '',
      description: p.description || '',
      minimumApprovals: p.minimum_approvals || 1,
      tags: p.tags ? JSON.parse(p.tags).join(', ') : '',
      expiryDate: p.expiry_date ? p.expiry_date.split('T')[0] : '',
      content: p.content || ''
    });
  };

  const archive = async (id: string) => {
    await api.archivePolicy(id);
    load();
  };
  
  const restore = async (id: string) => {
    await api.restorePolicy(id);
    load();
  };

  const submitApproval = async () => {
    if (!approvalModal) return;
    await api.approvePolicy(approvalModal.id, approvalModal.decision, approvalModal.comments);
    setApprovalModal(null);
    load();
    if (detail?.policy?.id === approvalModal.id) openDetail({ id: approvalModal.id });
  };

  const downloadPdf = (policyId: string) => {
    window.open(`${import.meta.env.VITE_API_URL}/api/reports/SOC2/pdf`, '_blank');
  };

  const downloadFile = async (policyId: string) => {
    try {
      const res = await api.downloadPolicyFile(policyId);
      window.open(res.url, '_blank');
    } catch (e) {
      alert("No file found or error downloading.");
    }
  };

  const onFileChange = (e: any) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Policy Management" subtitle="Versioned policies with cryptographic sign-off"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" onClick={() => setShowArchived(p => !p)}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Btn>
          <Btn onClick={() => { setCreating(true); setEditing(null); setForm(defaultForm); setFile(null); }}>+ New Policy</Btn>
        </div>
      }>

      {(creating || editing) && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editing ? 'Edit Policy' : 'New Policy'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Title *</div>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Owner Email</div>
              <input value={form.ownerEmail} onChange={e => setForm(p => ({ ...p, ownerEmail: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Category</div>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }}>
                {['security', 'privacy', 'ai', 'ops', 'hr', 'compliance'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Version</div>
              <input value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Description</div>
              <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13, fontFamily: 'sans-serif' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Minimum Approvals</div>
              <input type="number" value={form.minimumApprovals} onChange={e => setForm(p => ({ ...p, minimumApprovals: parseInt(e.target.value) || 1 }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Expiry Date</div>
              <input type="date" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Tags (comma separated)</div>
              <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                placeholder="e.g. SOC2, ISO27001"
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
            </div>
            {!editing && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Content</div>
                <textarea rows={5} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="# Policy Title&#10;&#10;## Purpose&#10;..."
                  style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13, fontFamily: 'monospace' }} />
              </div>
            )}
            <div style={{ gridColumn: '1/-1', marginTop: 10 }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Upload File (PDF/DOC/DOCX)</div>
              <div 
                style={{ border: `1px dashed ${colors.border}`, padding: 20, textAlign: 'center', borderRadius: 6, cursor: 'pointer', background: colors.bg3 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]); }}
              >
                {file ? (
                  <span style={{ fontSize: 13, color: colors.indigo }}>{file.name}</span>
                ) : (
                  <span style={{ fontSize: 13, color: colors.text3 }}>Drag and drop or click to select a file</span>
                )}
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx" onChange={onFileChange} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn onClick={save}>{editing ? 'Save Changes' : 'Create Policy'}</Btn>
            <Btn variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {approvalModal && (
        <Card style={{ marginBottom: 16, border: `1px solid ${colors.indigo}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            {approvalModal.decision === 'approve' ? 'Approve Policy' : 'Reject Policy'}
          </div>
          <textarea rows={3} value={approvalModal.comments} onChange={e => setApprovalModal(p => p ? { ...p, comments: e.target.value } : null)}
            placeholder="Add comments..."
            style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={submitApproval}>Submit</Btn>
            <Btn variant="ghost" onClick={() => setApprovalModal(null)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 380px' : '1fr', gap: 16 }}>
        <Card>
          <Table
            headers={['Title', 'Category', 'Version', 'Status', 'Owner', 'Sign-offs', 'Actions']}
            rows={policies.map(p => [
              <div style={{ cursor: 'pointer' }} onClick={() => openDetail(p)}>
                <div style={{ fontSize: 13, color: p.is_archived ? colors.text3 : colors.indigo, fontWeight: 500 }}>
                  {p.title} {p.is_archived && "(Archived)"}
                </div>
                {p.tags && <div style={{ fontSize: 10, color: colors.text3 }}>{JSON.parse(p.tags).join(' · ')}</div>}
              </div>,
              <Badge label={p.category} />,
              <span style={{ fontSize: 12, color: colors.text3, fontFamily: 'monospace' }}>v{p.version}</span>,
              <Badge label={p.status} status={p.status} />,
              <span style={{ fontSize: 12, color: colors.text2 }}>{p.owner_email?.split('@')[0] || '-'}</span>,
              <div>
                <span style={{ fontSize: 12, color: colors.green }}>{p.signed_count || 0} ✓</span>
                {' '}
                <span style={{ fontSize: 12, color: colors.text3 }}>{p.pending_count || 0} pending</span>
              </div>,
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn small onClick={() => startEdit(p)}>Edit</Btn>
                {p.status === 'in-review' && (
                  <>
                    <Btn small onClick={() => setApprovalModal({ id: p.id, decision: 'approve', comments: '' })}>Approve</Btn>
                    <Btn small variant="ghost" onClick={() => setApprovalModal({ id: p.id, decision: 'reject', comments: '' })}>Reject</Btn>
                  </>
                )}
                {p.file_path && <Btn small variant="ghost" onClick={() => downloadFile(p.id)}>File</Btn>}
                {!p.file_path && <Btn small variant="ghost" onClick={() => downloadPdf(p.id)}>PDF</Btn>}
                {p.is_archived ? (
                  <Btn small variant="ghost" onClick={() => restore(p.id)}>Restore</Btn>
                ) : (
                  <Btn small variant="ghost" onClick={() => archive(p.id)}>Archive</Btn>
                )}
              </div>,
            ])}
          />
        </Card>

        {detail && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{detail.policy?.title}</div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', color: colors.text3, fontSize: 18, cursor: 'pointer', border: 'none' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Badge label={detail.policy?.status} status={detail.policy?.status} />
              <span style={{ fontSize: 12, color: colors.text3 }}>v{detail.policy?.version}</span>
            </div>
            {detail.policy?.description && <div style={{ fontSize: 12, color: colors.text2, marginBottom: 12 }}>{detail.policy.description}</div>}
            
            {/* Sign-offs */}
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.text3, marginBottom: 8 }}>SIGN-OFFS</div>
            {detail.signoffs?.map((s: any) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <div style={{ fontSize: 13, color: colors.text }}>{s.full_name}</div>
                  <div style={{ fontSize: 11, color: colors.text3 }}>{s.email}</div>
                </div>
                <Badge label={s.status} status={s.status === 'signed' ? 'compliant' : 'partial'} />
              </div>
            ))}

            {/* Versions */}
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.text3, marginTop: 16, marginBottom: 8 }}>VERSION HISTORY</div>
            {detail.versions?.map((v: any) => (
              <div key={v.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: colors.text, fontFamily: 'monospace' }}>v{v.version}</span>
                  <span style={{ fontSize: 11, color: colors.text3 }}>{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                {v.change_note && <div style={{ fontSize: 11, color: colors.text2 }}>{v.change_note}</div>}
              </div>
            ))}
          </Card>
        )}
      </div>
    </PageWrap>
  );
}
