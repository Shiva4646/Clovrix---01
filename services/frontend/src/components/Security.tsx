import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, ScoreRing, colors, sevColor } from './ui';

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════════════════
export default function Security() {
  const [vulns, setVulns]   = useState<any[]>([]);
  const [stats, setStats]   = useState<any>({});
  const [scans, setScans]   = useState<any[]>([]);
  const [pentests, setPentests] = useState<any[]>([]);
  const [tab, setTab] = useState<'vulns'|'scans'|'pentests'>('vulns');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.vulnerabilities(filter || undefined), api.securityStats(), api.securityScans(), api.pentests()])
      .then(([v, s, sc, p]) => { setVulns(v); setStats(s); setScans(sc); setPentests(p); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const runScan = async () => {
    await api.createScan({ type: 'container', target: 'api:latest', scanner: 'trivy' });
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Security Testing"
      subtitle="Vulnerability tracking, penetration tests and continuous scanning"
      action={<Btn onClick={runScan}>+ Queue Scan</Btn>}>
      <Grid cols={4}>
        {[
          { label: 'Critical Vulns', value: stats.critical,     color: stats.critical > 0 ? colors.red : colors.green },
          { label: 'High Vulns',     value: stats.high,         color: stats.high > 0 ? colors.orange : colors.green },
          { label: 'Overdue',        value: stats.overdue,      color: stats.overdue > 0 ? colors.red : colors.green },
          { label: 'Pentests',       value: stats.pentests,     color: colors.text },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['vulns', 'scans', 'pentests'] as const).map(t => (
          <Btn key={t} small variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
            {t === 'vulns' ? 'Vulnerabilities' : t === 'scans' ? 'Scans' : 'Pentests'}
          </Btn>
        ))}
        {tab === 'vulns' && (
          <>
            <div style={{ width: 1, background: colors.border }} />
            {['', 'critical', 'high', 'medium', 'low'].map(s => (
              <Btn key={s} small variant={filter === s ? 'primary' : 'ghost'} onClick={() => setFilter(s)}>
                {s || 'All'}
              </Btn>
            ))}
          </>
        )}
      </div>

      {tab === 'vulns' && (
        <Card>
          <Table
            headers={['CVE', 'Title', 'Component', 'CVSS', 'Severity', 'Status', 'Assigned', 'Due']}
            rows={vulns.map(v => [
              <span style={{ fontSize: 11, color: colors.indigo, fontFamily: 'monospace' }}>{v.cve_id || 'N/A'}</span>,
              <span style={{ fontSize: 13, color: colors.text }}>{v.title}</span>,
              <div>
                <div style={{ fontSize: 12, color: colors.text2 }}>{v.component}</div>
                {v.component_version && <div style={{ fontSize: 10, color: colors.text3 }}>{v.component_version} → {v.fixed_version || '?'}</div>}
              </div>,
              <span style={{ fontSize: 13, fontWeight: 600, color: sevColor(v.severity) }}>{v.cvss_score || '-'}</span>,
              <Badge label={v.severity} status={v.severity === 'critical' ? 'non-compliant' : v.severity === 'high' ? 'failing' : 'partial'} />,
              <Badge label={v.status} status={v.status === 'resolved' ? 'compliant' : 'partial'} />,
              <span style={{ fontSize: 12, color: colors.text2 }}>{v.assigned_to?.split('@')[0] || '-'}</span>,
              <span style={{ fontSize: 11, color: v.due_date && new Date(v.due_date) < new Date() ? colors.red : colors.text3 }}>
                {v.due_date ? new Date(v.due_date).toLocaleDateString() : '-'}
              </span>,
            ])}
          />
        </Card>
      )}
      {tab === 'scans' && (
        <Card>
          <Table
            headers={['Target', 'Scanner', 'Type', 'Status', 'Critical', 'High', 'Medium', 'Low', 'Completed']}
            rows={scans.map(s => [
              <span style={{ fontSize: 13, color: colors.text, fontFamily: 'monospace' }}>{s.target}</span>,
              <Badge label={s.scanner || '-'} />,
              <Badge label={s.type} />,
              <Badge label={s.status} status={s.status === 'completed' ? 'compliant' : s.status === 'running' ? 'partial' : 'pending'} />,
              <span style={{ color: s.critical_count > 0 ? colors.red : colors.green, fontWeight: 700 }}>{s.critical_count}</span>,
              <span style={{ color: s.high_count > 0 ? colors.orange : colors.green }}>{s.high_count}</span>,
              <span style={{ color: s.medium_count > 0 ? colors.yellow : colors.green }}>{s.medium_count}</span>,
              <span style={{ color: colors.text3 }}>{s.low_count}</span>,
              <span style={{ fontSize: 11, color: colors.text3 }}>
                {s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-'}
              </span>,
            ])}
          />
        </Card>
      )}
      {tab === 'pentests' && (
        <Card>
          <Table
            headers={['Title', 'Vendor', 'Status', 'Start', 'End', 'Critical', 'High', 'Remediated']}
            rows={pentests.map(p => [
              <div>
                <div style={{ fontSize: 13, color: colors.text }}>{p.title}</div>
                {p.scope && <div style={{ fontSize: 11, color: colors.text3 }}>{p.scope?.slice(0, 60)}</div>}
              </div>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{p.vendor || '-'}</span>,
              <Badge label={p.status} status={p.status === 'completed' ? 'compliant' : 'partial'} />,
              <span style={{ fontSize: 11, color: colors.text3 }}>{p.start_date ? new Date(p.start_date).toLocaleDateString() : '-'}</span>,
              <span style={{ fontSize: 11, color: colors.text3 }}>{p.end_date ? new Date(p.end_date).toLocaleDateString() : '-'}</span>,
              <span style={{ color: p.critical_count > 0 ? colors.red : colors.green, fontWeight: 700 }}>{p.critical_count}</span>,
              <span style={{ color: p.high_count > 0 ? colors.orange : colors.green }}>{p.high_count}</span>,
              <span style={{ color: colors.green }}>{p.remediated_count}</span>,
            ])}
          />
        </Card>
      )}
    </PageWrap>
  );
}
