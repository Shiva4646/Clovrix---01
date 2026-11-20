import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, Badge, PageWrap, LoadingSpinner, Btn, colors } from './ui';
import { toast } from './Toast';

const FW_ICON: Record<string,string> = {
  ISO42001:'⬡', SOC2:'◈', GDPR:'◉', EU_AI_ACT:'⚖', NIST_AI_RMF:'◬', ISO27001:'◇', PIMS:'◎'
};

function ScoreRing({ score, color, label, size=72 }: { score:number; color:string; label:string; size?:number }) {
  const r = (size/2) - 7;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}25`} strokeWidth={6}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
          style={{transition:'stroke-dashoffset 0.6s ease'}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          style={{fill:colors.text,fontSize:size/4,fontWeight:700,transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>
          {score}%
        </text>
      </svg>
      <div style={{fontSize:10,color:colors.text3,textAlign:'center',maxWidth:72,lineHeight:1.3}}>{label}</div>
    </div>
  );
}

export default function Reports() {
  const [reports,    setReports]    = useState<any[]>([]);
  const [summary,    setSummary]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [downloading,setDl]         = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        api.reportSummary(filter || undefined),
        api.executiveSummary(),
      ]);
      setReports(Array.isArray(r) ? r : []);
      setSummary(s);
    } catch(e:any) { toast.error(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const download = async (wf: any) => {
    setDl(wf.id);
    try {
      await api.downloadReport(wf.id, wf.name);
      toast.success('Report downloaded', wf.name);
    } catch(e:any) { toast.error(e.message, 'Download failed'); }
    setDl(null);
  };

  if (loading) return <LoadingSpinner />;

  const fwScores: {code:string;name:string;score:number;color:string}[] = summary?.scores?.by_framework
    ? Object.entries(summary.scores.by_framework).map(([code, v]:any) => ({
        code, name: v.name || code, score: v.score ?? 0, color: v.color || colors.accent
      }))
    : [];

  const overallScore = summary?.scores?.overall ?? 0;

  const severityData: {label:string;value:number;color:string}[] = (summary?.findings_by_severity || [])
    .map((s:any) => ({
      label: s.severity,
      value: s.count,
      color: s.severity==='critical'?colors.red:s.severity==='high'?colors.orange:s.severity==='medium'?colors.yellow:colors.blue,
    }));

  const maxSev = severityData.reduce((m:number,s:any)=>Math.max(m,s.value),1);

  const visibleReports = typeFilter
    ? reports.filter((r:any) => r.type === typeFilter)
    : reports;

  return (
    <PageWrap title="Compliance Reports" subtitle="Audit reports generated from completed workflows — live, interconnected data.">
      {/* KPI Strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Completed Audits',    value:reports.length,                 color:colors.green},
          {label:'Avg Compliance Score',value:`${overallScore}%`,             color:colors.accent},
          {label:'Open Findings',       value:summary?.open_findings??0,      color:(summary?.open_findings??0)>0?colors.red:colors.green},
          {label:'Frameworks Tracked',  value:fwScores.length,                color:colors.blue},
        ].map(k=>(
          <Card key={k.label} style={{padding:'18px 20px'}}>
            <div style={{fontSize:11,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{k.label}</div>
            <div style={{fontSize:32,fontWeight:700,color:k.color||colors.text}}>{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Framework Scores + Findings Severity */}
      {(fwScores.length > 0 || severityData.length > 0) && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16,marginBottom:20}}>
          <Card style={{padding:'20px 24px'}}>
            <div style={{fontSize:13,fontWeight:600,color:colors.text,marginBottom:16}}>Framework Compliance Scores</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:24,alignItems:'flex-start'}}>
              {fwScores.length > 0 ? fwScores.map(fw=>(
                <ScoreRing key={fw.code} score={fw.score} color={fw.color} label={fw.name} />
              )) : (
                <div style={{color:colors.text3,fontSize:13}}>Scores will appear after workflows are completed.</div>
              )}
            </div>
          </Card>

          {severityData.length > 0 && (
            <Card style={{padding:'20px 24px'}}>
              <div style={{fontSize:13,fontWeight:600,color:colors.text,marginBottom:16}}>Open Findings by Severity</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {severityData.map((s:any)=>(
                  <div key={s.label}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:12,color:colors.text,textTransform:'capitalize'}}>{s.label}</span>
                      <span style={{fontSize:12,fontWeight:600,color:s.color}}>{s.value}</span>
                    </div>
                    <div style={{height:6,borderRadius:3,background:colors.border}}>
                      <div style={{height:'100%',borderRadius:3,background:s.color,width:`${Math.round(s.value*100/maxSev)}%`,transition:'width 0.4s ease'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:12,color:colors.text3}}>Framework:</span>
        {(['', ...fwScores.map((f:any)=>f.code)] as string[]).map((code:string)=>(
          <button key={code} onClick={()=>setFilter(code)}
            style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${filter===code?colors.accent:colors.border}`,background:filter===code?`${colors.accent}20`:'none',color:filter===code?colors.accent:colors.text3,cursor:'pointer',fontSize:12}}>
            {code ? `${FW_ICON[code]||''} ${fwScores.find((f:any)=>f.code===code)?.name||code}` : 'All Frameworks'}
          </button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          {['','quarterly','annual'].map((t:string)=>(
            <button key={t} onClick={()=>setTypeFilter(t)}
              style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${typeFilter===t?colors.accent:colors.border}`,background:typeFilter===t?`${colors.accent}20`:'none',color:typeFilter===t?colors.accent:colors.text3,cursor:'pointer',fontSize:12,textTransform:'capitalize'}}>
              {t||'All Types'}
            </button>
          ))}
        </div>
      </div>

      {/* Report Cards */}
      {visibleReports.length === 0 ? (
        <Card style={{padding:48,textAlign:'center'}}>
          <div style={{fontSize:36,marginBottom:16}}>📋</div>
          <div style={{fontSize:16,fontWeight:600,color:colors.text,marginBottom:8}}>No Completed Audit Reports</div>
          <div style={{fontSize:13,color:colors.text3,maxWidth:440,margin:'0 auto',lineHeight:1.6}}>
            Reports are generated automatically when audit workflows are completed.<br/>
            Go to <strong>Audit Tracking</strong> → create a workflow → complete all steps → your report will appear here.
          </div>
        </Card>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:16}}>
          {visibleReports.map((wf:any) => {
            const score    = wf.score ?? 0;
            const fwColor  = wf.framework_color || colors.accent;
            const fwIcon   = FW_ICON[wf.standard] || '◈';
            const completedDate = wf.completed_at
              ? new Date(wf.completed_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})
              : '—';
            const scoreColor = score>=80?colors.green:score>=60?colors.yellow:colors.red;
            return (
              <Card key={wf.id} style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:14}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontSize:18,color:fwColor}}>{fwIcon}</span>
                      <span style={{fontSize:11,fontWeight:600,color:fwColor,textTransform:'uppercase',letterSpacing:'0.06em'}}>{wf.framework_name||wf.standard}</span>
                      {wf.type && <Badge label={wf.type} status="partial"/>}
                    </div>
                    <div style={{fontSize:14,fontWeight:600,color:colors.text,lineHeight:1.3}}>{wf.name}</div>
                    {wf.system_name && <div style={{fontSize:11,color:colors.text3,marginTop:3}}>🤖 {wf.system_name}</div>}
                  </div>
                  <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                    <div style={{fontSize:28,fontWeight:700,color:scoreColor}}>{score}%</div>
                    <div style={{fontSize:10,color:colors.text3}}>compliance</div>
                  </div>
                </div>

                {/* Score bar */}
                <div style={{height:6,borderRadius:3,background:colors.border}}>
                  <div style={{height:'100%',borderRadius:3,background:scoreColor,width:`${score}%`,transition:'width 0.4s ease'}}/>
                </div>

                {/* Stats */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                  {[
                    {label:'Findings',  value:wf.findings_count??0,                                    color:colors.text},
                    {label:'Open',      value:wf.open_findings??0,                                     color:(wf.open_findings??0)>0?colors.red:colors.green},
                    {label:'Evidence',  value:wf.evidence_count??0,                                    color:colors.blue},
                    {label:'Steps',     value:`${wf.steps_completed??0}/${wf.steps_total??6}`,         color:colors.accent},
                  ].map(s=>(
                    <div key={s.label} style={{textAlign:'center',padding:'8px 4px',background:'var(--c-bg3)',borderRadius:8}}>
                      <div style={{fontSize:16,fontWeight:700,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:9,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.04em'}}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,borderTop:`1px solid ${colors.border}`}}>
                  <div style={{fontSize:11,color:colors.text3}}>
                    <span style={{color:colors.green}}>✓ </span>Completed {completedDate}
                  </div>
                  <Btn onClick={()=>download(wf)} style={{fontSize:12,padding:'6px 14px',opacity:downloading===wf.id?0.6:1}}>
                    {downloading===wf.id ? '⏳ Generating…' : '↓ Download PDF'}
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageWrap>
  );
}
