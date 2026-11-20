import type { WorkflowConfig } from "./WorkflowConfigurationModal";
import { useState, useEffect } from 'react';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';
import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalStage {
  id: string;
  stageName: string;
  approverRole: string;
  approverEmail: string;
  order: number;
  required: boolean;
}

// ── Approval Stage Row ────────────────────────────────────────────────────────
function ApprovalStageRow({ stage, onUpdate, onDelete, index }: {
  stage: ApprovalStage;
  onUpdate: (updated: ApprovalStage) => void;
  onDelete: () => void;
  index: number;
}) {
  const inp: React.CSSProperties = {
    background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 12,
    outline: 'none', width: '100%',
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 80px 40px',
      gap: 10, alignItems: 'center', padding: '10px 14px',
      background: colors.bg3, borderRadius: 8, border: `1px solid ${colors.border}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.text3, textAlign: 'center' }}>
        {index + 1}
      </div>
      <input
        value={stage.stageName}
        onChange={e => onUpdate({ ...stage, stageName: e.target.value })}
        placeholder="Stage name (e.g. Initial Review)"
        style={inp}
      />
      <input
        value={stage.approverRole}
        onChange={e => onUpdate({ ...stage, approverRole: e.target.value })}
        placeholder="Role (e.g. Compliance Admin)"
        style={inp}
      />
      <input
        value={stage.approverEmail}
        onChange={e => onUpdate({ ...stage, approverEmail: e.target.value })}
        placeholder="Approver email"
        style={inp}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <div
          onClick={() => onUpdate({ ...stage, required: !stage.required })}
          style={{
            width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
            border: `2px solid ${stage.required ? colors.green : colors.border}`,
            background: stage.required ? colors.green : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {stage.required && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
        </div>
        <span style={{ fontSize: 11, color: colors.text3 }}>Required</span>
      </label>
      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.red, fontSize: 16, padding: 4 }}>
        ✕
      </button>
    </div>
  );
}

// ── Config Form ───────────────────────────────────────────────────────────────
function ConfigForm({ config, frameworks, onSave, onCancel, isNew }: {
  config: Partial<WorkflowConfig>;
  frameworks: any[];
  onSave: (c: WorkflowConfig) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Partial<WorkflowConfig>>(config);
  const [stages, setStages] = useState<ApprovalStage[]>(config.approvalStages || []);
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: '8px 12px', color: colors.text, fontSize: 13, outline: 'none',
  };

  const addStage = () => {
    setStages(prev => [...prev, {
      id: `stage-${Date.now()}`,
      stageName: '', approverRole: '', approverEmail: '',
      order: prev.length + 1, required: true,
    }]);
  };

  const save = async () => {
    if (!form.framework) { toast.warning('Framework is required'); return; }
    if (!form.workflowType) { toast.warning('Workflow type is required'); return; }
    setSaving(true);
    try {
      const payload: WorkflowConfig = {
        id: form.id || `wfc-${Date.now()}`,
        framework: form.framework!,
        workflowType: form.workflowType!,
        approvalStages: stages,
        autoProgressEnabled: form.autoProgressEnabled ?? false,
        requireEvidenceOnComplete: form.requireEvidenceOnComplete ?? true,
        requireSignOffOnComplete: form.requireSignOffOnComplete ?? true,
        defaultAssignee: form.defaultAssignee || '',
        slaHours: form.slaHours || 72,
      };
      // Persist via API — endpoint will be /api/workflow-config
      await api.saveWorkflowConfig(payload);
      toast.success(isNew ? 'Configuration created' : 'Configuration updated');
      onSave(payload);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, marginBottom: 20 }}>
        {isNew ? '+ New Workflow Configuration' : 'Edit Configuration'}
      </div>

      {/* Basic settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Framework *</div>
          <select value={form.framework || ''} onChange={e => setForm(p => ({ ...p, framework: e.target.value }))} style={inp}>
            <option value="">Select framework...</option>
            {frameworks.map((f: any) => <option key={f.code} value={f.code}>{f.name || f.code}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Workflow Type *</div>
          <select value={form.workflowType || ''} onChange={e => setForm(p => ({ ...p, workflowType: e.target.value }))} style={inp}>
            <option value="">Select type...</option>
            {['full-audit', 'control-testing', 'gap-assessment', 'review-only'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Default Assignee Email</div>
          <input value={form.defaultAssignee || ''} onChange={e => setForm(p => ({ ...p, defaultAssignee: e.target.value }))}
            placeholder="compliance@company.com" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>SLA (hours)</div>
          <input type="number" value={form.slaHours || 72} min={1}
            onChange={e => setForm(p => ({ ...p, slaHours: Number(e.target.value) }))} style={inp} />
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {([
          { k: 'autoProgressEnabled', label: 'Auto-progress steps', desc: 'Steps advance automatically when all sub-tasks complete' },
          { k: 'requireEvidenceOnComplete', label: 'Require evidence', desc: 'Evidence must be uploaded before marking a step complete' },
          { k: 'requireSignOffOnComplete', label: 'Require sign-off', desc: 'Reviewer sign-off required to close the workflow' },
        ] as { k: keyof WorkflowConfig; label: string; desc: string }[]).map(t => (
          <div key={t.k} style={{ background: colors.bg3, borderRadius: 8, padding: 14, border: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{t.label}</div>
              <div
                onClick={() => setForm(p => ({ ...p, [t.k]: !p[t.k] }))}
                style={{
                  width: 38, height: 20, borderRadius: 99, cursor: 'pointer',
                  background: form[t.k] ? colors.green : colors.border,
                  position: 'relative', transition: 'background .15s', flexShrink: 0,
                }}>
                <div style={{
                  position: 'absolute', top: 2, left: form[t.k] ? 20 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: colors.text3 }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* Approval stages */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Approval Stages</div>
            <div style={{ fontSize: 11, color: colors.text3, marginTop: 2 }}>
              Define the sequential approval chain for this workflow type
            </div>
          </div>
          <Btn small onClick={addStage}>+ Add Stage</Btn>
        </div>
        {stages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: colors.text3, fontSize: 13,
            background: colors.bg3, borderRadius: 8, border: `1px dashed ${colors.border}` }}>
            No approval stages configured. Click "+ Add Stage" to add one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 80px 40px', gap: 10, padding: '0 14px' }}>
              {['#', 'Stage Name', 'Role', 'Approver', 'Required', ''].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 600, color: colors.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {stages.map((s, i) => (
              <ApprovalStageRow
                key={s.id}
                stage={s}
                index={i}
                onUpdate={updated => setStages(prev => prev.map((x, xi) => xi === i ? updated : x))}
                onDelete={() => setStages(prev => prev.filter((_, xi) => xi !== i))}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
        <Btn onClick={save} style={{ opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save Configuration'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WorkflowConfiguration() {
  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WorkflowConfig | null>(null);

  const load = async () => {
  console.log("LOAD FUNCTION STARTED");

  setLoading(true);

  let cfgs: any[] = [];
  let fws: any[] = [];

  try {
    console.log("Loading Workflow Configs...");
    cfgs = await api.workflowConfigs();
  } catch (e) {
    console.warn("workflowConfigs API not available");
  }

  try {
    console.log("Loading Frameworks...");
    fws = await api.frameworks();
  } catch (e) {
    console.warn("frameworks API not available");
  }

  setConfigs(Array.isArray(cfgs) ? cfgs : []);
  setFrameworks(Array.isArray(fws) ? fws : []);

  setLoading(false);
};

  useEffect(() => { load(); }, []);

  const handleSaved = (cfg: WorkflowConfig) => {
    setConfigs(prev => {
      const idx = prev.findIndex(c => c.id === cfg.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = cfg; return next; }
      return [cfg, ...prev];
    });
    setCreating(false);
    setEditing(null);
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Delete this workflow configuration?')) return;
    try {
      await api.deleteWorkflowConfig(id);
      setConfigs(prev => prev.filter(c => c.id !== id));
      toast.success('Configuration deleted');
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <PageWrap title="Workflow Configuration"><LoadingSpinner /></PageWrap>;

  return (
    <PageWrap
      title="Workflow Configuration"
      subtitle="Configure assessment workflows, approval stages, notifications, and escalation rules."
      action={<Btn onClick={() => { setCreating(true); setEditing(null); }}>+ New Configuration</Btn>}
    >
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Configs', value: configs.length, icon: '⚙️', color: colors.accent },
          { label: 'Frameworks Covered', value: new Set(configs.map(c => c.framework)).size, icon: '📋', color: colors.blue },
          { label: 'With Auto-Progress', value: configs.filter(c => c.autoProgressEnabled).length, icon: '⚡', color: colors.green },
          { label: 'Approval Stages', value: configs.reduce((s, c) => s + (c.approvalStages?.length || 0), 0), icon: '✅', color: colors.orange },
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

      {/* Create form */}
      {creating && (
        <ConfigForm
          config={{}}
          frameworks={frameworks}
          onSave={handleSaved}
          onCancel={() => setCreating(false)}
          isNew={true}
        />
      )}

      {/* Edit form */}
      {editing && (
        <ConfigForm
          config={editing}
          frameworks={frameworks}
          onSave={handleSaved}
          onCancel={() => setEditing(null)}
          isNew={false}
        />
      )}

      {/* Config list */}
      {configs.length === 0 && !creating && (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>⚙️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8 }}>No configurations yet</div>
          <div style={{ fontSize: 13, color: colors.text3, marginBottom: 20 }}>
            Create your first workflow configuration to define approval stages and settings for each framework.
          </div>
          <Btn onClick={() => setCreating(true)}>+ New Configuration</Btn>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {configs.map(cfg => (
          <Card key={cfg.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{cfg.framework}</div>
                  <Badge label={cfg.workflowType} />
                  {cfg.autoProgressEnabled && <Badge label="Auto-progress" color={colors.green} />}
                  {cfg.requireEvidenceOnComplete && <Badge label="Evidence required" color={colors.blue} />}
                  {cfg.requireSignOffOnComplete && <Badge label="Sign-off required" color={colors.orange} />}
                </div>
                <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: colors.text3 }}>
                    ⏱ SLA: <strong style={{ color: colors.text }}>{cfg.slaHours}h</strong>
                  </span>
                  {cfg.defaultAssignee && (
                    <span style={{ fontSize: 12, color: colors.text3 }}>
                      👤 Default: <strong style={{ color: colors.text }}>{cfg.defaultAssignee}</strong>
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: colors.text3 }}>
                    ✅ Stages: <strong style={{ color: colors.text }}>{cfg.approvalStages?.length || 0}</strong>
                  </span>
                </div>
                {(cfg.approvalStages?.length || 0) > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cfg.approvalStages.map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <span style={{ color: colors.text3, fontSize: 12 }}>→</span>}
                        <div style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 99,
                          background: `${colors.accent}15`, color: colors.accent, fontWeight: 600,
                        }}>
                          {s.stageName || `Stage ${i + 1}`}
                          {s.required && <span style={{ color: colors.red, marginLeft: 3 }}>*</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Btn small variant="ghost" onClick={() => { setEditing(cfg); setCreating(false); }}>Edit</Btn>
                <Btn small variant="ghost" onClick={() => deleteConfig(cfg.id)}
                  style={{ color: colors.red, borderColor: colors.red }}>Delete</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PageWrap>
  );
}