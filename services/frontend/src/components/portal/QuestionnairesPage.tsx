import { useState } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { getActiveRole } from '@/lib/auth';

export default function QuestionnairesPage() {
  const [questionnaires] = useState([
    { id: 'Q-001', name: 'Standard AI Vendor Assessment', templates: 'ISO 42001', responses: 12, pending: 3, lastUpdated: '2026-06-15' },
    { id: 'Q-002', name: 'Internal Data Privacy Check', templates: 'GDPR, SOC 2', responses: 45, pending: 0, lastUpdated: '2026-05-20' },
  ]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [respondOpen, setRespondOpen] = useState(false);
  const [selectedQ, setSelectedQ] = useState<any>(null);
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';

  const headers = ['Questionnaire Name', 'Mapped Frameworks', 'Responses', 'Pending', 'Last Updated', 'Action'];
  
  const rows = questionnaires.map(q => [
    <div key={q.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{q.name}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{q.id}</div>
    </div>,
    <div key={q.id} style={{ fontSize: 13 }}>{q.templates}</div>,
    <Badge key={q.id} label={`${q.responses} Received`} color="var(--c-green)" />,
    <Badge key={q.id} label={`${q.pending} Pending`} color={q.pending > 0 ? 'var(--c-orange)' : 'var(--c-green)'} />,
    q.lastUpdated,
    <div key={q.id} style={{ display: 'flex', gap: 6 }}>
      <Btn small variant="ghost">View</Btn>
      {activeRole === 'Control Lead' && <Btn small variant="ghost" onClick={() => { setSelectedQ(q); setRespondOpen(true); }}>Respond</Btn>}
      {!isAuditor && activeRole !== 'Control Lead' && <Btn small variant="ghost">Send</Btn>}
    </div>
  ]);

  return (
    <PageWrap 
      title="Security Questionnaires" 
      subtitle="Build and distribute compliance questionnaires to vendors or internal teams."
      action={!isAuditor && activeRole !== 'Assessor' && <Btn onClick={() => setBuilderOpen(true)}>Build Questionnaire</Btn>}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Table headers={headers} rows={rows} />
      </Card>

      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title="Questionnaire Builder" width={700}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input placeholder="Questionnaire Title" style={{ padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', fontSize: 16, fontWeight: 600 }} />
          
          <div style={{ padding: 16, border: '1px dashed var(--c-border2)', borderRadius: 8, background: 'var(--c-bg3)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Section 1: AI Data Governance</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--c-bg)', borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Q1: Do you have a formal AI acceptable use policy?</div>
                <div style={{ display: 'flex', gap: 10, color: 'var(--c-text2)', fontSize: 13 }}>
                  <label><input type="radio" disabled /> Yes</label>
                  <label><input type="radio" disabled /> No</label>
                </div>
              </div>
              <div style={{ padding: 12, background: 'var(--c-bg)', borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Q2: Describe your model risk management process.</div>
                <textarea disabled placeholder="Long text response..." style={{ width: '100%', height: 60, padding: 8, borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', resize: 'none' }} />
              </div>
            </div>
            
            <Btn small variant="ghost" style={{ marginTop: 12 }}>+ Add Question</Btn>
          </div>

          <Btn variant="ghost" style={{ alignSelf: 'flex-start' }}>+ Add Section</Btn>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => setBuilderOpen(false)}>Cancel</Btn>
            <Btn>Save & Distribute</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={respondOpen} onClose={() => setRespondOpen(false)} title={`Respond: ${selectedQ?.name || ''}`} width={700}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 16, border: '1px solid var(--c-border2)', borderRadius: 8, background: 'var(--c-bg3)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Section 1: AI Data Governance</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--c-bg)', borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Q1: Do you have a formal AI acceptable use policy?</div>
                <div style={{ display: 'flex', gap: 10, color: 'var(--c-text2)', fontSize: 13 }}>
                  <label><input type="radio" name="q1" /> Yes</label>
                  <label><input type="radio" name="q1" /> No</label>
                </div>
              </div>
              <div style={{ padding: 12, background: 'var(--c-bg)', borderRadius: 8, border: '1px solid var(--c-border2)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Q2: Describe your model risk management process.</div>
                <textarea placeholder="Long text response..." style={{ width: '100%', height: 60, padding: 8, borderRadius: 4, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', resize: 'none', color: 'var(--c-text)' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => setRespondOpen(false)}>Save Draft</Btn>
            <Btn onClick={() => {
              alert('Response submitted successfully!');
              setRespondOpen(false);
            }}>Submit Response</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}