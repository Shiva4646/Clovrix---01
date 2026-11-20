import { useState } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';

export default function AIIAPage() {
  const [assessments] = useState([
    { id: 'AIIA-001', system: 'Customer Support Bot (V2)', date: '2026-06-10', status: 'Completed', reviewer: 'Admin' },
    { id: 'AIIA-002', system: 'Resume Screening AI', date: '2026-06-15', status: 'Draft', reviewer: 'HR Dept' },
  ]);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);

  const headers = ['Assessment ID', 'AI System', 'Date Assessed', 'Status', 'Reviewer', 'Action'];
  
  const rows = assessments.map(a => [
    <div key={a.id} style={{ fontWeight: 600, color: 'var(--c-text)' }}>{a.id}</div>,
    <div key={a.id} style={{ fontWeight: 500 }}>{a.system}</div>,
    a.date,
    <Badge key={a.id} label={a.status} color={a.status === 'Completed' ? 'var(--c-green)' : 'var(--c-orange)'} />,
    a.reviewer,
    <Btn key={a.id} small variant="ghost" onClick={() => setSelectedAssessment(a)}>Review / Edit</Btn>
  ]);

  return (
    <PageWrap 
      title="AI Impact Assessment (AIIA)" 
      subtitle="Clause 6.1.2: Identify and mitigate potential harms to affected parties caused by AI systems."
      action={<Btn>+ New Assessment</Btn>}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedAssessment} onClose={() => setSelectedAssessment(null)} title="AI Impact Assessment" width={800}>
        {selectedAssessment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border2)', paddingBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Target System</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedAssessment.system}</div>
              </div>
              <div>
                <Badge label={selectedAssessment.status} color={selectedAssessment.status === 'Completed' ? 'var(--c-green)' : 'var(--c-orange)'} />
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Identified Harms & Mitigations</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Repeatable Block 1 */}
                <div style={{ border: '1px solid var(--c-border2)', borderRadius: 8, padding: 16, background: 'var(--c-bg)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Affected Party</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="Customers">
                        <option>Customers</option><option>Employees</option><option>Third Parties</option><option>Society</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Harm Type</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="Privacy">
                        <option>Discrimination / Bias</option><option>Financial Harm</option><option>Privacy / Data</option><option>Safety</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Severity Rating</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="High">
                        <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Mitigations in Place</div>
                    <textarea defaultValue="Data anonymization pipeline active. Annual privacy audits." style={{ width: '100%', height: 50, padding: 8, borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <Btn small variant="ghost">Forward to Risk Register ➔</Btn>
                  </div>
                </div>

                {/* Repeatable Block 2 */}
                <div style={{ border: '1px solid var(--c-border2)', borderRadius: 8, padding: 16, background: 'var(--c-bg)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Affected Party</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="Customers">
                        <option>Customers</option><option>Employees</option><option>Third Parties</option><option>Society</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Harm Type</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="Discrimination / Bias">
                        <option>Discrimination / Bias</option><option>Financial Harm</option><option>Privacy / Data</option><option>Safety</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Severity Rating</div>
                      <select style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} defaultValue="Medium">
                        <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Mitigations in Place</div>
                    <textarea defaultValue="Human-in-the-loop review for automated decisions." style={{ width: '100%', height: 50, padding: 8, borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <Btn small variant="ghost">Forward to Risk Register ➔</Btn>
                  </div>
                </div>

                <Btn variant="ghost" style={{ alignSelf: 'flex-start', borderStyle: 'dashed' }}>+ Add Another Harm</Btn>

              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <Btn variant="ghost" onClick={() => setSelectedAssessment(null)}>Cancel</Btn>
              <Btn>Save Assessment</Btn>
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}
