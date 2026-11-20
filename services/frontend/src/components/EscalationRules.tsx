import { useState, useEffect } from 'react';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';
import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type EscalationTrigger =
  | 'step_overdue'
  | 'finding_overdue'
  | 'evidence_missing'
  | 'approval_stalled'
  | 'workflow_stalled'
  | 'finding_unassigned'
  | 'review_pending'
  | 'sla_breach';

type EscalationAction =
  | 'notify_manager'
  | 'notify_admin'
  | 'reassign'
  | 'flag_critical'
  | 'create_finding'
  | 'send_report';

type EscalationConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

interface EscalationCondition {
  field: 'overdue_hours' | 'overdue_days' | 'attempts' | 'severity';
  operator: EscalationConditionOperator;
  value: number | string;
}

interface EscalationStep {
  id: string;
  delayHours: number;
  actions: EscalationAction[];
  notifyRoles: string[];
  message?: string;
}

interface EscalationRule {
  id: string;
  name: string;
  trigger: EscalationTrigger;
  conditions: EscalationCondition[];
  steps: EscalationStep[];
  framework?: string;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt?: string;
}

// ── Metadata ──────────────────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<EscalationTrigger, { label: string; icon: string; desc: string }> = {
  step_overdue:       { label: 'Step Overdue',         icon: '⏰', desc: 'A workflow step has exceeded its SLA deadline' },
  finding_overdue:    { label: 'Finding Overdue',      icon: '🚨', desc: 'A finding has exceeded its remediation deadline' },
  evidence_missing:   { label: 'Evidence Missing',     icon: '📎', desc: 'Required evidence has not been submitted by the deadline' },
  approval_stalled:   { label: 'Approval Stalled',     icon: '🔒', desc: 'An approval step has had no response within the SLA window' },
  workflow_stalled:   { label: 'Workflow Stalled',     icon: '⚙️', desc: 'An entire workflow has seen no activity within the threshold' },
  finding_unassigned: { label: 'Finding Unassigned',   icon: '👤', desc: 'A finding has been open without an assigned owner' },
  review_pending:     { label: 'Review Pending',       icon: '🔍', desc: 'A step review request has had no response within the SLA' },
  sla_breach:         { label: 'SLA Breach',           icon: '📊', desc: 'A configured SLA threshold has been breached' },
};

const ACTION_LABELS: Record<EscalationAction, { label: string; icon: string }> = {
  notify_manager:  { label: 'Notify Manager',    icon: '👔' },
  notify_admin:    { label: 'Notify Admin',       icon: '🛡️' },
  reassign:        { label: 'Reassign Task',      icon: '🔄' },
  flag_critical:   { label: 'Flag as Critical',  icon: '🚩' },
  create_finding:  { label: 'Create Finding',    icon: '⚠️' },
  send_report:     { label: 'Send Report',        icon: '📤' },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  medium:   { label: 'Medium',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  high:     { label: 'High',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  critical: { label: 'Critical', color: '#dc2626', bg: 'rgba(220,38,38,0.18)' },
};

const ROLE_OPTIONS = [
  { value: 'compliance_admin', label: 'Compliance Admin' },
  { value: 'auditor',          label: 'Auditor' },
  { value: 'reviewer',         label: 'Reviewer' },
  { value: 'manager',          label: 'Manager' },
  { value: 'ciso',             label: 'CISO' },
  { value: 'all_admins',       label: 'All Admins' },
];

const newStep = (): EscalationStep => ({
  id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  delayHours: 24,
  actions: ['notify_manager'],
  notifyRoles: ['manager'],
  message: '',
});

// ── Step Builder ──────────────────────────────────────────────────────────────
function StepBuilder({ steps, onChange }: {
  steps: EscalationStep[];
  onChange: (steps: EscalationStep[]) => void;
}) {
  const inp: React.CSSProperties = {
    background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12, outline: 'none',
  };

  const updateStep = (id: string, patch: Partial<EscalationStep>) =>
    onChange(steps.map(s => s.id === id ? { ...s, ...patch } : s));

  const toggleAction = (stepId: string, action: EscalationAction) => {
    const step = steps.find(s => s.id === stepId)!;
    const actions = step.actions.includes(action)
      ? step.actions.filter(a => a !== action)
      : [...step.actions, action];
    updateStep(stepId, { actions });
  };

  const toggleRole = (stepId: string, role: string) => {
    const step = steps.find(s => s.id === stepId)!;
    const notifyRoles = step.notifyRoles.includes(role)
      ? step.notifyRoles.filter(r => r !== role)
      : [...step.notifyRoles, role];
    updateStep(stepId, { notifyRoles });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Escalation Steps
        </div>
        <button onClick={() => onChange([...steps, newStep()])}
          style={{ fontSize: 12, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Add Step
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step, idx) => (
          <div key={step.id} style={{
            background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
            borderRadius: 10, padding: 14, position: 'relative',
          }}>
            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: `${colors.accent}20`, color: colors.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>{idx + 1}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Step {idx + 1}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: colors.text3 }}>Trigger after</span>
                <input type="number" min={1} value={step.delayHours}
                  onChange={e => updateStep(step.id, { delayHours: Number(e.target.value) })}
                  style={{ ...inp, width: 70, textAlign: 'center' }} />
                <span style={{ fontSize: 12, color: colors.text3 }}>hours</span>
                {steps.length > 1 && (
                  <button onClick={() => onChange(steps.filter(s => s.id !== step.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.red, fontSize: 16, lineHeight: 1 }}>×</button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.entries(ACTION_LABELS) as [EscalationAction, { label: string; icon: string }][]).map(([key, meta]) => {
                  const active = step.actions.includes(key);
                  return (
                    <button key={key} onClick={() => toggleAction(step.id, key)} style={{
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: active ? 600 : 400,
                      border: `1px solid ${active ? colors.accent : colors.border}`,
                      background: active ? `${colors.accent}20` : 'transparent',
                      color: active ? colors.accent : colors.text3,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {meta.icon} {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notify roles */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notify Roles</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ROLE_OPTIONS.map(r => {
                  const active = step.notifyRoles.includes(r.value);
                  return (
                    <button key={r.value} onClick={() => toggleRole(step.id, r.value)} style={{
                      padding: '5px 10px', borderRadius: 99, cursor: 'pointer', fontSize: 11,
                      border: `1px solid ${active ? colors.blue : colors.border}`,
                      background: active ? `${colors.blue}20` : 'transparent',
                      color: active ? colors.blue : colors.text3, fontWeight: active ? 600 : 400,
                    }}>
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom message */}
            <div>
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Custom Message (optional)
              </div>
              <input value={step.message || ''} onChange={e => updateStep(step.id, { message: e.target.value })}
                placeholder="e.g. This item requires immediate attention — {{step_name}}"
                style={{ ...inp, width: '100%' }} />
            </div>

            {/* Connector arrow to next step */}
            {idx < steps.length - 1 && (
              <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
                fontSize: 16, color: colors.text3, zIndex: 1 }}>↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rule Form Modal ───────────────────────────────────────────────────────────
function RuleFormModal({ rule, frameworks, onSave, onClose }: {
  rule: Partial<EscalationRule> | null;
  frameworks: any[];
  onSave: (r: EscalationRule) => void;
  onClose: () => void;
}) {
  const isNew = !rule?.id;
  const [form, setForm] = useState<Partial<EscalationRule>>(rule || {
    enabled: true,
    trigger: 'step_overdue',
    priority: 'medium',
    conditions: [{ field: 'overdue_hours', operator: 'gte', value: 24 }],
    steps: [newStep()],
  });
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13, outline: 'none',
  };

  const updateCondition = (idx: number, patch: Partial<EscalationCondition>) =>
    setForm(p => {
      const conds = [...(p.conditions || [])];
      conds[idx] = { ...conds[idx], ...patch };
      return { ...p, conditions: conds };
    });

  const removeCondition = (idx: number) =>
    setForm(p => ({ ...p, conditions: (p.conditions || []).filter((_, i) => i !== idx) }));

  const addCondition = () =>
    setForm(p => ({
      ...p,
      conditions: [...(p.conditions || []), { field: 'overdue_hours', operator: 'gte', value: 48 }],
    }));

  const save = async () => {
    if (!form.name?.trim()) { toast.warning('Rule name is required'); return; }
    if (!form.trigger) { toast.warning('Trigger event is required'); return; }
    if (!form.steps?.length) { toast.warning('At least one escalation step is required'); return; }
    setSaving(true);
    try {
      const payload: EscalationRule = {
        id: form.id || `er-${Date.now()}`,
        name: form.name!,
        trigger: form.trigger!,
        conditions: form.conditions || [],
        steps: form.steps!,
        framework: form.framework,
        enabled: form.enabled ?? true,
        priority: form.priority || 'medium',
      };
      await api.saveEscalationRule(payload);
      toast.success(isNew ? 'Escalation rule created' : 'Rule updated');
      onSave(payload);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const priorities = ['low', 'medium', 'high', 'critical'] as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>
              {isNew ? '+ New Escalation Rule' : 'Edit Escalation Rule'}
            </div>
            <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
              Configure multi-step escalation sequences for unresolved compliance events
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>×</button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rule Name *</div>
          <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Overdue Evidence Escalation" style={inp} />
        </div>

        {/* Trigger + Framework + Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trigger Event *</div>
            <select value={form.trigger || ''} onChange={e => setForm(p => ({ ...p, trigger: e.target.value as EscalationTrigger }))} style={inp}>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Framework Filter (optional)</div>
            <select value={form.framework || ''} onChange={e => setForm(p => ({ ...p, framework: e.target.value || undefined }))} style={inp}>
              <option value="">All frameworks</option>
              {frameworks.map((f: any) => <option key={f.code} value={f.code}>{f.name || f.code}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {priorities.map(p => {
                const cfg = PRIORITY_CONFIG[p];
                const active = form.priority === p;
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))} style={{
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 400,
                    border: `1px solid ${active ? cfg.color : colors.border}`,
                    background: active ? cfg.bg : 'transparent',
                    color: active ? cfg.color : colors.text3,
                  }}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Conditions (all must match)
            </div>
            <button onClick={addCondition}
              style={{ fontSize: 12, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              + Add Condition
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(form.conditions || []).map((cond, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value as any })}
                  style={{ ...inp, flex: 2 }}>
                  <option value="overdue_hours">Overdue (hours)</option>
                  <option value="overdue_days">Overdue (days)</option>
                  <option value="attempts">Escalation attempts</option>
                  <option value="severity">Severity</option>
                </select>
                <select value={cond.operator} onChange={e => updateCondition(idx, { operator: e.target.value as EscalationConditionOperator })}
                  style={{ ...inp, flex: 1 }}>
                  <option value="gt">&gt;</option>
                  <option value="gte">≥</option>
                  <option value="lt">&lt;</option>
                  <option value="lte">≤</option>
                  <option value="eq">=</option>
                </select>
                <input type="number" value={cond.value as number}
                  onChange={e => updateCondition(idx, { value: Number(e.target.value) })}
                  style={{ ...inp, flex: 1, width: 80 }} />
                {(form.conditions || []).length > 1 && (
                  <button onClick={() => removeCondition(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.red, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Escalation Steps */}
        <div style={{ marginBottom: 22 }}>
          <StepBuilder
            steps={form.steps || []}
            onChange={steps => setForm(p => ({ ...p, steps }))}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <Btn onClick={save} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save Rule'}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EscalationRules() {
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EscalationRule | null>(null);
  const [filterTrigger, setFilterTrigger] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [rls, fws] = await Promise.all([
        api.escalationRules(),
        api.frameworks(),
      ]);
      setRules(Array.isArray(rls) ? rls : []);
      setFrameworks(Array.isArray(fws) ? fws : []);
    } catch {
      toast.error('Failed to load escalation rules');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (rule: EscalationRule) => {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = rule; return next; }
      return [rule, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  };

  const toggleEnabled = async (rule: EscalationRule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    try {
      await api.saveEscalationRule(updated);
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      toast.success(updated.enabled ? 'Rule enabled' : 'Rule disabled');
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this escalation rule?')) return;
    try {
      await api.deleteEscalationRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = filterTrigger ? rules.filter(r => r.trigger === filterTrigger) : rules;

  // Derived stats
  const criticalCount = rules.filter(r => r.priority === 'critical' || r.priority === 'high').length;
  const activeCount = rules.filter(r => r.enabled).length;
  const avgSteps = rules.length
    ? Math.round(rules.reduce((acc, r) => acc + r.steps.length, 0) / rules.length)
    : 0;

  if (loading) return <PageWrap title="Escalation Rules"><LoadingSpinner /></PageWrap>;

  return (
    <PageWrap
      title="Escalation Rules"
      subtitle="Define multi-step escalation sequences that trigger when compliance events go unresolved beyond their SLA thresholds."
      action={<Btn onClick={() => { setShowForm(true); setEditing(null); }}>+ New Rule</Btn>}
    >
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Rules',    value: rules.length,  icon: '⚙️',  color: colors.accent },
          { label: 'Active Rules',   value: activeCount,   icon: '✅',  color: colors.green },
          { label: 'High / Critical', value: criticalCount, icon: '🚨', color: colors.red },
          { label: 'Avg Steps / Rule', value: avgSteps,    icon: '🪜',  color: colors.orange },
        ].map(s => (
          <Card key={s.label} style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Trigger filter chips */}
      {rules.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterTrigger('')}
            style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${!filterTrigger ? colors.accent : colors.border}`,
              background: !filterTrigger ? `${colors.accent}15` : 'transparent',
              color: !filterTrigger ? colors.accent : colors.text3, fontWeight: !filterTrigger ? 600 : 400 }}>
            All Triggers
          </button>
          {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => setFilterTrigger(k === filterTrigger ? '' : k)}
              style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${filterTrigger === k ? colors.accent : colors.border}`,
                background: filterTrigger === k ? `${colors.accent}15` : 'transparent',
                color: filterTrigger === k ? colors.accent : colors.text3, fontWeight: filterTrigger === k ? 600 : 400 }}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>⚙️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8 }}>No escalation rules yet</div>
          <div style={{ fontSize: 13, color: colors.text3, marginBottom: 20 }}>
            Create rules to automatically escalate unresolved findings, overdue steps, stalled approvals, and SLA breaches.
          </div>
          <Btn onClick={() => setShowForm(true)}>+ New Rule</Btn>
        </Card>
      )}

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(rule => {
          const meta =
  TRIGGER_LABELS[rule.trigger as keyof typeof TRIGGER_LABELS] ?? {
    label: rule.trigger || "Unknown Trigger",
    icon: "⚙️",
    desc: "Unknown trigger",
  };

const priorityCfg =
  PRIORITY_CONFIG[rule.priority as keyof typeof PRIORITY_CONFIG] ?? {
    label: rule.priority || "Unknown",
    color: "#9ca3af",
    bg: "rgba(156,163,175,0.15)",
  };
          return (
            <Card key={rule.id} style={{ opacity: rule.enabled ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{rule.name}</div>
                    <Badge label={meta.label} color={colors.accent} />
                    {/* Priority badge */}
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                      background: priorityCfg.bg, color: priorityCfg.color,
                    }}>{priorityCfg.label}</span>
                    {rule.framework && <Badge label={rule.framework} />}
                    <Badge label={rule.enabled ? 'Active' : 'Disabled'} status={rule.enabled ? 'active' : 'disabled'} />
                  </div>

                  {/* Trigger description */}
                  <div style={{ fontSize: 12, color: colors.text3, marginBottom: 10 }}>{meta.desc}</div>

                  {/* Step summary pills */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(() => {
  const steps = typeof rule.steps === "string"
    ? JSON.parse(rule.steps || "[]")
    : (rule.steps || []);

  return (
    <>
      <span style={{ fontSize: 11, color: colors.text3, marginRight: 2 }}>
        {steps.length} step{steps.length !== 1 ? "s" : ""}:
      </span>

      {steps.map((step: any, idx: number) => (
        <span
          key={step.id ?? idx}
          style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 99,
            background: `${colors.accent}12`,
            color: colors.accent,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {idx + 1}. {step.delayHours}h →{" "}
          {(step.actions ?? [])
            .slice(0, 2)
            .map((a: any) => ACTION_LABELS[a]?.icon ?? "⚙️")
            .join("")}
          {(step.actions?.length ?? 0) > 2 &&
            ` +${step.actions.length - 2}`}
        </span>
      ))}
    </>
  );
})()}
                    {/* Conditions summary */}
                    {rule.conditions.length > 0 && (
                      <span style={{ fontSize: 11, color: colors.text3, marginLeft: 4 }}>
                        · {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', marginLeft: 16 }}>
                  {/* Toggle */}
                  <div onClick={() => toggleEnabled(rule)} style={{
                    width: 38, height: 20, borderRadius: 99, cursor: 'pointer',
                    background: rule.enabled ? colors.green : colors.border,
                    position: 'relative', transition: 'background .15s', flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: rule.enabled ? 20 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                    }} />
                  </div>
                  <Btn small variant="ghost" onClick={() => { setEditing(rule); setShowForm(false); }}>Edit</Btn>
                  <Btn small variant="ghost" onClick={() => deleteRule(rule.id)}
                    style={{ color: colors.red, borderColor: colors.red }}>Delete</Btn>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Form modal */}
      {(showForm || editing) && (
        <RuleFormModal
          rule={editing}
          frameworks={frameworks}
          onSave={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </PageWrap>
  );
}