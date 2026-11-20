import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import api from '@/lib/api';
import { getActiveRole, getUser } from '@/lib/auth';

export default function ControlLibraryPage() {
  const [controls, setControls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [modalType, setModalType] = useState<"update" | "notes" | "evidence" | null>(null);
  const [form, setForm] = useState<any>({});
  
  const activeRole = getActiveRole();
  const user = getUser();
  const isAuditor = activeRole === 'Lead Auditor';
  const isControlLead = activeRole === 'Control Lead';

  useEffect(() => {
    api.searchControls('')
      .then(data => {
        // Assume controls have an owner field, mock it if not present for testing
        const enhancedData = data.map(c => ({
          ...c,
          owner: c.owner || 'controlLead@clovrix.com' // Mocking owner
        }));
        setControls(enhancedData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const openModal = (type: "update" | "notes" | "evidence", control: any) => {
    setSelectedControl(control);
    setForm({ ...control });
    setModalType(type);
  };

  const saveChanges = () => {
    if (!selectedControl) return;
    setControls(prev => prev.map(c => c.id === selectedControl.id ? { ...c, ...form } : c));
    setModalType(null);
  };

  const uploadEvidence = () => {
    if (!selectedControl) return;
    setControls(prev => prev.map(c => c.id === selectedControl.id ? { ...c, notes: "Evidence uploaded and linked to control" } : c));
    setModalType(null);
    alert("Evidence uploaded successfully");
  };

  const headers = ['Control', 'Framework', 'Title', 'Mandatory', 'Action'];
  
  const rows = controls.map(c => {
    const isOwned = isControlLead && c.owner === user.email;
    const isAssessor = activeRole === 'Assessor';
    const canEdit = !isAuditor && !isAssessor && (!isControlLead || isOwned);

    return [
      <div key={c.id}>
        <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{c.ref || c.id}</div>
      </div>,
      <Badge key={c.id} label={c.framework_name || c.standard || 'General'} color="var(--c-accent)" />,
      c.title,
      <Badge key={c.id} label={c.is_mandatory ? 'Yes' : 'No'} status={c.is_mandatory ? 'compliant' : 'draft'} />,
      <div key={c.id} style={{ display: 'flex', gap: 6 }}>
        <Btn small variant="ghost" onClick={() => setSelectedControl(c)}>View Details</Btn>
        {canEdit && (
          <>
            <Btn small variant="ghost" onClick={() => openModal('update', c)}>Update</Btn>
            <Btn small variant="ghost" onClick={() => openModal('notes', c)}>Notes</Btn>
            <Btn small variant="ghost" onClick={() => openModal('evidence', c)}>Evidence</Btn>
          </>
        )}
      </div>
    ];
  });

  return (
    <PageWrap 
      title="Control Library" 
      subtitle="Catalog of all compliance controls and their mapping to frameworks."
      action={
        !isAuditor && !isControlLead && activeRole !== 'Assessor' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost">Bulk Assign Owner</Btn>
            <Btn>Create Control</Btn>
          </div>
        )
      }
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text3)' }}>Loading controls...</div>
        ) : (
          <Table headers={headers} rows={rows} />
        )}
      </Card>

      <Modal open={!!selectedControl && !modalType} onClose={() => setSelectedControl(null)} title="Control Details" width={600}>
        {selectedControl && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Control ID</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedControl.ref || selectedControl.id} — {selectedControl.title}</div>
            </div>
            
            <div style={{ marginBottom: 24 }}>
               <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Description</div>
               <div style={{ fontSize: 14 }}>{selectedControl.description || 'No description provided.'}</div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Linked Evidence</h4>
              <div style={{ color: 'var(--c-text3)', fontSize: 13 }}>{selectedControl.evidence_required || 'No evidence linked yet.'}</div>
            </div>
            {selectedControl.notes && (
              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16, marginTop: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Implementation Notes</h4>
                <div style={{ color: 'var(--c-text', fontSize: 13, background: 'var(--c-bg3)', padding: 12, borderRadius: 8 }}>{selectedControl.notes}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              {selectedControl.status && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Status</div>
                  <Badge label={selectedControl.status} status={selectedControl.status === 'Implemented' ? 'compliant' : 'partial'} />
                </div>
              )}
              {selectedControl.effectiveness && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Effectiveness</div>
                  <div style={{ fontWeight: 600 }}>{selectedControl.effectiveness}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {modalType && (
        <Modal open={!!modalType} onClose={() => setModalType(null)} title={
          modalType === "update" ? "Update Control Status" :
          modalType === "notes" ? "Implementation Notes" :
          "Upload Control Evidence"
        } width={500}>
          {modalType === "update" && (
            <div style={{display:"grid",gap:16}}>
              <div>
                <label style={{fontSize: 12, color: 'var(--c-text3)'}}>Status</label>
                <select value={form.status || ''} onChange={e=>setForm({...form,status:e.target.value})} style={{width: '100%', padding: '10px 12px', border: '1px solid var(--c-border)', borderRadius: 8, marginTop: 4, background: 'var(--c-bg)'}}>
                  <option>Implemented</option>
                  <option>In Progress</option>
                  <option>Pending</option>
                </select>
              </div>
              <div>
                <label style={{fontSize: 12, color: 'var(--c-text3)'}}>Effectiveness %</label>
                <input value={form.effectiveness || ''} onChange={e=>setForm({...form,effectiveness:e.target.value})} placeholder="Effectiveness %" style={{width: '100%', padding: '10px 12px', border: '1px solid var(--c-border)', borderRadius: 8, marginTop: 4, background: 'var(--c-bg)'}} />
              </div>
              <div>
                <label style={{fontSize: 12, color: 'var(--c-text3)'}}>Next Review Date</label>
                <input value={form.review || ''} onChange={e=>setForm({...form,review:e.target.value})} placeholder="Next Review Date" style={{width: '100%', padding: '10px 12px', border: '1px solid var(--c-border)', borderRadius: 8, marginTop: 4, background: 'var(--c-bg)'}} />
              </div>
            </div>
          )}

          {modalType === "notes" && (
            <textarea
              value={form.notes || ''}
              onChange={e=>setForm({...form,notes:e.target.value})}
              rows={6}
              style={{width:"100%",padding:12,border:"1px solid var(--c-border)",borderRadius:8, background: 'var(--c-bg)', color: 'var(--c-text)'}}
              placeholder="Implementation notes..."
            />
          )}

          {modalType === "evidence" && (
            <div>
              <p style={{color:"var(--c-text2)",marginBottom:12}}>Upload evidence for <b>{form.title}</b></p>
              <input type="file" style={{marginBottom:14}} />
              <textarea placeholder="Evidence comments..." rows={4} style={{width:"100%",padding:12,border:"1px solid var(--c-border)",borderRadius:8, background: 'var(--c-bg)', color: 'var(--c-text)'}} />
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
            <Btn variant="ghost" onClick={()=>setModalType(null)}>Cancel</Btn>
            <Btn onClick={modalType === "evidence" ? uploadEvidence : saveChanges}>
              {modalType === "evidence" ? "Upload Evidence" : "Save Changes"}
            </Btn>
          </div>
        </Modal>
      )}
    </PageWrap>
  );
}