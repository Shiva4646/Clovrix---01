import { useState, useEffect } from 'react';
import { PageWrap, Card, Table, Badge, Btn, Modal, ErrorBanner, LoadingSpinner } from '../ui';
import api from '@/lib/api';
import { toast } from '../Toast';
import { getActiveRole } from '@/lib/auth';

// Maps a backend ai_systems row → the shape this page renders.
function mapSys(r: any) {
  const parse = (v: any) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const envs = parse(r.deploymentEnvs); const ds = parse(r.dataSources);
  return {
    id: r.systemId || r.id,
    _pk: r.id,
    name: r.name,
    desc: r.description || '',
    technique: r.modelType || '',
    stage: cap(r.lifecycleStage || 'development'),
    owner: r.businessOwner || '',
    dept: r.businessUnit || '',
    criticality: cap(r.riskClass || 'medium'),
    riskLevel: cap(r.riskClass || 'medium'),
    dataSources: ds.join(', '),
    thirdParty: !!r.vendorId,
    vendor: r.vendorId || '',
    env: envs.join(', '),
    goLive: r.nextReviewDate ? String(r.nextReviewDate).slice(0, 10) : '',
    frameworks: parse(r.frameworks),
  };
}

const AI_TECHNIQUES = ['LLM / Generative AI', 'Classical ML', 'Computer Vision', 'Rules-based', 'Other'];
const DEPARTMENTS = ['Engineering', 'Marketing', 'HR', 'Finance', 'Operations', 'Sales'];
const FRAMEWORKS = ['ISO 42001', 'NIST AI RMF', 'EU AI Act'];

export default function AISystemRegistryPage() {
  const [systems, setSystems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<any>(null);
  
  const [filterStage, setFilterStage] = useState('All');
  const [filterRisk, setFilterRisk] = useState('All');
  const [search, setSearch] = useState('');
  
  const activeRole = getActiveRole();
  const isAuditor = activeRole === 'Lead Auditor';
  const isControlLead = activeRole === 'Control Lead';

  // Form State
  const [form, setForm] = useState({
    name: '', desc: '', technique: 'LLM / Generative AI', stage: 'Development', 
    owner: '', dept: 'Engineering', criticality: 'Medium', dataSources: '', 
    thirdParty: false, vendor: '', env: 'Cloud', goLive: '', frameworks: ['ISO 42001']
  });
  const [retireConfirm, setRetireConfirm] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.aiSystems()
      .then(rows => { setSystems((rows || []).map(mapSys)); setError(''); })
      .catch(e => setError(e.message || 'Failed to load AI systems'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const getStageColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'production': return 'var(--c-green)';
      case 'pilot': return 'var(--c-accent)';
      case 'development': return 'var(--c-yellow)';
      case 'retired': return 'var(--c-text3)';
      default: return 'var(--c-text2)';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'high': return 'var(--c-red)';
      case 'medium': return 'var(--c-orange)';
      case 'low': return 'var(--c-green)';
      default: return 'var(--c-text3)';
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.owner || !form.stage) {
      toast.error('Name, Owner, and Lifecycle Stage are required.');
      return;
    }

    // Duplicate warning
    const exists = systems.some(s => s.name.toLowerCase() === form.name.toLowerCase());
    if (exists && !window.confirm(`Warning: A system named "${form.name}" already exists. Save anyway?`)) {
      return;
    }

    if (form.stage === 'Retired' && !retireConfirm) {
      setRetireConfirm('WARNING: Retiring this system will impact linked risks and controls. Confirm retirement?');
      return;
    }

    try {
      await api.createAiSystem({
        name: form.name,
        description: form.desc,
        modelType: form.technique,
        businessUnit: form.dept,
        businessOwner: form.owner,
        lifecycleStage: form.stage,
        riskClass: form.criticality,
        dataSources: form.dataSources,
        thirdParty: form.thirdParty,
        vendor: form.vendor,
        deploymentEnv: form.env,
        goLive: form.goLive,
        frameworks: form.frameworks,
      });
      setIsWizardOpen(false);
      setRetireConfirm(null);
      toast.success('AI System Registered successfully');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to register AI system');
    }
  };

  const filtered = systems.filter(s => {
    return (filterStage === 'All' || s.stage === filterStage) &&
           (filterRisk === 'All' || s.riskLevel === filterRisk) &&
           (s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()));
  });

  const headers = ['System Name / ID', 'Lifecycle Stage', 'Risk Category', 'Owner', 'Department', 'Action'];
  
  const rows = filtered.map(s => [
    <div key={s.id}>
      <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{s.name}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text3)' }}>{s.id}</div>
    </div>,
    <Badge key={s.id} label={s.stage.toUpperCase()} color={getStageColor(s.stage)} />,
    <Badge key={s.id} label={s.riskLevel} color={getRiskColor(s.riskLevel)} />,
    s.owner,
    s.dept,
    <Btn key={s.id} small variant="ghost" onClick={() => setSelectedSystem(s)}>Details</Btn>
  ]);

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--c-border2)', background: 'var(--c-bg)', color: 'var(--c-text)', marginTop: 4, outline: 'none' };

  return (
    <PageWrap 
      title="AI System Registry" 
      subtitle="Clause 8: Foundation inventory of all AI systems. Required before risks or controls can be mapped."
      action={
        !isAuditor && !isControlLead && activeRole !== 'Assessor' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost">Bulk Import (CSV)</Btn>
            <Btn onClick={() => { setForm({...form, stage: 'Development', name: ''}); setIsWizardOpen(true); }}>+ Register AI System</Btn>
          </div>
        )
      }
    >
      <ErrorBanner msg={error} />
      
      <Card style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input placeholder="Search systems..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }}>
          <option value="All">All Lifecycle Stages</option>
          <option value="Development">Development</option><option value="Pilot">Pilot</option>
          <option value="Production">Production</option><option value="Retired">Retired</option>
        </select>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }}>
          <option value="All">All Risk Categories</option>
          <option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
        </select>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 40 }}><LoadingSpinner /></div> : <Table headers={headers} rows={rows} />}
      </Card>

      {/* Details Drawer */}
      <Modal open={!!selectedSystem} onClose={() => setSelectedSystem(null)} title="AI System Details" width={900}>
        {selectedSystem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800 }}>{selectedSystem.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--c-text3)' }}>{selectedSystem.id} • {selectedSystem.desc}</div>
              </div>
              <Badge label={selectedSystem.stage.toUpperCase()} color={getStageColor(selectedSystem.stage)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, background: 'var(--c-bg2)', padding: 16, borderRadius: 8, border: '1px solid var(--c-border2)' }}>
              <div><div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Risk Category</div><Badge label={selectedSystem.riskLevel} color={getRiskColor(selectedSystem.riskLevel)} /></div>
              <div><div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>AI Technique</div><div style={{ fontWeight: 600, fontSize: 13 }}>{selectedSystem.technique}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Owner</div><div style={{ fontWeight: 600, fontSize: 13 }}>{selectedSystem.owner}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--c-text3)', textTransform: 'uppercase', marginBottom: 4 }}>Department</div><div style={{ fontWeight: 600, fontSize: 13 }}>{selectedSystem.dept}</div></div>
            </div>

            {/* Tabs Mockup */}
            <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--c-border)', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, color: 'var(--c-accent)', borderBottom: '2px solid var(--c-accent)', paddingBottom: 8, cursor: 'pointer' }}>Overview</div>
              <div style={{ fontWeight: 600, color: 'var(--c-text3)', paddingBottom: 8, cursor: 'pointer' }}>Linked Controls (12)</div>
              <div style={{ fontWeight: 600, color: 'var(--c-text3)', paddingBottom: 8, cursor: 'pointer' }}>Linked Risks (3)</div>
              <div style={{ fontWeight: 600, color: 'var(--c-text3)', paddingBottom: 8, cursor: 'pointer' }}>Activity Timeline</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Data Sources</h4><p style={{ fontSize: 13 }}>{selectedSystem.dataSources}</p></div>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Vendor / Origin</h4><p style={{ fontSize: 13 }}>{selectedSystem.thirdParty ? `Third-party (${selectedSystem.vendor})` : 'Built in-house'}</p></div>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Deployment Env</h4><p style={{ fontSize: 13 }}>{selectedSystem.env}</p></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Criticality</h4><p style={{ fontSize: 13 }}>{selectedSystem.criticality}</p></div>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Go-Live Date</h4><p style={{ fontSize: 13 }}>{selectedSystem.goLive || 'Not set'}</p></div>
                <div><h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Frameworks</h4><p style={{ fontSize: 13 }}>{(selectedSystem.frameworks || []).join(', ')}</p></div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Registration Wizard */}
      <Modal open={isWizardOpen} onClose={() => setIsWizardOpen(false)} title="Register AI System" width={700}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {retireConfirm && <div style={{ padding: 12, background: 'rgba(255,0,0,0.1)', color: 'var(--c-red)', fontWeight: 600, borderRadius: 6, border: '1px solid var(--c-red)' }}>{retireConfirm}</div>}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>System Name *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Lifecycle Stage *</label>
              <select value={form.stage} onChange={e => setForm({...form, stage: e.target.value})} style={inputStyle}>
                <option>Development</option><option>Pilot</option><option>Production</option><option>Retired</option>
              </select>
            </div>
          </div>
          
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Purpose / Description</label><textarea value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} style={{ ...inputStyle, height: 60, resize: 'none' }} /></div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Owner *</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} style={inputStyle} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Department</label>
              <select value={form.dept} onChange={e => setForm({...form, dept: e.target.value})} style={inputStyle}>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>AI Technique</label>
              <select value={form.technique} onChange={e => setForm({...form, technique: e.target.value})} style={inputStyle}>
                {AI_TECHNIQUES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Criticality</label>
              <select value={form.criticality} onChange={e => setForm({...form, criticality: e.target.value})} style={inputStyle}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
          </div>

          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Data Sources Used</label><input value={form.dataSources} onChange={e => setForm({...form, dataSources: e.target.value})} placeholder="Include if sources contain PII..." style={inputStyle} /></div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.thirdParty} onChange={e => setForm({...form, thirdParty: e.target.checked})} />
              Is this a Third-Party Model?
            </label>
            {form.thirdParty && <input placeholder="Vendor Name" value={form.vendor} onChange={e => setForm({...form, vendor: e.target.value})} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
            <Btn variant="ghost" onClick={() => setIsWizardOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSave}>{retireConfirm ? 'Confirm & Retire' : 'Save System'}</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}
