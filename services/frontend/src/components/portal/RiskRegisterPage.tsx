import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal } from '../ui';
import api from '@/lib/api';
import { can } from '@/lib/capabilities';
import { toast } from '../Toast';

// Score (likelihood×impact, 1–25) → severity level for the register.
function level(score: number) {
  return score >= 20 ? 'Critical' : score >= 12 ? 'High' : score >= 6 ? 'Medium' : 'Low';
}
const LI: Record<string, number> = { Low: 2, Medium: 3, High: 4 };

// Backend risk row → the shape this page renders.
function mapRisk(r: any) {
  return {
    ...r,
    id: r.id,
    name: r.title,
    category: r.category || 'operational',
    aiSystemId: r.aiSystemId || '',
    inherent: level(r.inherentScore ?? ((r.likelihood || 3) * (r.impact || 3))),
    residual: level(r.residualScore ?? ((r.residualLikelihood || 2) * (r.residualImpact || 2))),
    status: r.status || 'open',
  };
}

export default function RiskRegisterPage() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'table' | 'heatmap'>('table');

  // Capability gates (per role-page matrix)
  const canCreate = can('risk.create');   // run a new risk assessment
  const canEdit = can('risk.edit');        // modify treatment plans
  const canRate = can('risk.rate');        // reassess / score risks
  const canAccept = can('risk.accept');    // accept a risk
  const canModify = canEdit || canRate;    // any write on the treatment panel

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [newRisk, setNewRisk] = useState({ system: '', category: '', likelihood: 'Medium', impact: 'Medium', treatment: '' });

  const load = () => {
    setLoading(true);
    api.risks()
      .then(data => setRisks((data || []).map(mapRisk)))
      .catch(() => setRisks([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const headers = ['Risk ID / Name', 'Category', 'AI System', 'Inherent Risk', 'Residual Risk', 'Status', 'Action'];
  
  const getRiskColor = (level: string) => {
    if (level === 'Critical') return 'var(--c-red)';
    if (level === 'High') return 'var(--c-orange)';
    if (level === 'Medium') return 'var(--c-yellow)';
    return 'var(--c-green)';
  };

  const rows = risks.map(r => [
    <div key={r.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{r.name}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{r.id}</div>
    </div>,
    <div key={r.id} style={{ fontSize: 13, color: 'var(--c-text2)', textTransform: 'capitalize' }}>{r.category}</div>,
    <div key={r.id} style={{ fontSize: 13, color: 'var(--c-text2)' }}>{r.aiSystemId || '—'}</div>,
    <Badge key={r.id} label={r.inherent} color={getRiskColor(r.inherent)} />,
    <Badge key={r.id} label={r.residual} color={getRiskColor(r.residual)} />,
    <Badge key={r.id} label={r.status} status={r.status} />,
    <Btn key={r.id} small variant="ghost" onClick={() => setSelectedRisk(r)}>View Details</Btn>
  ]);

  const handleNext = () => setStep(s => Math.min(s + 1, 4));
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));
  const handleSave = async () => {
    try {
      await api.createRisk({
        title: newRisk.system ? `Risk: ${newRisk.system}` : 'New Risk Assessment',
        category: (newRisk.category || 'operational').toLowerCase(),
        likelihood: LI[newRisk.likelihood] ?? 3,
        impact: LI[newRisk.impact] ?? 3,
        treatment: newRisk.treatment || 'mitigate',
      });
      toast.success('Risk added to the register.');
      setWizardOpen(false); setStep(1);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save risk.');
    }
  };

  return (
    <PageWrap 
      title="Risk Register & Assessment" 
      subtitle="Clause 6.1: Identify, assess, and treat risks associated with AI systems."
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" onClick={() => setViewMode(v => v === 'table' ? 'heatmap' : 'table')}>
            Toggle View ({viewMode === 'table' ? 'Heatmap' : 'Table'})
          </Btn>
          {canCreate && <Btn onClick={() => setWizardOpen(true)}>Run Risk Assessment</Btn>}
        </div>
      }
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text3)' }}>Loading risks...</div>
        ) : viewMode === 'table' ? (
          <Table headers={headers} rows={rows} />
        ) : (
          <div style={{ padding: 40, textAlign: 'center', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Inherent Risk Heatmap</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: 300, height: 300 }}>
              {/* Likelihood vs Impact grid mock */}
              {[4, 8, 12, 2, 15, 8, 1, 5, 3].map((val, i) => {
                const color = val > 10 ? 'var(--c-red)' : val > 5 ? 'var(--c-orange)' : val > 2 ? 'var(--c-yellow)' : 'var(--c-green)';
                return (
                  <div key={i} style={{ background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-bg)', fontSize: 24, fontWeight: 700, borderRadius: 8, opacity: 0.9 }}>
                    {val}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: 'var(--c-text3)', display: 'flex', gap: 20 }}>
              <div>X-Axis: Impact</div>
              <div>Y-Axis: Likelihood</div>
            </div>
          </div>
        )}
      </Card>

      {/* Details Modal */}
      <Modal open={!!selectedRisk} onClose={() => setSelectedRisk(null)} title="Risk Details" width={600}>
        {selectedRisk && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Risk ID</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedRisk.id} — {selectedRisk.name}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Inherent Risk</div>
                <Badge label={selectedRisk.inherent} color={getRiskColor(selectedRisk.inherent)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>Residual Risk</div>
                <Badge label={selectedRisk.residual} color={getRiskColor(selectedRisk.residual)} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Treatment Plan</h4>
              <textarea
                placeholder="Describe the treatment plan..."
                readOnly={!canEdit}
                style={{ width: '100%', height: 100, padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)' }}
              />
              {canModify ? (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {canRate && <Btn small variant="ghost">Reassess Risk</Btn>}
                    {canAccept && <Btn small variant="ghost">Accept Risk</Btn>}
                    {canRate && <Btn small variant="ghost">Add Comment</Btn>}
                  </div>
                  {canEdit && <Btn small>Save Treatment Plan</Btn>}
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--c-text3)' }}>You have view-only access to risk treatment.</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Risk Assessment Wizard */}
      <Modal open={wizardOpen} onClose={() => { setWizardOpen(false); setStep(1); }} title={`Risk Assessment Wizard (Step ${step} of 4)`} width={650}>
        <div style={{ minHeight: 300, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} style={{ height: 4, flex: 1, background: s <= step ? 'var(--c-accent)' : 'var(--c-border2)', borderRadius: 2 }} />
            ))}
          </div>

          {step === 1 && (
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>1. Select Target AI System</h3>
              <p style={{ fontSize: 13, color: 'var(--c-text2)', marginBottom: 16 }}>ISO 42001 requires risk assessments to be linked to specific AI systems.</p>
              <select style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)', outline: 'none' }} onChange={e => setNewRisk({...newRisk, system: e.target.value})}>
                <option value="">Select a system...</option>
                <option value="sys-1">Customer Support Bot</option>
                <option value="sys-2">Resume Screening AI</option>
              </select>
            </div>
          )}

          {step === 2 && (
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>2. Identify Risk Category</h3>
              <p style={{ fontSize: 13, color: 'var(--c-text2)', marginBottom: 16 }}>Select the primary AI-specific risk vector being assessed.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {['Bias / Fairness', 'Opacity / Explainability', 'Model Drift', 'Privacy / Data Protection', 'Security', 'Robustness'].map(cat => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', border: '1px solid var(--c-border2)', borderRadius: 8, cursor: 'pointer', background: newRisk.category === cat ? 'rgba(0,102,255,0.05)' : 'var(--c-bg)' }}>
                    <input type="radio" name="risk_cat" checked={newRisk.category === cat} onChange={() => setNewRisk({...newRisk, category: cat})} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{cat}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>3. Score Likelihood & Impact</h3>
              <p style={{ fontSize: 13, color: 'var(--c-text2)', marginBottom: 16 }}>Determine the inherent risk rating before any controls are applied.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)', marginBottom: 6 }}>Likelihood of Occurrence</div>
                  <select style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} value={newRisk.likelihood} onChange={e => setNewRisk({...newRisk, likelihood: e.target.value})}>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)', marginBottom: 6 }}>Severity of Impact</div>
                  <select style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)' }} value={newRisk.impact} onChange={e => setNewRisk({...newRisk, impact: e.target.value})}>
                    <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>4. Define Treatment Plan</h3>
              <p style={{ fontSize: 13, color: 'var(--c-text2)', marginBottom: 16 }}>How will this risk be mitigated, transferred, or accepted?</p>
              <textarea 
                placeholder="e.g. Implement human-in-the-loop review for all critical decisions..." 
                style={{ width: '100%', height: 120, padding: 12, borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)', resize: 'none', outline: 'none' }}
                value={newRisk.treatment}
                onChange={e => setNewRisk({...newRisk, treatment: e.target.value})}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
            <Btn variant="ghost" disabled={step === 1} onClick={handlePrev}>Back</Btn>
            {step < 4 ? <Btn onClick={handleNext}>Next Step</Btn> : <Btn onClick={handleSave}>Log Risk</Btn>}
          </div>

        </div>
      </Modal>

    </PageWrap>
  );
}