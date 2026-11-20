import { useEffect, useState, useMemo } from 'react';
import { PageWrap, Card, Btn, Badge, Modal, LoadingSpinner, ErrorBanner } from '../ui';
import { toast } from '../Toast';
import { complianceAdminApi, Integration } from '@/lib/mock/complianceAdminApi';

const PROVIDER_ICONS: Record<string, string> = {
  'Google': '🌐',
  'AWS': '☁️',
  'Azure': '🟦',
  'Atlassian': '🔷',
  'Slack': '💬',
  'Other': '✉️',
};

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Connected' | 'Available' | 'Pending Setup'>('All');
  
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  
  const [configTarget, setConfigTarget] = useState<Integration | null>(null);
  const [form, setForm] = useState({ apiUrl: '', apiKey: '', syncInterval: '60' });
  const [testing, setTesting] = useState(false);

  const load = () => {
    setLoading(true);
    complianceAdminApi.getIntegrations()
      .then(setItems)
      .catch(() => setError('Failed to load integrations'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = async (item: Integration) => {
    await complianceAdminApi.updateIntegration(item.id, { enabled: !item.enabled, status: !item.enabled ? 'connected' : 'disconnected' });
    toast.success(`${item.name} ${!item.enabled ? 'connected' : 'disconnected'}`);
    load();
  };

  const openConfig = (item: Integration) => {
    setConfigTarget(item);
    setForm({ apiUrl: item.apiUrl || '', apiKey: item.apiKey || '', syncInterval: '60' });
  };

  const saveConfig = async () => {
    if (!configTarget) return;
    await complianceAdminApi.updateIntegration(configTarget.id, { apiUrl: form.apiUrl, apiKey: form.apiKey ? '••••••••' : undefined, enabled: true, status: 'connected' });
    toast.success(`${configTarget.name} configuration saved`);
    setConfigTarget(null);
    load();
  };

  const testConnection = async () => {
    if (!configTarget) return;
    setTesting(true);
    const result = await complianceAdminApi.testIntegration(configTarget.id);
    result.success ? toast.success(result.message) : toast.error(result.message);
    setTesting(false);
  };

  // Group and filter logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          item.provider.toLowerCase().includes(search.toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
      const matchFilter = 
        filter === 'All' ? true :
        filter === 'Connected' ? item.enabled :
        filter === 'Available' ? !item.enabled :
        filter === 'Pending Setup' ? (item.enabled && item.status !== 'connected') : true;
        
      return matchSearch && matchFilter;
    });
  }, [items, search, filter]);

  const groupedByProvider = useMemo(() => {
    const map = new Map<string, Integration[]>();
    filteredItems.forEach(item => {
      if (!map.has(item.provider)) map.set(item.provider, []);
      map.get(item.provider)!.push(item);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--c-bg3)', border: '1px solid var(--c-border)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--c-text)', fontSize: 13, outline: 'none',
  };

  return (
    <PageWrap title="Integration Management" subtitle="Connect and configure third-party services and cloud platforms">
      <ErrorBanner msg={error} />
      
      {/* Search and Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Search integrations or services..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          style={{ ...inputStyle, maxWidth: 300 }} 
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Connected', 'Available', 'Pending Setup'].map(f => (
            <Btn 
              key={f} 
              variant={filter === f ? 'primary' : 'ghost'} 
              small 
              onClick={() => setFilter(f as any)}
            >
              {f}
            </Btn>
          ))}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedByProvider.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text3)' }}>
              No integrations found matching your criteria.
            </div>
          )}
          {groupedByProvider.map(([providerName, services]) => {
            const isExpanded = expandedProvider === providerName;
            const connectedCount = services.filter(s => s.enabled).length;
            
            return (
              <Card key={providerName} style={{ padding: 0, overflow: 'hidden' }}>
                <div 
                  onClick={() => setExpandedProvider(isExpanded ? null : providerName)}
                  style={{ 
                    padding: '20px 24px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: isExpanded ? 'var(--c-bg2)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--c-border)' : 'none',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 32 }}>{PROVIDER_ICONS[providerName] || '🔌'}</span>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--c-text)' }}>{providerName}</div>
                      <div style={{ fontSize: 13, color: 'var(--c-text3)', marginTop: 4 }}>
                        {services.length} available service{services.length !== 1 ? 's' : ''} • {connectedCount} connected
                      </div>
                    </div>
                  </div>
                  <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
                    ▼
                  </div>
                </div>
                
                {isExpanded && (
                  <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, background: 'var(--c-bg)' }}>
                    {services.map(item => (
                      <div key={item.id} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 16, background: 'var(--c-bg2)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, color: 'var(--c-text)', fontSize: 15 }}>{item.name}</div>
                            <Badge label={item.enabled ? 'Connected' : 'Not Connected'} status={item.enabled ? 'compliant' : 'non-compliant'} />
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--c-text2)', marginBottom: 16, lineHeight: 1.4, minHeight: 36 }}>
                            {item.description || 'Service integration details.'}
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
                          <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>
                            {item.enabled ? `Synced: ${item.lastSync}` : 'Available for setup'}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {item.enabled && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); openConfig(item); }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}
                                title="Settings"
                              >
                                ⚙️
                              </button>
                            )}
                            <Btn small variant={item.enabled ? 'ghost' : 'primary'} onClick={(e) => { e.stopPropagation(); toggle(item); }}>
                              {item.enabled ? 'Disconnect' : 'Connect'}
                            </Btn>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!configTarget} onClose={() => setConfigTarget(null)} title={`Configure ${configTarget?.name}`} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>API URL / Endpoint</label>
            <input value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://…" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>API Credentials / Token</label>
            <input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="Enter API key or token" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Sync Interval (minutes)</label>
            <select value={form.syncInterval} onChange={e => setForm({ ...form, syncInterval: e.target.value })} style={inputStyle}>
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="120">120</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Btn onClick={saveConfig}>Save</Btn>
            <Btn variant="ghost" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test Connection'}</Btn>
            <Btn variant="ghost" onClick={() => setConfigTarget(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </PageWrap>
  );
}
