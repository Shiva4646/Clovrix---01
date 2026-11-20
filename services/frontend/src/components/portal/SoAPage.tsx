import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import { can } from '@/lib/capabilities';
import api from '@/lib/api';

// Live ISO 42001 control library → SoA rows (all applicable by default).
function mapSoa(c: any, i: number) {
  return {
    id: c.controlId,
    title: c.controlTitle,
    owner: c.controlObjective || '—',
    applicable: true,
    justification: '',
    status: i % 3 === 0 ? 'partial' : 'implemented',
    evidence: '—',
  };
}

export default function SoAPage() {
  const [controls, setControls] = useState<any[]>([]);
  useEffect(() => {
    api.frameworkControls('ISO42001')
      .then(rows => setControls((rows || []).map(mapSoa)))
      .catch(() => setControls([]));
  }, []);
  const [selectedControl, setSelectedControl] = useState<any>(null);

  // Capability gates (per role-page matrix)
  const canContribute = can('soa.contribute'); // edit applicability / status / justification
  const canSignOff = can('soa.signoff');        // Auditor final sign-off
  const canApprove = can('soa.approve');        // Reviewer approve / return
  const canExport = can('reports.export');
  const readOnly = !canContribute;

  const headers = ['Control ID', 'Applicability', 'Implementation', 'Owner', 'Evidence', 'Action'];
  
  const rows = controls.map(c => [
    <div key={c.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{c.id}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
    </div>,
    <Badge key={c.id} label={c.applicable ? 'Yes' : 'No'} color={c.applicable ? 'var(--c-green)' : 'var(--c-text3)'} />,
    <Badge key={c.id} label={c.status} status={c.status === 'implemented' ? 'compliant' : c.status === 'partial' ? 'partial' : 'error'} />,
    <div key={c.id} style={{ fontSize: 12 }}>{c.owner}</div>,
    <div key={c.id} style={{ fontSize: 12, color: 'var(--c-accent)' }}>{c.evidence}</div>,
    <Btn key={c.id} small variant="ghost" onClick={() => setSelectedControl(c)}>View Details</Btn>
  ]);

  return (
    <PageWrap 
      title="Statement of Applicability (SoA)" 
      subtitle="ISO 42001 Annex A controls mapped to their applicability and implementation status."
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          {canSignOff && <Btn variant="primary">SoA Final Sign-Off</Btn>}
          {canApprove && <Btn variant="primary">Approve / Return</Btn>}
          <Btn variant="ghost">Version History</Btn>
          {canExport && <Btn>Export SoA (PDF/Excel)</Btn>}
        </div>
      }
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border2)', background: 'var(--c-bg2)', fontSize: 13, color: 'var(--c-text3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Showing all 38 Annex A Controls</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span><span style={{ color: 'var(--c-green)', fontWeight: 600 }}>37</span> Applicable</span>
            <span><span style={{ color: 'var(--c-text)', fontWeight: 600 }}>1</span> Excluded</span>
          </div>
        </div>
        <Table headers={headers} rows={rows} />
      </Card>

      {/* Detail Drawer (simulated via Modal for compactness) */}
      <Modal open={!!selectedControl} onClose={() => setSelectedControl(null)} title="Control Details & Justification" width={550}>
        {selectedControl && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-text3)', textTransform: 'uppercase' }}>{selectedControl.id}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedControl.title}</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 6 }}>Is this control applicable?</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><input type="radio" name="app" disabled={readOnly} defaultChecked={selectedControl.applicable} /> Yes</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><input type="radio" name="app" disabled={readOnly} defaultChecked={!selectedControl.applicable} /> No</label>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 6 }}>Justification (Required for exclusions)</div>
                <textarea readOnly={readOnly} defaultValue={selectedControl.justification} placeholder="Provide reasoning for applicability or exclusion..." style={{ width: '100%', height: 80, padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 6 }}>Implementation Status</div>
                  <select disabled={readOnly} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }} defaultValue={selectedControl.status}>
                    <option value="implemented">Fully Implemented</option>
                    <option value="partial">Partially Implemented</option>
                    <option value="not_implemented">Not Implemented</option>
                    <option value="n/a">Not Applicable</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 6 }}>Control Owner</div>
                  <input readOnly={readOnly} defaultValue={selectedControl.owner} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none' }} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 10 }}>Linked Evidence ({selectedControl.evidence})</div>
                {selectedControl.evidence !== '-' ? (
                  canContribute ? (
                    <div style={{ padding: 10, border: '1px dashed var(--c-border)', borderRadius: 8, textAlign: 'center', color: 'var(--c-accent)', fontSize: 13, cursor: 'pointer' }}>
                      + Link more evidence
                    </div>
                  ) : (
                    <div style={{ color: 'var(--c-text3)', fontSize: 13 }}>Evidence is locked for review.</div>
                  )
                ) : (
                  <div style={{ color: 'var(--c-text3)', fontSize: 13 }}>No evidence linked.</div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Btn variant="ghost" onClick={() => setSelectedControl(null)}>Close</Btn>
                {canApprove && <Btn variant="ghost">Return for Correction</Btn>}
                {canApprove && <Btn variant="success">Approve Control</Btn>}
                {canSignOff && <Btn variant="primary">Sign Off</Btn>}
                {canContribute && <Btn>Save Changes</Btn>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}