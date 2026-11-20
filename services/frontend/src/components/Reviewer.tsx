import { useState, useMemo } from 'react';
import { Card, Badge, PageWrap, Btn, Modal, Table, Grid, colors } from './ui';
import { toast } from './Toast';

// ── Types ──────────────────────────────────────────────────────────────────

type ReviewStatus =
  | 'Pending'
  | 'Verified'
  | 'Approved'
  | 'Rejected'
  | 'Additional Evidence Requested';

interface ReviewRecord {
  id: string;
  controlRef: string;
  controlName: string;
  assessor: string;
  evidenceFile: string;
  submissionDate: string;
  status: ReviewStatus;
  reviewerComments?: string;
  rejectionReason?: string;
  evidenceRequestReason?: string;
  history: { action: string; date: string; by: string; comments?: string }[];
}

type ModalKind = 'view' | 'approve' | 'reject' | 'request' | null;

// ── Mock Data ──────────────────────────────────────────────────────────────

const INITIAL_RECORDS: ReviewRecord[] = [
  {
    id: 'rev-001',
    controlRef: 'AM-01',
    controlName: 'Access Management — Role-Based Access Control',
    assessor: 'Sarah Mitchell',
    evidenceFile: 'access_control_report_Q2_2026.pdf',
    submissionDate: '2026-06-28',
    status: 'Pending',
    history: [
      { action: 'Submitted', date: '2026-06-28', by: 'Sarah Mitchell' },
    ],
  },
  {
    id: 'rev-002',
    controlRef: 'PP-02',
    controlName: 'Password Policy — Complexity & Rotation',
    assessor: 'James Crawford',
    evidenceFile: 'password_policy_audit_june2026.xlsx',
    submissionDate: '2026-06-25',
    status: 'Pending',
    history: [
      { action: 'Submitted', date: '2026-06-25', by: 'James Crawford' },
    ],
  },
  {
    id: 'rev-003',
    controlRef: 'DE-03',
    controlName: 'Data Encryption — At-Rest & In-Transit',
    assessor: 'Priya Sharma',
    evidenceFile: 'encryption_compliance_cert_2026.pdf',
    submissionDate: '2026-06-22',
    status: 'Approved',
    reviewerComments: 'All encryption standards met. Certificate verified.',
    history: [
      { action: 'Submitted', date: '2026-06-22', by: 'Priya Sharma' },
      { action: 'Approved', date: '2026-06-24', by: 'You', comments: 'All encryption standards met. Certificate verified.' },
    ],
  },
  {
    id: 'rev-004',
    controlRef: 'VM-04',
    controlName: 'Vulnerability Management — Patch Compliance',
    assessor: 'David Okonkwo',
    evidenceFile: 'vulnerability_scan_results_june2026.pdf',
    submissionDate: '2026-06-20',
    status: 'Rejected',
    rejectionReason: 'Critical CVEs not addressed',
    reviewerComments: '4 critical vulnerabilities remain unpatched. Must remediate before re-submission.',
    history: [
      { action: 'Submitted', date: '2026-06-20', by: 'David Okonkwo' },
      { action: 'Rejected', date: '2026-06-21', by: 'You', comments: '4 critical vulnerabilities remain unpatched. Must remediate before re-submission.' },
    ],
  },
  {
    id: 'rev-005',
    controlRef: 'BV-05',
    controlName: 'Backup Verification — Recovery Point Objectives',
    assessor: 'Emily Torres',
    evidenceFile: 'backup_test_results_q2_2026.pdf',
    submissionDate: '2026-06-18',
    status: 'Additional Evidence Requested',
    evidenceRequestReason: 'RPO/RTO test results incomplete',
    reviewerComments: 'Please provide recovery test logs from the secondary data centre.',
    history: [
      { action: 'Submitted', date: '2026-06-18', by: 'Emily Torres' },
      { action: 'Evidence Requested', date: '2026-06-19', by: 'You', comments: 'Please provide recovery test logs from the secondary data centre.' },
    ],
  },
  {
    id: 'rev-006',
    controlRef: 'IR-06',
    controlName: 'Incident Response — Playbook Effectiveness',
    assessor: 'Chen Wei',
    evidenceFile: 'incident_response_drilllog_may2026.docx',
    submissionDate: '2026-06-15',
    status: 'Verified',
    history: [
      { action: 'Submitted', date: '2026-06-15', by: 'Chen Wei' },
      { action: 'Verified', date: '2026-06-16', by: 'You' },
    ],
  },
  {
    id: 'rev-007',
    controlRef: 'NS-07',
    controlName: 'Network Security — Firewall Rule Review',
    assessor: 'Aisha Patel',
    evidenceFile: 'firewall_config_audit_june2026.pdf',
    submissionDate: '2026-06-29',
    status: 'Pending',
    history: [
      { action: 'Submitted', date: '2026-06-29', by: 'Aisha Patel' },
    ],
  },
  {
    id: 'rev-008',
    controlRef: 'MFA-08',
    controlName: 'MFA Enforcement — All Privileged Accounts',
    assessor: 'Marcus Johansen',
    evidenceFile: 'mfa_compliance_report_june2026.pdf',
    submissionDate: '2026-06-30',
    status: 'Pending',
    history: [
      { action: 'Submitted', date: '2026-06-30', by: 'Marcus Johansen' },
    ],
  },
  {
    id: 'rev-009',
    controlRef: 'AM-09',
    controlName: 'Access Management — Privileged Access Workstations',
    assessor: 'Sophie Dubois',
    evidenceFile: 'paw_deployment_evidence_q2.pdf',
    submissionDate: '2026-06-17',
    status: 'Approved',
    reviewerComments: 'PAW deployment fully documented and verified.',
    history: [
      { action: 'Submitted', date: '2026-06-17', by: 'Sophie Dubois' },
      { action: 'Approved', date: '2026-06-18', by: 'You', comments: 'PAW deployment fully documented and verified.' },
    ],
  },
  {
    id: 'rev-010',
    controlRef: 'DE-10',
    controlName: 'Data Encryption — Key Management Procedures',
    assessor: 'Rajiv Nair',
    evidenceFile: 'key_management_audit_2026.pdf',
    submissionDate: '2026-06-26',
    status: 'Pending',
    history: [
      { action: 'Submitted', date: '2026-06-26', by: 'Rajiv Nair' },
    ],
  },
  {
    id: 'rev-011',
    controlRef: 'IR-11',
    controlName: 'Incident Response — Communication Chain Test',
    assessor: 'Laura Kim',
    evidenceFile: 'comms_chain_test_june2026.pdf',
    submissionDate: '2026-06-23',
    status: 'Rejected',
    rejectionReason: 'Incomplete communication chain',
    reviewerComments: 'Executive stakeholders were excluded from the drill. Redo and resubmit.',
    history: [
      { action: 'Submitted', date: '2026-06-23', by: 'Laura Kim' },
      { action: 'Rejected', date: '2026-06-24', by: 'You', comments: 'Executive stakeholders were excluded from the drill. Redo and resubmit.' },
    ],
  },
  {
    id: 'rev-012',
    controlRef: 'BV-12',
    controlName: 'Backup Verification — Offsite Storage Audit',
    assessor: 'Tom Anderson',
    evidenceFile: 'offsite_backup_audit_q2_2026.xlsx',
    submissionDate: '2026-06-19',
    status: 'Additional Evidence Requested',
    evidenceRequestReason: 'Physical site inspection report missing',
    reviewerComments: 'Please attach the signed site inspection report from the third-party auditor.',
    history: [
      { action: 'Submitted', date: '2026-06-19', by: 'Tom Anderson' },
      { action: 'Evidence Requested', date: '2026-06-20', by: 'You', comments: 'Please attach the signed site inspection report from the third-party auditor.' },
    ],
  },
];

const PAGE_SIZE = 8;

// ── Status helpers ─────────────────────────────────────────────────────────

function statusToUi(s: ReviewStatus): { label: string; status: string } {
  switch (s) {
    case 'Approved':                     return { label: 'Approved',            status: 'approved' };
    case 'Rejected':                     return { label: 'Rejected',            status: 'non-compliant' };
    case 'Verified':                     return { label: 'Verified',            status: 'compliant' };
    case 'Additional Evidence Requested':return { label: 'Evidence Requested',  status: 'in_progress' };
    default:                             return { label: 'Pending',             status: 'partial' };
  }
}

// ── Inline label style ─────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  fontSize: 11, color: colors.text3, marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
};

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
  borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, outline: 'none',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function HistoryLog({ rows }: { rows: ReviewRecord['history'] }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: colors.text3 }}>No history.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((h, i) => (
        <div key={i} style={{ padding: '8px 10px', border: `1px solid ${colors.border}`, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.text }}>{h.action}</span>
            <span style={{ fontSize: 11, color: colors.text3 }}>{h.date}</span>
          </div>
          <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>by {h.by}</div>
          {h.comments && <div style={{ fontSize: 12, color: colors.text2, marginTop: 6, fontStyle: 'italic' }}>"{h.comments}"</div>}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Reviewer() {
  const [records, setRecords] = useState<ReviewRecord[]>(INITIAL_RECORDS);

  // Filters & sorting
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy,     setSortBy]     = useState<string>('date-desc');
  const [page,       setPage]       = useState(1);

  // Modal state
  const [modalKind,  setModalKind]  = useState<ModalKind>(null);
  const [activeRec,  setActiveRec]  = useState<ReviewRecord | null>(null);

  // Form fields
  const [rejectReason,   setRejectReason]   = useState('');
  const [comments,       setComments]       = useState('');
  const [evidenceReason, setEvidenceReason] = useState('');
  const [saving,         setSaving]         = useState(false);

  // ── Derived data ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        x.controlRef.toLowerCase().includes(q) ||
        x.controlName.toLowerCase().includes(q) ||
        x.assessor.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') {
      r = r.filter(x => x.status === statusFilter);
    }
    r = [...r].sort((a, b) => {
      if (sortBy === 'date-desc') return b.submissionDate.localeCompare(a.submissionDate);
      if (sortBy === 'date-asc')  return a.submissionDate.localeCompare(b.submissionDate);
      if (sortBy === 'ref-asc')   return a.controlRef.localeCompare(b.controlRef);
      return 0;
    });
    return r;
  }, [records, search, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Dashboard metrics
  const metrics = useMemo(() => ({
    pending:   records.filter(r => r.status === 'Pending').length,
    approved:  records.filter(r => r.status === 'Approved').length,
    rejected:  records.filter(r => r.status === 'Rejected').length,
    evidence:  records.filter(r => r.status === 'Additional Evidence Requested').length,
    verified:  records.filter(r => r.status === 'Verified').length,
  }), [records]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openModal = (kind: ModalKind, rec: ReviewRecord) => {
    setActiveRec(rec);
    setModalKind(kind);
    setComments('');
    setRejectReason('');
    setEvidenceReason('');
  };

  const closeModal = () => {
    setModalKind(null);
    setActiveRec(null);
  };

  const updateRecord = (id: string, patch: Partial<ReviewRecord>) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleVerify = (rec: ReviewRecord) => {
    if (rec.status !== 'Pending' && rec.status !== 'Verified') {
      toast.warning('Only Pending submissions can be verified');
      return;
    }
    updateRecord(rec.id, {
      status: 'Verified',
      history: [...rec.history, { action: 'Verified', date: new Date().toISOString().slice(0, 10), by: 'You (Reviewer)' }],
    });
    toast.success(`${rec.controlRef} marked as Verified`);
  };

  const handleApprove = async () => {
    if (!activeRec) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    updateRecord(activeRec.id, {
      status: 'Approved',
      reviewerComments: comments || undefined,
      history: [
        ...activeRec.history,
        { action: 'Approved', date: new Date().toISOString().slice(0, 10), by: 'You (Reviewer)', comments: comments || undefined },
      ],
    });
    toast.success(`${activeRec.controlRef} approved successfully`, 'Assessment Approved');
    setSaving(false);
    closeModal();
  };

  const handleReject = async () => {
    if (!activeRec) return;
    if (!rejectReason.trim()) { toast.warning('Rejection reason is required'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    updateRecord(activeRec.id, {
      status: 'Rejected',
      rejectionReason: rejectReason,
      reviewerComments: comments || undefined,
      history: [
        ...activeRec.history,
        { action: 'Rejected', date: new Date().toISOString().slice(0, 10), by: 'You (Reviewer)', comments: [rejectReason, comments].filter(Boolean).join(' — ') },
      ],
    });
    toast.error(`${activeRec.controlRef} has been rejected`, 'Assessment Rejected');
    setSaving(false);
    closeModal();
  };

  const handleRequestEvidence = async () => {
    if (!activeRec) return;
    if (!evidenceReason.trim()) { toast.warning('Evidence request reason is required'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    updateRecord(activeRec.id, {
      status: 'Additional Evidence Requested',
      evidenceRequestReason: evidenceReason,
      reviewerComments: comments || undefined,
      history: [
        ...activeRec.history,
        { action: 'Evidence Requested', date: new Date().toISOString().slice(0, 10), by: 'You (Reviewer)', comments: [evidenceReason, comments].filter(Boolean).join(' — ') },
      ],
    });
    toast.success(`Evidence request sent for ${activeRec.controlRef}`, 'Evidence Requested');
    setSaving(false);
    closeModal();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const metricCards = [
    { label: 'Pending Reviews',       value: metrics.pending,  icon: '⏳', color: colors.yellow },
    { label: 'Approved',              value: metrics.approved, icon: '✓',  color: colors.green  },
    { label: 'Rejected',              value: metrics.rejected, icon: '✕',  color: colors.red    },
    { label: 'Evidence Requests',     value: metrics.evidence, icon: '📋', color: colors.orange },
    { label: 'Verified',              value: metrics.verified, icon: '🔍', color: colors.blue   },
  ];

  const STATUS_OPTIONS: string[] = [
    'All', 'Pending', 'Verified', 'Approved', 'Rejected', 'Additional Evidence Requested',
  ];

  return (
    <PageWrap
      title="Reviewer Workspace"
      subtitle="Manage, verify, approve, reject, and request evidence for submitted control assessments."
    >

      {/* ── CX-26: Dashboard Summary Cards ─────────────────────────────── */}
      <Grid cols={5} gap={12}>
        {metricCards.map(k => (
          <Card key={k.label} style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {k.label}
              </div>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: `${k.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: k.color }}>
                {k.icon}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: k.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {k.value}
            </div>
          </Card>
        ))}
      </Grid>

      {/* ── CX-27: Evidence Review Section header ──────────────────────── */}
      <Card style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginBottom: 2 }}>Evidence Review Queue</div>
          <div style={{ fontSize: 12, color: colors.text3 }}>
            Review submitted control assessments, verify evidence completeness, and take action on each record.
          </div>
        </div>

        {/* ── Filters & Search ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <svg
              width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.text3}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by control ref, name or assessor…"
              style={{ ...inp, paddingLeft: 30 }}
            />
          </div>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ ...inp, flex: '0 0 220px' }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            style={{ ...inp, flex: '0 0 200px' }}
          >
            <option value="date-desc">Newest Submission First</option>
            <option value="date-asc">Oldest Submission First</option>
            <option value="ref-asc">Control Reference (A–Z)</option>
          </select>
          {/* Result count */}
          <span style={{ fontSize: 12, color: colors.text3, whiteSpace: 'nowrap', paddingLeft: 4 }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Review Table ─────────────────────────────────────────────── */}
        <Table
          headers={['Control Ref', 'Control Name', 'Assessor', 'Evidence', 'Submitted', 'Status', 'Actions']}
          rows={paginated.map(rec => {
            const { label, status } = statusToUi(rec.status);
            return [
              /* Control Ref */
              <span style={{ fontSize: 12, color: colors.accent, fontFamily: 'monospace', fontWeight: 700 }}>
                {rec.controlRef}
              </span>,

              /* Control Name */
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{rec.controlName}</div>
              </div>,

              /* Assessor */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: `${colors.accent}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: colors.accent,
                }}>
                  {rec.assessor.split(' ').map(p => p[0]).join('').slice(0, 2)}
                </div>
                <span style={{ fontSize: 13, color: colors.text2 }}>{rec.assessor}</span>
              </div>,

              /* Evidence */
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>
                  {rec.evidenceFile.endsWith('.pdf') ? '📄' : rec.evidenceFile.endsWith('.xlsx') ? '📊' : '📁'}
                </span>
                <span style={{ fontSize: 12, color: colors.text3, wordBreak: 'break-all' }}>{rec.evidenceFile}</span>
              </div>,

              /* Submission Date */
              <span style={{ fontSize: 12, color: colors.text3 }}>{rec.submissionDate}</span>,

              /* Status Badge */
              <Badge label={label} status={status} />,

              /* Actions */
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <Btn small variant="ghost" onClick={() => openModal('view', rec)}>View</Btn>
                {(rec.status === 'Pending' || rec.status === 'Verified') && (
                  <Btn small variant="ghost" onClick={() => handleVerify(rec)}>
                    {rec.status === 'Verified' ? 'Re-Verify' : 'Verify'}
                  </Btn>
                )}
                {rec.status !== 'Approved' && (
                  <Btn small onClick={() => openModal('approve', rec)}>Approve</Btn>
                )}
                {rec.status !== 'Rejected' && (
                  <Btn small variant="danger" onClick={() => openModal('reject', rec)}>Reject</Btn>
                )}
                {rec.status !== 'Additional Evidence Requested' && rec.status !== 'Approved' && (
                  <Btn small variant="ghost" onClick={() => openModal('request', rec)}>Request Evidence</Btn>
                )}
              </div>,
            ];
          })}
        />

        {/* ── Pagination ───────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}`,
          }}>
            <span style={{ fontSize: 12, color: colors.text3 }}>
              Page {page} of {totalPages} · {filtered.length} records
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="ghost" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                ← Previous
              </Btn>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  style={{
                    width: 32, height: 32, borderRadius: 6, border: `1px solid ${n === page ? colors.accent : colors.border}`,
                    background: n === page ? `${colors.accent}18` : 'transparent',
                    color: n === page ? colors.accent : colors.text3,
                    fontSize: 13, fontWeight: n === page ? 700 : 400, cursor: 'pointer',
                    transition: 'all .12s',
                  }}
                >
                  {n}
                </button>
              ))}
              <Btn small variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Next →
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
           MODALS
         ══════════════════════════════════════════════════════════════════ */}

      {/* ── View Evidence Modal ─────────────────────────────────────────── */}
      <Modal open={modalKind === 'view'} onClose={closeModal} title="Evidence Details" width={680}>
        {activeRec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Control Reference', value: activeRec.controlRef },
                { label: 'Assessor',          value: activeRec.assessor },
                { label: 'Submission Date',   value: activeRec.submissionDate },
                { label: 'Current Status',    value: statusToUi(activeRec.status).label },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={lbl}>{label}</div>
                  <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Control Name */}
            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={lbl}>Control Name</div>
              <div style={{ fontSize: 13, color: colors.text }}>{activeRec.controlName}</div>
            </div>

            {/* Evidence file */}
            <div style={{
              border: `1px solid ${colors.border}`, borderRadius: 10,
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
              background: `${colors.accent}08`,
            }}>
              <div style={{ fontSize: 36 }}>
                {activeRec.evidenceFile.endsWith('.pdf') ? '📄'
                  : activeRec.evidenceFile.endsWith('.xlsx') ? '📊'
                  : '📁'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, wordBreak: 'break-all' }}>
                  {activeRec.evidenceFile}
                </div>
                <div style={{ fontSize: 11, color: colors.text3, marginTop: 3 }}>
                  Submitted {activeRec.submissionDate} by {activeRec.assessor}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Btn small variant="ghost" onClick={() => toast.success('Evidence preview loaded (mock)', 'View Evidence')}>
                  👁 Preview
                </Btn>
                <Btn small variant="ghost" onClick={() => toast.success(`${activeRec.evidenceFile} downloaded (mock)`, 'Download')}>
                  ⬇ Download
                </Btn>
              </div>
            </div>

            {/* Completeness check */}
            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={lbl}>Completeness Verification</div>
              {['File attached', 'Control reference matches', 'Assessor name recorded', 'Submission date recorded'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ color: colors.green, fontSize: 14 }}>✓</span>
                  <span style={{ fontSize: 12, color: colors.text2 }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Notes/comments if any */}
            {activeRec.reviewerComments && (
              <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={lbl}>Reviewer Comments</div>
                <div style={{ fontSize: 13, color: colors.text2, fontStyle: 'italic' }}>"{activeRec.reviewerComments}"</div>
              </div>
            )}

            {/* History */}
            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Review History</div>
              <HistoryLog rows={activeRec.history} />
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              {activeRec.status !== 'Approved' && (
                <Btn onClick={() => { closeModal(); setTimeout(() => openModal('approve', activeRec), 50); }}>
                  Approve Assessment
                </Btn>
              )}
              {activeRec.status !== 'Rejected' && (
                <Btn variant="danger" onClick={() => { closeModal(); setTimeout(() => openModal('reject', activeRec), 50); }}>
                  Reject Assessment
                </Btn>
              )}
              <Btn variant="ghost" onClick={closeModal}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── CX-28: Approve Modal ────────────────────────────────────────── */}
      <Modal open={modalKind === 'approve'} onClose={closeModal} title="Approve Assessment" width={500}>
        {activeRec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: `${colors.green}12`, border: `1px solid ${colors.green}30`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 13, color: colors.text }}>
                You are about to <strong style={{ color: colors.green }}>approve</strong> the assessment for:
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginTop: 4 }}>
                {activeRec.controlRef} — {activeRec.controlName}
              </div>
              <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
                Submitted by {activeRec.assessor} on {activeRec.submissionDate}
              </div>
            </div>

            <div>
              <div style={lbl}>Reviewer Comments (optional)</div>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                rows={3}
                placeholder="Add any comments or notes for this approval…"
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              <Btn variant="success" onClick={handleApprove} disabled={saving}>
                {saving ? 'Approving…' : '✓ Confirm Approval'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── CX-29: Reject Modal ─────────────────────────────────────────── */}
      <Modal open={modalKind === 'reject'} onClose={closeModal} title="Reject Assessment" width={520}>
        {activeRec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: `${colors.red}10`, border: `1px solid ${colors.red}30`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 13, color: colors.text }}>
                You are about to <strong style={{ color: colors.red }}>reject</strong> the assessment for:
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginTop: 4 }}>
                {activeRec.controlRef} — {activeRec.controlName}
              </div>
            </div>

            <div>
              <div style={lbl}>Rejection Reason *</div>
              <input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Incomplete evidence, critical gaps identified…"
                style={inp}
              />
            </div>

            <div>
              <div style={lbl}>Reviewer Comments (optional)</div>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                rows={4}
                placeholder="Provide detailed comments to help the assessor remediate…"
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              <Btn variant="danger" onClick={handleReject} disabled={saving}>
                {saving ? 'Rejecting…' : '✕ Reject Assessment'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── CX-30: Request Evidence Modal ───────────────────────────────── */}
      <Modal open={modalKind === 'request'} onClose={closeModal} title="Request Additional Evidence" width={520}>
        {activeRec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: `${colors.orange}10`, border: `1px solid ${colors.orange}30`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 13, color: colors.text }}>
                Send an evidence request to <strong>{activeRec.assessor}</strong> for:
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginTop: 4 }}>
                {activeRec.controlRef} — {activeRec.controlName}
              </div>
            </div>

            <div>
              <div style={lbl}>Evidence Request Reason *</div>
              <input
                value={evidenceReason}
                onChange={e => setEvidenceReason(e.target.value)}
                placeholder="e.g. Missing third-party audit report, RPO test logs not included…"
                style={inp}
              />
            </div>

            <div>
              <div style={lbl}>Reviewer Comments (optional)</div>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                rows={4}
                placeholder="Specify exactly what additional evidence is needed…"
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={handleRequestEvidence} disabled={saving}>
                {saving ? 'Sending…' : '📋 Send Request'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

    </PageWrap>
  );
}
