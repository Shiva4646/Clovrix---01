import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, colors } from './ui';

// ══════════════════════════════════════════════════════════════════════════════
// PERSONNEL
// ══════════════════════════════════════════════════════════════════════════════
export default function Personnel() {
  const [people, setPeople]   = useState<any>({ items: [] });
  const [stats, setStats]     = useState<any>({});
  const [reviews, setReviews] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [tab, setTab]         = useState<'people'|'training'|'access'>('people');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.personnel(), api.personnelStats(), api.accessReviews(), api.overdueTraining()])
      .then(([p, s, r, o]) => { setPeople(p); setStats(s); setReviews(r); setOverdue(o); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const completeReview = async (id: string, status: string) => {
    await api.updateAccessReview(id, { status });
    const r = await api.accessReviews();
    setReviews(r);
  };

  if (loading) return <LoadingSpinner />;
  const ps = people.items || [];

  return (
    <PageWrap title="Personnel & Access Reviews" subtitle="Employee training, access reviews and compliance">
      <Grid cols={4}>
        {[
          { label: 'Active Employees', value: stats.total_active,      color: colors.green },
          { label: 'MFA Enrolled',     value: `${stats.mfa_pct}%`,     color: stats.mfa_pct >= 90 ? colors.green : colors.yellow },
          { label: 'Training %',       value: `${stats.training_pct}%`,color: stats.training_pct >= 80 ? colors.green : colors.orange },
          { label: 'Pending Reviews',  value: stats.pending_reviews,   color: stats.pending_reviews > 0 ? colors.red : colors.green },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {(['people', 'training', 'access'] as const).map(t => (
          <Btn key={t} small variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
            {t === 'people' ? 'People' : t === 'training' ? `Overdue Training (${overdue.length})` : `Access Reviews (${reviews.length})`}
          </Btn>
        ))}
      </div>

      <Card>
        {tab === 'people' && (
          <Table headers={['Name', 'Department', 'Title', 'Status', 'MFA', 'Background Check', 'Review Due']}
            rows={ps.map((p: any) => [
              <div>
                <div style={{ fontSize: 13, color: colors.text }}>{p.full_name}</div>
                <div style={{ fontSize: 11, color: colors.text3 }}>{p.email}</div>
              </div>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{p.department || '-'}</span>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{p.title || '-'}</span>,
              <Badge label={p.employment_status} status={p.employment_status === 'active' ? 'compliant' : 'failing'} />,
              <span style={{ color: p.mfa_enabled ? colors.green : colors.red }}>
                {p.mfa_enabled ? '✓ Enabled' : '✗ Disabled'}
              </span>,
              <Badge label={p.background_check_status} status={p.background_check_status === 'passed' ? 'compliant' : 'partial'} />,
              <span style={{ fontSize: 11, color: p.access_review_due && new Date(p.access_review_due) < new Date() ? colors.red : colors.text3 }}>
                {p.access_review_due ? new Date(p.access_review_due).toLocaleDateString() : '-'}
              </span>,
            ])}
          />
        )}
        {tab === 'training' && (
          <Table headers={['Employee', 'Department', 'Course', 'Type', 'Due Date']}
            rows={overdue.map((t: any) => [
              <div>
                <div style={{ fontSize: 13, color: colors.text }}>{t.full_name}</div>
                <div style={{ fontSize: 11, color: colors.text3 }}>{t.email}</div>
              </div>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{t.department}</span>,
              <span style={{ fontSize: 13, color: colors.text }}>{t.course_name}</span>,
              <Badge label={t.course_type} />,
              <span style={{ fontSize: 11, color: colors.red }}>{new Date(t.due_date).toLocaleDateString()} — OVERDUE</span>,
            ])}
          />
        )}
        {tab === 'access' && (
          <Table headers={['Employee', 'System', 'Access Level', 'Type', 'Due', 'Status', 'Actions']}
            rows={reviews.map((r: any) => [
              <div>
                <div style={{ fontSize: 13, color: colors.text }}>{r.full_name}</div>
                <div style={{ fontSize: 11, color: colors.text3 }}>{r.email}</div>
              </div>,
              <span style={{ fontSize: 13, color: colors.text }}>{r.system_name}</span>,
              <Badge label={r.access_level || 'unknown'} />,
              <Badge label={r.review_type} />,
              <span style={{ fontSize: 11, color: r.due_date && new Date(r.due_date) < new Date() ? colors.red : colors.text3 }}>
                {r.due_date ? new Date(r.due_date).toLocaleDateString() : '-'}
              </span>,
              <Badge label={r.status} status={r.status === 'completed' ? 'compliant' : 'partial'} />,
              r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn small onClick={() => completeReview(r.id, 'approved')}>Approve</Btn>
                  <Btn small variant="danger" onClick={() => completeReview(r.id, 'revoked')}>Revoke</Btn>
                </div>
              ),
            ])}
          />
        )}
      </Card>
    </PageWrap>
  );
}
