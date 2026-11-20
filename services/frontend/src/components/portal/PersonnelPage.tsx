import { useState } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { getActiveRole } from '@/lib/auth';

export default function PersonnelPage() {
  const [personnel] = useState([
    { id: 'EMP-01', name: 'Alex Morgan', dept: 'Compliance', training: 'Completed', certs: 2, controls: 5, status: 'compliant' },
    { id: 'EMP-02', name: 'Jordan Lee', dept: 'Engineering', training: 'Overdue', certs: 1, controls: 12, status: 'non-compliant' },
    { id: 'EMP-03', name: 'Sam Rivera', dept: 'Risk', training: 'Completed', certs: 4, controls: 2, status: 'compliant' },
  ]);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';

  const headers = ['Employee Name', 'Department', 'Training Status', 'Certifications', 'Assigned Controls', 'Compliance', 'Action'];
  
  const rows = personnel.map(p => [
    <div key={p.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{p.name}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{p.id}</div>
    </div>,
    p.dept,
    <Badge key={p.id} label={p.training} color={p.training === 'Completed' ? 'var(--c-green)' : 'var(--c-red)'} />,
    p.certs,
    p.controls,
    <Badge key={p.id} label={p.status} status={p.status} />,
    <Btn key={p.id} small variant="ghost" onClick={() => setSelectedPerson(p)}>View Record</Btn>
  ]);

  return (
    <PageWrap 
      title="Personnel Compliance" 
      subtitle="Track employee training and compliance status against assigned controls."
      action={!isAuditor && <Btn>Assign Training</Btn>}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedPerson} onClose={() => setSelectedPerson(null)} title="Personnel Record" width={500}>
        {selectedPerson && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedPerson.name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{selectedPerson.dept}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Training Status</div>
                <Badge label={selectedPerson.training} color={selectedPerson.training === 'Completed' ? 'var(--c-green)' : 'var(--c-red)'} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Overall Compliance</div>
                <Badge label={selectedPerson.status} status={selectedPerson.status} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Training & Certification Timeline</h4>
              <ul style={{ paddingLeft: 20, color: 'var(--c-text2)', fontSize: 13, lineHeight: 1.6 }}>
                <li>2026-01-15: Completed Security Awareness Training</li>
                <li>2025-08-10: Achieved ISO 27001 Lead Implementer Certification</li>
                {selectedPerson.training === 'Overdue' && (
                  <li style={{ color: 'var(--c-red)' }}>2026-05-01: Missed AI Ethics Refresher Deadline</li>
                )}
              </ul>
              
              {!isAuditor && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <Btn small>Send Reminder</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}