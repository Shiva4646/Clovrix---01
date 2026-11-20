import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, Table, Grid, Stat, colors } from './ui';

const PROVIDER_ICONS: Record<string, string> = {
  aws: '☁', github: '🐙', okta: '🔑', azure: '🔷', gcp: '🔵',
  jira: '🎯', slack: '💬', snyk: '🛡', crowdstrike: '🦅',
  google_workspace: '🏢', default: '🔌',
};

const AUTH_LABELS: Record<string, string> = {
  oauth2: 'OAuth 2.0', access_key: 'Access Key', token: 'API Token',
};

export default function Integrations() {
  const [items, setItems]   = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [rules, setRules]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string|null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tab, setTab] = useState<'integrations'|'ccm'>('integrations');
  const [aiStatus, setAiStatus] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.integrations(), api.ccmRules(), api.aiStatus()])
      .then(([i, r, a]) => { setItems(i); setRules(r); setAiStatus(a); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selectIntegration = async (item: any) => {
    setSelected(item);
    if (item.status === 'connected') {
      const c = await api.integrationChecks(item.id);
      setChecks(c);
    } else {
      setChecks([]);
    }
  };

  const connectOAuth = async (provider: string) => {
    const redirectUri = `${window.location.origin}/oauth/callback`;
    try {
      const r = await api.oauthAuthorize(provider, redirectUri);
      window.open(r.authorize_url, '_blank', 'width=600,height=700');
    } catch (e: any) { alert(e.message); }
  };

  const connectToken = async (provider: string) => {
    if (!tokenInput.trim()) return;
    await api.connectToken(provider, tokenInput.trim());
    setConnecting(null);
    setTokenInput('');
    load();
  };

  const disconnect = async (provider: string) => {
    await api.disconnect(provider);
    load();
  };

  const sync = async (id: string) => {
    await api.syncIntegration(id);
    load();
  };

  if (loading) return <LoadingSpinner />;

  const connected = items.filter(i => i.status === 'connected').length;
  const errors    = items.filter(i => i.status === 'error').length;
  const passing   = rules.filter(r => r.last_result === 'passing').length;
  const failing   = rules.filter(r => r.last_result === 'failing').length;

  return (
    <PageWrap title="Integrations & CCM" subtitle="Connect any OAuth provider and run continuous control monitoring">
      <Grid cols={4}>
        {[
          { label: 'Connected',     value: connected, color: colors.green },
          { label: 'Errors',        value: errors,    color: errors > 0 ? colors.red : colors.green },
          { label: 'CCM Passing',   value: passing,   color: colors.green },
          { label: 'CCM Failing',   value: failing,   color: failing > 0 ? colors.red : colors.green },
        ].map(s => <Card key={s.label}><Stat {...s} /></Card>)}
      </Grid>

      {/* AI Agent status */}
      <Card style={{ marginTop: 16, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: aiStatus?.available ? colors.green : colors.red }} />
        <span style={{ fontSize: 13, color: colors.text }}>
          AI Agent (Ollama) - {aiStatus?.available ? `Online · Model: ${aiStatus.active_model}` : 'Offline - start with: docker compose up ollama'}
        </span>
        {aiStatus?.available && aiStatus.models?.map((m: string) => (
          <Badge key={m} label={m} />
        ))}
      </Card>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <Btn small variant={tab === 'integrations' ? 'primary' : 'ghost'} onClick={() => setTab('integrations')}>
          Integrations ({items.length})
        </Btn>
        <Btn small variant={tab === 'ccm' ? 'primary' : 'ghost'} onClick={() => setTab('ccm')}>
          CCM Rules ({rules.length})
        </Btn>
      </div>

      {tab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
            {items.map(item => (
              <Card key={item.id} style={{ cursor: 'pointer', border: selected?.id === item.id ? `1px solid ${colors.indigo}` : undefined }}
                onClick={() => selectIntegration(item)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{PROVIDER_ICONS[item.provider] || PROVIDER_ICONS.default}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{item.display_name}</div>
                      <div style={{ fontSize: 11, color: colors.text3 }}>{AUTH_LABELS[item.auth_type] || item.auth_type}</div>
                    </div>
                  </div>
                  <Badge label={item.status} status={item.status} />
                </div>

                {item.status === 'connected' && (
                  <div style={{ fontSize: 11, color: colors.text3, marginBottom: 10 }}>
                    {item.controls_linked} controls · {item.evidence_count} evidence · synced {item.last_sync_at ? new Date(item.last_sync_at).toLocaleTimeString() : 'never'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  {item.status === 'not_connected' && (
                    <>
                      {item.auth_type === 'oauth2'
                        ? <Btn small onClick={() => connectOAuth(item.provider)}>Connect OAuth</Btn>
                        : <Btn small onClick={() => setConnecting(connecting === item.provider ? null : item.provider)}>Connect</Btn>
                      }
                    </>
                  )}
                  {item.status === 'connected' && (
                    <>
                      <Btn small variant="ghost" onClick={() => sync(item.id)}>⟳ Sync</Btn>
                      <Btn small variant="danger" onClick={() => disconnect(item.provider)}>Disconnect</Btn>
                    </>
                  )}
                  {item.status === 'error' && (
                    <Btn small onClick={() => connectOAuth(item.provider)}>Reconnect</Btn>
                  )}
                </div>

                {connecting === item.provider && item.auth_type !== 'oauth2' && (
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <input placeholder="API token or access key" value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      style={{ width: '100%', background: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '6px 10px', color: colors.text, fontSize: 12 }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <Btn small onClick={() => connectToken(item.provider)}>Save</Btn>
                      <Btn small variant="ghost" onClick={() => setConnecting(null)}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {selected && selected.status === 'connected' && (
            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                {PROVIDER_ICONS[selected.provider]} {selected.display_name} - Checks
              </div>
              {checks.length === 0
                ? <div style={{ color: colors.text3, fontSize: 13, padding: 20, textAlign: 'center' }}>No checks configured</div>
                : checks.map((c: any) => (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: colors.text }}>{c.name}</span>
                      <Badge label={c.status} status={c.status} />
                    </div>
                    {c.failure_count > 0 && (
                      <span style={{ fontSize: 11, color: colors.orange }}>{c.failure_count} failures</span>
                    )}
                  </div>
                ))
              }
            </Card>
          )}
        </div>
      )}

      {tab === 'ccm' && (
        <Card>
          <Table
            headers={['Rule', 'Integration', 'Frequency', 'Last Run', 'Result', 'Failures']}
            rows={rules.map(r => [
              <div>
                <div style={{ fontSize: 13, color: colors.text }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 11, color: colors.text3 }}>{r.description}</div>}
              </div>,
              <span style={{ fontSize: 12, color: colors.text2 }}>{r.integration_name || '-'}</span>,
              <Badge label={r.frequency} />,
              <span style={{ fontSize: 11, color: colors.text3 }}>
                {r.last_run_at ? new Date(r.last_run_at).toLocaleTimeString() : 'never'}
              </span>,
              r.last_result ? <Badge label={r.last_result} status={r.last_result} /> : <span style={{ color: colors.text3 }}>—</span>,
              <span style={{ fontSize: 13, color: r.failure_streak > 3 ? colors.red : r.failure_streak > 0 ? colors.orange : colors.green }}>
                {r.failure_streak}
              </span>,
            ])}
          />
        </Card>
      )}
    </PageWrap>
  );
}
