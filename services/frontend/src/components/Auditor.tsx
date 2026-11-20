import { useMemo, useState } from 'react';
import { Card, Badge, PageWrap, Btn, Modal, Table, Grid, ScoreRing, Bar, StatCard, colors } from './ui';
import { toast } from './Toast';
import { getActiveRole } from '@/lib/auth';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'controls' | 'workflow' | 'soa' | 'evidence' | 'findings' | 'remediations';

type Decision =
  | { kind: 'soa';         id: string; title: string; action: 'approve' | 'reject' }
  | { kind: 'evidence';    id: string; title: string; action: 'verify'  | 'reject' }
  | { kind: 'finding';     id: string; title: string; action: 'validate'| 'reject'; severity?: string }
  | { kind: 'remediation'; id: string; title: string; action: 'approve' | 'reject' | 'more_evidence' }
  | { kind: 'control';     id: string; title: string; action: 'verify'  | 'flag' }
  | { kind: 'workflow';    id: string; title: string; action: 'acknowledge' };

// ── Shared styles ──────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
  borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, outline: 'none',
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: colors.text3, marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
};

function fmtDate(v?: string) {
  return v ? new Date(v).toLocaleString() : '-';
}

// ── Mock Data ──────────────────────────────────────────────────────────────

// CX-31 — Dashboard mock
const MOCK_READINESS = {
  overallScore: 74,
  posture: [
    { framework: 'ISO 27001',   score: 82, controls: 114, compliant: 93, partial: 12, nonCompliant: 9  },
    { framework: 'SOC 2 Type II', score: 71, controls: 64,  compliant: 45, partial: 11, nonCompliant: 8  },
    { framework: 'NIST CSF',    score: 67, controls: 98,  compliant: 66, partial: 18, nonCompliant: 14 },
    { framework: 'PCI DSS',     score: 88, controls: 56,  compliant: 49, partial: 5,  nonCompliant: 2  },
  ],
  openFindings: [
    { id: 'f-01', title: 'Privileged account MFA not enforced',          severity: 'critical', control: 'AM-08', daysOpen: 12, assignee: 'David Okonkwo'   },
    { id: 'f-02', title: 'Firewall rules not reviewed quarterly',         severity: 'high',     control: 'NS-07', daysOpen: 31, assignee: 'Aisha Patel'     },
    { id: 'f-03', title: 'Data retention policy outdated',               severity: 'high',     control: 'DM-02', daysOpen: 19, assignee: 'Sarah Mitchell'   },
    { id: 'f-04', title: 'Backup restoration test not completed in Q2',  severity: 'medium',   control: 'BV-05', daysOpen: 8,  assignee: 'Emily Torres'     },
    { id: 'f-05', title: 'Asset inventory missing 14 endpoints',         severity: 'medium',   control: 'AM-01', daysOpen: 25, assignee: 'Chen Wei'         },
    { id: 'f-06', title: 'Security awareness training completion < 90%', severity: 'low',      control: 'HR-03', daysOpen: 3,  assignee: 'Marcus Johansen'  },
  ],
  metrics: {
    totalControls: 332, compliant: 253, partial: 46, nonCompliant: 33,
    evidencePending: 18, findingsOpen: 6, avgDaysToClose: 14,
  },
};

// CX-32 — Control Verification mock
const MOCK_CONTROLS = [
  { id: 'cv-01', ref: 'AM-01', name: 'Role-Based Access Control',           framework: 'ISO 27001', evidenceStatus: 'verified',  lastReview: '2026-06-24', owner: 'Sarah Mitchell',   evidenceCount: 3, notes: 'All role assignments reviewed and approved.', history: [
    { action: 'Evidence submitted', date: '2026-06-22', by: 'Sarah Mitchell' },
    { action: 'Evidence verified',  date: '2026-06-24', by: 'Auditor' },
  ]},
  { id: 'cv-02', ref: 'PP-02', name: 'Password Complexity & Rotation',      framework: 'ISO 27001', evidenceStatus: 'pending',   lastReview: '2026-06-25', owner: 'James Crawford',   evidenceCount: 2, notes: '', history: [
    { action: 'Evidence submitted', date: '2026-06-25', by: 'James Crawford' },
  ]},
  { id: 'cv-03', ref: 'DE-03', name: 'Data Encryption At-Rest & In-Transit',framework: 'SOC 2',    evidenceStatus: 'verified',  lastReview: '2026-06-22', owner: 'Priya Sharma',     evidenceCount: 4, notes: 'Certificates validated. AES-256 confirmed.', history: [
    { action: 'Evidence submitted', date: '2026-06-22', by: 'Priya Sharma' },
    { action: 'Evidence verified',  date: '2026-06-23', by: 'Auditor' },
  ]},
  { id: 'cv-04', ref: 'VM-04', name: 'Vulnerability Management & Patching',  framework: 'NIST CSF', evidenceStatus: 'flagged',   lastReview: '2026-06-20', owner: 'David Okonkwo',   evidenceCount: 1, notes: '4 critical CVEs outstanding. Re-scan required.', history: [
    { action: 'Evidence submitted', date: '2026-06-20', by: 'David Okonkwo' },
    { action: 'Flagged',            date: '2026-06-21', by: 'Auditor', comments: '4 critical CVEs outstanding.' },
  ]},
  { id: 'cv-05', ref: 'BV-05', name: 'Backup Verification & RPO/RTO',       framework: 'ISO 27001', evidenceStatus: 'pending',   lastReview: '2026-06-18', owner: 'Emily Torres',     evidenceCount: 2, notes: 'Secondary DC logs missing.', history: [
    { action: 'Evidence submitted', date: '2026-06-18', by: 'Emily Torres' },
  ]},
  { id: 'cv-06', ref: 'NS-07', name: 'Network Security — Firewall Rules',    framework: 'PCI DSS',  evidenceStatus: 'pending',   lastReview: '2026-06-29', owner: 'Aisha Patel',     evidenceCount: 1, notes: '', history: [
    { action: 'Evidence submitted', date: '2026-06-29', by: 'Aisha Patel' },
  ]},
  { id: 'cv-07', ref: 'MFA-08', name: 'MFA Enforcement — Privileged Accounts',framework: 'SOC 2',  evidenceStatus: 'flagged',   lastReview: '2026-06-30', owner: 'Marcus Johansen', evidenceCount: 1, notes: 'MFA not enabled on 3 service accounts.', history: [
    { action: 'Evidence submitted', date: '2026-06-30', by: 'Marcus Johansen' },
    { action: 'Flagged',            date: '2026-07-01', by: 'Auditor', comments: 'MFA not enabled on 3 service accounts.' },
  ]},
  { id: 'cv-08', ref: 'IR-06', name: 'Incident Response Playbook Test',      framework: 'NIST CSF', evidenceStatus: 'verified',  lastReview: '2026-06-16', owner: 'Chen Wei',        evidenceCount: 5, notes: 'Drill completed successfully. All stakeholders present.', history: [
    { action: 'Evidence submitted', date: '2026-06-15', by: 'Chen Wei' },
    { action: 'Evidence verified',  date: '2026-06-16', by: 'Auditor' },
  ]},
];

// CX-33 — Workflow Verification mock
const MOCK_WORKFLOWS = [
  { id: 'wf-01', controlRef: 'AM-01', controlName: 'Role-Based Access Control',     assessor: 'Sarah Mitchell', reviewer: 'Reviewer User', reviewerDecision: 'Approved',            reviewerComments: 'All role assignments documented and verified.', assessmentDate: '2026-06-22', reviewDate: '2026-06-24', workflowStatus: 'completed', history: [
    { action: 'Assessment Submitted', date: '2026-06-22', by: 'Sarah Mitchell' },
    { action: 'Assigned to Reviewer', date: '2026-06-22', by: 'System' },
    { action: 'Evidence Verified',    date: '2026-06-23', by: 'Reviewer User' },
    { action: 'Approved',             date: '2026-06-24', by: 'Reviewer User', comments: 'All role assignments documented and verified.' },
    { action: 'Auditor Sign-off',     date: '2026-06-25', by: 'Lead Auditor' },
  ]},
  { id: 'wf-02', controlRef: 'PP-02', controlName: 'Password Complexity & Rotation', assessor: 'James Crawford', reviewer: 'Reviewer User', reviewerDecision: 'Pending',             reviewerComments: '', assessmentDate: '2026-06-25', reviewDate: '', workflowStatus: 'in_review', history: [
    { action: 'Assessment Submitted', date: '2026-06-25', by: 'James Crawford' },
    { action: 'Assigned to Reviewer', date: '2026-06-25', by: 'System' },
  ]},
  { id: 'wf-03', controlRef: 'VM-04', controlName: 'Vulnerability Management',       assessor: 'David Okonkwo', reviewer: 'Reviewer User', reviewerDecision: 'Rejected',            reviewerComments: '4 critical CVEs remain unpatched. Must remediate.', assessmentDate: '2026-06-20', reviewDate: '2026-06-21', workflowStatus: 'rejected', history: [
    { action: 'Assessment Submitted', date: '2026-06-20', by: 'David Okonkwo' },
    { action: 'Assigned to Reviewer', date: '2026-06-20', by: 'System' },
    { action: 'Rejected',             date: '2026-06-21', by: 'Reviewer User', comments: '4 critical CVEs remain unpatched. Must remediate.' },
    { action: 'Returned to Assessor', date: '2026-06-21', by: 'System' },
  ]},
  { id: 'wf-04', controlRef: 'BV-05', controlName: 'Backup Verification',            assessor: 'Emily Torres', reviewer: 'Reviewer User', reviewerDecision: 'Evidence Requested', reviewerComments: 'Please provide secondary DC recovery test logs.', assessmentDate: '2026-06-18', reviewDate: '2026-06-19', workflowStatus: 'evidence_requested', history: [
    { action: 'Assessment Submitted',  date: '2026-06-18', by: 'Emily Torres' },
    { action: 'Assigned to Reviewer',  date: '2026-06-18', by: 'System' },
    { action: 'Evidence Requested',    date: '2026-06-19', by: 'Reviewer User', comments: 'Please provide secondary DC recovery test logs.' },
  ]},
  { id: 'wf-05', controlRef: 'DE-03', controlName: 'Data Encryption',                assessor: 'Priya Sharma', reviewer: 'Reviewer User', reviewerDecision: 'Approved',            reviewerComments: 'Certificates validated. AES-256 confirmed.', assessmentDate: '2026-06-22', reviewDate: '2026-06-23', workflowStatus: 'completed', history: [
    { action: 'Assessment Submitted', date: '2026-06-22', by: 'Priya Sharma' },
    { action: 'Assigned to Reviewer', date: '2026-06-22', by: 'System' },
    { action: 'Approved',             date: '2026-06-23', by: 'Reviewer User', comments: 'Certificates validated. AES-256 confirmed.' },
    { action: 'Auditor Sign-off',     date: '2026-06-24', by: 'Lead Auditor' },
  ]},
  { id: 'wf-06', controlRef: 'IR-06', controlName: 'Incident Response Playbook',    assessor: 'Chen Wei',    reviewer: 'Reviewer User', reviewerDecision: 'Approved',            reviewerComments: 'Drill completed successfully.', assessmentDate: '2026-06-15', reviewDate: '2026-06-16', workflowStatus: 'completed', history: [
    { action: 'Assessment Submitted', date: '2026-06-15', by: 'Chen Wei' },
    { action: 'Assigned to Reviewer', date: '2026-06-15', by: 'System' },
    { action: 'Verified',             date: '2026-06-16', by: 'Reviewer User' },
    { action: 'Approved',             date: '2026-06-16', by: 'Reviewer User', comments: 'Drill completed successfully.' },
    { action: 'Auditor Sign-off',     date: '2026-06-17', by: 'Lead Auditor' },
  ]},
  { id: 'wf-07', controlRef: 'NS-07', controlName: 'Firewall Rule Review',           assessor: 'Aisha Patel', reviewer: 'Reviewer User', reviewerDecision: 'Pending',             reviewerComments: '', assessmentDate: '2026-06-29', reviewDate: '', workflowStatus: 'in_review', history: [
    { action: 'Assessment Submitted', date: '2026-06-29', by: 'Aisha Patel' },
    { action: 'Assigned to Reviewer', date: '2026-06-29', by: 'System' },
  ]},
  { id: 'wf-08', controlRef: 'MFA-08', controlName: 'MFA Enforcement',              assessor: 'Marcus Johansen', reviewer: 'Reviewer User', reviewerDecision: 'Pending',         reviewerComments: '', assessmentDate: '2026-06-30', reviewDate: '', workflowStatus: 'in_review', history: [
    { action: 'Assessment Submitted', date: '2026-06-30', by: 'Marcus Johansen' },
    { action: 'Assigned to Reviewer', date: '2026-06-30', by: 'System' },
  ]},
];

// ── History sub-component ──────────────────────────────────────────────────

function HistoryLog({ rows = [] }: { rows: { action: string; date: string; by: string; comments?: string }[] }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: colors.text3 }}>No history yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((h, i) => (
        <div key={i} style={{ padding: '9px 12px', border: `1px solid ${colors.border}`, borderRadius: 8, position: 'relative', paddingLeft: 28 }}>
          <div style={{ position: 'absolute', left: 10, top: 13, width: 7, height: 7, borderRadius: '50%', background: colors.accent }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.text }}>{h.action}</span>
            <span style={{ fontSize: 11, color: colors.text3 }}>{h.date}</span>
          </div>
          <div style={{ fontSize: 11, color: colors.text3, marginTop: 1 }}>by {h.by}</div>
          {h.comments && <div style={{ fontSize: 12, color: colors.text2, marginTop: 5, fontStyle: 'italic' }}>"{h.comments}"</div>}
        </div>
      ))}
    </div>
  );
}

// ── Severity colour helper ─────────────────────────────────────────────────

function sevColor(s: string) {
  if (s === 'critical') return colors.red;
  if (s === 'high')     return colors.orange;
  if (s === 'medium')   return colors.yellow;
  return colors.green;
}

function wfStatus(s: string): { label: string; status: string } {
  if (s === 'completed')          return { label: 'Completed',          status: 'approved' };
  if (s === 'rejected')           return { label: 'Rejected',           status: 'non-compliant' };
  if (s === 'in_review')          return { label: 'In Review',          status: 'in_progress' };
  if (s === 'evidence_requested') return { label: 'Evidence Requested', status: 'partial' };
  return { label: s, status: 'partial' };
}

function evidenceStatusToUi(s: string): { label: string; status: string } {
  if (s === 'verified') return { label: 'Verified', status: 'compliant' };
  if (s === 'flagged')  return { label: 'Flagged',  status: 'non-compliant' };
  return { label: 'Pending', status: 'partial' };
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Auditor() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';
  const isControlLead = activeRole === 'Control Lead';

  // CX-32 state
  const [controls, setControls] = useState(MOCK_CONTROLS);
  const [ctrlFilter, setCtrlFilter] = useState('All');
  const [ctrlSearch, setCtrlSearch] = useState('');
  const [selectedCtrl, setSelectedCtrl] = useState<typeof MOCK_CONTROLS[0] | null>(null);

  // CX-33 state
  const [workflows, setWorkflows] = useState(MOCK_WORKFLOWS);
  const [wfFilter, setWfFilter] = useState('All');
  const [wfSearch, setWfSearch] = useState('');
  const [selectedWf, setSelectedWf] = useState<typeof MOCK_WORKFLOWS[0] | null>(null);

  // Decision modal (shared)
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  // ── CX-32 Derived data ───────────────────────────────────────────────────
  const filteredControls = useMemo(() => {
    let r = controls;
    if (ctrlFilter !== 'All') r = r.filter(c => c.evidenceStatus === ctrlFilter.toLowerCase());
    if (ctrlSearch.trim()) {
      const q = ctrlSearch.toLowerCase();
      r = r.filter(c => c.ref.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q));
    }
    return r;
  }, [controls, ctrlFilter, ctrlSearch]);

  // ── CX-33 Derived data ───────────────────────────────────────────────────
  const filteredWorkflows = useMemo(() => {
    let r = workflows;
    if (wfFilter !== 'All') r = r.filter(w => w.workflowStatus === wfFilter);
    if (wfSearch.trim()) {
      const q = wfSearch.toLowerCase();
      r = r.filter(w => w.controlRef.toLowerCase().includes(q) || w.controlName.toLowerCase().includes(q) || w.assessor.toLowerCase().includes(q));
    }
    return r;
  }, [workflows, wfFilter, wfSearch]);

  // ── Control action handler ───────────────────────────────────────────────
  const handleControlDecision = async () => {
    if (!decision || decision.kind !== 'control') return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    setControls(prev => prev.map(c => {
      if (c.id !== decision.id) return c;
      const newStatus = decision.action === 'verify' ? 'verified' : 'flagged';
      const actionLabel = decision.action === 'verify' ? 'Evidence verified' : 'Flagged';
      return {
        ...c,
        evidenceStatus: newStatus,
        notes: comments || c.notes,
        history: [...c.history, { action: actionLabel, date: new Date().toISOString().slice(0, 10), by: 'Lead Auditor', comments: comments || undefined }],
      };
    }));
    toast.success(`Control ${decision.title} ${decision.action === 'verify' ? 'verified' : 'flagged'}`);
    setSaving(false);
    setDecision(null);
    setComments('');
    setSelectedCtrl(null);
  };

  // ── Workflow acknowledge handler ─────────────────────────────────────────
  const handleWfAck = async () => {
    if (!decision || decision.kind !== 'workflow') return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    setWorkflows(prev => prev.map(w => {
      if (w.id !== decision.id) return w;
      return {
        ...w,
        workflowStatus: 'completed',
        history: [...w.history, { action: 'Auditor Sign-off', date: new Date().toISOString().slice(0, 10), by: 'Lead Auditor', comments: comments || undefined }],
      };
    }));
    toast.success(`Workflow for ${decision.title} acknowledged`, 'Auditor Sign-off');
    setSaving(false);
    setDecision(null);
    setComments('');
    setSelectedWf(null);
  };

  const submitDecision = () => {
    if (!decision) return;
    if (decision.kind === 'control') return handleControlDecision();
    if (decision.kind === 'workflow') return handleWfAck();
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS: [Tab, string][] = [
    ['dashboard',    'Audit Readiness'],
    ['controls',     'Control Verification'],
    ['workflow',     'Workflow Verification'],
    ['soa',          'SoA Sign-off'],
    ['evidence',     'Evidence Queue'],
    ['findings',     'Findings Validation'],
    ['remediations', 'Remediation Closure'],
  ];

  // ── CX-31: Dashboard ─────────────────────────────────────────────────────

  const m = MOCK_READINESS.metrics;

  const renderDashboard = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Top metric cards */}
      <Grid cols={4} gap={12}>
        <StatCard label="Total Controls"    value={m.totalControls}    icon="🛡️" color={colors.accent}  sub={`${m.compliant} compliant`} />
        <StatCard label="Evidence Pending"  value={m.evidencePending}  icon="📋" color={colors.yellow}  sub="awaiting auditor review" />
        <StatCard label="Open Findings"     value={m.findingsOpen}     icon="🔍" color={colors.red}     sub="require remediation" />
        <StatCard label="Avg. Days to Close" value={m.avgDaysToClose}  icon="⏱️" color={colors.blue}    sub="findings resolution time" />
      </Grid>

      {/* Readiness score + Posture breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>

        {/* Readiness ring */}
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Overall Audit Readiness</div>
          <ScoreRing score={MOCK_READINESS.overallScore} size={120} />
          <div style={{ fontSize: 12, color: colors.text3, textAlign: 'center' }}>
            Based on {m.totalControls} controls across {MOCK_READINESS.posture.length} frameworks
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
            {[
              { label: 'Compliant', value: m.compliant,    color: colors.green  },
              { label: 'Partial',   value: m.partial,      color: colors.yellow },
              { label: 'Gap',       value: m.nonCompliant, color: colors.red    },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: colors.text3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Framework posture */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 16 }}>Compliance Posture by Framework</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {MOCK_READINESS.posture.map(f => {
              const pct = f.score;
              const barColor = pct >= 80 ? colors.green : pct >= 65 ? colors.yellow : colors.red;
              return (
                <div key={f.framework}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{f.framework}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: barColor }}>{pct}%</div>
                  </div>
                  <Bar pct={pct} color={barColor} h={8} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: colors.green  }}>✓ {f.compliant} compliant</span>
                    <span style={{ fontSize: 11, color: colors.yellow }}>⚠ {f.partial} partial</span>
                    <span style={{ fontSize: 11, color: colors.red    }}>✕ {f.nonCompliant} gaps</span>
                    <span style={{ fontSize: 11, color: colors.text3  }}>{f.controls} total</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Open findings list */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 14 }}>Open Findings</div>
        <Table
          headers={['Severity', 'Finding', 'Control', 'Assignee', 'Days Open', 'Action']}
          rows={MOCK_READINESS.openFindings.map(f => [
            <Badge
              label={f.severity}
              status={f.severity === 'critical' ? 'non-compliant' : f.severity === 'high' ? 'non-compliant' : f.severity === 'medium' ? 'in_progress' : 'partial'}
              color={sevColor(f.severity)}
            />,
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{f.title}</div>,
            <span style={{ fontSize: 12, color: colors.accent, fontFamily: 'monospace', fontWeight: 700 }}>{f.control}</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${colors.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: colors.accent, flexShrink: 0 }}>
                {f.assignee.split(' ').map(p => p[0]).join('').slice(0, 2)}
              </div>
              <span style={{ fontSize: 12, color: colors.text2 }}>{f.assignee}</span>
            </div>,
            <span style={{ fontSize: 12, color: f.daysOpen > 20 ? colors.red : f.daysOpen > 10 ? colors.yellow : colors.text3, fontWeight: f.daysOpen > 20 ? 700 : 400 }}>
              {f.daysOpen}d
            </span>,
            <Btn small variant="ghost" onClick={() => { setTab('workflow'); }}>Review →</Btn>,
          ])}
        />
      </Card>
    </div>
  );

  // ── CX-32: Control Verification ──────────────────────────────────────────

  const renderControls = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary chips */}
      <Grid cols={3} gap={12}>
        {[
          { label: 'Verified',   count: controls.filter(c => c.evidenceStatus === 'verified').length, color: colors.green  },
          { label: 'Pending',    count: controls.filter(c => c.evidenceStatus === 'pending').length,  color: colors.yellow },
          { label: 'Flagged',    count: controls.filter(c => c.evidenceStatus === 'flagged').length,  color: colors.red    },
        ].map(k => (
          <Card
            key={k.label}
            style={{ padding: '14px 18px', cursor: 'pointer', border: ctrlFilter === k.label ? `1.5px solid ${k.color}` : undefined }}
            onClick={() => setCtrlFilter(ctrlFilter === k.label ? 'All' : k.label)}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label} Evidence</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginTop: 6 }}>{k.count}</div>
          </Card>
        ))}
      </Grid>

      <Card>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.text3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={ctrlSearch} onChange={e => setCtrlSearch(e.target.value)} placeholder="Search controls…" style={{ ...inp, paddingLeft: 30 }} />
          </div>
          <select value={ctrlFilter} onChange={e => setCtrlFilter(e.target.value)} style={{ ...inp, flex: '0 0 180px' }}>
            {['All', 'Verified', 'Pending', 'Flagged'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: colors.text3 }}>{filteredControls.length} controls</span>
        </div>

        <Table
          headers={['Control Ref', 'Control Name', 'Framework', 'Evidence', 'Owner', 'Last Review', 'Status', 'Actions']}
          rows={filteredControls.map(c => {
            const { label, status } = evidenceStatusToUi(c.evidenceStatus);
            return [
              <span style={{ fontSize: 12, color: colors.accent, fontFamily: 'monospace', fontWeight: 700 }}>{c.ref}</span>,
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{c.name}</div>
                {c.notes && <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>{c.notes.slice(0, 60)}{c.notes.length > 60 ? '…' : ''}</div>}
              </div>,
              <span style={{ fontSize: 12, color: colors.text3 }}>{c.framework}</span>,
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <span style={{ fontSize: 12, color: colors.text3 }}>{c.evidenceCount} file{c.evidenceCount !== 1 ? 's' : ''}</span>
              </div>,
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${colors.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: colors.accent, flexShrink: 0 }}>
                  {c.owner.split(' ').map(p => p[0]).join('').slice(0, 2)}
                </div>
                <span style={{ fontSize: 12, color: colors.text2 }}>{c.owner}</span>
              </div>,
              <span style={{ fontSize: 12, color: colors.text3 }}>{c.lastReview}</span>,
              <Badge label={label} status={status} />,
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <Btn small variant="ghost" onClick={() => setSelectedCtrl(c)}>View</Btn>
                {!isAuditor && !isControlLead && c.evidenceStatus !== 'verified' && (
                  <>
                    <Btn small variant="ghost" onClick={() => { setDecision({ kind: 'control', id: c.id, title: c.ref, action: 'verify' }); }}>Verify Evidence</Btn>
                    <Btn small onClick={() => { toast.success('Draft saved successfully'); }}>Save Draft</Btn>
                    <Btn small variant="primary" onClick={() => {
                      if(c.evidenceCount === 0) {
                        toast.error('Required information missing: No evidence provided.');
                      } else {
                        toast.success('Assessment Submitted for Review');
                      }
                    }}>Submit</Btn>
                  </>
                )}
                {!isAuditor && !isControlLead && c.evidenceStatus !== 'flagged' && (
                  <Btn small variant="danger" onClick={() => { setDecision({ kind: 'control', id: c.id, title: c.ref, action: 'flag' }); }}>Flag Evidence</Btn>
                )}
              </div>,
            ];
          })}
        />
      </Card>
    </div>
  );

  // ── CX-33: Workflow Verification ─────────────────────────────────────────

  const renderWorkflow = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary chips */}
      <Grid cols={4} gap={12}>
        {[
          { label: 'Completed',         key: 'completed',          color: colors.green  },
          { label: 'In Review',         key: 'in_review',          color: colors.yellow },
          { label: 'Rejected',          key: 'rejected',           color: colors.red    },
          { label: 'Evidence Requested',key: 'evidence_requested', color: colors.orange },
        ].map(k => (
          <Card
            key={k.key}
            style={{ padding: '14px 18px', cursor: 'pointer', border: wfFilter === k.key ? `1.5px solid ${k.color}` : undefined }}
            onClick={() => setWfFilter(wfFilter === k.key ? 'All' : k.key)}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginTop: 6 }}>
              {workflows.filter(w => w.workflowStatus === k.key).length}
            </div>
          </Card>
        ))}
      </Grid>

      <Card>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.text3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={wfSearch} onChange={e => setWfSearch(e.target.value)} placeholder="Search by control, assessor…" style={{ ...inp, paddingLeft: 30 }} />
          </div>
          <select value={wfFilter} onChange={e => setWfFilter(e.target.value)} style={{ ...inp, flex: '0 0 220px' }}>
            {[
              ['All', 'All Statuses'],
              ['completed', 'Completed'],
              ['in_review', 'In Review'],
              ['rejected', 'Rejected'],
              ['evidence_requested', 'Evidence Requested'],
            ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span style={{ fontSize: 12, color: colors.text3 }}>{filteredWorkflows.length} workflows</span>
        </div>

        <Table
          headers={['Control', 'Assessor', 'Reviewer', 'Decision', 'Reviewer Comments', 'Assessment Date', 'Review Date', 'Status', 'Actions']}
          rows={filteredWorkflows.map(w => {
            const { label, status } = wfStatus(w.workflowStatus);
            const decisionColor =
              w.reviewerDecision === 'Approved'          ? colors.green  :
              w.reviewerDecision === 'Rejected'          ? colors.red    :
              w.reviewerDecision === 'Evidence Requested'? colors.orange  : colors.text3;
            return [
              <div>
                <span style={{ fontSize: 12, color: colors.accent, fontFamily: 'monospace', fontWeight: 700 }}>{w.controlRef}</span>
                <div style={{ fontSize: 12, color: colors.text2, marginTop: 2 }}>{w.controlName}</div>
              </div>,
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${colors.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: colors.accent, flexShrink: 0 }}>
                  {w.assessor.split(' ').map(p => p[0]).join('').slice(0, 2)}
                </div>
                <span style={{ fontSize: 12, color: colors.text2 }}>{w.assessor}</span>
              </div>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{w.reviewer}</span>,
              <span style={{ fontSize: 12, fontWeight: 700, color: decisionColor }}>{w.reviewerDecision}</span>,
              <span style={{ fontSize: 12, color: colors.text3, fontStyle: w.reviewerComments ? 'italic' : 'normal' }}>
                {w.reviewerComments ? `"${w.reviewerComments.slice(0, 55)}${w.reviewerComments.length > 55 ? '…' : ''}"` : '—'}
              </span>,
              <span style={{ fontSize: 12, color: colors.text3 }}>{w.assessmentDate}</span>,
              <span style={{ fontSize: 12, color: colors.text3 }}>{w.reviewDate || '—'}</span>,
              <Badge label={label} status={status} />,
              <div style={{ display: 'flex', gap: 5 }}>
                <Btn small variant="ghost" onClick={() => setSelectedWf(w)}>History</Btn>
                {!isAuditor && !isControlLead && w.workflowStatus !== 'completed' && w.reviewerDecision === 'Approved' && (
                  <Btn small onClick={() => setDecision({ kind: 'workflow', id: w.id, title: w.controlRef, action: 'acknowledge' })}>
                    Sign Off
                  </Btn>
                )}
              </div>,
            ];
          })}
        />
      </Card>
    </div>
  );

  // ── SoA / Evidence / Findings / Remediations ─────────────────────────────

  const renderOriginalTab = () => {
    const messages: Record<Tab, { title: string; description: string }> = {
      soa: { title: 'Statement of Applicability', description: 'No SOA data available yet.' },
      evidence: { title: 'Evidence Queue', description: 'No evidence pending verification.' },
      findings: { title: 'Findings Queue', description: 'No findings pending validation.' },
      remediations: { title: 'Remediations Queue', description: 'No remediations pending closure.' },
      dashboard: { title: '', description: '' },
      controls: { title: '', description: '' },
      workflow: { title: '', description: '' },
    };

    const msg = messages[tab];
    return (
      <Card style={{ marginTop: 0 }}>
        <div style={{ padding: 40, textAlign: 'center', color: colors.text3 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: colors.text2 }}>{msg.title}</div>
          <div style={{ fontSize: 13 }}>{msg.description}</div>
        </div>
      </Card>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageWrap
      title="Auditor Workflow"
      subtitle="Audit readiness dashboard, control & workflow verification, evidence review, findings validation, and remediation closure."
    >

      {/* Tab bar */}
      <Card style={{ marginBottom: 20, padding: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => (
            <Btn key={id} small variant={tab === id ? 'primary' : 'ghost'} onClick={() => setTab(id)}>
              {id === 'dashboard'    && '📊 '}
              {id === 'controls'     && '🛡️ '}
              {id === 'workflow'     && '🔄 '}
              {label}
            </Btn>
          ))}
        </div>
      </Card>

      {tab === 'dashboard'    && renderDashboard()}
      {tab === 'controls'     && renderControls()}
      {tab === 'workflow'     && renderWorkflow()}
      {(tab === 'soa' || tab === 'evidence' || tab === 'findings' || tab === 'remediations') && renderOriginalTab()}

      {/* ── Control Detail Modal ──────────────────────────────────────── */}
      <Modal open={!!selectedCtrl} onClose={() => setSelectedCtrl(null)} title="Control Evidence Detail" width={660}>
        {selectedCtrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Control Reference', value: selectedCtrl.ref },
                { label: 'Framework',         value: selectedCtrl.framework },
                { label: 'Owner',             value: selectedCtrl.owner },
                { label: 'Last Review',       value: selectedCtrl.lastReview },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={lbl}>{label}</div>
                  <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={lbl}>Control Name</div>
              <div style={{ fontSize: 13, color: colors.text }}>{selectedCtrl.name}</div>
            </div>

            {selectedCtrl.notes && (
              <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={lbl}>Auditor Notes</div>
                <div style={{ fontSize: 13, color: colors.text2, fontStyle: 'italic' }}>"{selectedCtrl.notes}"</div>
              </div>
            )}

            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={lbl}>Evidence Files</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>📎</span>
                <span style={{ fontSize: 13, color: colors.text }}>{selectedCtrl.evidenceCount} file{selectedCtrl.evidenceCount !== 1 ? 's' : ''} attached</span>
                <Btn small variant="ghost" onClick={() => toast.success('Evidence preview (mock)', 'Preview')}>Preview</Btn>
                <Btn small variant="ghost" onClick={() => toast.success('Download started (mock)', 'Download')}>Download</Btn>
              </div>
            </div>

            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Verification History</div>
              <HistoryLog rows={selectedCtrl.history} />
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, flexDirection: 'column' }}>
              {!isAuditor && !isControlLead && selectedCtrl.evidenceStatus !== 'verified' && (
                <div style={{ background: 'var(--c-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--c-border)' }}>
                  <div style={{ ...lbl, marginBottom: 8 }}>Assessor Compliance Decision</div>
                  <select style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border2)', background: 'var(--c-bg3)', color: 'var(--c-text)', marginBottom: 12 }}>
                    <option value="">Select Compliance Status...</option>
                    <option value="compliant">Compliant</option>
                    <option value="partial">Partially Compliant</option>
                    <option value="non_compliant">Non-Compliant</option>
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn onClick={() => { setDecision({ kind: 'control', id: selectedCtrl.id, title: selectedCtrl.ref, action: 'verify' }); }}>
                      ✓ Verify Evidence
                    </Btn>
                    <Btn onClick={() => { toast.success('Assessment saved as draft.'); }}>Save Draft</Btn>
                    <Btn variant="primary" onClick={() => {
                      if(selectedCtrl.evidenceCount === 0) {
                        toast.error('Submission prevented: Missing required evidence.');
                      } else {
                        toast.success('Assessment Submitted for Review');
                      }
                    }}>Submit Assessment</Btn>
                  </div>
                </div>
              )}
              {!isAuditor && !isControlLead && selectedCtrl.evidenceStatus !== 'flagged' && (
                <div style={{ marginTop: 8 }}>
                  <Btn variant="danger" onClick={() => { setDecision({ kind: 'control', id: selectedCtrl.id, title: selectedCtrl.ref, action: 'flag' }); }}>
                    ⚑ Flag Issue
                  </Btn>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setSelectedCtrl(null)}>Close</Btn>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Workflow History Modal ──────────────────────────────────────── */}
      <Modal open={!!selectedWf} onClose={() => setSelectedWf(null)} title="Workflow History & Approval Chain" width={680}>
        {selectedWf && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Control Reference', value: selectedWf.controlRef },
                { label: 'Assessor',          value: selectedWf.assessor },
                { label: 'Reviewer',          value: selectedWf.reviewer },
                { label: 'Reviewer Decision', value: selectedWf.reviewerDecision },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={lbl}>{label}</div>
                  <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={lbl}>Control Name</div>
              <div style={{ fontSize: 13, color: colors.text }}>{selectedWf.controlName}</div>
            </div>

            {selectedWf.reviewerComments && (
              <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={lbl}>Reviewer Comments</div>
                <div style={{ fontSize: 13, color: colors.text2, fontStyle: 'italic' }}>"{selectedWf.reviewerComments}"</div>
              </div>
            )}

            {/* Approval chain visual */}
            <div style={{ background: 'var(--c-bg3)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ ...lbl, marginBottom: 10 }}>Approval Chain</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {[
                  { role: 'Assessor', name: selectedWf.assessor,  done: true },
                  { role: 'Reviewer', name: selectedWf.reviewer,  done: selectedWf.reviewerDecision !== 'Pending' },
                  { role: 'Auditor',  name: 'Lead Auditor',       done: selectedWf.workflowStatus === 'completed' },
                ].map((step, i) => (
                  <div key={step.role} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: step.done ? `${colors.green}25` : 'var(--c-bg2)', border: `2px solid ${step.done ? colors.green : colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, margin: '0 auto 6px' }}>
                        {step.done ? '✓' : '⏳'}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: step.done ? colors.green : colors.text3 }}>{step.role}</div>
                      <div style={{ fontSize: 10, color: colors.text3 }}>{step.name.split(' ')[0]}</div>
                    </div>
                    {i < 2 && <div style={{ width: 40, height: 2, background: colors.border, margin: '0 4px', marginBottom: 24 }} />}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Workflow History</div>
              <HistoryLog rows={selectedWf.history} />
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              {!isAuditor && !isControlLead && selectedWf.workflowStatus !== 'completed' && selectedWf.reviewerDecision === 'Approved' && (
                <Btn onClick={() => setDecision({ kind: 'workflow', id: selectedWf.id, title: selectedWf.controlRef, action: 'acknowledge' })}>
                  ✓ Auditor Sign-off
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => setSelectedWf(null)}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Decision Modal ──────────────────────────────────────── */}
      <Modal open={!!decision} onClose={() => { setDecision(null); setComments(''); }} title="Confirm Auditor Decision" width={500}>
        {decision && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: decision.action === 'verify' || decision.action === 'approve' || decision.action === 'acknowledge' ? `${colors.green}10` : `${colors.red}10`,
              border: `1px solid ${decision.action === 'verify' || decision.action === 'approve' || decision.action === 'acknowledge' ? colors.green : colors.red}30`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 13, color: colors.text }}>
                Confirm <strong style={{ color: decision.action === 'verify' || decision.action === 'approve' || decision.action === 'acknowledge' ? colors.green : colors.red }}>
                  {decision.action === 'acknowledge' ? 'Auditor Sign-off' : decision.action.replace('_', ' ')}
                </strong> for:
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginTop: 4 }}>{decision.title}</div>
            </div>

            <div>
              <div style={lbl}>Comments (optional)</div>
              <textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                rows={3}
                placeholder="Add any auditor notes or justification…"
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              <Btn variant="ghost" onClick={() => { setDecision(null); setComments(''); }}>Cancel</Btn>
              <Btn
                variant={decision.action === 'flag' || decision.action === 'reject' ? 'danger' : 'primary'}
                onClick={submitDecision}
                disabled={saving}
              >
                {saving ? 'Saving…' : decision.action === 'acknowledge' ? '✓ Confirm Sign-off' : `Confirm ${decision.action.replace('_', ' ')}`}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </PageWrap>
  );
}
