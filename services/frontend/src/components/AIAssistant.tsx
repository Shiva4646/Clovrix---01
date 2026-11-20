import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { colors } from './ui';
import { toast } from './Toast';

interface PendingAction {
  action: string;
  label: string;
  params: Record<string, string>;
  preview: string;
}

interface AutoExecuted {
  action: string;
  label: string;
  params: Record<string, string>;
  result: any;
  error?: string;
  log_id: string;
  success: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  pending_action?: PendingAction;
  auto_executed?: AutoExecuted;
  // once user confirms/cancels a pending action, mark it resolved
  action_resolved?: 'confirmed' | 'cancelled' | 'success' | 'failed';
  action_result?: any;
}

const SUGGESTIONS = [
  'What ISO 42001 controls are failing for my Fraud Scoring Engine?',
  'Create a high severity finding for missing EU AI Act conformity assessment',
  'Add a critical risk: EU AI Act non-compliance for Hiring Recommender with likelihood 4 impact 5',
  'Start an audit workflow for Customer Support LLM under ISO 42001',
  'Update finding status to in-remediation for finding id abc123',
  'What evidence is needed for SOC 2 CC6.1?',
];

const ACTION_ICONS: Record<string, string> = {
  create_finding:         '📋',
  create_risk:            '⚠️',
  update_finding_status:  '🔄',
  update_risk_status:     '🔄',
  create_workflow:        '▶',
  run_gap_analysis:       '🔍',
  create_framework:       '◈',
  create_incident:        '🚨',
};

export default function AIAssistant({ contextModule, contextId }: { contextModule?: string; contextId?: string }) {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState<'chat' | 'logs'>('chat');
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null); // message index being confirmed
  const [sessionId,  setSessionId]  = useState<string | undefined>();
  const [online,     setOnline]     = useState<boolean | null>(null);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [autoExec,   setAutoExec]   = useState(false);
  const [logs,       setLogs]       = useState<any[]>([]);
  const [logsLoading,setLogsLoading]= useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load AI status + user preference
  useEffect(() => {
    api.aiStatus()
      .then((r: any) => { setOnline(r.available ?? r.online ?? false); setStatusMsg(r.message || r.reason || ''); })
      .catch(() => { setOnline(false); setStatusMsg('Service offline'); });
    api.aiSettings()
      .then((r: any) => setAutoExec(r.ai_auto_execute ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadLogs = async () => {
    setLogsLoading(true);
    try { setLogs(await api.aiActionLogs()); }
    catch { setLogs([]); }
    setLogsLoading(false);
  };

  const switchTab = (t: 'chat' | 'logs') => {
    setTab(t);
    if (t === 'logs') loadLogs();
  };

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setMessages(p => [...p, { role: 'user', content: msg, timestamp: new Date() }]);
    setLoading(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const res = await api.aiChat({ message: msg, sessionId, contextModule, contextId, history });
      setSessionId(res.session_id);
      setMessages(p => [...p, {
        role: 'assistant',
        content: res.reply,
        timestamp: new Date(),
        pending_action: res.pending_action,
        auto_executed: res.auto_executed,
      }]);
    } catch (e: any) {
      setMessages(p => [...p, { role: 'assistant', content: `Error: ${e.message}`, timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const confirmAction = async (msgIndex: number, action: PendingAction) => {
    setConfirming(String(msgIndex));
    try {
      const res = await api.aiExecute({ action: action.action, params: action.params, sessionId });
      setMessages(p => p.map((m, i) => i === msgIndex
        ? { ...m, action_resolved: 'success', action_result: res }
        : m));
      toast.success(`✓ ${action.label} executed successfully`, 'Action Confirmed');
      if (tab === 'logs') loadLogs();
    } catch (e: any) {
      setMessages(p => p.map((m, i) => i === msgIndex
        ? { ...m, action_resolved: 'failed', action_result: { error: e.message } }
        : m));
      toast.error(e.message, 'Action Failed');
    }
    setConfirming(null);
  };

  const cancelAction = (msgIndex: number) => {
    setMessages(p => p.map((m, i) => i === msgIndex
      ? { ...m, action_resolved: 'cancelled' }
      : m));
  };

  const s = (v: string) => ({ fontSize: 11, color: colors.text3, marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' });

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen(p => !p)} title="Ask Clovrix AI" style={{
        position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%',
        background: `linear-gradient(135deg,${colors.accent},${colors.blue})`,
        border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,106,247,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        zIndex: 9000, transition: 'transform .2s', color: 'white',
      }}
        onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}>
        {open ? '×' : '✦'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, width: 420, height: 620,
          background: 'var(--c-bg2)', border: `1px solid var(--c-border2)`,
          borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.7)',
          display: 'flex', flexDirection: 'column', zIndex: 8999, overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid var(--c-border)`, background: `linear-gradient(135deg,${colors.accent}15,${colors.blue}10)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${colors.accent},${colors.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'white', flexShrink: 0 }}>✦</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Clovrix AI</div>
                <div style={{ fontSize: 10, color: online === true ? colors.green : online === false ? colors.red : colors.text3 }}>
                  {online === true ? '● Online' : online === false ? (statusMsg.includes('pull') ? '● Downloading model…' : '● Offline') : '● Checking…'}
                  {contextModule && <span style={{ color: colors.accent, marginLeft: 6 }}>· {contextModule}</span>}
                </div>
              </div>
              {/* Mode indicator — read-only, configured in Settings */}
              <span title={autoExec ? 'Auto-Execute mode is ON (change in Settings)' : 'Confirmation mode is ON (change in Settings)'}
                style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: autoExec ? `${colors.orange}20` : `${colors.green}20`, color: autoExec ? colors.orange : colors.green, cursor: 'default' }}>
                {autoExec ? '⚡ Auto' : '🔒 Confirm'}
              </span>
              <button onClick={() => setMessages([])} title="Clear chat" style={{ background: 'none', border: 'none', color: colors.text3, cursor: 'pointer', fontSize: 13, padding: 4 }}>↺</button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['chat', 'logs'] as const).map(t => (
                <button key={t} onClick={() => switchTab(t)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: tab === t ? `${colors.accent}25` : 'transparent',
                  color: tab === t ? colors.accent : colors.text3,
                }}>
                  {t === 'chat' ? '💬 Chat' : '📋 Action Log'}
                </button>
              ))}
            </div>
          </div>

          {/* ── CHAT TAB ── */}
          {tab === 'chat' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: colors.text2, marginBottom: 12, lineHeight: 1.6 }}>
                      Hello! I'm your AI governance assistant. I can <strong style={{ color: colors.accent }}>answer questions</strong> about compliance or <strong style={{ color: autoExec ? colors.orange : colors.green }}>execute platform actions</strong> {autoExec ? 'automatically' : 'with your confirmation'}.
                    </div>
                    <div style={{ fontSize: 10, color: colors.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Try asking…</div>
                    {SUGGESTIONS.map((s, i) => (
                      <button key={i} onClick={() => send(s)} style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: 4,
                        background: 'var(--c-bg3)', border: `1px solid var(--c-border)`, borderRadius: 7,
                        color: colors.text2, fontSize: 11, cursor: 'pointer', lineHeight: 1.4,
                      }}
                        onMouseOver={e => (e.currentTarget.style.borderColor = colors.accent)}
                        onMouseOut={e => (e.currentTarget.style.borderColor = colors.border)}>{s}</button>
                    ))}
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: m.role === 'user' ? `${colors.accent}30` : `linear-gradient(135deg,${colors.accent},${colors.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: m.role === 'user' ? colors.accent : 'white' }}>
                        {m.role === 'user' ? 'U' : '✦'}
                      </div>
                      <div style={{ maxWidth: '85%' }}>
                        <div style={{ background: m.role === 'user' ? `${colors.accent}15` : 'var(--c-bg3)', border: `1px solid ${m.role === 'user' ? `${colors.accent}30` : colors.border}`, borderRadius: 10, padding: '8px 12px' }}>
                          <pre style={{ fontSize: 12, color: colors.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, fontFamily: 'inherit', margin: 0 }}>
                            {m.content}
                          </pre>
                        </div>
                        <div style={{ fontSize: 9, color: colors.text3, marginTop: 3, textAlign: m.role === 'user' ? 'right' : 'left' }}>{m.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>

                    {/* Pending action confirmation card */}
                    {m.pending_action && !m.action_resolved && (
                      <div style={{ marginLeft: 34, background: `${colors.accent}08`, border: `1.5px solid ${colors.accent}40`, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: colors.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                          {ACTION_ICONS[m.pending_action.action] || '⚡'} Action Proposed
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 4 }}>{m.pending_action.label}</div>
                        <div style={{ fontSize: 11, color: colors.text2, marginBottom: 10, background: 'var(--c-bg3)', borderRadius: 6, padding: '6px 8px' }}>
                          {m.pending_action.preview}
                        </div>
                        {/* Params detail */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                          {Object.entries(m.pending_action.params).filter(([, v]) => v).map(([k, v]) => (
                            <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: `${colors.indigo}20`, color: colors.indigo }}>
                              {k}: <strong>{v}</strong>
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => confirmAction(i, m.pending_action!)}
                            disabled={confirming === String(i)}
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: colors.accent, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: confirming === String(i) ? 0.6 : 1 }}>
                            {confirming === String(i) ? 'Executing…' : '✓ Confirm & Execute'}
                          </button>
                          <button
                            onClick={() => cancelAction(i)}
                            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text3, fontSize: 12, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resolved action states */}
                    {m.action_resolved === 'success' && (
                      <div style={{ marginLeft: 34, background: `${colors.green}10`, border: `1px solid ${colors.green}40`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: colors.green }}>
                        ✓ {m.pending_action?.label || 'Action'} executed — changes saved to platform
                      </div>
                    )}
                    {m.action_resolved === 'failed' && (
                      <div style={{ marginLeft: 34, background: `${colors.red}10`, border: `1px solid ${colors.red}40`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: colors.red }}>
                        ✗ Execution failed: {m.action_result?.error || 'Unknown error'}
                      </div>
                    )}
                    {m.action_resolved === 'cancelled' && (
                      <div style={{ marginLeft: 34, fontSize: 11, color: colors.text3 }}>
                        ↩ Action cancelled
                      </div>
                    )}

                    {/* Auto-executed badge */}
                    {m.auto_executed && (
                      <div style={{ marginLeft: 34, background: m.auto_executed.success ? `${colors.orange}12` : `${colors.red}10`, border: `1px solid ${m.auto_executed.success ? colors.orange : colors.red}40`, borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: m.auto_executed.success ? colors.orange : colors.red, fontWeight: 700, marginBottom: 4 }}>
                          ⚡ AUTO-EXECUTED · {m.auto_executed.label}
                        </div>
                        {m.auto_executed.success
                          ? <div style={{ fontSize: 11, color: colors.text2 }}>Action completed and logged (ID: {m.auto_executed.log_id?.slice(0, 8)}…)</div>
                          : <div style={{ fontSize: 11, color: colors.red }}>Failed: {m.auto_executed.error}</div>}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${colors.accent},${colors.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white' }}>✦</div>
                    <div style={{ background: 'var(--c-bg3)', border: `1px solid ${colors.border}`, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: colors.accent, animation: 'pulse 1.4s infinite', animationDelay: `${i * 0.2}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '10px 12px', borderTop: `1px solid var(--c-border)`, display: 'flex', gap: 6 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={autoExec ? 'Ask or instruct — actions execute automatically…' : 'Ask or instruct — I\'ll propose actions for your approval…'}
                  style={{ flex: 1, background: 'var(--c-bg3)', border: `1px solid var(--c-border)`, borderRadius: 8, padding: '8px 11px', color: colors.text, fontSize: 12, outline: 'none' }} />
                <button onClick={() => send()} disabled={!input.trim() || loading}
                  style={{ width: 36, height: 36, borderRadius: 8, background: colors.accent, border: 'none', cursor: 'pointer', fontSize: 15, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || loading ? 0.5 : 1 }}>→</button>
              </div>
            </>
          )}

          {/* ── ACTION LOGS TAB ── */}
          {tab === 'logs' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>AI Action Audit Log</div>
                <button onClick={loadLogs} style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 11 }}>↺ Refresh</button>
              </div>
              {logsLoading && <div style={{ fontSize: 12, color: colors.text3 }}>Loading…</div>}
              {!logsLoading && logs.length === 0 && (
                <div style={{ fontSize: 12, color: colors.text3, textAlign: 'center', paddingTop: 30 }}>
                  No actions executed yet.
                </div>
              )}
              {logs.map((l: any) => (
                <div key={l.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{ACTION_ICONS[l.action_type] || '⚡'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>{l.action_type?.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', background: l.exec_mode === 'auto' ? `${colors.orange}20` : `${colors.green}20`, color: l.exec_mode === 'auto' ? colors.orange : colors.green }}>
                        {l.exec_mode}
                      </span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: l.status === 'success' ? `${colors.green}15` : `${colors.red}15`, color: l.status === 'success' ? colors.green : colors.red }}>
                        {l.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: colors.text3, marginBottom: 3 }}>
                    {l.user_email} · {l.created_at ? new Date(l.created_at).toLocaleString() : ''}
                  </div>
                  {l.parameters && l.parameters !== '{}' && (
                    <div style={{ fontSize: 10, color: colors.text3, background: 'var(--c-bg3)', borderRadius: 5, padding: '4px 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {typeof l.parameters === 'string' ? l.parameters : JSON.stringify(l.parameters)}
                    </div>
                  )}
                  {l.error_msg && (
                    <div style={{ fontSize: 10, color: colors.red, marginTop: 3 }}>✗ {l.error_msg}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes pulse{0%,60%,100%{opacity:.3}30%{opacity:1}}`}</style>
    </>
  );
}
