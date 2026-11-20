import React from 'react';

export const colors = {
  bg:'var(--c-bg)',bg2:'var(--c-bg2)',bg3:'var(--c-bg3)',
  border:'var(--c-border)',border2:'var(--c-border2)',
  text:'var(--c-text)',text2:'var(--c-text2)',text3:'var(--c-text3)',
  indigo:'var(--c-accent)',accent:'var(--c-accent)',accent2:'var(--c-accent2)',
  green:'var(--c-green)',red:'var(--c-red)',yellow:'var(--c-yellow)',
  orange:'var(--c-orange)',pink:'var(--c-pink)',blue:'var(--c-accent2)',
  violet:'var(--c-accent)',sidebar:'var(--c-sidebar)',topbar:'var(--c-topbar)',
};

export const sevColor=(s:string)=>s==='critical'?colors.red:s==='high'?colors.orange:s==='medium'?colors.yellow:colors.green;

export const statusColor=(s:string)=>{
  if(['compliant','completed','resolved','approved','pass','passing','connected','active'].includes(s)) return colors.green;
  if(['partial','in_progress','in-remediation','in-review','warning','running','investigating'].includes(s)) return colors.yellow;
  if(['non-compliant','failed','fail','failing','error','critical','breached'].includes(s)) return colors.red;
  return colors.accent;
};

export const statusBg=(s:string)=>{
  if(['compliant','completed','resolved','approved','pass','passing','connected','active'].includes(s)) return 'rgba(34,197,94,.15)';
  if(['partial','in_progress','in-remediation','in-review','warning','running','investigating'].includes(s)) return 'rgba(251,191,36,.15)';
  if(['non-compliant','failed','fail','failing','error','critical','breached'].includes(s)) return 'rgba(244,63,94,.15)';
  return 'rgba(124,106,247,.15)';
};

interface CardProps {
  children:React.ReactNode;style?:React.CSSProperties;onClick?:()=>void;title?:string;
  tabIndex?:number;role?:string;ariaLabel?:string;
  onKeyDown?:(e:React.KeyboardEvent)=>void;
  onMouseEnter?:(e:React.MouseEvent<HTMLDivElement>)=>void;
  onMouseLeave?:(e:React.MouseEvent<HTMLDivElement>)=>void;
  onMouseDown?:(e:React.MouseEvent<HTMLDivElement>)=>void;
  onMouseUp?:(e:React.MouseEvent<HTMLDivElement>)=>void;
  onFocus?:(e:React.FocusEvent<HTMLDivElement>)=>void;
  onBlur?:(e:React.FocusEvent<HTMLDivElement>)=>void;
}
export function Card({children,style,onClick,title,tabIndex,role,ariaLabel,onKeyDown,onMouseEnter,onMouseLeave,onMouseDown,onMouseUp,onFocus,onBlur}:CardProps) {
  return <div style={{background:colors.bg2,border:`1px solid ${colors.border}`,borderRadius:12,padding:20,boxShadow:'0 1px 3px rgba(0,0,0,.05), 0 2px 6px rgba(0,0,0,.03)',transition:'all .2s ease',...style}} onClick={onClick} title={title} tabIndex={tabIndex} role={role} aria-label={ariaLabel} onKeyDown={onKeyDown} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onFocus={onFocus} onBlur={onBlur}>{children}</div>;
}

export function Badge({label,status,color}:{label:string;status?:string;color?:string}) {
  const fg=color||(status?statusColor(status):colors.accent);
  const bg=status?statusBg(status):'rgba(124,106,247,.15)';
  return <span style={{background:bg,color:fg,padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:600,textTransform:'capitalize',whiteSpace:'nowrap'}}>{label}</span>;
}

export function Bar({pct,color=colors.accent,h=6}:{pct:number;color?:string;h?:number}) {
  return <div style={{background:'var(--c-bg3)',borderRadius:h,height:h,overflow:'hidden',width:'100%'}}><div style={{background:color,height:h,width:`${Math.max(0,Math.min(100,pct))}%`,borderRadius:h,transition:'width .4s ease'}}/></div>;
}

export function ScoreRing({score,size=80}:{score:number;size?:number}) {
  const r=(size/2)-8, circ=2*Math.PI*r, dash=(score/100)*circ;
  const color=score>=75?'#22c55e':score>=50?'#fbbf24':'#f43f5e';
  return <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-bg3)" strokeWidth={7}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7} strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round" style={{transition:'stroke-dasharray .6s ease'}}/>
    <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" style={{transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}} fill={color} fontSize={size/5} fontWeight={700}>{score}%</text>
  </svg>;
}

export function Stat({label,value,sub,color:c,trend}:{label:string;value:unknown;sub?:string;color?:string;trend?:string}) {
  return <div><div style={{fontSize:26,fontWeight:700,color:c||colors.text,letterSpacing:'-0.02em'}}>{value!==undefined&&value!==null?String(value):'-'}</div><div style={{fontSize:12,color:colors.text2,marginTop:2}}>{label}</div>{trend&&<div style={{fontSize:11,color:trend.startsWith('+')?colors.green:colors.red,marginTop:2,fontWeight:500}}>{trend} vs last month</div>}{sub&&<div style={{fontSize:11,color:colors.text3}}>{sub}</div>}</div>;
}

export function StatCard({label,value,icon,color:c,trend,sub,onClick,ariaLabel}:{label:string;value:unknown;icon?:string;color?:string;trend?:string;sub?:string;onClick?:()=>void;ariaLabel?:string}) {
  const ac=c||colors.accent;
  const interactive = !!onClick;
  return <Card
    onClick={onClick}
    style={{
      padding:'18px 20px',
      cursor: interactive ? 'pointer' : undefined,
      transition: interactive ? 'all .18s ease' : undefined,
      outline: 'none',
    }}
    tabIndex={interactive ? 0 : undefined}
    role={interactive ? 'link' : undefined}
    ariaLabel={interactive ? (ariaLabel || `Navigate to ${label}`) : undefined}
    onKeyDown={interactive ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
    onMouseEnter={interactive ? (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 6px 24px rgba(0,0,0,.18)`; e.currentTarget.style.borderColor=ac; } : undefined}
    onMouseLeave={interactive ? (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor=colors.border; } : undefined}
    onMouseDown={interactive ? (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(0px) scale(0.985)'; } : undefined}
    onMouseUp={interactive ? (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.transform='translateY(-2px)'; } : undefined}
    onFocus={interactive ? (e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow=`0 0 0 2px ${ac}`; e.currentTarget.style.borderColor=ac; } : undefined}
    onBlur={interactive ? (e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor=colors.border; } : undefined}
  >
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:600,color:colors.text3,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</div>
      {icon&&<div style={{width:32,height:32,borderRadius:8,background:`${ac}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:ac}}>{icon}</div>}
    </div>
    <div style={{fontSize:28,fontWeight:700,color:ac,letterSpacing:'-0.02em'}}>{value!==undefined&&value!==null?String(value):'-'}</div>
    {sub&&<div style={{fontSize:12,color:colors.text2,marginTop:4}}>{sub}</div>}
    {trend&&<div style={{fontSize:11,marginTop:6,display:'flex',alignItems:'center',gap:4}}><span style={{color:trend.startsWith('+')?colors.green:colors.red,fontWeight:600}}>{trend}</span><span style={{color:colors.text3}}>vs last month</span></div>}
    {interactive && <div style={{fontSize:11,color:ac,marginTop:8,fontWeight:600,opacity:0.7,display:'flex',alignItems:'center',gap:4}}>View details →</div>}
  </Card>;
}

export function PageWrap({title,subtitle,action,children}:{title:string;subtitle?:string;action?:React.ReactNode;children:React.ReactNode}) {
  return <div style={{padding:'24px 28px'}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
      <div><h1 style={{fontSize:22,fontWeight:700,color:colors.text,letterSpacing:'-0.02em'}}>{title}</h1>{subtitle&&<p style={{fontSize:13,color:colors.text3,marginTop:5}}>{subtitle}</p>}</div>
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
  const border=variant==='ghost'?`1px solid var(--c-border2)`:'none';
  const shadow=variant==='primary'?'0 2px 8px rgba(0,86,179,.2)':variant==='danger'?'0 2px 8px rgba(244,63,94,.2)':variant==='success'?'0 2px 8px rgba(34,197,94,.2)':'none';
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:variant==='ghost'?'var(--c-text)':'#ffffff',border,borderRadius:8,padding:small?'5px 12px':'9px 18px',fontSize:small?12:13,fontWeight:600,cursor:disabled?'not-allowed':'pointer',transition:'all .2s ease',opacity:disabled?0.5:1,letterSpacing:'0.01em',boxShadow:shadow,...style}}
    onMouseOver={e=>!disabled&&(e.currentTarget.style.transform='translateY(-1px)' || (e.currentTarget.style.boxShadow=variant==='primary'?'0 6px 12px rgba(0,86,179,.3)':variant==='danger'?'0 6px 12px rgba(244,63,94,.3)':variant==='success'?'0 6px 12px rgba(34,197,94,.3)':'none'))}
    onMouseOut={e=>!disabled&&(e.currentTarget.style.transform='none' || (e.currentTarget.style.boxShadow=shadow))}>{children}</button>;
}

export function Modal({open,onClose,title,children,width=520}:{open:boolean;onClose:()=>void;title?:string;children:React.ReactNode;width?:number}) {
  if(!open) return null;
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={onClose}>
    <div style={{background:'var(--c-bg2)',border:`1px solid var(--c-border2)`,borderRadius:16,width:'100%',maxWidth:width,maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}} onClick={e=>e.stopPropagation()}>
      {title&&<div style={{padding:'16px 20px',borderBottom:`1px solid var(--c-border)`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:15,fontWeight:700,color:'var(--c-text)'}}>{title}</div><button onClick={onClose} style={{background:'none',border:'none',color:'var(--c-text3)',fontSize:20,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button></div>}
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>;
}

export function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}) {
  return <div style={{overflowX:'auto',borderRadius:10,border:`1px solid var(--c-border)`}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead><tr style={{background:'var(--c-bg3)',borderBottom:`1px solid var(--c-border)`}}>{headers.map((h,i)=><th key={i} style={{padding:'10px 14px',textAlign:'left',color:'var(--c-text3)',fontSize:11,fontWeight:600,letterSpacing:'.6px',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row,ri)=><tr key={ri} style={{borderBottom:`1px solid var(--c-border)`}} onMouseOver={e=>(e.currentTarget.style.background='var(--c-bg3)')} onMouseOut={e=>(e.currentTarget.style.background='transparent')}>{row.map((cell,ci)=><td key={ci} style={{padding:'11px 14px',color:'var(--c-text2)',verticalAlign:'middle'}}>{cell}</td>)}</tr>)}{rows.length===0&&<tr><td colSpan={headers.length} style={{padding:40,textAlign:'center',color:'var(--c-text3)'}}>No data</td></tr>}</tbody>
    </table>
  </div>;
}

export function LoadingSpinner() {
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:60}}><div style={{width:28,height:28,border:'3px solid var(--c-border2)',borderTop:'3px solid var(--c-accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
}

export function ErrorBanner({msg}:{msg?:string}) {
  if(!msg) return null;
  return <div style={{background:'rgba(244,63,94,.1)',border:'1px solid rgba(244,63,94,.3)',borderRadius:10,padding:'12px 16px',color:'var(--c-red)',fontSize:13,marginBottom:16}}>{msg}</div>;
}
