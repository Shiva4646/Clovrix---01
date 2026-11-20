import { useState, useEffect, useRef } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal, colors } from '../ui';
import api from '@/lib/api';
import { toast } from '../Toast';
import { getActiveRole } from '@/lib/auth';

export default function PolicyManagementPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';
  const isControlLead = activeRole === 'Control Lead';
  
  // Nithi's modals + User's modals
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false); // For Nithi's Rich Editor or User's New Policy
  
  // User's specific states
  const defaultForm = { title: '', category: 'security', version: '1.0', ownerEmail: '', description: '', minimumApprovals: 1, tags: '', expiryDate: '', content: '' };
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [approvalModal, setApprovalModal] = useState<{ id: string, decision: 'approve'|'reject', comments: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.policies(undefined, showArchived)
       .then(setPolicies)
       .catch(console.error)
       .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [showArchived]);

  // -- User's implementations --
  const save = async () => {
    const payload = { 
      ...form, 
      tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()) : [],
      expiryDate: form.expiryDate || null,
    };
    
    let resId = selectedPolicy?.id || null;
    
    if (resId) {
      await api.updatePolicy(resId, payload);
      toast.success('Policy updated');
    } else {
      const res = await api.createPolicy(payload);
      resId = res.id;
      toast.success('Policy created');
    }

    if (file && resId) {
      await api.uploadPolicyFile(resId, file);
    }

    setEditorOpen(false);
    setSelectedPolicy(null);
    setFile(null);
    load();
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

  // Nithi's Headers
  const headers = ['Policy Name / ID', 'Status', 'Version', 'Owner', 'Sign-offs', 'Action'];
  
  // Merged Table Rows
  const rows = policies.map(p => [
    <div key={p.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{p.title} {p.is_archived && "(Archived)"}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{p.id}</div>
    </div>,
    <Badge key={p.id} label={p.status} status={p.status === 'approved' ? 'approved' : p.status === 'draft' ? 'draft' : 'in-review'} />,
    p.version,
    p.owner_email,
    <div key={p.id}>
       <span style={{ fontSize: 12, color: colors.green }}>{p.signed_count || 0} ✓</span>
       {' '}
       <span style={{ fontSize: 12, color: colors.text3 }}>{p.pending_count || 0} pending</span>
    </div>,
    <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {!isAuditor && !isControlLead && activeRole !== 'Assessor' && (
        <Btn small onClick={() => {
          setForm({
            title: p.title, category: p.category, version: p.version, ownerEmail: p.owner_email || '', description: p.description || '',
            minimumApprovals: p.minimum_approvals || 1, tags: p.tags ? JSON.parse(p.tags).join(', ') : '',
            expiryDate: p.expiry_date ? p.expiry_date.split('T')[0] : '', content: p.content || ''
          });
          setSelectedPolicy(p);
          setEditorOpen(true);
        }}>Edit</Btn>
      )}
      {!isAuditor && !isControlLead && activeRole !== 'Assessor' && p.status === 'in-review' && (
        <>
          <Btn small onClick={() => setApprovalModal({ id: p.id, decision: 'approve', comments: '' })}>Approve</Btn>
          <Btn small variant="ghost" onClick={() => setApprovalModal({ id: p.id, decision: 'reject', comments: '' })}>Reject</Btn>
        </>
      )}
      {p.file_path && <Btn small variant="ghost" onClick={() => downloadFile(p.id)}>File</Btn>}
      {!p.file_path && <Btn small variant="ghost" onClick={() => downloadPdf(p.id)}>PDF</Btn>}
      {!isAuditor && !isControlLead && activeRole !== 'Assessor' && (p.is_archived ? (
        <Btn small variant="ghost" onClick={() => restore(p.id)}>Restore</Btn>
      ) : (
        <Btn small variant="ghost" onClick={() => archive(p.id)}>Archive</Btn>
      ))}
      <Btn small variant="ghost" onClick={() => setSelectedPolicy(p)}>Details</Btn>
    </div>
  ]);

  return (
    <PageWrap 
      title="Policy Management" 
      subtitle="Manage the lifecycle of governance policies from draft to expiry."
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" onClick={() => setShowArchived(p => !p)}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Btn>
          {!isAuditor && !isControlLead && activeRole !== 'Assessor' && <Btn onClick={() => { setForm(defaultForm); setSelectedPolicy(null); setFile(null); setEditorOpen(true); }}>Create Policy</Btn>}
        </div>
      }
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text3)' }}>Loading policies...</div>
        ) : (
          <Table headers={headers} rows={rows} />
        )}
      </Card>

      {/* Merged Nithi's Rich Policy Editor + User's Form Logic */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={selectedPolicy ? "Edit Policy" : "Rich Policy Editor"} width={700}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Policy Title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', fontSize: 16, fontWeight: 600, gridColumn: '1/-1' }} />
            <input placeholder="Owner Email" value={form.ownerEmail} onChange={e => setForm(p => ({ ...p, ownerEmail: e.target.value }))} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', fontSize: 14 }} />
            <input placeholder="Version (e.g. 1.0)" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', fontSize: 14 }} />
            <input placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', fontSize: 14, gridColumn: '1/-1' }} />
          </div>

          <div style={{ border: '1px solid var(--c-border2)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: 'var(--c-bg3)', padding: 10, display: 'flex', gap: 8, borderBottom: '1px solid var(--c-border2)' }}>
              <button style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'var(--c-bg)', cursor: 'pointer' }}>B</button>
              <button style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'var(--c-bg)', cursor: 'pointer' }}>I</button>
              <button style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'var(--c-bg)', cursor: 'pointer' }}>U</button>
              <button style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'var(--c-bg)', cursor: 'pointer' }}>List</button>
            </div>
            <textarea placeholder="Write policy content here..." value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} style={{ width: '100%', height: 200, padding: 16, border: 'none', background: 'var(--c-bg)', color: 'var(--c-text)', resize: 'none', outline: 'none' }} />
          </div>

          {/* User's Upload File functionality integrated */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4 }}>Upload File (PDF/DOC/DOCX)</div>
            <div 
              style={{ border: `1px dashed var(--c-border)`, padding: 20, textAlign: 'center', borderRadius: 6, cursor: 'pointer', background: 'var(--c-bg3)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <span style={{ fontSize: 13, color: colors.indigo }}>{file.name}</span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--c-text3)' }}>Drag and drop or click to select a file</span>
              )}
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx" onChange={onFileChange} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Btn>
            <Btn onClick={save}>{selectedPolicy ? 'Save Changes' : 'Submit for Approval'}</Btn>
          </div>
        </div>
      </Modal>

      {/* Approval Modal */}
      {approvalModal && (
        <Modal open={!!approvalModal} onClose={() => setApprovalModal(null)} title={approvalModal.decision === 'approve' ? 'Approve Policy' : 'Reject Policy'} width={400}>
          <textarea rows={3} value={approvalModal.comments} onChange={e => setApprovalModal(p => p ? { ...p, comments: e.target.value } : null)}
            placeholder="Add comments..."
            style={{ width: '100%', background: 'var(--c-bg3)', border: `1px solid var(--c-border)`, borderRadius: 6, padding: '7px 10px', color: 'var(--c-text)', fontSize: 13, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={submitApproval}>Submit</Btn>
            <Btn variant="ghost" onClick={() => setApprovalModal(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      <Modal open={!!selectedPolicy && !editorOpen} onClose={() => setSelectedPolicy(null)} title="Policy Details" width={500}>
        {selectedPolicy && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedPolicy.title}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{selectedPolicy.id} | v{selectedPolicy.version}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Status</div>
                <Badge label={selectedPolicy.status} status={selectedPolicy.status === 'approved' ? 'approved' : selectedPolicy.status === 'draft' ? 'draft' : 'in-review'} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Owner</div>
                <div>{selectedPolicy.owner_email || 'Not specified'}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Activity Timeline</h4>
              <ul style={{ paddingLeft: 20, color: 'var(--c-text2)', fontSize: 13, lineHeight: 1.6 }}>
                <li>Policy drafted by {selectedPolicy.owner_email || 'System'}</li>
                {selectedPolicy.status === 'approved' && <li>Approved by Compliance Admin</li>}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}