import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, colors } from './ui';

// ══════════════════════════════════════════════════════════════════════════════
// REMEDIATIONS
// ══════════════════════════════════════════════════════════════════════════════
export default function Remediations() {
  const [items, setItems]  = useState<any[]>([]);
  const [stats, setStats]  = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.remediations(filter || undefined), api.remediationStats()])
      .then(([r, s]) => { setItems(r); setStats(s); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const update = async (id: string, status: string, notes?: string) => {
    await api.updateRemediation(id, { status, notes });
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageWrap title="Remediations" subtitle="Track and resolve compliance findings">
      <Grid cols={4}>
        {[
          { label: 'Open',        value: stats.open,        color: colors.yellow },
          { label: 'In Progress', value: stats.in_progress, color: colors.blue },
          { label: 'Overdue',     value: stats.overdue,     color: colors.red },
          { label: 'Critical',    value: stats.critical,    color: colors.red },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {['', 'open', 'in_progress', 'resolved'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'ghost'} onClick={() => setFilter(s)}>
            {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Btn>
        ))}
      </div>

      <Card>
        <Table
          headers={['Priority', 'Title', 'Status', 'SLA', 'Assigned To', 'Due Date', 'Actions']}
          rows={items.map(r => [
            <Badge label={r.priority} status={r.priority === 'critical' ? 'non-compliant' : r.priority === 'high' ? 'failing' : 'partial'} />,
            <div>
              <div style={{ fontSize: 13, color: colors.text }}>{r.title}</div>
              {r.sla_breached && <span style={{ fontSize: 10, color: colors.red }}>⚠ SLA BREACHED</span>}
            </div>,
            <Badge label={r.status} status={r.status} />,
            <span style={{ fontSize: 11, color: colors.text3 }}>{r.sla_days}d SLA</span>,
            <span style={{ fontSize: 12, color: colors.text2 }}>{r.assigned_to?.split('@')[0] || '-'}</span>,
            <span style={{ fontSize: 11, color: r.due_date && new Date(r.due_date) < new Date() ? colors.red : colors.text3 }}>
              {r.due_date ? new Date(r.due_date).toLocaleDateString() : '-'}
            </span>,
            <div style={{ display: 'flex', gap: 6 }}>
              {r.status === 'open'        && <Btn small onClick={() => update(r.id, 'in_progress')}>Start</Btn>}
              {r.status === 'in_progress' && <Btn small onClick={() => update(r.id, 'resolved', 'Remediation completed')}>Resolve</Btn>}
              {r.status === 'resolved'    && <Btn small onClick={() => update(r.id, 'verified')}>Verify</Btn>}
            </div>,
          ])}
        />
      </Card>
    </PageWrap>
  );
}
