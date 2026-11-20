import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, Bar, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';

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

const SEV_COLORS: Record<string,string> = {
  critical: colors.red, high: colors.orange, medium: colors.yellow, low: colors.green,
};

const STATUS_COLORS: Record<string,string> = {
  pending: colors.yellow, running: colors.blue, completed: colors.green,
  archived: colors.text3, cancelled: colors.red,
};

export default function Dashboard({ setPage }:{ setPage:(p:string)=>void }) {
  const [data,    setData]    = useState<any>(null);
  const [audit,   setAudit]   = useState<any>(null);   // live audit-cycle metrics (DB)
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    Promise.allSettled([api.dashboard(), api.auditMetrics()])
      .then(([d,a])=>{
        if(d.status==='fulfilled') setData(d.value); else toast.error((d.reason as any)?.message||'Error','Dashboard');
        setAudit(a.status==='fulfilled'?a.value:null);
      })
      .finally(()=>setLoading(false));
  },[]);

  if(loading) return <LoadingSpinner/>;

  const score       = data?.score ?? 0;
  // Audit-cycle KPIs prefer the live metrics endpoint (single DB source).
  const openFindings= audit?.openFindings ?? data?.open_findings ?? 0;
  const pendingAuds = audit?.activeAudits ?? data?.pending_audits ?? 0;
  const completedAds= audit?.closedAudits ?? data?.completed_audits ?? 0;
  const policies    = data?.active_policies ?? 0;
  const activity    = data?.recent_activity ?? [];
  const alerts      = data?.live_alerts ?? [];
  const frameworks  = data?.framework_coverage ?? [];
  const trend       = data?.posture_trend ?? [];
  const maturity    = data?.ai_maturity_index ?? 0;
  const matBreak    = data?.maturity_breakdown ?? {};
  const wfStats     = data?.workflow_stats ?? [];
  const findingsBySev = data?.findings_by_severity ?? [];

  const totalWf = wfStats.reduce((s:number,w:any)=>s+(w.count||0),0);

  return (
    <PageWrap title="AI Governance Command Center"
      subtitle="Real-time posture across controls, audit workflows, findings, and compliance frameworks."
      action={
        <Btn variant="ghost" small onClick={()=>api.dashboard().then(d=>{setData(d);toast.success('Refreshed')}).catch(e=>toast.error(e.message))}>
          ↻ Refresh
        </Btn>
      }>

      {/* ── 6 KPI Cards ────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Compliance Score', value:`${score}%`,    icon:'◎', color:colors.green,  trend:score>=90?'On target':'Below target',               sub:'target 90%'},
          {label:'Open Findings',    value:openFindings,   icon:'⚠', color:colors.orange, trend:openFindings>0?`${openFindings} need attention`:'All clear', sub:'unresolved'},
          {label:'Pending Audits',   value:pendingAuds,    icon:'⊡', color:colors.yellow, trend:pendingAuds>0?`${pendingAuds} active`:'None active', sub:'workflows'},
          {label:'Completed Audits', value:completedAds,   icon:'✓', color:colors.green,  trend:completedAds>0?`${completedAds} done`:'–',            sub:'workflows'},
          {label:'Active Policies',  value:policies,       icon:'☰', color:colors.blue,   trend:policies>0?`${policies} published`:'–',               sub:'published'},
          {label:'Maturity Index',   value:maturity,       icon:'◈', color:colors.accent, trend:maturity>=80?'Level 4 – Managed':maturity>=60?'Level 3 – Defined':maturity>=40?'Level 2 – Developing':'Level 1 – Initial', sub:'AI governance'},
        ].map(k=>(
          <Card key={k.label} style={{padding:'16px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</div>
              <div style={{width:28,height:28,borderRadius:7,background:`${k.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:k.color}}>{k.icon}</div>
            </div>
            <div style={{fontSize:26,fontWeight:700,color:k.color,letterSpacing:'-0.02em'}}>{k.value}</div>
            <div style={{fontSize:11,marginTop:4}}><span style={{color:k.color,fontWeight:600}}>{k.trend}</span><span style={{color:colors.text3}}> {k.sub}</span></div>
          </Card>
        ))}
      </div>

      {/* ── Row 2: Compliance Trend + Framework Coverage ─────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:16,marginBottom:16}}>
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>Compliance Score Trend</div>
          <div style={{fontSize:11,color:colors.text3,marginBottom:16}}>Score vs target over the last 9 months</div>
          {trend.length > 0 ? (
            <>
              <div style={{height:160,display:'flex',alignItems:'flex-end',gap:6,padding:'0 4px'}}>
                {trend.map((m:any,i:number)=>(
                  <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <div style={{width:'100%',position:'relative',height:120,display:'flex',alignItems:'flex-end',gap:2}}>
                      <div style={{flex:1,background:colors.accent,borderRadius:'3px 3px 0 0',height:`${m.score}%`,opacity:0.85,transition:'height .4s'}}/>
                      <div style={{flex:1,background:`${colors.yellow}60`,borderRadius:'3px 3px 0 0',height:`${m.target}%`,transition:'height .4s'}}/>
                    </div>
                    <span style={{fontSize:10,color:colors.text3}}>{m.month}</span>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:16,marginTop:10}}>
                <div style={{display:'flex',gap:5,alignItems:'center'}}><div style={{width:10,height:10,borderRadius:2,background:colors.accent}}/><span style={{fontSize:11,color:colors.text3}}>Score</span></div>
                <div style={{display:'flex',gap:5,alignItems:'center'}}><div style={{width:10,height:10,borderRadius:2,background:`${colors.yellow}60`}}/><span style={{fontSize:11,color:colors.text3}}>Target</span></div>
              </div>
            </>
          ) : (
            <div style={{height:160,display:'flex',alignItems:'center',justifyContent:'center',color:colors.text3,fontSize:12}}>
              Complete audit workflows to see trend data
            </div>
          )}
        </Card>
        <Card>
          <div style={{fontSize:14,fontWeight:600,color:colors.text,marginBottom:4}}>Framework Coverage</div>
          <div style={{fontSize:11,color:colors.text3,marginBottom:16}}>Compliance score per active framework</div>
          {frameworks.length > 0 ? frameworks.map((f:any)=>(
            <div key={f.code||f.name} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontSize:12,color:colors.text2}}>{f.name}</span>
                <span style={{fontSize:12,fontWeight:700,color:(f.score||0)>=90?colors.green:(f.score||0)>=75?colors.yellow:colors.red}}>{f.score||0}%</span>
              </div>
              <Bar pct={f.score||0} color={(f.score||0)>=90?colors.green:(f.score||0)>=75?colors.yellow:colors.red}/>
            </div>
          )) : (
            <div style={{color:colors.text3,fontSize:12,textAlign:'center',paddingTop:20}}>
              No active frameworks — add a framework to see coverage
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: Findings by Severity + Workflow Status + Live Alerts ─ */}
      <div style={{display:'grid',gridTemplateColumns:'200px 1fr 340px',gap:16,marginBottom:16}}>

        {/* Findings by Severity */}
        <Card>
          <div style={{fontSize:13,fontWeight:600,color:colors.text,marginBottom:4}}>Open Findings</div>
          <div style={{fontSize:10,color:colors.text3,marginBottom:12}}>By severity</div>
          {findingsBySev.length > 0 ? (() => {
            const max = Math.max(...findingsBySev.map((f:any)=>f.count||1));
            return findingsBySev.map((f:any)=>{
              const col = SEV_COLORS[f.severity] || colors.text3;
              return (
                <div key={f.severity} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:11,color:colors.text2,textTransform:'capitalize'}}>{f.severity}</span>
                    <span style={{fontSize:11,fontWeight:700,color:col}}>{f.count}</span>
                  </div>
                  <Bar pct={(f.count/max)*100} color={col} h={4}/>
                </div>
              );
            });
          })() : (
            <div style={{color:colors.green,fontSize:12,paddingTop:8}}>✓ No open findings</div>
          )}
        </Card>

        {/* Workflow Status breakdown */}
        <Card>
          <div style={{fontSize:13,fontWeight:600,color:colors.text,marginBottom:4}}>Audit Workflow Status</div>
          <div style={{fontSize:10,color:colors.text3,marginBottom:16}}>Across all audit workflows</div>
          {wfStats.length > 0 ? (
            <>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
                {wfStats.map((w:any)=>{
                  const col = STATUS_COLORS[w.status] || colors.text3;
                  const pct = totalWf > 0 ? Math.round((w.count/totalWf)*100) : 0;
                  return (
                    <div key={w.status} style={{flex:'1 1 120px',padding:'12px 14px',background:`${col}10`,border:`1px solid ${col}30`,borderRadius:10}}>
                      <div style={{fontSize:22,fontWeight:700,color:col}}>{w.count}</div>
                      <div style={{fontSize:11,color:colors.text2,textTransform:'capitalize',marginTop:2}}>{w.status}</div>
                      <div style={{fontSize:10,color:colors.text3,marginTop:4}}>{pct}% of total</div>
                    </div>
                  );
                })}
              </div>
              {/* Mini stacked bar */}
              <div style={{display:'flex',borderRadius:6,overflow:'hidden',height:8}}>
                {wfStats.map((w:any)=>{
                  const col = STATUS_COLORS[w.status] || colors.text3;
                  const pct = totalWf > 0 ? (w.count/totalWf)*100 : 0;
                  return pct > 0 ? <div key={w.status} style={{width:`${pct}%`,background:col,transition:'width .3s'}}/> : null;
                })}
              </div>
            </>
          ) : (
            <div style={{color:colors.text3,fontSize:12,textAlign:'center',paddingTop:20}}>No workflows yet — create an audit workflow to get started</div>
          )}
        </Card>

        {/* Live Alerts */}
        <Card>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:colors.text}}>Critical Findings</div>
            {alerts.length > 0 && <Badge label={`${alerts.length} active`} color={colors.red}/>}
          </div>
          <div style={{fontSize:10,color:colors.text3,marginBottom:12}}>Open critical & high severity findings</div>
          {alerts.length > 0 ? alerts.map((a:any,i:number)=>(
            <div key={i} style={{padding:'10px 0',borderBottom:`1px solid ${colors.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,gap:8}}>
                <span style={{fontSize:12,color:colors.text,fontWeight:500,flex:1}}>{a.title}</span>
                <Badge label={a.severity} color={a.severity==='critical'?colors.red:a.severity==='high'?colors.orange:colors.yellow}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:11,color:colors.text3}}>{a.system_name||a.category}</span>
                <span style={{fontSize:10,color:colors.text3}}>{timeAgo(a.time)}</span>
              </div>
            </div>
          )) : (
            <div style={{color:colors.green,fontSize:12,paddingTop:8}}>✓ No critical or high findings</div>
          )}
          {alerts.length > 0 && (
            <Btn small variant="ghost" style={{marginTop:12,width:'100%'}} onClick={()=>setPage('findings')}>
              View all findings →
            </Btn>
          )}
        </Card>
      </div>

      {/* ── Row 4: Recent Activity + AI Maturity Index ────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:16}}>
        <Card>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:colors.text}}>Recent Activity</div>
              <div style={{fontSize:10,color:colors.text3}}>Across compliance, audit, and governance</div>
            </div>
            <Btn small variant="ghost" onClick={()=>setPage('workflows')}>View workflows</Btn>
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

        {/* AI Maturity Index */}
        <Card>
          <div style={{fontSize:13,fontWeight:600,color:colors.text,marginBottom:4}}>AI Maturity Index</div>
          <div style={{fontSize:10,color:colors.text3,marginBottom:20}}>Governance maturity across key domains</div>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:56,fontWeight:800,color:colors.accent,lineHeight:1}}>{maturity}</div>
            <div style={{fontSize:12,color:colors.text2,marginTop:6}}>
              {maturity>=80?'Level 4 — Managed':maturity>=60?'Level 3 — Defined':maturity>=40?'Level 2 — Developing':'Level 1 — Initial'}
            </div>
          </div>
          {[
            {d:'Compliance',  v: matBreak.compliance  ?? 0, col:colors.green},
            {d:'Operations',  v: matBreak.operations  ?? 0, col:colors.blue},
            {d:'Controls',    v: matBreak.controls    ?? 0, col:colors.yellow},
            {d:'Audit',       v: matBreak.audit       ?? 0, col:colors.orange},
          ].map(m=>(
            <div key={m.d} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{fontSize:12,color:colors.text2}}>{m.d}</span>
                <span style={{fontSize:12,fontWeight:700,color:m.col}}>{Math.round(m.v)}%</span>
              </div>
              <Bar pct={m.v} color={m.col}/>
            </div>
          ))}
        </Card>
      </div>
    </PageWrap>
  );
}
