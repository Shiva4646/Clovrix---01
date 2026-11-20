import { useState, useEffect } from 'react';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';
import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type EventType =
  | 'assignment'
  | 'evidence_submission'
  | 'step_review'
  | 'step_approved'
  | 'step_overdue'
  | 'workflow_completed'
  | 'finding_created'
  | 'finding_overdue';

type Channel = 'email' | 'in_app' | 'slack' | 'teams';

interface NotificationRule {
  id: string;
  name: string;
  eventType: EventType;
  channels: Channel[];
  recipients: RecipientGroup[];
  framework?: string;
  enabled: boolean;
  delayMinutes: number;
  templateSubject: string;
  templateBody: string;
  createdAt?: string;
}

interface RecipientGroup {
  type: 'role' | 'email' | 'assignee' | 'approver';
  value: string;
  label: string;
}

const EVENT_LABELS: Record<EventType, { label: string; icon: string; desc: string }> = {
  assignment:          { label: 'Assignment',         icon: '👤', desc: 'Triggered when a task or step is assigned to a user' },
  evidence_submission: { label: 'Evidence Submitted', icon: '📎', desc: 'Triggered when evidence is uploaded to a workflow step' },
  step_review:         { label: 'Step Review',        icon: '🔍', desc: 'Triggered when a step is ready for review' },
  step_approved:       { label: 'Step Approved',      icon: '✅', desc: 'Triggered when an approver marks a step as approved' },
  step_overdue:        { label: 'Step Overdue',       icon: '⏰', desc: 'Triggered when a step exceeds its SLA deadline' },
  workflow_completed:  { label: 'Workflow Complete',  icon: '🎉', desc: 'Triggered when an entire audit workflow is completed' },
  finding_created:     { label: 'Finding Created',   icon: '⚠️', desc: 'Triggered when a new finding or gap is logged' },
  finding_overdue:     { label: 'Finding Overdue',   icon: '🚨', desc: 'Triggered when a finding exceeds its remediation deadline' },
};

const CHANNEL_ICONS: Record<Channel, string> = {
  email:    '📧',
  in_app:   '🔔',
  slack:    '💬',
  teams:    '📱',
};

const RECIPIENT_OPTIONS: RecipientGroup[] = [
  { type: 'role',     value: 'compliance_admin',  label: 'Compliance Admin' },
  { type: 'role',     value: 'auditor',           label: 'Auditor' },
  { type: 'role',     value: 'reviewer',          label: 'Reviewer' },
  { type: 'assignee', value: 'step_assignee',     label: 'Step Assignee' },
  { type: 'approver', value: 'approver',          label: 'Configured Approver' },
  { type: 'role',     value: 'all_admins',        label: 'All Admins' },
];

// ── Rule Form Modal ───────────────────────────────────────────────────────────
function RuleFormModal({ rule, frameworks, onSave, onClose }: {
  rule: Partial<NotificationRule> | null;
  frameworks: any[];
  onSave: (r: NotificationRule) => void;
  onClose: () => void;
}) {
  const isNew = !rule?.id;
  const [form, setForm] = useState<Partial<NotificationRule>>(rule || {
    enabled: true,
    channels: ['email', 'in_app'],
    recipients: [RECIPIENT_OPTIONS[3]],
    delayMinutes: 0,
    eventType: 'assignment',
    templateSubject: '',
    templateBody: '',
  });
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13, outline: 'none',
  };

  const toggleChannel = (ch: Channel) => {
    setForm(p => {
      const chs = p.channels || [];
      return { ...p, channels: chs.includes(ch) ? chs.filter(c => c !== ch) : [...chs, ch] };
    });
  };

  const toggleRecipient = (r: RecipientGroup) => {
    setForm(p => {
      const recs = p.recipients || [];
      const exists = recs.find(x => x.value === r.value);
      return { ...p, recipients: exists ? recs.filter(x => x.value !== r.value) : [...recs, r] };
    });
  };

  // Auto-fill template when event type changes
  const onEventChange = (evt: EventType) => {
    const meta = EVENT_LABELS[evt];
    setForm(p => ({
      ...p,
      eventType: evt,
      templateSubject: p.templateSubject || `[Clovrix] ${meta.label} — {{workflow_name}}`,
      templateBody: p.templateBody ||
        `Hi {{recipient_name}},\n\nA "${meta.label}" event has occurred in workflow "{{workflow_name}}".\n\nStep: {{step_name}}\nFramework: {{framework}}\nDate: {{event_date}}\n\nPlease log in to Clovrix to take action.\n\n— The Clovrix Platform`,
    }));
  };

  const save = async () => {
    if (!form.name?.trim()) { toast.warning('Rule name is required'); return; }
    if (!form.eventType) { toast.warning('Event type is required'); return; }
    if (!form.channels?.length) { toast.warning('At least one channel is required'); return; }
    setSaving(true);
    try {
      const payload: NotificationRule = {
        id: form.id || `nr-${Date.now()}`,
        name: form.name!,
        eventType: form.eventType!,
        channels: form.channels!,
        recipients: form.recipients || [],
        framework: form.framework,
        enabled: form.enabled ?? true,
        delayMinutes: form.delayMinutes || 0,
        templateSubject: form.templateSubject || '',
        templateBody: form.templateBody || '',
      };
      await api.saveNotificationRule(payload);
      toast.success(isNew ? 'Notification rule created' : 'Rule updated');
      onSave(payload);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--c-bg2)', border: `1px solid ${colors.border2}`, borderRadius: 14,
        padding: 28, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>
              {isNew ? '+ New Notification Rule' : 'Edit Notification Rule'}
            </div>
            <div style={{ fontSize: 12, color: colors.text3, marginTop: 2 }}>
              Configure automated notifications for workflow events
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text3, fontSize: 20 }}>×</button>
        </div>

        {/* Name & Framework */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rule Name *</div>
            <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Notify on Evidence Upload" style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trigger Event *</div>
            <select value={form.eventType || ''} onChange={e => onEventChange(e.target.value as EventType)} style={inp}>
              {Object.entries(EVENT_LABELS).map(([k, v]) => (
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
        </div>

        {/* Channels */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channels *</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['email', 'in_app', 'slack', 'teams'] as Channel[]).map(ch => {
              const active = (form.channels || []).includes(ch);
              return (
                <button key={ch} onClick={() => toggleChannel(ch)} style={{
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `2px solid ${active ? colors.accent : colors.border}`,
                  background: active ? `${colors.accent}20` : 'transparent',
                  color: active ? colors.accent : colors.text3, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {CHANNEL_ICONS[ch]} {ch.replace('_', ' ').toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recipients */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recipients</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RECIPIENT_OPTIONS.map(r => {
              const active = (form.recipients || []).some(x => x.value === r.value);
              return (
                <button key={r.value} onClick={() => toggleRecipient(r)} style={{
                  padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12,
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

        {/* Delay */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Send Delay (minutes)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" min={0} value={form.delayMinutes || 0}
              onChange={e => setForm(p => ({ ...p, delayMinutes: Number(e.target.value) }))}
              style={{ ...inp, width: 120 }} />
            <span style={{ fontSize: 12, color: colors.text3 }}>0 = send immediately</span>
          </div>
        </div>

        {/* Template */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Subject Template</div>
          <input value={form.templateSubject || ''} onChange={e => setForm(p => ({ ...p, templateSubject: e.target.value }))}
            placeholder="[Clovrix] {{event_type}} — {{workflow_name}}" style={inp} />
          <div style={{ fontSize: 10, color: colors.text3, marginTop: 4 }}>
            Variables: {'{{workflow_name}}'}, {'{{step_name}}'}, {'{{recipient_name}}'}, {'{{framework}}'}, {'{{event_date}}'}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email Body Template</div>
          <textarea value={form.templateBody || ''} onChange={e => setForm(p => ({ ...p, templateBody: e.target.value }))}
            rows={5} style={{ ...inp, resize: 'vertical' }}
            placeholder="Hi {{recipient_name}}, ..." />
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
export default function NotificationManagement() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [filterEvent, setFilterEvent] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [rls, fws] = await Promise.all([
        api.notificationRules(),
        api.frameworks(),
      ]);
      setRules(Array.isArray(rls) ? rls : []);
      setFrameworks(Array.isArray(fws) ? fws : []);
    } catch {
      toast.error('Failed to load notification rules');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (rule: NotificationRule) => {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = rule; return next; }
      return [rule, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  };

  const toggleEnabled = async (rule: NotificationRule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    try {
      await api.saveNotificationRule(updated);
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      toast.success(updated.enabled ? 'Rule enabled' : 'Rule disabled');
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this notification rule?')) return;
    try {
      await api.deleteNotificationRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = filterEvent ? rules.filter(r => r.eventType === filterEvent) : rules;

  if (loading) return <PageWrap title="Notification Management"><LoadingSpinner /></PageWrap>;

  return (
    <PageWrap
      title="Notification Management"
      subtitle="Configure automated notifications for assignments, evidence submissions, reviews, approvals, and overdue tasks."
      action={<Btn onClick={() => { setShowForm(true); setEditing(null); }}>+ New Rule</Btn>}
    >
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Rules', value: rules.length, icon: '📬', color: colors.accent },
          { label: 'Active Rules', value: rules.filter(r => r.enabled).length, icon: '✅', color: colors.green },
          {
  label: 'Email Rules',
  value: rules.filter(
    r => r.channels?.some(c => c.toLowerCase() === 'email')
  ).length,
  icon: '📧',
  color: colors.blue
},
          {
  label: 'Overdue Alerts',
  value: rules.filter(
    r => r.eventType?.toLowerCase().includes('overdue')
  ).length,
  icon: '⏰',
  color: colors.orange
},
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

      {/* Filter */}
      {rules.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterEvent('')}
            style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${!filterEvent ? colors.accent : colors.border}`,
              background: !filterEvent ? `${colors.accent}15` : 'transparent',
              color: !filterEvent ? colors.accent : colors.text3, fontWeight: !filterEvent ? 600 : 400 }}>
            All Events
          </button>
          {Object.entries(EVENT_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => setFilterEvent(k === filterEvent ? '' : k)}
              style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${filterEvent === k ? colors.accent : colors.border}`,
                background: filterEvent === k ? `${colors.accent}15` : 'transparent',
                color: filterEvent === k ? colors.accent : colors.text3, fontWeight: filterEvent === k ? 600 : 400 }}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Rules list */}
      {filtered.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📬</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8 }}>No notification rules yet</div>
          <div style={{ fontSize: 13, color: colors.text3, marginBottom: 20 }}>
            Create rules to automatically notify users on assignments, evidence submissions, reviews, and overdue tasks.
          </div>
          <Btn onClick={() => setShowForm(true)}>+ New Rule</Btn>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(rule => {
          const meta = EVENT_LABELS[rule.eventType];
          return (
            <Card key={rule.id} style={{ opacity: rule.enabled ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{rule.name}</div>
                    <Badge label={meta.label} color={colors.accent} />
                    {rule.framework && <Badge label={rule.framework} />}
                    <Badge label={rule.enabled ? 'Active' : 'Disabled'} status={rule.enabled ? 'active' : 'disabled'} />
                  </div>
                  <div style={{ fontSize: 12, color: colors.text3, marginBottom: 8 }}>{meta.desc}</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {rule.channels.map(ch => (
                        <span key={ch} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
                          background: `${colors.blue}15`, color: colors.blue, fontWeight: 600 }}>
                          {CHANNEL_ICONS[ch]} {ch.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                    {rule.recipients.length > 0 && (
                      <span style={{ fontSize: 12, color: colors.text3 }}>
                        👥 {rule.recipients.map(r => r.label).join(', ')}
                      </span>
                    )}
                    {rule.delayMinutes > 0 && (
                      <span style={{ fontSize: 12, color: colors.text3 }}>
                        ⏱ {rule.delayMinutes}m delay
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
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