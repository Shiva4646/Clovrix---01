import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { can } from '@/lib/capabilities';
import api from '@/lib/api';

// Backend evidence row (e.* + control_ref) → this page's shape.
function mapEvidence(e: any) {
  return {
    id: e.id,
    name: e.file_name || e.name || e.filename || 'evidence',
    controls: e.control_ref || '-',
    risks: '-',
    status: e.status || 'in-review',
    expiry: String(e.expiry_date || e.expiry || '').slice(0, 10) || '-',
    date: String(e.uploaded_at || e.created_at || '').slice(0, 10),
  };
}

export default function EvidenceManagerPage() {
  const [evidence, setEvidence] = useState<any[]>([]);
  useEffect(() => {
    api.evidence()
      .then((r: any) => {
        const rows = Array.isArray(r) ? r : (r?.items || r?.evidence || []);
        setEvidence(rows.map(mapEvidence));
      })
      .catch(() => setEvidence([]));
  }, []);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Capability gates (per role-page matrix)
  const canUpload = can('evidence.upload'); // Admin + Control Lead
  const canReview = can('evidence.review'); // Admin + Assessor (accept / reject)

  const handleViewEvidence = async () => {
  if (!selectedFile?.id) return;

  try {
    const response = await api.downloadEvidence(selectedFile.id);

    let url = response.url;

    if (url?.startsWith('http://minio:9000')) {
      url = url.replace('http://minio:9000', 'http://localhost:9000');
    }

    if (!url) {
      throw new Error('Evidence URL was not returned');
    }

    window.open(url, '_blank');
  } catch (err: any) {
    console.error('Evidence preview failed:', err);
  }
};

  const getExpiryState = (expiry: string) => {
    if (expiry === '-') return { label: '-', color: 'var(--c-text3)' };
    const expDate = new Date(expiry).getTime();
    const now = new Date('2026-06-27').getTime();
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { label: `Expired (${expiry})`, color: 'var(--c-red)' };
    if (diffDays <= 30) return { label: `Expiring in ${diffDays} days`, color: 'var(--c-orange)' };
    return { label: expiry, color: 'var(--c-text)' };
  };

  const headers = ['File Name', 'Linked Control(s)', 'Upload Date', 'Approval Status', 'Expiry Date', 'Action'];
  
  const rows = evidence.map(e => {
    const exp = getExpiryState(e.expiry);
    return [
      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 20 }}>{e.name.endsWith('.pdf') ? '📄' : e.name.endsWith('.csv') ? '📊' : '📝'}</div>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{e.name}</div>
          <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{e.id}</div>
        </div>
      </div>,
      <Badge key={e.id} label={e.controls} color="var(--c-accent)" />,
      e.date,
      <Badge key={e.id} label={e.status} status={e.status} />,
      <div key={e.id} style={{ color: exp.color, fontWeight: exp.color !== 'var(--c-text)' ? 700 : 400 }}>{exp.label}</div>,
      <Btn key={e.id} small variant="ghost" onClick={() => setSelectedFile(e)}>Preview</Btn>
    ];
  });

  const expiringCount = evidence.filter(e => {
    if (e.expiry === '-') return false;
    const diffDays = Math.ceil((new Date(e.expiry).getTime() - new Date('2026-06-27').getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays >= 0;
  }).length;

  return (
    <PageWrap 
      title="Evidence Manager" 
      subtitle="Central repository for audit/compliance evidence with traceability."
      action={canUpload && <Btn onClick={() => setUploadOpen(true)}>Upload Evidence</Btn>}
    >
      {expiringCount > 0 && (
        <Card style={{ padding: '12px 16px', background: 'rgba(255,166,0,0.1)', border: '1px solid var(--c-orange)', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--c-orange)', fontWeight: 600 }}>
            <span>⚠️</span> {expiringCount} evidence file(s) expiring within the next 30 days.
          </div>
          <Btn small variant="ghost" style={{ color: 'var(--c-orange)' }}>Filter Expiring</Btn>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedFile} onClose={() => setSelectedFile(null)} title="Evidence Preview" width={600}>
        {selectedFile && (
          <div>
            <div style={{ padding: 40, textAlign: 'center', background: 'var(--c-bg3)', borderRadius: 8, border: '1px dashed var(--c-border2)', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
              <div style={{ fontWeight: 600 }}>{selectedFile.name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 4 }}>Uploaded {selectedFile.date}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Status</div>
                <Badge label={selectedFile.status} status={selectedFile.status} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Expiry Date</div>
                <div style={{ color: getExpiryState(selectedFile.expiry).color, fontWeight: 600 }}>
                  {getExpiryState(selectedFile.expiry).label}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Version History</h4>
                {selectedFile.status === 'rejected' && canUpload && (
                  <Btn small variant="primary" onClick={() => { setUploadOpen(true); setSelectedFile(null); }}>
                    Resubmit Evidence
                  </Btn>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-text)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--c-border2)' }}>
                  <span>v2.0 (Current) - {selectedFile.date}</span>
                  <Badge label={selectedFile.status} status={selectedFile.status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: 'var(--c-text3)' }}>
                  <span>v1.0 - 2025-12-01</span>
                  <span>Superseded</span>
                </div>
              </div>

              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Audit Trail & Comments</h4>
              <div style={{ color: 'var(--c-text2)', fontSize: 13, background: 'var(--c-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                <strong>Jordan Lee:</strong> Uploaded document for review.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <input placeholder="Add a comment..." style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)' }} />
                <Btn small>Post</Btn>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
  <Btn variant="primary" onClick={handleViewEvidence}>
    View PDF
  </Btn>

  <Btn variant="ghost" onClick={() => setSelectedFile(null)}>
    Close
  </Btn>
              {canReview && selectedFile.status !== 'approved' && (
                <>
                  <Btn variant="ghost">Request More</Btn>
                  <Btn variant="danger">Reject</Btn>
                  <Btn variant="success">Accept Evidence</Btn>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload / Resubmit Evidence" width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 40, textAlign: 'center', background: 'var(--c-bg3)', borderRadius: 8, border: '2px dashed var(--c-border2)', cursor: 'pointer' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📤</div>
            <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>Drag and drop files here</div>
            <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 4 }}>or click to browse</div>
          </div>
          
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)' }}>Tag to Controls (Optional)</label>
            <input placeholder="e.g. A.1.1, A.3.1" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Btn>
            <Btn onClick={() => setUploadOpen(false)}>Upload Files</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}