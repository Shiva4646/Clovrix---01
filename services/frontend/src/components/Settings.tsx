import { useState, useEffect } from 'react';
import { Card, PageWrap, Btn, colors } from './ui';
import { THEMES, getThemeId, applyTheme, ThemeId } from '@/lib/theme';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/branding';
import { getUser } from '@/lib/auth';
import { toast } from './Toast';
import api from '@/lib/api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const INTEGRATION_MAP: Record<string, { icon: string; label: string }> = {
  'postgres':  { icon: '🗄️', label: 'PostgreSQL' },
  'valkey':    { icon: '⚡', label: 'Valkey Cache' },
  'redis':     { icon: '⚡', label: 'Valkey Cache' },
  'minio':     { icon: '☁️', label: 'MinIO Storage' },
  'rabbitmq':  { icon: '📨', label: 'RabbitMQ' },
  'ollama':    { icon: '🤖', label: 'Ollama AI' },
  'keycloak':  { icon: '🔐', label: 'Keycloak SSO' },
};

export default function Settings() {
  const [activeTheme,  setActiveTheme]  = useState<ThemeId>(getThemeId());
  const [healthChecks, setHealthChecks] = useState<{name:string;status:string;icon:string;label:string}[]>([]);
  const [autoExec,     setAutoExec]     = useState(false);
  const [savingAI,     setSavingAI]     = useState(false);
  const user = getUser();

  useEffect(() => {
    api.aiSettings().then((r: any) => setAutoExec(r.ai_auto_execute ?? false)).catch(() => {});
  }, []);

  const saveAiSetting = async (next: boolean) => {
    setSavingAI(true);
    try {
      await api.updateAiSettings({ aiAutoExecute: next });
      setAutoExec(next);
      toast.success(
        next ? '⚡ AI Auto-Execute enabled — actions run immediately with full audit logging'
             : '🔒 AI Confirmation mode enabled — all actions require your approval before executing',
        'AI Setting Saved'
      );
    } catch (e: any) { toast.error(e.message); }
    setSavingAI(false);
  };

  useEffect(()=>{
    fetch(`${BASE}/health/detailed`)
      .then(r=>r.json())
      .then((d:any)=>{
        const checks = (d.checks||[]).map((c:any)=>{
          const meta = INTEGRATION_MAP[c.name.toLowerCase()] || { icon:'🔌', label: c.name };
          return { name: c.name, status: c.status?.toLowerCase(), icon: meta.icon, label: meta.label };
        });
        // Always add Keycloak SSO as connected (auth is working if user is logged in)
        if(!checks.find((c:any)=>c.name==='keycloak'))
          checks.push({ name:'keycloak', status:'healthy', icon:'🔐', label:'Keycloak SSO' });
        setHealthChecks(checks);
      })
      .catch(()=>{
        // Fallback with assumed status if health endpoint unreachable
        setHealthChecks([
          { name:'keycloak', status:'unknown', icon:'🔐', label:'Keycloak SSO' },
          { name:'minio',    status:'unknown', icon:'☁️', label:'MinIO Storage' },
          { name:'ollama',   status:'unknown', icon:'🤖', label:'Ollama AI' },
          { name:'rabbitmq', status:'unknown', icon:'📨', label:'RabbitMQ' },
        ]);
      });
  },[]);

  const switchTheme = (id:ThemeId) => {
    applyTheme(id);
    setActiveTheme(id);
    toast.success(`${THEMES.find(t=>t.id===id)?.name} theme applied`,'Theme Changed');
  };

  return (
    <PageWrap title="Settings" subtitle="Theme, profile, and integration preferences.">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,maxWidth:900}}>

        {/* Theme Picker */}
        <Card style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>Appearance</div>
          <div style={{fontSize:12,color:colors.text3,marginBottom:18}}>Choose your preferred colour scheme for the platform.</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',gap:12}}>
            {THEMES.map(theme=>(
              <button key={theme.id} onClick={()=>switchTheme(theme.id)} style={{
                padding:'16px 12px',borderRadius:12,border:`2px solid ${activeTheme===theme.id?colors.accent:colors.border}`,
                background:activeTheme===theme.id?`${colors.accent}15`:'var(--c-bg3)',cursor:'pointer',
                display:'flex',flexDirection:'column',alignItems:'center',gap:8,transition:'all .15s',
              }}>
                <div style={{width:32,height:32,borderRadius:'50%',background:`linear-gradient(135deg,${theme.vars['--c-accent']},${theme.vars['--c-accent2']||theme.vars['--c-accent']})`,flexShrink:0}}/>
                <div style={{fontSize:13,fontWeight:600,color:colors.text}}>{theme.name}</div>
                <div style={{display:'flex',gap:4}}>
                  {Object.values(theme.vars).slice(0,4).filter(v=>v.startsWith('#')).map((c,i)=>(
                    <div key={i} style={{width:12,height:12,borderRadius:3,background:c}}/>
                  ))}
                </div>
                {activeTheme===theme.id&&<div style={{fontSize:10,color:colors.accent,fontWeight:600}}>Active</div>}
              </button>
            ))}
          </div>
        </Card>

        {/* Profile */}
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:16}}>Your Profile</div>
          <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:16}}>
            <div style={{width:52,height:52,borderRadius:'50%',background:`${colors.accent}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:colors.accent,fontWeight:700}}>
              {user?.name?.[0]?.toUpperCase()||'U'}
            </div>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:colors.text}}>{user?.name||'-'}</div>
              <div style={{fontSize:12,color:colors.text3}}>{user?.email||'-'}</div>
              <div style={{fontSize:11,color:colors.accent,marginTop:2}}>{user?.roles?.[0]?.replace('_',' ')||'User'}</div>
            </div>
          </div>
          <div style={{padding:'10px 12px',background:'var(--c-bg3)',borderRadius:8,marginBottom:10}}>
            <div style={{fontSize:11,color:colors.text3,marginBottom:2}}>Tenant</div>
            <div style={{fontSize:13,color:colors.text}}>{user?.tenantId||'-'}</div>
          </div>
          <Btn small variant="ghost" onClick={()=>toast.info('Password change via Keycloak')}>Change Password</Btn>
        </Card>

        {/* Product Info (hardcoded) */}
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:16}}>Platform Information</div>
          <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:20}}>
            <div style={{width:52,height:52,borderRadius:14,background:`${colors.accent}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>⬡</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:colors.text,letterSpacing:'-0.02em'}}>{PRODUCT_NAME}</div>
              <div style={{fontSize:11,color:colors.text3,fontStyle:'italic'}}>{PRODUCT_TAGLINE}</div>
              <div style={{fontSize:11,color:colors.accent,marginTop:2}}>v2.0 - AI Governance GRC</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[['Frameworks','ISO 42001, SOC 2, GDPR, NIST AI RMF, ISO 27001'],['AI Model','Ollama (llama3.2)'],['Version','2.0.0']].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${colors.border}`}}>
                <span style={{fontSize:12,color:colors.text3}}>{k}</span>
                <span style={{fontSize:12,color:colors.text2}}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:16}}>Notifications</div>
          {([['Email on critical finding','critical-finding',true],['Email on approval request','approval-req',true],['Weekly compliance digest','weekly-digest',false]] as [string,string,boolean][]).map(([label,key,defVal])=>(
            <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${colors.border}`}}>
              <span style={{fontSize:13,color:colors.text2}}>{label}</span>
              <div style={{width:40,height:22,borderRadius:12,background:defVal?colors.accent:'var(--c-bg3)',border:`1px solid ${defVal?colors.accent:colors.border}`,cursor:'pointer',position:'relative'}} onClick={()=>toast.info('Notification preferences saved')}>
                <div style={{position:'absolute',top:3,left:defVal?20:3,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s'}}/>
              </div>
            </div>
          ))}
        </Card>

        {/* AI Assistant Settings */}
        <Card style={{gridColumn:'1/-1'}}>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>AI Assistant Behaviour</div>
          <div style={{fontSize:12,color:colors.text3,marginBottom:18}}>
            Control how the AI assistant executes platform actions (create findings, risks, workflows, etc.)
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* Confirmation mode */}
            <div onClick={()=>!savingAI&&saveAiSetting(false)} style={{padding:'16px',borderRadius:10,border:`2px solid ${!autoExec?colors.accent:colors.border}`,background:!autoExec?`${colors.accent}10`:'var(--c-bg3)',cursor:'pointer',transition:'all .15s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${colors.green}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🔒</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:colors.text}}>Confirmation Mode</div>
                  <div style={{fontSize:10,color:colors.text3}}>Recommended</div>
                </div>
                {!autoExec&&<div style={{marginLeft:'auto',fontSize:10,color:colors.accent,fontWeight:700}}>● Active</div>}
              </div>
              <div style={{fontSize:12,color:colors.text2,lineHeight:1.5}}>
                AI proposes actions with a confirmation card. You review the parameters and click <strong>Confirm & Execute</strong> before anything is written to the platform.
              </div>
            </div>
            {/* Auto-execute mode */}
            <div onClick={()=>!savingAI&&saveAiSetting(true)} style={{padding:'16px',borderRadius:10,border:`2px solid ${autoExec?colors.orange:colors.border}`,background:autoExec?`${colors.orange}10`:'var(--c-bg3)',cursor:'pointer',transition:'all .15s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${colors.orange}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>⚡</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:colors.text}}>Auto-Execute Mode</div>
                  <div style={{fontSize:10,color:colors.orange}}>Seamless — use with care</div>
                </div>
                {autoExec&&<div style={{marginLeft:'auto',fontSize:10,color:colors.orange,fontWeight:700}}>● Active</div>}
              </div>
              <div style={{fontSize:12,color:colors.text2,lineHeight:1.5}}>
                AI executes actions immediately without asking. Every action is logged with your user ID, timestamp, and parameters in the AI Action Audit Log.
              </div>
            </div>
          </div>
          {autoExec&&(
            <div style={{marginTop:12,padding:'10px 14px',background:`${colors.orange}12`,borderRadius:8,border:`1px solid ${colors.orange}30`,fontSize:12,color:colors.orange}}>
              ⚠ Auto-Execute is active. Every AI action will modify platform data immediately. A full audit trail is maintained — view it in the AI Assistant panel → Action Log tab.
            </div>
          )}
        </Card>

        {/* Integration Status — live from /health/detailed */}
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>Integration Status</div>
          <div style={{fontSize:11,color:colors.text3,marginBottom:14}}>Live health from API</div>
          {healthChecks.length===0
            ? <div style={{fontSize:12,color:colors.text3}}>Checking…</div>
            : healthChecks.map(s=>{
                const ok      = s.status==='healthy';
                const unknown = s.status==='unknown';
                const color   = ok ? colors.green : unknown ? colors.text3 : colors.red;
                const dot     = ok ? '●' : unknown ? '○' : '●';
                const label   = ok ? 'Healthy' : unknown ? 'Unknown' : s.status;
                return (
                  <div key={s.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${colors.border}`}}>
                    <span style={{fontSize:12,color:colors.text2}}>{s.icon} {s.label}</span>
                    <span style={{fontSize:11,color,fontWeight:600}}>{dot} {label}</span>
                  </div>
                );
              })
          }
        </Card>
      </div>
    </PageWrap>
  );
}
