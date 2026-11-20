import { useState } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal, Bar } from '../ui';
import { getActiveRole } from '@/lib/auth';

export default function RemediationsPage() {
  const [actions, setActions] = useState([
    { id: 'REM-501', title: 'Implement AI Model Access Logs', linked: 'RSK-01', priority: 'High', due: '2026-07-15', progress: 50 },
    { id: 'REM-502', title: 'Update Acceptable Use Policy', linked: 'FND-101', priority: 'Medium', due: '2026-08-01', progress: 10 },
    { id: 'REM-503', title: 'Rotate API Keys', linked: 'FND-103', priority: 'Critical', due: '2026-06-30', progress: 100 },
  ]);
  const [selectedAction, setSelectedAction] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newAction, setNewAction] = useState({ title: '', linked: '', priority: 'Medium', due: '', assignee: '' });
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';
  const isRiskOwner = activeRole === 'Risk Owner';
  const isControlLead = activeRole === 'Control Lead';
  const isAssessor = activeRole === 'Assessor';
  const canEdit = !isAuditor && !isAssessor;

  const getPriorityColor = (p: string) => p === 'Critical' ? 'var(--c-red)' : p === 'High' ? 'var(--c-orange)' : 'var(--c-yellow)';

  const headers = ['Action Title / ID', 'Linked Item', 'Priority', 'Due Date', 'Progress', 'Action'];
  
  const rows = actions.map(a => [
    <div key={a.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{a.title}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{a.id}</div>
    </div>,
    <Badge key={a.id} label={a.linked} color="var(--c-accent)" />,
    <Badge key={a.id} label={a.priority} color={getPriorityColor(a.priority)} />,
    a.due,
    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 120 }}>
      <Bar pct={a.progress} color={a.progress === 100 ? 'var(--c-green)' : 'var(--c-accent)'} />
      <span style={{ fontSize: 12, color: 'var(--c-text2)', minWidth: 30 }}>{a.progress}%</span>
    </div>,
    <Btn key={a.id} small variant="ghost" onClick={() => setSelectedAction(a)}>Update</Btn>
  ]);

  return (
    <PageWrap 
      title="Remediations" 
      subtitle="Track corrective actions raised against findings or risks to completion."
      action={canEdit && !isRiskOwner && !isControlLead && <Btn onClick={() => setCreateOpen(true)}>Create Action Plan</Btn>}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={!!selectedAction} onClose={() => setSelectedAction(null)} title="Update Remediation" width={500}>
        {selectedAction && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedAction.id}: {selectedAction.title}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Due Date</div>
                <div style={{ color: selectedAction.progress < 100 ? 'var(--c-red)' : 'var(--c-text)' }}>{selectedAction.due}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Priority</div>
                <Badge label={selectedAction.priority} color={getPriorityColor(selectedAction.priority)} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Update Progress</h4>
                <input type="range" min="0" max="100" defaultValue={selectedAction.progress} disabled={!canEdit} style={{ width: '100%', accentColor: 'var(--c-accent)' }} />
                <div style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>{selectedAction.progress}% Complete</div>
              </div>
              
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Completion Evidence</h4>
                <div style={{ padding: 16, textAlign: 'center', border: '1px dashed var(--c-border2)', borderRadius: 8, background: 'var(--c-bg3)', color: 'var(--c-text3)', cursor: !canEdit ? 'default' : 'pointer' }}>
                  {!canEdit ? 'View evidence of completion' : 'Upload evidence of completion'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                {canEdit ? <Btn variant="ghost" small>Send Reminder</Btn> : <div />}
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn variant="ghost" onClick={() => setSelectedAction(null)}>Cancel</Btn>
                  {canEdit && <Btn>Save Updates</Btn>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Action Plan" width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Action Title</label>
            <input value={newAction.title} onChange={e => setNewAction({...newAction, title: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Linked Item (Risk/Finding)</label>
              <input value={newAction.linked} onChange={e => setNewAction({...newAction, linked: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Priority</label>
              <select value={newAction.priority} onChange={e => setNewAction({...newAction, priority: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }}>
                <option>High</option><option>Medium</option><option>Low</option><option>Critical</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Assignee</label>
              <input value={newAction.assignee} onChange={e => setNewAction({...newAction, assignee: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Due Date</label>
              <input type="date" value={newAction.due} onChange={e => setNewAction({...newAction, due: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', marginTop: 4 }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn onClick={() => {
              setActions([{ id: `REM-${Math.floor(Math.random()*100)+600}`, progress: 0, ...newAction }, ...actions]);
              setCreateOpen(false);
            }}>Save Action Plan</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}