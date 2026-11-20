import { useEffect, useState } from 'react';
import { PageWrap, Card, Btn, Table, Badge, Modal, LoadingSpinner, ErrorBanner } from '../ui';
import { toast } from '../Toast';
import { complianceAdminApi, ImportRecord } from '@/lib/mock/complianceAdminApi';

const PAGE_SIZE = 8;

export default function ImportHistoryPage() {
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    complianceAdminApi.getImportHistory()
      .then(setHistory)
      .catch(() => setError('Failed to load import history'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = history.filter(h => {
    const q = search.toLowerCase();
    const matchSearch = !q || h.framework.toLowerCase().includes(q) || h.admin.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || h.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--c-text)', fontSize: 13, outline: 'none',
  };

  return (
    <PageWrap title="Import History & Logs" subtitle="Version history, change tracking, and import audit trail">
      <ErrorBanner msg={error} />

      <Card style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search frameworks or admin…" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 140 }}>
          <option value="All">All Status</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
        </select>
        <Btn variant="ghost" small onClick={() => toast.info('Exporting import logs…')}>Export Logs</Btn>
      </Card>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48, color: 'var(--c-text3)' }}>No import records found</Card>
      ) : (
        <>
          <Table
            headers={['Date', 'Framework', 'Version', 'Admin', 'Status', 'Controls', 'Actions']}
            rows={paged.map(h => [
              h.date,
              <strong>{h.framework}</strong>,
              h.version,
              h.admin,
              <Badge label={h.status} status={h.status === 'Success' ? 'compliant' : 'non-compliant'} />,
              h.count,
              h.error ? (
                <Btn small variant="ghost" onClick={() => setErrorDetail(h.error!)}>View Error</Btn>
              ) : <span style={{ color: 'var(--c-text3)' }}>—</span>,
            ])}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ fontSize: 12, color: 'var(--c-text3)' }}>{filtered.length} record(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn small variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Btn>
              <span style={{ fontSize: 12, alignSelf: 'center', color: 'var(--c-text2)' }}>{page + 1} / {totalPages}</span>
              <Btn small variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Btn>
            </div>
          </div>
        </>
      )}

      <Modal open={!!errorDetail} onClose={() => setErrorDetail('')} title="Import Error Details">
        <pre style={{ background: 'rgba(244,63,94,0.08)', padding: 14, borderRadius: 8, fontSize: 12, color: 'var(--c-red)', overflow: 'auto' }}>{errorDetail}</pre>
        <div style={{ marginTop: 14, textAlign: 'right' }}><Btn small onClick={() => setErrorDetail('')}>Dismiss</Btn></div>
      </Modal>
    </PageWrap>
  );
}
