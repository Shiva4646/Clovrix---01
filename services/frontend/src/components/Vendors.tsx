import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, colors } from './ui';

export default function Vendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [stats, setStats]     = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending]   = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: 'SaaS', criticality: 'medium', contactEmail: '', website: '' });

  const load = () => {
    setLoading(true);
    Promise.all([api.vendors(), api.vendorStats()])
      .then(([v, s]) => { setVendors(v); setStats(s); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async () => {
    await api.createVendor(form);
    setCreating(false);
    load();
  };

  const sendAssessment = async (id: string) => {
    setSending(id);
    await api.sendAssessment(id);
    setSending(null);
    load();
  };

  const riskColor = (score: number) => score >= 70 ? colors.red : score >= 40 ? colors.orange : colors.green;

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Vendor Risk Management" subtitle="Third-party risk, DPA tracking and assessments"
      action={<Btn onClick={() => setCreating(p => !p)}>+ Add Vendor</Btn>}>

      <Grid cols={4}>
        {[
          { label: 'Active Vendors',  value: stats.total,        color: colors.text },
          { label: 'No DPA Signed',   value: stats.no_dpa,       color: stats.no_dpa > 0 ? colors.red : colors.green },
          { label: 'High Risk',       value: stats.high_risk,    color: stats.high_risk > 0 ? colors.red : colors.green },
          { label: 'Avg Risk Score',  value: `${stats.avg_risk}%`,color: stats.avg_risk >= 60 ? colors.red : colors.yellow },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      {creating && (
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>New Vendor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { k: 'name', l: 'Vendor Name *' }, { k: 'website', l: 'Website' },
              { k: 'contactEmail', l: 'Contact Email' },
            ].map(f => (
              <div key={f.k}>
                <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>{f.l}</div>
                <input value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                  style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Category</div>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }}>
                {['SaaS', 'IaaS', 'PaaS', 'AI', 'Security', 'HR', 'Finance', 'Legal'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>Criticality</div>
              <select value={form.criticality} onChange={e => setForm(p => ({ ...p, criticality: e.target.value }))}
                style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13 }}>
                {['critical', 'high', 'medium', 'low'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn onClick={create}>Add Vendor</Btn>
            <Btn variant="ghost" onClick={() => setCreating(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <Card style={{ marginTop: 16 }}>
        <Table
          headers={['Vendor', 'Category', 'Criticality', 'Risk Score', 'DPA', 'SOC 2', 'Last Assessed', 'Actions']}
          rows={vendors.map(v => [
            <div>
              <div style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>{v.name}</div>
              {v.website && <div style={{ fontSize: 11, color: colors.indigo }}>{v.website}</div>}
            </div>,
            <Badge label={v.category} />,
            <Badge label={v.criticality} status={v.criticality === 'critical' ? 'non-compliant' : v.criticality === 'high' ? 'failing' : 'partial'} />,
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: riskColor(v.risk_score) }}>{v.risk_score}</div>
              <Bar pct={v.risk_score} color={riskColor(v.risk_score)} h={4} />
            </div>,
            <span style={{ color: v.dpa_signed ? colors.green : colors.red }}>
              {v.dpa_signed ? '✓ Signed' : '✗ Missing'}
            </span>,
            <span style={{ color: v.soc2_type ? colors.green : colors.text3 }}>
              {v.soc2_type ? `Type ${v.soc2_type}` : '-'}
            </span>,
            <span style={{ fontSize: 11, color: colors.text3 }}>
              {v.last_assessment_date ? new Date(v.last_assessment_date).toLocaleDateString() : '-'}
            </span>,
            <Btn small variant="ghost" onClick={() => sendAssessment(v.id)} style={{ opacity: sending === v.id ? 0.5 : 1 }}>
              {sending === v.id ? 'Sending…' : '✉ Assess'}
            </Btn>,
          ])}
        />
      </Card>
    </PageWrap>
  );
}
