import { useState, useEffect, useCallback } from 'react';
export type ToastType='success'|'error'|'warning'|'info';
export interface ToastItem { id:string; type:ToastType; title?:string; message:string; duration:number; }
const ICON:Record<ToastType,string>={success:'✓',error:'✕',warning:'⚠',info:'ℹ'};
const CLR:Record<ToastType,{bg:string;border:string;icon:string}> = {
  success:{bg:'rgba(34,197,94,.12)',border:'rgba(34,197,94,.35)',icon:'#22c55e'},
  error:{bg:'rgba(244,63,94,.12)',border:'rgba(244,63,94,.35)',icon:'#f43f5e'},
  warning:{bg:'rgba(251,191,36,.12)',border:'rgba(251,191,36,.35)',icon:'#fbbf24'},
  info:{bg:'rgba(124,106,247,.12)',border:'rgba(124,106,247,.35)',icon:'#7c6af7'},
};
let _set:React.Dispatch<React.SetStateAction<ToastItem[]>>|null=null;
export const toast={
  show(opts:Omit<ToastItem,'id'>){_set?.(p=>[...p.slice(-4),{id:`t${Date.now()}${Math.random()}`,...opts}]);},
  success(msg:string,title?:string,dur=4000){this.show({type:'success',message:msg,title,duration:dur});},
  error(msg:string,title?:string,dur=6000){this.show({type:'error',message:msg,title,duration:dur});},
  warning(msg:string,title?:string,dur=5000){this.show({type:'warning',message:msg,title,duration:dur});},
  info(msg:string,title?:string,dur=4000){this.show({type:'info',message:msg,title,duration:dur});},
};
export default function ToastContainer() {
  const [items,setItems]=useState<ToastItem[]>([]);
  useEffect(()=>{
    _set=setItems;
    const orig=window.alert;
    window.alert=(m:string)=>{const t=/fail|error|invalid/i.test(m)?'error':/success|saved|created|done/i.test(m)?'success':'info';toast.show({type:t,message:m,duration:4000});};
    return ()=>{_set=null;window.alert=orig;};
  },[]);
  const dismiss=useCallback((id:string)=>setItems(p=>p.filter(t=>t.id!==id)),[]);
  useEffect(()=>{items.forEach(t=>{if(t.duration>0){const timer=setTimeout(()=>dismiss(t.id),t.duration);return()=>clearTimeout(timer);}});},[items,dismiss]);
  if(!items.length) return null;
  return (
    <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:10,width:340}}>
      {items.map(t=>{const c=CLR[t.type];return(
        <div key={t.id} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:12,padding:'12px 14px',boxShadow:'0 8px 32px rgba(0,0,0,.4)',display:'flex',gap:12,alignItems:'flex-start',animation:'slideIn .25s ease'}}>
          <div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:`${c.icon}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:c.icon}}>{ICON[t.type]}</div>
          <div style={{flex:1}}>
            {t.title&&<div style={{fontSize:13,fontWeight:600,color:c.icon,marginBottom:2}}>{t.title}</div>}
            <div style={{fontSize:12,color:c.icon,lineHeight:1.5}}>{t.message}</div>
          </div>
          <button onClick={()=>dismiss(t.id)} style={{background:'none',border:'none',cursor:'pointer',color:c.icon,fontSize:16,opacity:.6,padding:'0 2px'}}>×</button>
        </div>
      );})}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}
