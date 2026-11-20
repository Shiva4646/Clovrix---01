import { useEffect, useState, type CSSProperties } from 'react';
import api from '@/lib/api';
import { PageWrap, Card, Btn, LoadingSpinner, ErrorBanner, Badge, Modal } from './ui';
import { toast } from './Toast';

const scoreLevel = (score: number) => {
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
};

export default function RiskRegister() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'operational',
    likelihood: '3',
    impact: '3',
    residualLikelihood: '2',
    residualImpact: '2',
    treatment: 'mitigate',
    ownerEmail: '',
    dueDate: '',
  });

  const loadRisks = async () => {
    setLoading(true);
    try {
      const data = await api.risks();
      setRisks(Array.isArray(data) ? data : data?.items || []);
      setError(undefined);
    } catch (err: any) {
      setError(err?.message || 'Unable to load risk register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRisks();
  }, []);

  const score = (Number(form.likelihood) || 0) * (Number(form.impact) || 0);
  const level = scoreLevel(score);
  const residualScore = (Number(form.residualLikelihood) || 0) * (Number(form.residualImpact) || 0);
  const residualLevel = scoreLevel(residualScore);

  const saveRisk = async () => {
    if (!form.title.trim()) {
      toast.error('Please provide a risk title');
      return;
    }

    try {
      await api.createRisk({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        likelihood: Number(form.likelihood),
        impact: Number(form.impact),
        residualLikelihood: Number(form.residualLikelihood),
        residualImpact: Number(form.residualImpact),
        treatment: form.treatment,
        ownerEmail: form.ownerEmail || undefined,
        dueDate: form.dueDate || undefined,
      });
      toast.success('Risk created');
      setOpen(false);
      setForm({
        title: '',
        description: '',
        category: 'operational',
        likelihood: '3',
        impact: '3',
        residualLikelihood: '2',
        residualImpact: '2',
        treatment: 'mitigate',
        ownerEmail: '',
        dueDate: '',
      });
      await loadRisks();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to create risk');
    }
  };

  return (
    <PageWrap
      title="Risk Register"
      subtitle="Capture risks, rate likelihood and impact, and see the resulting score immediately."
      action={<Btn onClick={() => setOpen(true)}>New risk</Btn>}
    >
      <ErrorBanner msg={error} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)' }}>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Open risks</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{risks.length}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)' }}>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Highest score</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
              {risks.length > 0 ? Math.max(...risks.map((r) => Number((r.score ?? (r.likelihood * r.impact)) || 0))) : 0}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)' }}>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk score formula</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>Likelihood × Impact</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)' }}>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Residual score</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
              {risks.length > 0 ? Math.max(...risks.map((r) => Number(r.residual_score ?? (r.residual_likelihood || 0) * (r.residual_impact || 0)))) : 0}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Registered risks</div>
            <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{risks.length} item{risks.length === 1 ? '' : 's'}</div>
          </div>
          {risks.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--c-text3)', textAlign: 'center' }}>No risks have been registered yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Risk</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Category</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Likelihood</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Impact</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Score</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Residual</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--c-text3)' }}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((risk) => {
                    const scoreValue = Number(risk.score ?? (risk.likelihood || 0) * (risk.impact || 0));
                    const riskLevel = scoreLevel(scoreValue);
                    const residualScoreValue = Number(risk.residual_score ?? (risk.residual_likelihood || 0) * (risk.residual_impact || 0));
                    const residualLevel = scoreLevel(residualScoreValue);
                    return (
                      <tr key={risk.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{risk.title}</div>
                          {risk.description && <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 3 }}>{risk.description}</div>}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{risk.category || 'operational'}</td>
                        <td style={{ padding: '10px 8px' }}>{risk.likelihood ?? '-'}</td>
                        <td style={{ padding: '10px 8px' }}>{risk.impact ?? '-'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{scoreValue}</span>
                            <Badge label={riskLevel} status={riskLevel} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{residualScoreValue}</span>
                            <Badge label={residualLevel} status={residualLevel} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>{risk.owner_email || risk.ownerEmail || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add risk" width={640}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Title</div>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} style={{ width: '100%', ...inputStyle }} placeholder="e.g. Vendor data exfiltration risk" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
            <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} style={{ width: '100%', ...inputStyle, resize: 'vertical' }} placeholder="Describe the scenario and context" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</div>
              <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} style={inputStyle}>
                <option value="operational">Operational</option>
                <option value="compliance">Compliance</option>
                <option value="technical">Technical</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Treatment</div>
              <select value={form.treatment} onChange={(e) => setForm((p) => ({ ...p, treatment: e.target.value }))} style={inputStyle}>
                <option value="mitigate">Mitigate</option>
                <option value="transfer">Transfer</option>
                <option value="accept">Accept</option>
                <option value="avoid">Avoid</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Likelihood</div>
              <select value={form.likelihood} onChange={(e) => setForm((p) => ({ ...p, likelihood: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Impact</div>
              <select value={form.impact} onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Residual likelihood</div>
              <select value={form.residualLikelihood} onChange={(e) => setForm((p) => ({ ...p, residualLikelihood: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Residual impact</div>
              <select value={form.residualImpact} onChange={(e) => setForm((p) => ({ ...p, residualImpact: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Calculated score</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{score}</div>
            </div>
            <Badge label={level} status={level} />
          </div>

          <div style={{ padding: 12, borderRadius: 10, background: 'var(--c-bg3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Residual score</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{residualScore}</div>
            </div>
            <Badge label={residualLevel} status={residualLevel} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner email</div>
              <input value={form.ownerEmail} onChange={(e) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))} style={inputStyle} placeholder="owner@company.com" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due date</div>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={saveRisk}>Save risk</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--c-bg3)',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  padding: '9px 10px',
  color: 'var(--c-text)',
  fontSize: 13,
  outline: 'none',
};
