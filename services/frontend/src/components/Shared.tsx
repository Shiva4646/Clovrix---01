import React from 'react';

export type ThemeId = 'midnight'|'dark'|'ocean'|'light'|'white-blue';
export interface Theme { id:ThemeId; name:string; icon:string; vars:Record<string,string>; }
export const THEMES:Theme[] = [
  { id:'midnight', name:'Midnight', icon:'M', vars:{
    '--c-bg':'#0a0a18','--c-bg2':'#111128','--c-bg3':'#16163a','--c-border':'#1e1e48',
    '--c-border2':'#2a2a60','--c-text':'#f0f0ff','--c-text2':'#9898c8','--c-text3':'#6868a8',
    '--c-accent':'#7c6af7','--c-accent2':'#22d3ee','--c-green':'#22c55e','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#fb923c','--c-pink':'#e879f9',
    '--c-sidebar':'#0e0e24','--c-topbar':'#0e0e24','--c-scrollbar':'#2a2a60',
  }},
  { id:'dark', name:'Dark', icon:'D', vars:{
    '--c-bg':'#0f1117','--c-bg2':'#13162a','--c-bg3':'#1a1d2e','--c-border':'#1e2140',
    '--c-border2':'#2d3150','--c-text':'#e8eaf0','--c-text2':'#a0aec0','--c-text3':'#6b7da0',
    '--c-accent':'#6366f1','--c-accent2':'#0d9488','--c-green':'#10b981','--c-red':'#ef4444',
    '--c-yellow':'#f59e0b','--c-orange':'#f97316','--c-pink':'#ec4899',
    '--c-sidebar':'#13162a','--c-topbar':'#13162a','--c-scrollbar':'#2d3150',
  }},
  { id:'ocean', name:'Ocean', icon:'O', vars:{
    '--c-bg':'#060e1a','--c-bg2':'#0a1628','--c-bg3':'#0f1f38','--c-border':'#162845',
    '--c-border2':'#1e3860','--c-text':'#e0f2fe','--c-text2':'#7fb3d3','--c-text3':'#4a7a9b',
    '--c-accent':'#0ea5e9','--c-accent2':'#06b6d4','--c-green':'#10b981','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#f97316','--c-pink':'#818cf8',
    '--c-sidebar':'#080e1a','--c-topbar':'#080e1a','--c-scrollbar':'#1e3860',
  }},
  { id:'light', name:'Light', icon:'L', vars:{
    '--c-bg':'#f4f6fa','--c-bg2':'#ffffff','--c-bg3':'#eef1f7','--c-border':'#dde1eb',
    '--c-border2':'#c8cfe0','--c-text':'#1a1f36','--c-text2':'#374151','--c-text3':'#6b7280',
    '--c-accent':'#4f46e5','--c-accent2':'#0891b2','--c-green':'#059669','--c-red':'#dc2626',
    '--c-yellow':'#b45309','--c-orange':'#c2410c','--c-pink':'#be185d',
    '--c-sidebar':'#f0f3f9','--c-topbar':'#f0f3f9','--c-scrollbar':'#dde1eb',
  }},
  { id:'white-blue', name:'White & Blue', icon:'W', vars:{
    '--c-bg':'#ffffff','--c-bg2':'#f5f5f5','--c-bg3':'#eeeeee','--c-border':'#e0e0e0',
    '--c-border2':'#d0d0d0','--c-text':'#0056b3','--c-text2':'#1e90ff','--c-text3':'#4169e1',
    '--c-accent':'#0056b3','--c-accent2':'#1e90ff','--c-green':'#22c55e','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#fb923c','--c-pink':'#e879f9',
    '--c-sidebar':'#f5f5f5','--c-topbar':'#f5f5f5','--c-scrollbar':'#d0d0d0',
  }},
];
const STORAGE_KEY = 'clovrix_theme';
export function getThemeId():ThemeId { if(typeof window==='undefined') return 'white-blue'; return (localStorage.getItem(STORAGE_KEY) as ThemeId)||'white-blue'; }
export function getTheme():Theme { return THEMES.find(t=>t.id===getThemeId())||THEMES[0]; }
export function applyTheme(id:ThemeId) {
  const theme = THEMES.find(t=>t.id===id)||THEMES[0];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k,v])=>root.style.setProperty(k,v));
  document.body.style.background = theme.vars['--c-bg'];
  document.body.style.color = theme.vars['--c-text'];
  localStorage.setItem(STORAGE_KEY,id);
  window.dispatchEvent(new CustomEvent('clovrix:theme-changed',{detail:id}));
}
export function initTheme() { if(typeof window!=='undefined') applyTheme(getThemeId()); }

// ── Semantic helpers (use CSS vars, not hardcoded hex) ───────────────────────

export const sevColor=(s:string)=>
  s==='critical'?'var(--c-red)':s==='high'?'var(--c-orange)':s==='medium'?'var(--c-orange)':'var(--c-green)';

export const statusColor=(s:string)=>{
  if(['compliant','completed','resolved','approved','pass','passing','connected','active'].includes(s)) return 'var(--c-green)';
  if(['partial','in_progress','in-remediation','in-review','warning','running','investigating'].includes(s)) return 'var(--c-orange)';
  if(['non-compliant','failed','fail','failing','error','critical','breached'].includes(s)) return 'var(--c-red)';
  return 'var(--c-accent)';
};

export const statusBg=(s:string)=>{
  if(['compliant','completed','resolved','approved','pass','passing','connected','active'].includes(s)) return 'rgba(34,197,94,.15)';
  if(['partial','in_progress','in-remediation','in-review','warning','running','investigating'].includes(s)) return 'rgba(251,191,36,.15)';
  if(['non-compliant','failed','fail','failing','error','critical','breached'].includes(s)) return 'rgba(244,63,94,.15)';
  return 'rgba(124,106,247,.15)';
};

// ── Components ───────────────────────────────────────────────────────────────

export function Card({children,style,onClick,title}:{children:React.ReactNode;style?:React.CSSProperties;onClick?:()=>void;title?:string}) {
  return <div style={{background:'var(--c-bg2)',border:'1px solid var(--c-border)',borderRadius:12,padding:20,...style}} onClick={onClick} title={title}>{children}</div>;
}

export function Badge({label,status,color}:{label:string;status?:string;color?:string}) {
  const fg=color||(status?statusColor(status):'var(--c-accent)');
  const bg=status?statusBg(status):'rgba(124,106,247,.15)';
  return <span style={{background:bg,color:fg,padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:600,textTransform:'capitalize',whiteSpace:'nowrap'}}>{label}</span>;
}

export function Bar({pct,color,h=6}:{pct:number;color?:string;h?:number}) {
  return <div style={{background:'var(--c-bg3)',borderRadius:h,height:h,overflow:'hidden',width:'100%'}}>
    <div style={{background:color||'var(--c-accent)',height:h,width:`${Math.max(0,Math.min(100,pct))}%`,borderRadius:h,transition:'width .4s ease'}}/>
  </div>;
}

export function ScoreRing({score,size=80}:{score:number;size?:number}) {
  const r=(size/2)-8, circ=2*Math.PI*r, dash=(score/100)*circ;
  const color=score>=75?'var(--c-green)':score>=50?'var(--c-yellow)':'var(--c-red)';
  return <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-bg3)" strokeWidth={7}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7} strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round" style={{transition:'stroke-dasharray .6s ease'}}/>
    <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}} fill={color} fontSize={size/5} fontWeight={700}>{score}%</text>
  </svg>;
}

export function Stat({label,value,sub,color:c,trend}:{label:string;value:unknown;sub?:string;color?:string;trend?:string}) {
  return <div>
    <div style={{fontSize:26,fontWeight:700,color:c||'var(--c-text)',letterSpacing:'-0.02em'}}>{value!==undefined&&value!==null?String(value):'-'}</div>
    <div style={{fontSize:12,color:'var(--c-text2)',marginTop:2}}>{label}</div>
    {trend&&<div style={{fontSize:11,color:trend.startsWith('+')?'var(--c-green)':'var(--c-red)',marginTop:2,fontWeight:500}}>{trend} vs last month</div>}
    {sub&&<div style={{fontSize:11,color:'var(--c-text3)'}}>{sub}</div>}
  </div>;
}

export function StatCard({label,value,icon,color:c,trend,sub}:{label:string;value:unknown;icon?:string;color?:string;trend?:string;sub?:string}) {
  const ac=c||'var(--c-accent)';
  return <Card style={{padding:'18px 20px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:600,color:'var(--c-text3)',textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'Inter,system-ui,sans-serif'}}>{label}</div>
      {icon&&<div style={{width:32,height:32,borderRadius:8,background:`color-mix(in srgb, ${ac} 15%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:ac}}>{icon}</div>}
    </div>
    <div style={{fontSize:28,fontWeight:700,color:ac,letterSpacing:'-0.02em',fontFamily:'Inter,system-ui,sans-serif'}}>{value!==undefined&&value!==null?String(value):'-'}</div>
    {sub&&<div style={{fontSize:12,color:'var(--c-text2)',marginTop:4}}>{sub}</div>}
    {trend&&<div style={{fontSize:11,marginTop:6,display:'flex',alignItems:'center',gap:4}}>
      <span style={{color:trend.startsWith('+')?'var(--c-green)':'var(--c-red)',fontWeight:600}}>{trend}</span>
      <span style={{color:'var(--c-text3)'}}>vs last month</span>
    </div>}
  </Card>;
}

export function PageWrap({title,subtitle,action,children}:{title:string;subtitle?:string;action?:React.ReactNode;children:React.ReactNode}) {
  return <div style={{padding:'24px 28px'}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,color:'var(--c-text)',letterSpacing:'-0.02em',fontFamily:'Inter,system-ui,sans-serif'}}>{title}</h1>
        {subtitle&&<p style={{fontSize:13,color:'var(--c-text3)',marginTop:5}}>{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>;
}

export function Grid({cols=3,children,gap=16}:{cols?:number;children:React.ReactNode;gap?:number}) {
  return <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap}}>{children}</div>;
}

export function Btn({children,onClick,variant='primary',small,style,disabled}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'ghost'|'danger'|'success';small?:boolean;style?:React.CSSProperties;disabled?:boolean}) {
  const bg=variant==='primary'?'var(--c-accent)':variant==='danger'?'var(--c-red)':variant==='success'?'var(--c-green)':'transparent';
  const border=variant==='ghost'?'1px solid var(--c-border2)':'none';
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:'var(--c-text)',border,borderRadius:8,padding:small?'5px 12px':'9px 18px',fontSize:small?12:13,fontWeight:600,cursor:disabled?'not-allowed':'pointer',transition:'all .15s',opacity:disabled?0.5:1,letterSpacing:'0.01em',...style}}
    onMouseOver={e=>!disabled&&((e.currentTarget as HTMLElement).style.opacity='.8')} onMouseOut={e=>!disabled&&((e.currentTarget as HTMLElement).style.opacity='1')}>{children}</button>;
}

export function Modal({open,onClose,title,children,width=520}:{open:boolean;onClose:()=>void;title?:string;children:React.ReactNode;width?:number}) {
  if(!open) return null;
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={onClose}>
    <div style={{background:'var(--c-bg2)',border:'1px solid var(--c-border2)',borderRadius:16,width:'100%',maxWidth:width,maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}} onClick={e=>e.stopPropagation()}>
      {title&&<div style={{padding:'16px 20px',borderBottom:'1px solid var(--c-border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:15,fontWeight:700,color:'var(--c-text)'}}>{title}</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--c-text3)',fontSize:20,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button>
      </div>}
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>;
}

export function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}) {
  return <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--c-border)'}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead>
        <tr style={{background:'var(--c-bg3)',borderBottom:'1px solid var(--c-border)'}}>
          {headers.map((h,i)=><th key={i} style={{padding:'10px 14px',textAlign:'left',color:'var(--c-text3)',fontSize:11,fontWeight:600,letterSpacing:'.6px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,ri)=><tr key={ri} style={{borderBottom:'1px solid var(--c-border)'}} onMouseOver={e=>(e.currentTarget.style.background='var(--c-bg3)')} onMouseOut={e=>(e.currentTarget.style.background='transparent')}>
          {row.map((cell,ci)=><td key={ci} style={{padding:'11px 14px',color:'var(--c-text2)',verticalAlign:'middle'}}>{cell}</td>)}
        </tr>)}
        {rows.length===0&&<tr><td colSpan={headers.length} style={{padding:40,textAlign:'center',color:'var(--c-text3)'}}>No data</td></tr>}
      </tbody>
    </table>
  </div>;
}

export function LoadingSpinner() {
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60}}>
    <div style={{width:28,height:28,border:'3px solid var(--c-border2)',borderTop:'3px solid var(--c-accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}

export function ErrorBanner({msg}:{msg?:string}) {
  if(!msg) return null;
  return <div style={{background:'rgba(244,63,94,.1)',border:'1px solid rgba(244,63,94,.3)',borderRadius:10,padding:'12px 16px',color:'var(--c-red)',fontSize:13,marginBottom:16}}>{msg}</div>;
}