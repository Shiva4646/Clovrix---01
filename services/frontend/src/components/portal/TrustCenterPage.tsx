import { useState } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { getActiveRole } from '@/lib/auth';

export default function TrustCenterPage() {
  const [requests] = useState([
    { id: 'REQ-901', customer: 'Acme Corp', document: 'SOC 2 Type II Report', status: 'pending', date: '2026-06-25' },
    { id: 'REQ-902', customer: 'Globex Inc', document: 'ISO 27001 Certificate', status: 'approved', date: '2026-06-20' },
  ]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'admin' | 'public'>('admin');
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';

  const headers = ['Request ID', 'Customer/Prospect', 'Requested Document', 'Status', 'Date', 'Action'];
  
  const rows = requests.map(r => [
    <div key={r.id} style={{ fontWeight: 600, color: 'var(--c-text)' }}>{r.id}</div>,
    r.customer,
    r.document,
    <Badge key={r.id} label={r.status} status={r.status} />,
    r.date,
    <Btn key={r.id} small variant="ghost" onClick={() => setSelectedRequest(r)}>
      {isAuditor ? 'View Details' : 'Manage Request'}
    </Btn>
  ]);

  if (viewMode === 'public') {
    return (
      <div style={{ padding: '40px 20px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Clovrix Trust Center</h1>
            <p style={{ color: 'var(--c-text2)', fontSize: 16 }}>Our commitment to security, privacy, and compliance.</p>
          </div>
          <Btn variant="ghost" onClick={() => setViewMode('admin')}>Back to Admin View</Btn>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Certifications & Frameworks</h3>
            <ul style={{ paddingLeft: 20, color: 'var(--c-text2)', lineHeight: 1.8 }}>
              <li>ISO 42001:2023 (AI Management)</li>
              <li>ISO 27001:2022 (Information Security)</li>
              <li>SOC 2 Type II</li>
              <li>GDPR Compliant</li>
            </ul>
          </Card>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Request Documents</h3>
            <p style={{ color: 'var(--c-text2)', fontSize: 13, marginBottom: 16 }}>Need access to our SOC 2 report or Pen Test results? Request them here under NDA.</p>
            <Btn style={{ width: '100%' }}>Request Documents</Btn>
          </Card>
        </div>
        
        <Card style={{ padding: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Security FAQs</h3>
          <div style={{ color: 'var(--c-text2)', fontSize: 14 }}>
            <p style={{ marginBottom: 10 }}><strong>Where is my data stored?</strong><br/>All data is stored in AWS US-East.</p>
            <p><strong>Do you use customer data to train AI?</strong><br/>No, Clovrix explicitly opts out of all customer data training unless explicitly authorized.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <PageWrap 
      title="Trust Center Management" 
      subtitle="Manage your public-facing Trust Center and customer document requests."
      action={<Btn onClick={() => setViewMode('public')}>Preview Public Trust Center</Btn>}
    >
      <div style={{ marginBottom: 20, display: 'flex', gap: 20 }}>
        <Card style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Public Status</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Published</div>
          </div>
          {!isAuditor && <Btn small variant="ghost">Edit Content</Btn>}
        </Card>
        <Card style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Pending Requests</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--c-orange)' }}>1 Request</div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedRequest} onClose={() => setSelectedRequest(null)} title="Manage Document Request" width={500}>
        {selectedRequest && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedRequest.customer}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{selectedRequest.id}</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Requested Document</div>
                <div style={{ fontWeight: 500 }}>{selectedRequest.document}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Status</div>
                <Badge label={selectedRequest.status} status={selectedRequest.status} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" small onClick={() => setSelectedRequest(null)}>Close</Btn>
              {!isAuditor && (
                <>
                  <Btn variant="danger" small onClick={() => setSelectedRequest(null)}>Deny Request</Btn>
                  <Btn variant="success" small onClick={() => setSelectedRequest(null)}>Approve & Send</Btn>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}