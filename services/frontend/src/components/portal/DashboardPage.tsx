import { useEffect, useState } from 'react';
import { Card, StatCard, Grid, PageWrap, LoadingSpinner, Badge, Bar, ScoreRing, ErrorBanner, colors, Btn } from '../ui';
import { complianceAdminApi, DashboardMetrics } from '@/lib/mock/complianceAdminApi';
import { IconFindings, IconRisk, IconAudit, IconTracking, IconEvidence, IconReports, IconDashboard, IconSettings, IconUsers, IconFrameworks } from '../Icons';
import api from '@/lib/api';
import { toast } from '../Toast';

function timeAgo(ts: string | null) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

const SEV_COLORS: Record<string,string> = { critical: colors.red, high: colors.orange, medium: colors.yellow, low: colors.green };
const STATUS_COLORS: Record<string,string> = { pending: colors.yellow, running: colors.blue, completed: colors.green, archived: colors.text3, cancelled: colors.red };

function navigateTo(page: string, setPage?: (p: string) => void) {
  if (setPage) setPage(page);
  else window.dispatchEvent(new CustomEvent('clovrix:navigate', { detail: page }));
}

function makeInteractiveCardProps(page: string, label: string, setPage?: (p: string) => void) {
  const go = () => navigateTo(page, setPage);
  return {
    onClick: go,
    style: { cursor: 'pointer' as const, transition: 'all .18s ease', outline: 'none' as const },
    tabIndex: 0, role: 'link' as const, ariaLabel: `Navigate to ${label}`,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } },
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,.18)'; e.currentTarget.style.borderColor='var(--c-accent)'; },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--c-border)'; },
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(0px) scale(0.985)'; },
    onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(-2px)'; },
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow='0 0 0 2px var(--c-accent)'; e.currentTarget.style.borderColor='var(--c-accent)'; },
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='var(--c-border)'; },
  };
}

function TrendGraph({ color, data }: { color: string, data: number[] }) {
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min;
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 300},${80 - ((d - min) / range) * 80}`).join(' ');
  return (
    <div style={{ width: '100%', height: 100, position: 'relative' }}>
      <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,80 ${points} 300,80`} fill={`url(#grad-${color})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={(i / (data.length - 1)) * 300} cy={80 - ((d - min) / range) * 80} r="4" fill={colors.bg2} stroke={color} strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}

function RiskHeatmap() {
  const cells = [
    { x: 0, y: 0, v: 4, c: colors.green }, { x: 1, y: 0, v: 8, c: colors.green }, { x: 2, y: 0, v: 12, c: colors.yellow },
    { x: 0, y: 1, v: 2, c: colors.green }, { x: 1, y: 1, v: 15, c: colors.yellow }, { x: 2, y: 1, v: 8, c: colors.orange },
    { x: 0, y: 2, v: 1, c: colors.yellow }, { x: 1, y: 2, v: 5, c: colors.orange }, { x: 2, y: 2, v: 3, c: colors.red },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, width: '100%', height: 140 }}>
      {cells.map((cell, i) => (
        <div key={i} style={{ background: cell.c, borderRadius: 6, opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
          {cell.v}
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage({ activeRole, setPage }: { activeRole: string; setPage?: (p: string) => void }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [realData, setRealData] = useState<any>(null);
  const [auditM, setAuditM] = useState<any>(null);   // live audit-cycle metrics (DB)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedScope, setSelectedScope] = useState(activeRole === 'Risk Owner' ? 'assigned' : 'all');
  const [selectedFramework, setSelectedFramework] = useState('all');

  const fetchMetrics = () => {
    setLoading(true);
    Promise.allSettled([
      complianceAdminApi.getDashboardMetrics(selectedScope, selectedFramework),
      api.dashboard(),
      api.auditMetrics()
    ])
      .then(([mRes, dRes, aRes]) => {
        if (mRes.status === 'fulfilled') {
          setMetrics(mRes.value);
        } else {
          setError('Failed to load dashboard metrics');
          toast.error(mRes.reason?.message || 'Error', 'Dashboard');
        }

        if (dRes.status === 'fulfilled') {
          setRealData(dRes.value);
        } else {
          console.warn("Backend API not reachable, falling back to local data");
        }

        // Live audit-cycle metrics — the single DB source for the audit KPIs.
        setAuditM(aRes.status === 'fulfilled' ? aRes.value : null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMetrics();
  }, [selectedScope, selectedFramework, activeRole]);

  if (loading) return <LoadingSpinner />;
  if (!metrics) return <PageWrap title="Dashboard"><ErrorBanner msg={error || 'No data available'} /></PageWrap>;

  const nav = (page: string) => navigateTo(page, setPage);

  // Real data variables. Audit-cycle KPIs prefer the live metrics endpoint
  // (auditM) so every role's dashboard reflects the same DB numbers; they fall
  // back to the legacy dashboard/mock only when the endpoint is unreachable.
  const score = realData?.score ?? metrics.complianceScore;
  const openFindings = auditM?.openFindings ?? realData?.open_findings ?? metrics.openFindings;
  const pendingAuds = auditM?.activeAudits ?? realData?.pending_audits ?? metrics.activeAudits;
  const completedAds = auditM?.closedAudits ?? realData?.completed_audits ?? 0;
  const policies = realData?.active_policies ?? 0;
  const maturity = realData?.ai_maturity_index ?? 0;
  const matBreak = realData?.maturity_breakdown ?? {};
  const activity = realData?.recent_activity ?? [];
  const wfStats = realData?.workflow_stats ?? [];
  const totalWf = wfStats.reduce((s:number,w:any)=>s+(w.count||0),0);

  return (
    <PageWrap
      title="Dashboard"
      subtitle={`Enterprise Compliance Posture — Role: ${activeRole}`}
      action={
        <div style={{ display: 'flex', gap: 12 }}>
          <Btn variant="ghost" small onClick={fetchMetrics}>Refresh Data</Btn>
          <Btn small onClick={() => nav('admin-reports')}>Generate Report</Btn>
        </div>
      }
    >
      <ErrorBanner msg={error} />

      {/* Filter Bar */}
      <Card style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--c-bg2)', border: '1px solid var(--c-border2)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Scope</label>
              <select 
                value={selectedScope} 
                onChange={e => setSelectedScope(e.target.value)}
                disabled={activeRole === 'Risk Owner'}
                style={{
                  background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                  borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 500,
                  color: 'var(--c-text)', cursor: 'pointer', outline: 'none',
                  opacity: activeRole === 'Risk Owner' ? 0.5 : 1
                }}
              >
                <option value="all">All Scopes (Global)</option>
                <option value="compliance">Compliance & Governance</option>
                <option value="engineering">Engineering & Security Controls</option>
                <option value="risk">Risk Management</option>
                <option value="assigned">My Assigned Controls</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text3)', textTransform: 'uppercase' }}>Framework</label>
              <select 
                value={selectedFramework} 
                onChange={e => setSelectedFramework(e.target.value)}
                style={{
                  background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                  borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 500,
                  color: 'var(--c-text)', cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="all">All Frameworks</option>
                <option value="iso-42001">ISO 42001 (Artificial Intelligence)</option>
                <option value="iso-27001">ISO 27001 (Information Security)</option>
                <option value="nist-ai-rmf">NIST AI Risk Management Framework</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns: activeRole === 'Risk Owner' || activeRole === 'Lead Auditor' ? 'repeat(4,1fr)' : activeRole === 'Control Lead' ? 'repeat(5,1fr)' : 'repeat(6,1fr)',gap:12,marginBottom:20}}>
        {activeRole === 'Control Lead' ? [
          {label:'Assigned Controls', value:42,    icon:'◎', color:colors.green,  trend:'32 active',     sub:'10 pending review', route: 'admin-control-library'},
          {label:'Open Compliance Gaps', value:6,    icon:'⚠', color:colors.orange, trend:'Needs attention', sub:'', route: 'admin-remediations'},
          {label:'Pending Evidence',  value:14,    icon:'⊡', color:colors.yellow, trend:'Awaiting upload', sub:'submissions', route: 'admin-evidence-manager'},
          {label:'Remediation Progress', value:'78%', icon:'✓', color:colors.green, trend:'On track', sub:'completed', route: 'admin-remediations'},
          {label:'Upcoming Reviews',  value:9,     icon:'☰', color:colors.blue,   trend:'Next 30 days', sub:'scheduled', route: 'admin-control-library'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}} {...(k.route ? makeInteractiveCardProps(k.route, k.label, setPage) : {})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        )) : activeRole === 'Risk Owner' ? [
          {label:'Total Assigned Risks', value:42,    icon:'⚠', color:colors.orange,  trend:'8 new this month',     sub:'', route: 'admin-risk-register'},
          {label:'Open Risks',           value:15,    icon:'◎', color:colors.yellow,  trend:'5 pending review',     sub:'', route: 'admin-risk-register'},
          {label:'High Priority Risks',  value:3,     icon:'⨯', color:colors.red,     trend:'Immediate action',     sub:'required', route: 'admin-risk-register'},
          {label:'Vendor Risks',         value:12,    icon:'🏢', color:colors.blue,   trend:'2 pending reassessment', sub:'', route: 'admin-vendor-risk'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}} {...(k.route ? makeInteractiveCardProps(k.route, k.label, setPage) : {})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        )) : activeRole === 'Lead Auditor' ? [
          {label:'Compliance Score', value:`${score}%`,     icon:'◎', color:colors.green,  trend:score>=90?'On target':'Below target', sub:'target 90%', route: 'admin-dashboard'},
          {label:'Audit Readiness',  value:'85%',           icon:'⊡', color:colors.blue,   trend:'15% outstanding tasks', sub:'', route: 'admin-audit-workflows'},
          {label:'Open Findings',    value:openFindings,    icon:'⚠', color:colors.orange, trend:openFindings>0?`${openFindings} need attention`:'All clear', sub:'unresolved', route: 'admin-findings'},
          {label:'Evidence Coverage',value:`${Math.round((metrics.activeControls - metrics.missingEvidence) / metrics.activeControls * 100)}%`, icon:'✓', color:colors.accent, trend:`${metrics.missingEvidence} missing`, sub:'controls', route: 'admin-evidence-manager'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}} {...(k.route ? makeInteractiveCardProps(k.route, k.label, setPage) : {})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        )) : activeRole === 'Assessor' ? [
          {label:'Assigned Assessments',    value:42,             icon:'⊡', color:colors.blue,   trend:'12 pending', sub:'', route: 'admin-audit-workflows'},
          {label:'Pending Reviews',         value:15,             icon:'☰', color:colors.yellow, trend:'5 overdue', sub:'', route: 'admin-audit-workflows'},
          {label:'Open Findings',           value:openFindings,   icon:'⚠', color:colors.orange, trend:openFindings>0?`${openFindings} need attention`:'All clear', sub:'unresolved', route: 'admin-findings'},
          {label:'Assessment Completion Rate', value:'78%',       icon:'✓', color:colors.green,  trend:'On track', sub:'', route: 'admin-audit-workflows'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}} {...(k.route ? makeInteractiveCardProps(k.route, k.label, setPage) : {})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        )) : [
          {label:'Compliance Score', value:`${score}%`,    icon:'◎', color:colors.green,  trend:score>=90?'On target':'Below target',               sub:'target 90%', route: 'admin-dashboard'},
          {label:'Open Findings',    value:openFindings,   icon:'⚠', color:colors.orange, trend:openFindings>0?`${openFindings} need attention`:'All clear', sub:'unresolved', route: 'admin-findings'},
          {label:'Pending Audits',   value:pendingAuds,    icon:'⊡', color:colors.yellow, trend:pendingAuds>0?`${pendingAuds} active`:'None active', sub:'workflows', route: 'admin-audit-workflows'},
          {label:'Completed Audits', value:completedAds,   icon:'✓', color:colors.green,  trend:completedAds>0?`${completedAds} done`:'–',            sub:'workflows', route: 'admin-audit-workflows'},
          {label:'Active Policies',  value:policies,       icon:'☰', color:colors.blue,   trend:policies>0?`${policies} published`:'–',               sub:'published', route: 'admin-policy-management'},
          {label:'Maturity Index',   value:maturity,       icon:'◈', color:colors.accent, trend:maturity>=80?'Level 4 – Managed':maturity>=60?'Level 3 – Defined':maturity>=40?'Level 2 – Developing':'Level 1 – Initial', sub:'AI governance'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}} {...(k.route ? makeInteractiveCardProps(k.route, k.label, setPage) : {})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        ))}
      </div>
      


      {activeRole !== 'Assessor' && (
      <Grid cols={3} gap={24}>
        {/* Main Charts Column */}
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeRole === 'Control Lead' ? (
            <>
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-reports', 'Compliance Trend', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Compliance Score Trend</div>
                  <TrendGraph color={colors.accent} data={[72, 75, 78, 82, 86, 91]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>
                <Card {...makeInteractiveCardProps('admin-history', 'Framework Coverage', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Framework Coverage</div>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[{name:"ISO/IEC 42001", score:92}, {name:"NIST AI RMF", score:87}, {name:"ISO/IEC 27001", score:95}].map(f => (
                        <div key={f.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{color: 'var(--c-text2)'}}>{f.name}</span><span style={{fontWeight:600}}>{f.score}%</span>
                          </div>
                          <Bar pct={f.score} color={f.score>=90?colors.green:f.score>=75?colors.yellow:colors.red} h={6} />
                        </div>
                      ))}
                   </div>
                </Card>
              </Grid>
              <Card {...makeInteractiveCardProps('admin-findings', 'Findings by Severity', setPage)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Open Findings by Severity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>Critical Findings (Open)</span><span style={{fontWeight:600}}>1</span>
                    </div>
                    <Bar pct={10} color={colors.red} h={6} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>High Findings (Open)</span><span style={{fontWeight:600}}>4</span>
                    </div>
                    <Bar pct={40} color={colors.orange} h={6} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>Medium Findings (Open)</span><span style={{fontWeight:600}}>5</span>
                    </div>
                    <Bar pct={50} color={colors.yellow} h={6} />
                  </div>
                </div>
              </Card>
            </>
          ) : activeRole === 'Risk Owner' ? (
            <>
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-risk-register', 'Risk Status Trends', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Risk Status Trends</div>
                  <TrendGraph color={colors.orange} data={[12, 14, 18, 15, 12, 10]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>
                <Card {...makeInteractiveCardProps('admin-risk-register', 'Monthly Risk Progress', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Monthly Risk Progress</div>
                  <TrendGraph color={colors.green} data={[5, 8, 12, 18, 22, 25]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>
              </Grid>
              
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-risk-register', 'Risk Heatmap', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Risk Severity Distribution</div>
                   <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                     <div style={{ flex: 1 }}><RiskHeatmap /></div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: 'var(--c-text2)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.red, borderRadius: 2 }}/> Critical (4)</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.orange, borderRadius: 2 }}/> High (8)</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.yellow, borderRadius: 2 }}/> Medium (15)</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.green, borderRadius: 2 }}/> Low (15)</div>
                     </div>
                   </div>
                </Card>

                <Card {...makeInteractiveCardProps('admin-vendor-risk', 'Vendor Risk Status', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Vendor Risk Rating Summary</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{color: 'var(--c-text2)'}}>High Risk Vendors</span><span style={{fontWeight:600}}>3</span>
                      </div>
                      <Bar pct={25} color={colors.red} h={6} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{color: 'var(--c-text2)'}}>Medium Risk Vendors</span><span style={{fontWeight:600}}>5</span>
                      </div>
                      <Bar pct={40} color={colors.orange} h={6} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{color: 'var(--c-text2)'}}>Low Risk Vendors</span><span style={{fontWeight:600}}>4</span>
                      </div>
                      <Bar pct={35} color={colors.green} h={6} />
                    </div>
                  </div>
                </Card>
              </Grid>
            </>
          ) : activeRole === 'Lead Auditor' ? (
            <>
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-reports', 'Monthly Findings Trend', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Monthly Findings Trend</div>
                  <TrendGraph color={colors.red} data={[3, 5, 4, 8, 5, openFindings]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>

                <Card {...makeInteractiveCardProps('admin-reports', 'Open vs Closed Findings', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Open vs Closed Findings</div>
                  <TrendGraph color={colors.blue} data={[2, 6, 9, 12, 14, 15]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>
              </Grid>

              <Card {...makeInteractiveCardProps('admin-findings', 'Findings by Severity & Status', setPage)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Findings by Severity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>Critical Findings (Open)</span><span style={{fontWeight:600}}>2</span>
                    </div>
                    <Bar pct={20} color={colors.red} h={6} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>High Findings (Open)</span><span style={{fontWeight:600}}>5</span>
                    </div>
                    <Bar pct={50} color={colors.orange} h={6} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{color: 'var(--c-text2)'}}>Medium Findings (Open)</span><span style={{fontWeight:600}}>3</span>
                    </div>
                    <Bar pct={30} color={colors.yellow} h={6} />
                  </div>
                </div>
              </Card>
              
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-evidence-manager', 'Evidence Coverage', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Evidence Coverage</div>
                   <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                     <ScoreRing score={Math.round(((metrics.activeControls - metrics.missingEvidence) / metrics.activeControls) * 100)} size={110} />
                     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Total Evidence Collected</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.blue }}>{metrics.activeControls - metrics.missingEvidence} / {metrics.activeControls}</div>
                       </div>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Missing Evidence</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.red }}>{metrics.missingEvidence}</div>
                       </div>
                     </div>
                   </div>
                </Card>

                <Card {...makeInteractiveCardProps('admin-audit-workflows', 'Audit Preparation Status', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Control Compliance</div>
                   <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                     <ScoreRing score={Math.round((metrics.compliantControls / Math.max(1, metrics.activeControls)) * 100)} size={110} />
                     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Compliant Controls</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.green }}>{metrics.compliantControls}</div>
                       </div>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Non-Compliant Controls</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.red }}>{metrics.nonCompliantControls}</div>
                       </div>
                     </div>
                   </div>
                </Card>
              </Grid>
            </>
          ) : (
            <>
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-reports', 'Compliance Trend', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Compliance Trend</div>
                  <TrendGraph color={colors.green} data={[72, 75, 78, 81, 84, Math.max(84, score)]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>

                <Card {...makeInteractiveCardProps('admin-reports', 'Risk Trend', setPage)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Open Risks Trend</div>
                  <TrendGraph color={colors.orange} data={[42, 38, 35, 30, 25, metrics.openRisks]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--c-text3)' }}>
                    <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                  </div>
                </Card>
              </Grid>

              <Card {...makeInteractiveCardProps('admin-history', 'Framework Compliance', setPage)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Framework Compliance Status</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {metrics.frameworkCompliance.map(fw => (
                    <div key={fw.name} style={{ background: 'var(--c-bg3)', padding: 16, borderRadius: 10, border: '1px solid var(--c-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{fw.name}</div>
                        <Badge label={fw.status} status={fw.status} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <Bar pct={fw.score} color={fw.score > 90 ? colors.green : fw.score > 75 ? colors.yellow : colors.red} h={8} />
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text2)' }}>{fw.score}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              
              <Grid cols={2} gap={24}>
                <Card {...makeInteractiveCardProps('admin-reports', 'Risk Heatmap', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Inherent Risk Heatmap</div>
                   <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                     <div style={{ flex: 1 }}><RiskHeatmap /></div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: 'var(--c-text2)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.red, borderRadius: 2 }}/> Critical ({metrics.riskSummary.critical})</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.orange, borderRadius: 2 }}/> High ({metrics.riskSummary.high})</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.yellow, borderRadius: 2 }}/> Medium ({metrics.riskSummary.medium})</div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: colors.green, borderRadius: 2 }}/> Low ({metrics.riskSummary.low})</div>
                     </div>
                   </div>
                </Card>

                <Card {...makeInteractiveCardProps('admin-workflows', 'Control Effectiveness', setPage)}>
                   <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Control Effectiveness</div>
                   <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                     <ScoreRing score={Math.round((metrics.compliantControls / Math.max(1, metrics.activeControls)) * 100)} size={110} />
                     <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Operating Effectively</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.green }}>{metrics.compliantControls}</div>
                       </div>
                       <div>
                         <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 4 }}>Needs Remediation</div>
                         <div style={{ fontSize: 16, fontWeight: 700, color: colors.red }}>{metrics.nonCompliantControls}</div>
                       </div>
                     </div>
                   </div>
                </Card>
              </Grid>
            </>
          )}
        </div>

        {/* Right Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {activeRole === 'Control Lead' ? (
             <Card style={{ background: `linear-gradient(135deg, var(--c-bg2) 0%, var(--c-bg3) 100%)`, border: `1px solid var(--c-border)`, borderColor: colors.yellow }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                   <IconTracking size={18} color={colors.yellow} />
                   Control Coverage
                 </div>
                 <Badge label="Strong" status="compliant" />
               </div>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                 <div style={{ fontSize: 42, fontWeight: 800, color: colors.yellow, letterSpacing: '-0.04em' }}>91%</div>
               </div>
               <Bar pct={91} color={colors.yellow} h={6} />
               <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12, lineHeight: 1.5 }}>
                 Your mapped controls cover 91% of active compliance requirements. 9 reviews pending.
               </div>
               <Btn style={{ marginTop: 16, width: '100%' }} onClick={() => setPage('admin-control-library')}>Review Controls</Btn>
             </Card>
          ) : activeRole === 'Risk Owner' ? (
             <Card style={{ background: `linear-gradient(135deg, var(--c-bg2) 0%, var(--c-bg3) 100%)`, border: `1px solid var(--c-border)`, borderColor: colors.orange }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                   <IconRisk size={18} color={colors.orange} />
                   Vendor Reassessments
                 </div>
                 <Badge label="2 Pending" status="partial" />
               </div>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                 <div style={{ fontSize: 42, fontWeight: 800, color: colors.orange, letterSpacing: '-0.04em' }}>2</div>
               </div>
               <Bar pct={60} color={colors.orange} h={6} />
               <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12, lineHeight: 1.5 }}>
                 You have 2 vendor risk reassessments pending review. Ensure these are completed this month.
               </div>
               <Btn style={{ marginTop: 16, width: '100%' }} onClick={() => nav('admin-vendor-risk')}>Review Vendors</Btn>
             </Card>
          ) : activeRole === 'Lead Auditor' ? (
             <Card style={{ background: `linear-gradient(135deg, var(--c-bg2) 0%, var(--c-bg3) 100%)`, border: `1px solid var(--c-border)`, borderColor: colors.blue }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                   <IconAudit size={18} color={colors.blue} />
                   Audit Readiness
                 </div>
                 <Badge label="85%" status="compliant" />
               </div>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                 <div style={{ fontSize: 42, fontWeight: 800, color: colors.blue, letterSpacing: '-0.04em' }}>85%</div>
               </div>
               <Bar pct={85} color={colors.blue} h={6} />
               <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12, lineHeight: 1.5 }}>
                 15% of mapped controls require evidence upload or review before formal audit commencement.
               </div>
               <Btn style={{ marginTop: 16, width: '100%' }} onClick={() => nav('admin-audit-workflows')}>Manage Audit Preparation</Btn>
             </Card>
          ) : (
            <Card style={{ background: `linear-gradient(135deg, var(--c-bg2) 0%, var(--c-bg3) 100%)`, border: `1px solid var(--c-border)`, borderColor: colors.accent }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconFrameworks size={18} color={colors.accent} />
                  AI Compliance Health
                </div>
                <Badge label={metrics.aiComplianceHealth > 90 ? 'Healthy' : 'Warning'} status={metrics.aiComplianceHealth > 90 ? 'compliant' : 'partial'} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 42, fontWeight: 800, color: colors.accent, letterSpacing: '-0.04em' }}>{metrics.aiComplianceHealth}%</div>
              </div>
              <Bar pct={metrics.aiComplianceHealth} color={colors.accent} h={6} />
              <div style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12, lineHeight: 1.5 }}>
                ISO 42001 and NIST AI RMF readiness indicates a strong posture, but {metrics.missingEvidence} controls are lacking evidence.
              </div>
              <Btn style={{ marginTop: 16, width: '100%' }} onClick={() => nav('admin-history')}>Review AI Frameworks</Btn>
            </Card>
          )}

          <Card>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:colors.text}}>Recent Activity</div>
                <div style={{fontSize:10,color:colors.text3}}>Across compliance, audit, and governance</div>
              </div>
            </div>
            {activity.length > 0 ? activity.slice(0,8).map((a:any,i:number)=>{
              const initials = (a.actor||a.user_email||'S').replace(/[@.].*$/,'').slice(0,2).toUpperCase();
              const action   = (a.action||'').replace(/\./g,' ');
              const item     = a.entity_id || a.resource_id || a.entity_type || '';
              return (
                <div key={i} style={{display:'flex',gap:12,alignItems:'center',padding:'9px 0',borderBottom:`1px solid ${colors.border}`}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:`${colors.accent}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:colors.accent,flexShrink:0}}>{initials}</div>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,color:colors.text2}}>
                      <span style={{fontWeight:600}}>{a.actor||a.user_email||'System'}</span>
                      {' '}{action}{' '}
                      <span style={{color:colors.accent}}>{item}</span>
                    </span>
                  </div>
                  <span style={{fontSize:10,color:colors.text3,flexShrink:0}}>{timeAgo(a.created_at)}</span>
                </div>
              );
            }) : (
              <div style={{color:colors.text3,fontSize:12,textAlign:'center',padding:'20px 0'}}>No recent activity</div>
            )}
          </Card>

        </div>

      </Grid>
      )}

      {activeRole === 'Assessor' && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Assigned Controls Dashboard</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-text3)', textAlign: 'left' }}>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Control Ref</th>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Description & Guidance</th>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Assigned By</th>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Due Date</th>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 0', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                { ref: 'A.1.1', desc: 'AI Governance Policy', guide: 'Ensure the AI policy is approved and published.', by: 'Control Lead', due: '2026-07-15', status: 'pending' },
                { ref: 'A.2.1', desc: 'Risk Assessment Process', guide: 'Verify the AI risk methodology.', by: 'Control Lead', due: '2026-07-20', status: 'in-progress' },
                { ref: 'A.3.1', desc: 'Data Quality Management', guide: 'Upload the Q2 data quality report.', by: 'Control Lead', due: '2026-07-25', status: 'completed' },
              ].map(c => (
                <tr key={c.ref} style={{ borderBottom: '1px solid var(--c-border2)' }}>
                  <td style={{ padding: '16px 0', fontWeight: 600, color: 'var(--c-text)' }}>{c.ref}</td>
                  <td style={{ padding: '16px 0', maxWidth: 300 }}>
                    <div style={{ fontWeight: 600, color: 'var(--c-text)' }}>{c.desc}</div>
                    <div style={{ color: 'var(--c-text3)', marginTop: 4, fontSize: 12 }}>{c.guide}</div>
                  </td>
                  <td style={{ padding: '16px 0', color: 'var(--c-text2)' }}>{c.by}</td>
                  <td style={{ padding: '16px 0', color: 'var(--c-text2)' }}>{c.due}</td>
                  <td style={{ padding: '16px 0' }}><Badge label={c.status} status={c.status === 'completed' ? 'compliant' : c.status === 'pending' ? 'partial' : 'running'} /></td>
                  <td style={{ padding: '16px 0' }}><Btn small variant="ghost" onClick={() => navigateTo('admin-audit-workflows', setPage)}>Assess</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageWrap>
  );
}
