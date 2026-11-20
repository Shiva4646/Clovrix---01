import { useEffect, useState } from 'react';
import { PageWrap, Card, Btn, Table, Badge, Modal, LoadingSpinner, ErrorBanner } from '../ui';
import { toast } from '../Toast';
import { complianceAdminApi, WorkflowDefinition } from '@/lib/mock/complianceAdminApi';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editWf, setEditWf] = useState<WorkflowDefinition | null>(null);
  const [form, setForm] = useState({ name: '', stages: 2, reviewers: 'Control Lead, Lead Auditor', slaHours: 48, status: 'draft' as WorkflowDefinition['status'], version: '1.0' });

  const load = () => {
    setLoading(true);
    complianceAdminApi.getWorkflows()
      .then(setWorkflows)
      .catch(() => setError('Failed to load workflows'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditWf(null);
    setForm({ name: '', stages: 2, reviewers: 'Control Lead, Lead Auditor', slaHours: 48, status: 'draft', version: '1.0' });
    setModalOpen(true);
  };

  const openEdit = (wf: WorkflowDefinition) => {
    setEditWf(wf);
    setForm({ name: wf.name, stages: wf.stages, reviewers: wf.reviewers.join(', '), slaHours: wf.slaHours, status: wf.status, version: wf.version });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Workflow name is required'); return; }
    await complianceAdminApi.saveWorkflow({
      id: editWf?.id,
      name: form.name,
      stages: form.stages,
      reviewers: form.reviewers.split(',').map(s => s.trim()).filter(Boolean),
      slaHours: form.slaHours,
      status: form.status,
      version: form.version,
    });
    toast.success(editWf ? 'Workflow updated' : 'Workflow created');
    setModalOpen(false);
    load();
  };

  const toggleActive = async (wf: WorkflowDefinition) => {
    const status = wf.status === 'active' ? 'inactive' : 'active';
    await complianceAdminApi.saveWorkflow({ ...wf, status });
    toast.success(`Workflow ${status === 'active' ? 'activated' : 'deactivated'}`);
    load();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--c-text)', fontSize: 13, outline: 'none',
  };

  return (
    <PageWrap title="Approval Workflow Builder" subtitle="Create workflows, assign reviewers, configure SLA and escalation rules" action={<Btn onClick={openCreate}>+ Create Workflow</Btn>}>
      <ErrorBanner msg={error} />

      <Card style={{ padding: 20, marginBottom: 20, background: 'var(--c-bg3)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 12 }}>Visual Workflow Designer</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {['Submit', 'Review', 'Approve', 'Complete'].map((stage, i) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ padding: '10px 16px', background: 'var(--c-bg2)', border: '1px solid var(--c-border)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--c-accent)' }}>{stage}</div>
              {i < 3 && <span style={{ color: 'var(--c-text3)' }}>→</span>}
            </div>
          ))}
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : workflows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48, color: 'var(--c-text3)' }}>No workflows configured</Card>
      ) : (
        <Table
          headers={['Name', 'Stages', 'Reviewers', 'SLA (hrs)', 'Version', 'Status', 'Updated', 'Actions']}
          rows={workflows.map(wf => [
            <strong>{wf.name}</strong>,
            wf.stages,
            wf.reviewers.join(', '),
            wf.slaHours,
            wf.version,
            <Badge label={wf.status} status={wf.status === 'active' ? 'compliant' : wf.status === 'draft' ? 'partial' : 'non-compliant'} />,
            wf.updatedAt,
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="ghost" onClick={() => openEdit(wf)}>Edit</Btn>
              <Btn small variant="ghost" onClick={() => toggleActive(wf)}>{wf.status === 'active' ? 'Deactivate' : 'Activate'}</Btn>
            </div>,
          ])}
        />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editWf ? 'Edit Workflow' : 'Create Workflow'} width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Workflow Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Approval Stages</label>
              <input type="number" min={1} max={10} value={form.stages} onChange={e => setForm({ ...form, stages: Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>SLA (hours)</label>
              <input type="number" min={1} value={form.slaHours} onChange={e => setForm({ ...form, slaHours: Number(e.target.value) })} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Assign Reviewers (comma-separated)</label>
            <input value={form.reviewers} onChange={e => setForm({ ...form, reviewers: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Version</label>
              <input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as WorkflowDefinition['status'] })} style={inputStyle}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Btn onClick={save}>Save Workflow</Btn>
            <Btn variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}
